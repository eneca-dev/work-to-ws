# Логика синхронизации work-to-ws

> Полное описание работы синхронизации eneca.work → Worksection

## Оглавление

1. [Общий принцип](#общий-принцип)
2. [Этапы синхронизации](#этапы-синхронизации)
3. [Маппинг сущностей](#маппинг-сущностей)
4. [Умный UPDATE](#умный-update)
5. [Обработка ошибок](#обработка-ошибок)
6. [Отчеты и логирование](#отчеты-и-логирование)

---

## Общий принцип

### Направление синхронизации

```
eneca.work (Supabase) → Worksection
```

**Односторонняя синхронизация:**
- eneca.work - источник истины (Source of Truth)
- Worksection - целевая система (Target)
- Изменения в WS вручную будут перезаписаны при следующей синхронизации

### Критические правила

✅ **Разрешено:**
- CREATE - создание новых сущностей
- UPDATE - обновление существующих сущностей

❌ **ЗАПРЕЩЕНО:**
- DELETE - удаление данных в Worksection
- Любые деструктивные операции

### Идентификация сущностей

Каждая сущность в eneca.work хранит `external_id` - это ID из Worksection:

```sql
-- Таблицы в Supabase
projects.external_id        -- ID проекта в WS
objects.external_id         -- ID задачи (Level 1) в WS
sections.external_id        -- ID подзадачи (Level 2) в WS
decomposition_stages.external_id  -- ID под-подзадачи (Level 3) в WS
```

**Логика работы:**
- Если `external_id` есть → UPDATE (обновить существующую)
- Если `external_id` нет → CREATE (создать новую)

---

## Этапы синхронизации

Синхронизация проходит в **7 последовательных шагов**.

### Шаг 0: Инициализация

**Файл:** `sync/sync-manager.js`

```javascript
async function syncProjectToWS(projectId, dryRun = false, sendNotifications = null)
```

**Действия:**
1. Очистка логов и кэшей (пользователи, отделы)
2. Инициализация статистики
3. Определение режима (dry-run или реальный)
4. Отправка уведомления в Telegram о начале

### Шаг 1: Загрузка данных из eneca.work

**Файл:** `services/supabase.js`

**Метод:** `getProjectFull(projectId)`

**Что загружается:**

```javascript
{
  project: {
    project_id: "uuid",
    project_name: "Название",
    external_id: "123456", // ID в WS (если есть)
    project_manager: "user_uuid",
    project_start_date: "2025-01-01",
    project_end_date: "2025-12-31",
    status: "active"
  },
  stages: [
    {
      stage_id: "uuid",
      stage_name: "Стадия А",
      stage_project_id: "project_uuid"
    }
  ],
  objects: [
    {
      object_id: "uuid",
      object_name: "Объект 1",
      external_id: "789012", // ID в WS (если есть)
      object_start_date: "2025-01-01",
      object_end_date: "2025-03-31"
    }
  ],
  sections: [
    {
      section_id: "uuid",
      section_name: "Раздел 1",
      external_id: "345678", // ID в WS (если есть)
      section_object_id: "object_uuid",
      section_responsible: "user_uuid",
      section_start_date: "2025-01-01",
      section_end_date: "2025-01-31",
      decomposition_stages: [
        {
          decomposition_stage_id: "uuid",
          decomposition_stage_name: "Этап 1",
          external_id: "901234", // ID в WS (если есть)
          decomposition_stage_responsibles: ["user_uuid"],
          decomposition_stage_start: "2025-01-01",
          decomposition_stage_finish: "2025-01-15",
          items: [
            {
              decomposition_item_id: "uuid",
              item_content: "Пункт чеклиста",
              decomposition_item_planned_hours: 5,
              checked: false,
              order: 1
            }
          ]
        }
      ]
    }
  ]
}
```

**Логирование:**
```
i [timestamp] Loaded project: Название проекта
i [timestamp]   Objects: 5
i [timestamp]   Sections: 12
i [timestamp]   Decomposition Stages: 24
```

### Шаг 2: Синхронизация проекта

**Файл:** `sync/project-sync.js`

**Метод:** `syncProject(project, stages, dryRun)`

**Действия:**

1. **Подготовка данных:**
   ```javascript
   const stageTags = stages.map(s => s.stage_name).join(',');
   const managerEmail = await getEmailByUserId(project.project_manager);

   const projectData = {
     title: project.project_name,
     emailManager: managerEmail,
     dateStart: formatDateForWS(project.project_start_date),
     dateEnd: formatDateForWS(project.project_end_date),
     tags: stageTags // Только при CREATE!
   };
   ```

2. **CREATE или UPDATE:**

   **Если `project.external_id` НЕТ (CREATE):**
   ```javascript
   const wsProject = await wsWriter.postProject(projectData);
   // Сохраняем external_id в Supabase
   await supabase.updateProjectExternalId(project.project_id, wsProject.id);
   ```

   **Если `project.external_id` ЕСТЬ (UPDATE):**
   ```javascript
   // 1. Загрузить текущие данные из WS
   const wsProject = await wsWriter.getProject(project.external_id);

   // 2. Сравнить данные
   const comparison = compareProjectData(wsProject, projectData);

   // 3. Если нет изменений - пропустить
   if (!comparison.hasChanges) {
     logger.info(`✓ Project unchanged, skipping UPDATE`);
     return { action: 'unchanged', wsProjectId: project.external_id };
   }

   // 4. Логировать детали изменений
   logger.logChanges('Project', project.project_name, comparison.changes);

   // 5. Выполнить UPDATE (БЕЗ тегов!)
   await wsWriter.updateProject(project.external_id, projectData);
   ```

**Результат:**
```javascript
{
  action: 'created' | 'updated' | 'unchanged',
  wsProjectId: "123456",
  error: null
}
```

### Шаг 3: Синхронизация Objects → Tasks (Level 1)

**Файл:** `sync/object-sync.js`

**Метод:** `syncObjects(objects, wsProjectId, dryRun)`

**Маппинг:**
- Objects (eneca.work) → Tasks Level 1 (WS)
- Без ответственного (emailUserTo: 'NOONE')
- Без родителя (parentId: null)

**Для каждого объекта:**

1. **Проверка placeholder (OS проекты):**
   ```javascript
   if (obj.external_id && obj.external_id.includes('_placeholder')) {
     // Пропускаем - это объект из ws-to-work OS проекта
     result.taskMap.set(obj.object_id, obj.external_id);
     continue;
   }
   ```

2. **Подготовка данных:**
   ```javascript
   const taskData = {
     projectId: wsProjectId,
     parentId: null, // Level 1 - top-level task
     title: obj.object_name,
     emailUserTo: 'NOONE', // Objects не синхронизируют ответственных
     dateStart: formatDateForWS(obj.object_start_date),
     dateEnd: formatDateForWS(obj.object_end_date),
   };
   ```

3. **CREATE или UPDATE:**

   **Если `obj.external_id` НЕТ (CREATE):**
   ```javascript
   const wsTask = await wsWriter.postTask(taskData);
   await supabase.updateObjectExternalId(obj.object_id, wsTask.id);
   result.taskMap.set(obj.object_id, wsTask.id);
   result.created++;
   ```

   **Если `obj.external_id` ЕСТЬ (UPDATE):**
   ```javascript
   try {
     // 1. Загрузить текущую задачу из WS
     const wsTask = await wsWriter.getTask(obj.external_id);

     // 2. Сравнить данные
     const comparison = compareTaskData(wsTask, taskData);

     // 3. Если нет изменений - пропустить
     if (!comparison.hasChanges) {
       logger.info(`✓ Object unchanged, skipping UPDATE`);
       result.taskMap.set(obj.object_id, obj.external_id);
       continue;
     }

     // 4. Логировать детали изменений
     logger.logChanges('Object', obj.object_name, comparison.changes);

     // 5. Выполнить UPDATE
     await wsWriter.updateTask(obj.external_id, taskData);
     result.updated++;
     result.taskMap.set(obj.object_id, obj.external_id);

   } catch (updateError) {
     // Fallback: задача не существует - создаем новую
     logger.warning(`UPDATE failed, creating new task`);
     const wsTask = await wsWriter.postTask(taskData);
     await supabase.updateObjectExternalId(obj.object_id, wsTask.id);
     result.created++;
   }
   ```

**Результат:**
```javascript
{
  created: 3,
  updated: 2,
  unchanged: 0, // Подсчитывается в sync-manager
  errors: [],
  taskMap: Map { object_id → ws_task_id }
}
```

**taskMap нужна для следующего шага** - чтобы связать sections с их родительскими objects.

### Шаг 4: Синхронизация Sections → Subtasks (Level 2)

**Файл:** `sync/section-sync.js`

**Метод:** `syncSections(sections, wsProjectId, objectTaskMap, dryRun)`

**Маппинг:**
- Sections (eneca.work) → Subtasks Level 2 (WS)
- С ответственным (section_responsible)
- С родителем (parentId из objectTaskMap)

**Для каждой секции:**

1. **Найти родителя:**
   ```javascript
   let parentTaskId = objectTaskMap.get(section.section_object_id);

   // Проверка на placeholder (OS проекты)
   if (parentTaskId && parentTaskId.includes('_placeholder')) {
     parentTaskId = null; // Секции в OS проектах - top-level tasks
   }
   ```

2. **Подготовка данных:**
   ```javascript
   const responsibleEmail = await getEmailByUserId(section.section_responsible);
   const departmentTag = await getDepartmentNameByUserId(section.section_responsible);

   const taskData = {
     projectId: wsProjectId,
     parentId: parentTaskId, // Level 2 - subtask
     title: section.section_name,
     emailUserTo: responsibleEmail,
     dateStart: formatDateForWS(section.section_start_date),
     dateEnd: formatDateForWS(section.section_end_date),
     tags: departmentTag // Только при CREATE!
   };
   ```

3. **CREATE или UPDATE:**
   - Аналогично Objects
   - UPDATE БЕЗ тегов (чтобы избежать "Tag is invalid")

**Результат:**
```javascript
{
  created: 5,
  updated: 3,
  unchanged: 0,
  errors: [],
  taskMap: Map { section_id → ws_task_id }
}
```

### Шаг 5: Синхронизация Decomposition → Sub-subtasks (Level 3)

**Файл:** `sync/decomposition-sync.js`

**Метод:** `syncDecomposition(sections, wsProjectId, dryRun)`

**Маппинг:**
- Decomposition Stages (eneca.work) → Sub-subtasks Level 3 (WS)
- С ответственным (первый из массива responsibles)
- С родителем (section.external_id)
- С чеклистом (decomposition_items)
- С плановыми часами (сумма из items)

**Для каждого decomposition stage:**

1. **Вычислить плановые часы:**
   ```javascript
   function calculatePlannedHours(items) {
     if (!items || items.length === 0) return null;
     const total = items.reduce((sum, item) => {
       return sum + (parseFloat(item.decomposition_item_planned_hours) || 0);
     }, 0);
     return total > 0 ? total : null;
   }
   ```

2. **Подготовка данных:**
   ```javascript
   const plannedHours = calculatePlannedHours(decomp.items);
   const responsibles = decomp.decomposition_stage_responsibles || [];
   const responsibleEmail = await getEmailByUserId(responsibles[0]);

   const taskData = {
     projectId: wsProjectId,
     parentId: section.external_id, // Level 3 - sub-subtask
     title: decomp.decomposition_stage_name,
     emailUserTo: responsibleEmail,
     dateStart: formatDateForWS(decomp.decomposition_stage_start),
     dateEnd: formatDateForWS(decomp.decomposition_stage_finish),
     maxTime: plannedHours,
   };
   ```

3. **CREATE или UPDATE:**

   **CREATE (с чеклистом!):**
   ```javascript
   const checklist = buildChecklist(decomp.items);
   if (checklist) {
     taskData.text = checklist; // Чеклист можно добавить только при CREATE!
   }
   const wsTask = await wsWriter.postTask(taskData);
   ```

   **UPDATE (БЕЗ чеклиста!):**
   ```javascript
   // Сравнение с опцией skipText: true
   const comparison = compareTaskData(wsTask, taskData, { skipText: true });

   // UPDATE без text - чеклист нельзя изменить!
   await wsWriter.updateTask(decomp.external_id, taskData);
   ```

**Результат:**
```javascript
{
  created: 8,
  updated: 4,
  unchanged: 0,
  errors: []
}
```

### Шаг 6: Подсчет статистики

**Файл:** `sync/sync-manager.js`

**Для каждого уровня:**

```javascript
// Unchanged = Total - Created - Updated - Errors
stats.objects.unchanged = objects.length
  - stats.objects.created
  - stats.objects.updated
  - stats.objects.errors.length;

stats.sections.unchanged = sections.length
  - stats.sections.created
  - stats.sections.updated
  - stats.sections.errors.length;

// Для decomposition нужно посчитать total вручную
let totalDecompStages = 0;
sections.forEach(s => {
  totalDecompStages += s.decomposition_stages?.length || 0;
});
stats.decomposition.unchanged = totalDecompStages
  - stats.decomposition.created
  - stats.decomposition.updated
  - stats.decomposition.errors.length;
```

**Итоговое логирование:**
```
+ [timestamp] Sync completed in 15234ms
i [timestamp] Total entities processed: 42
i [timestamp]   Created: 16, Updated: 9, Unchanged: 17
```

### Шаг 7: Отправка отчета в Telegram

**Файл:** `services/telegram.js`

**Метод:** `sendCsvFile(logs, csvStats, startTime, endTime, projectId)`

**Формат отчета:** CSV файл с разделами:
1. PROJECT INFORMATION
2. OBJECTS → TASKS
3. SECTIONS → SUBTASKS
4. DECOMPOSITION STAGES
5. DECOMPOSITION ITEMS
6. SYNC STATISTICS
7. DETAILED LOGS

---

## Маппинг сущностей

### Иерархия в eneca.work

```
Project
  ├── Stages (теги проекта)
  └── Objects
        └── Sections
              └── Decomposition Stages
                    └── Decomposition Items (чеклист)
```

### Иерархия в Worksection

```
Project (с тегами Stages)
  └── Task (Level 1) - Object
        └── Subtask (Level 2) - Section
              └── Sub-subtask (Level 3) - Decomposition Stage
                    └── Checklist в описании - Decomposition Items
```

### Таблица соответствия

| eneca.work | Worksection | Level | Parent | Ответственный | Теги |
|------------|-------------|-------|--------|---------------|------|
| Project | Project | 0 | - | Manager | Stages |
| Stage | Project Tag | - | - | - | - |
| Object | Task | 1 | null | NOONE | - |
| Section | Subtask | 2 | Object Task | User | Department |
| Decomposition Stage | Sub-subtask | 3 | Section Subtask | User | - |
| Decomposition Item | Checklist | - | - | - | - |

### Поля маппинга

#### Project
```javascript
eneca.work              →  Worksection
─────────────────────────────────────
project_name            →  title
project_manager         →  emailManager (через user lookup)
project_start_date      →  dateStart (DD.MM.YYYY)
project_end_date        →  dateEnd (DD.MM.YYYY)
stages[].stage_name     →  tags (через запятую, только CREATE)
```

#### Object → Task
```javascript
eneca.work              →  Worksection
─────────────────────────────────────
object_name             →  title
object_start_date       →  dateStart (DD.MM.YYYY)
object_end_date         →  dateEnd (DD.MM.YYYY)
-                       →  emailUserTo = 'NOONE'
-                       →  parentId = null
```

#### Section → Subtask
```javascript
eneca.work              →  Worksection
─────────────────────────────────────
section_name            →  title
section_responsible     →  emailUserTo (через user lookup)
section_start_date      →  dateStart (DD.MM.YYYY)
section_end_date        →  dateEnd (DD.MM.YYYY)
section_object_id       →  parentId (через objectTaskMap)
user.department         →  tags (только CREATE)
```

#### Decomposition Stage → Sub-subtask
```javascript
eneca.work                      →  Worksection
─────────────────────────────────────────────
decomposition_stage_name        →  title
decomposition_stage_responsibles[0] → emailUserTo
decomposition_stage_start       →  dateStart (DD.MM.YYYY)
decomposition_stage_finish      →  dateEnd (DD.MM.YYYY)
section.external_id             →  parentId
SUM(items[].planned_hours)      →  maxTime
items[]                         →  text (чеклист, только CREATE)
```

---

## Умный UPDATE

### Проблема "слепого" UPDATE

**Было (до оптимизации):**
```javascript
if (obj.external_id) {
  // Всегда UPDATE, даже если данные не изменились
  await wsWriter.updateTask(obj.external_id, taskData);
}
```

**Проблемы:**
- Лишние API запросы (rate limit)
- Непонятно что изменилось
- Пользователь видит "ничего не произошло"

### Решение: Сравнение перед UPDATE

**Стало (с оптимизацией):**
```javascript
if (obj.external_id) {
  // 1. Загрузить текущие данные из WS
  const wsTask = await wsWriter.getTask(obj.external_id);

  // 2. Сравнить данные
  const comparison = compareTaskData(wsTask, taskData);

  // 3. Если нет изменений - пропустить
  if (!comparison.hasChanges) {
    logger.info(`✓ Object unchanged, skipping UPDATE`);
    continue;
  }

  // 4. Логировать детали изменений
  logger.logChanges('Object', obj.object_name, comparison.changes);

  // 5. Выполнить UPDATE
  await wsWriter.updateTask(obj.external_id, taskData);
}
```

### Модуль сравнения данных

**Файл:** `utils/data-comparator.js`

**Функции:**
- `compareProjectData(wsProject, enevaData)` - сравнение проектов
- `compareTaskData(wsTask, enevaData, options)` - сравнение задач

**Особенности:**

1. **Нормализация дат:**
   ```javascript
   // WS API возвращает: "2025-01-15" (YYYY-MM-DD)
   // UPDATE принимает: "15.01.2025" (DD.MM.YYYY)
   // Конвертируем оба формата в DD.MM.YYYY
   ```

2. **Нормализация email:**
   ```javascript
   // WS API возвращает: { user_to: { email: "user@email.com" } }
   // Извлекаем: user_to.email
   // Нормализуем: null → 'NOONE'
   ```

3. **Нормализация тегов:**
   ```javascript
   // WS API возвращает: { "1": "Tag1", "2": "Tag2" }
   // Конвертируем: Object.values() → "Tag1,Tag2"
   ```

4. **Опция skipText:**
   ```javascript
   // Для decomposition не сравниваем text (чеклист нельзя обновить)
   compareTaskData(wsTask, taskData, { skipText: true });
   ```

**Результат сравнения:**
```javascript
{
  hasChanges: true,
  changes: {
    title: { old: "Старое название", new: "Новое название" },
    dateEnd: { old: "15.01.2025", new: "31.01.2025" }
  },
  unchangedFields: ["dateStart", "emailUserTo", "maxTime"]
}
```

### Детальное логирование

**Файл:** `utils/logger.js`

**Метод:** `logChanges(entityType, entityName, changes)`

**Пример вывода:**
```
i [timestamp] Updating section: Раздел 1
i [timestamp]   Changes in Section "Раздел 1":
i [timestamp]     title: "Раздел 23" → "Раздел 1"
i [timestamp]     dateStart: "20.12.2025" → "01.01.2026"
i [timestamp]     dateEnd: "20.01.2026" → "31.01.2026"
```

---

## Обработка ошибок

### Типы ошибок

#### 1. Ошибки валидации

**Причина:** Данные не прошли валидацию WS API

**Примеры:**
- `Tag is invalid` - тег не существует или не добавлен к проекту
- `Invalid email` - email не существует в WS
- `Invalid date` - неверный формат даты

**Обработка:**
```javascript
try {
  await wsWriter.updateTask(taskId, taskData);
} catch (error) {
  logger.warning(`UPDATE failed: ${error.message}`);
  // Fallback: создать новую задачу
  const wsTask = await wsWriter.postTask(taskData);
}
```

#### 2. Ошибки "Task not found"

**Причина:** external_id указывает на несуществующую задачу

**Причины возникновения:**
- Задача была удалена в WS вручную
- Неправильная структура (объект был секцией раньше)
- Миграция данных

**Обработка:**
```javascript
try {
  await wsWriter.updateTask(obj.external_id, taskData);
} catch (updateError) {
  // Задача не существует - создаем новую
  logger.warning(`Task ${obj.external_id} not found, creating new`);
  const wsTask = await wsWriter.postTask(taskData);
  // Обновляем external_id на новый
  await supabase.updateObjectExternalId(obj.object_id, wsTask.id);
}
```

#### 3. Ошибки placeholder (OS проекты)

**Причина:** Объект из ws-to-work OS проекта

**Идентификация:**
```javascript
if (obj.external_id && obj.external_id.includes('_placeholder')) {
  // Это объект из OS проекта - пропускаем
}
```

**Обработка для sections:**
```javascript
if (parentTaskId && parentTaskId.includes('_placeholder')) {
  // Секция должна быть top-level task (не subtask)
  parentTaskId = null;
}
```

#### 4. Ошибки user mapping

**Причина:** Пользователь есть в Supabase, но нет в WS

**Обработка:**
```javascript
const responsibleEmail = await getEmailByUserId(section.section_responsible);

if (!responsibleEmail || responsibleEmail === 'NOONE') {
  logger.warning(`User not found in WS, using NOONE`);
}
```

### Сбор ошибок

**В каждом sync модуле:**
```javascript
const result = {
  created: 0,
  updated: 0,
  errors: []
};

try {
  // Синхронизация
} catch (error) {
  logger.error(`Section sync error: ${error.message}`);
  result.errors.push({
    section_id: section.section_id,
    name: section.section_name,
    error: error.message
  });
}
```

**В sync-manager:**
```javascript
stats.totalErrors =
  (stats.project.error ? 1 : 0) +
  stats.objects.errors.length +
  stats.sections.errors.length +
  stats.decomposition.errors.length;
```

---

## Отчеты и логирование

### Уровни логирования

**Файл:** `utils/logger.js`

```javascript
logger.info('Информационное сообщение')    // i [timestamp]
logger.success('Успешная операция')        // + [timestamp]
logger.warning('Предупреждение')           // ! [timestamp]
logger.error('Ошибка')                     // x [timestamp]
```

### Структура логов

```
i [timestamp] Starting sync for project: uuid
i [timestamp] Step 1: Loading data from eneca.work
i [timestamp] Loaded project: Название проекта
i [timestamp]   Objects: 5
i [timestamp]   Sections: 12

i [timestamp] Step 2: Syncing project
i [timestamp] Project has external_id: 123456, checking for changes
i [timestamp] ✓ Project unchanged, skipping UPDATE: Название проекта

i [timestamp] Step 3: Syncing objects as tasks (Level 1)
i [timestamp] Object has external_id: 789012, checking for changes
i [timestamp] Updating object: Объект 1
i [timestamp]   Changes in Object "Объект 1":
i [timestamp]     dateEnd: "15.01.2025" → "31.01.2025"
+ [timestamp] ✓ Updated object as task: Объект 1

i [timestamp] Objects: 1 created, 2 updated, 2 unchanged

+ [timestamp] Sync completed in 15234ms
i [timestamp] Total entities processed: 42
i [timestamp]   Created: 16, Updated: 9, Unchanged: 17
```

### CSV отчет

**Файл:** `services/telegram.js`

**Секции отчета:**

1. **PROJECT INFORMATION**
   - Project ID (WS)
   - Project Name
   - Status
   - Stage Tags

2. **OBJECTS → TASKS**
   - Object ID
   - Object Name
   - WS Task ID
   - Status
   - Priority
   - Created At

3. **SECTIONS → SUBTASKS**
   - Section ID
   - Section Name
   - Parent Task ID
   - WS Subtask ID
   - Status
   - Budget
   - Created At

4. **DECOMPOSITION STAGES**
   - Stage ID
   - Stage Name
   - Parent Subtask ID
   - WS Sub-subtask ID
   - Status
   - Duration
   - Order
   - Created At

5. **DECOMPOSITION ITEMS**
   - Item ID
   - Content
   - Stage ID
   - Parent Task ID
   - Checked
   - Order
   - Created At

6. **SYNC STATISTICS**
   - Projects: 1
   - Objects Created: X
   - Objects Updated: Y
   - Sections Created: X
   - Sections Updated: Y
   - Stages Created: X
   - Stages Updated: Y
   - Items Created: X
   - Errors: X

7. **DETAILED LOGS**
   - Все логи с timestamp

**Формат даты в CSV:** DD.MM.YYYY HH:MM:SS

### Telegram уведомления

**3 типа сообщений:**

1. **Начало синхронизации:**
   ```
   🚀 Синхронизация запущена
   Project ID: uuid
   Project Name: Название
   Objects: 5 | Sections: 12 | Stages: 24
   ```

2. **Завершение (CSV файл):**
   ```
   📊 Отчёт о синхронизации
   [CSV файл]
   ```

3. **Ошибка:**
   ```
   ❌ Ошибка синхронизации
   Project ID: uuid
   Error: Tag is invalid
   ```

---

## Rate Limiting

**Файл:** `utils/rate-limiter.js`

**Ограничение WS API:** 1 запрос в секунду

**Реализация:**
```javascript
class RateLimiter {
  constructor(delayMs = 1000) {
    this.delayMs = delayMs;
    this.lastRequestTime = 0;
  }

  async wait() {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;

    if (timeSinceLastRequest < this.delayMs) {
      const waitTime = this.delayMs - timeSinceLastRequest;
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }

    this.lastRequestTime = Date.now();
  }
}
```

**Использование:**
```javascript
class WorksectionWriter {
  constructor() {
    this.rateLimiter = new RateLimiter(1000); // 1 req/sec
  }

  async request(action, params) {
    await this.rateLimiter.wait(); // Ждем перед запросом
    const response = await axios.get(url);
    return response.data;
  }
}
```

---

## Dry-Run режим

**Включение:**
```javascript
await syncProjectToWS(projectId, dryRun = true);
```

**Поведение:**
- Все операции логируются с префиксом `[DRY-RUN]`
- Запросы к WS API НЕ выполняются
- external_id НЕ сохраняются в Supabase
- Возвращаются моковые ID: `dry-run-project-id`, `dry-run-task-123456`

**Пример:**
```
! [timestamp] ⚠️  DRY-RUN MODE: NO CHANGES WILL BE MADE TO WORKSECTION
i [timestamp] [DRY-RUN] Would CREATE project: Название проекта
i [timestamp] [DRY-RUN] Would CREATE task (Level 1): Объект 1
i [timestamp] [DRY-RUN]   Project: 123456, Parent: none, Responsible: NOONE
```

---

## Производительность

### Параллелизация

**НЕТ параллелизации** - все выполняется последовательно:

1. Проект (1 запрос)
2. Objects (N запросов)
3. Sections (M запросов)
4. Decomposition (K запросов)

**Причины:**
- Rate limit 1 req/sec
- Зависимости (нужны taskMap)
- Проще отладка

### Оптимизации

1. **Пропуск unchanged:**
   - Экономия UPDATE запросов
   - Если данные не изменились - запрос не отправляется

2. **Кэширование:**
   ```javascript
   // Кэш пользователей WS (загружается 1 раз)
   const userCache = new Map();

   // Кэш отделов (загружается по требованию)
   const departmentCache = new Map();
   ```

3. **Очистка кэшей:**
   ```javascript
   clearCache(); // В начале каждой синхронизации
   ```

### Типичная длительность

- Проект (5 objects, 12 sections, 24 stages): ~40-50 секунд
- 1 object = ~1-2 секунды
- 1 section = ~1-2 секунды
- 1 decomposition = ~1-2 секунды

---

## Конфигурация

**Файл:** `config/env.js`

```javascript
module.exports = {
  supabase: {
    url: process.env.SUPABASE_URL,
    key: process.env.SUPABASE_ANON_KEY
  },
  worksection: {
    domain: process.env.WORKSECTION_DOMAIN,
    hash: process.env.WORKSECTION_HASH
  },
  sync: {
    delayMs: parseInt(process.env.SYNC_DELAY_MS) || 1000
  },
  telegram: {
    enabled: !!(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID),
    botToken: process.env.TELEGRAM_BOT_TOKEN,
    chatIds: [
      process.env.TELEGRAM_CHAT_ID,
      process.env.TELEGRAM_CHAT_ID_2
    ].filter(Boolean)
  }
};
```

---

## Итоговая схема

```
┌─────────────────────────────────────────────────────────────┐
│                    SYNC ORCHESTRATOR                        │
│                  (sync/sync-manager.js)                     │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  STEP 1: Load Data (services/supabase.js)                  │
│    ├─ Project                                               │
│    ├─ Stages                                                │
│    ├─ Objects                                               │
│    └─ Sections (with Decomposition)                        │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  STEP 2: Sync Project (sync/project-sync.js)               │
│    ├─ Compare with WS (utils/data-comparator.js)           │
│    ├─ Log changes (utils/logger.js)                        │
│    └─ CREATE or UPDATE (services/worksection-writer.js)    │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  STEP 3: Sync Objects → Tasks L1 (sync/object-sync.js)     │
│    ├─ For each object:                                      │
│    │   ├─ Compare with WS                                   │
│    │   ├─ Log changes                                       │
│    │   └─ CREATE or UPDATE                                  │
│    └─ Build taskMap (object_id → ws_task_id)               │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  STEP 4: Sync Sections → Subtasks L2 (sync/section-sync.js)│
│    ├─ For each section:                                     │
│    │   ├─ Get parent from taskMap                          │
│    │   ├─ Compare with WS                                   │
│    │   ├─ Log changes                                       │
│    │   └─ CREATE or UPDATE                                  │
│    └─ Build taskMap (section_id → ws_task_id)              │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  STEP 5: Sync Decomposition → Sub-subtasks L3              │
│         (sync/decomposition-sync.js)                        │
│    ├─ For each stage:                                       │
│    │   ├─ Build checklist (mappers/checklist-mapper.js)    │
│    │   ├─ Calculate hours                                   │
│    │   ├─ Compare with WS (skipText: true)                 │
│    │   ├─ Log changes                                       │
│    │   └─ CREATE (with checklist) or UPDATE (without)      │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  STEP 6: Calculate Statistics                              │
│    ├─ Count created/updated/unchanged                       │
│    ├─ Count errors                                          │
│    └─ Calculate duration                                    │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  STEP 7: Send Report (services/telegram.js)                │
│    ├─ Generate CSV                                          │
│    ├─ Send to Telegram                                      │
│    └─ Save to file                                          │
└─────────────────────────────────────────────────────────────┘
```

---

## Дальнейшее развитие

### Возможные улучшения

1. **Bidirectional sync**
   - WS → eneca.work
   - Conflict resolution

2. **Batch operations**
   - Загружать все задачи проекта оптом
   - Сравнивать локально
   - Отправлять только изменения

3. **Webhooks**
   - Автоматическая синхронизация при изменениях
   - Realtime updates

4. **Snapshot system**
   - Хранить состояние после синхронизации
   - Детектировать ручные изменения в WS
   - Предупреждать о конфликтах

5. **Partial sync**
   - Синхронизировать только измененные сущности
   - Отслеживать updated_at

6. **Rollback**
   - Откатывать изменения при ошибках
   - Transactional sync

---

**Документация актуальна на:** 2026-01-05
**Версия системы:** MVP v1.0
