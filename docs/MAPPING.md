# Маппинг сущностей: eneca.work → Worksection

## Правильная структура синхронизации

```
eneca.work              →    Worksection
─────────────────────────────────────────────────
Project                 →    Project
Stage                   →    Tag проекта
Object                  →    Task (Level 1)
Section                 →    Subtask (Level 2)
Decomposition Stage     →    Sub-subtask (Level 3)
Decomposition Item      →    Чеклист в text
```

---

## Детальная таблица маппинга

| eneca.work | Worksection | Уровень | Примечание |
|------------|-------------|---------|------------|
| **Project** | **Project** | - | Создается/обновляется по external_id |
| project_name | title | - | Название проекта |
| project_manager | email_manager | - | Email менеджера из profiles |
| project_start_date | datestart | - | Формат DD.MM.YYYY |
| project_end_date | dateend | - | Формат DD.MM.YYYY |
| **Stage** | **Tag** | - | Добавляется к проекту как тег |
| stage_name | tags | - | Например: "Стадия П" |
| **Object** | **Task** | **1** | Верхний уровень задач |
| object_name | title | 1 | Название задачи |
| object_start_date | datestart | 1 | Формат DD.MM.YYYY |
| object_end_date | dateend | 1 | Формат DD.MM.YYYY |
| - | id_parent | 1 | = null (top-level) |
| - | email_user_to | 1 | = NOONE (без ответственного) |
| **Section** | **Subtask** | **2** | Подзадачи объектов |
| section_name | title | 2 | Название подзадачи |
| section_responsible | email_user_to | 2 | Email из profiles |
| section_start_date | datestart | 2 | Формат DD.MM.YYYY |
| section_end_date | dateend | 2 | Формат DD.MM.YYYY |
| section_object_id | id_parent | 2 | = object.external_id |
| **Decomposition Stage** | **Sub-subtask** | **3** | Под-подзадачи |
| decomposition_stage_name | title | 3 | Название |
| decomposition_stage_responsibles[0] | email_user_to | 3 | Первый ответственный из массива |
| decomposition_stage_start | datestart | 3 | Формат DD.MM.YYYY |
| decomposition_stage_finish | dateend | 3 | Формат DD.MM.YYYY |
| items (sum planned_hours) | max_time | 3 | Сумма часов из items |
| - | id_parent | 3 | = section.external_id |
| **Decomposition Item** | **Чеклист** | - | В поле text sub-subtask |
| decomposition_item_description | text | - | Формат: `[ ] Описание (4ч)` |
| decomposition_item_planned_hours | - | - | Добавляется в описание |
| decomposition_item_status_id | - | - | `[x]` если выполнено |

---

## Структура в Worksection (3 уровня)

```
WS Project: "4-ПР-01/25-РД Склад ВБ Ростов"
  ├─ Tag: "Стадия П"
  │
  ├─ Task (Level 1): "1. [Курирование]"           ← Object
  │   ├─ id_parent: null
  │   │
  │   ├─ Subtask (Level 2): "10. АК 64/24-С"      ← Section
  │   │   ├─ id_parent: <task_id>
  │   │   │
  │   │   ├─ Sub-subtask (Level 3): "Этап 10.1"   ← Decomposition Stage
  │   │   │   ├─ id_parent: <subtask_id>
  │   │   │   ├─ max_time: 12ч
  │   │   │   └─ text:
  │   │   │       [ ] Разработка ТЗ (4ч)          ← Decomposition Item
  │   │   │       [ ] Согласование (2ч)
  │   │   │       [x] Подготовка (6ч)
  │   │   │
  │   │   └─ Sub-subtask (Level 3): "Этап 10.2"
  │   │       └─ text: ...
  │   │
  │   └─ Subtask (Level 2): "11. ПБ 64/24-С"
  │       └─ ...
  │
  └─ Task (Level 1): "2. [Проектування]"
      └─ ...
```

---

## Примеры кода

### 1. Создание Project

```javascript
// eneca.work
const project = {
  project_name: "4-ПР-01/25-РД Склад ВБ Ростов",
  project_manager: "user-uuid",
  project_start_date: "2025-01-15T00:00:00Z",
  project_end_date: "2025-06-30T00:00:00Z",
  external_id: null, // Пока не синхронизирован
};

const stage = {
  stage_name: "Стадия П",
};

// Worksection API
await wsWriter.postProject({
  title: "4-ПР-01/25-РД Склад ВБ Ростов",
  email_manager: "manager@example.com",
  datestart: "15.01.2025",
  dateend: "30.06.2025",
  tags: "Стадия П",
});

// → Сохраняем в project.external_id = ws_project_id
```

### 2. Создание Object → Task (Level 1)

```javascript
// eneca.work
const object = {
  object_name: "1. [Курирование]",
  object_responsible: "user-uuid",
  object_start_date: "2025-01-15T00:00:00Z",
  object_end_date: "2025-03-01T00:00:00Z",
  external_id: null,
};

// Worksection API
await wsWriter.postTask({
  id_project: wsProjectId,  // ← Из project.external_id!
  id_parent: null,          // ← Level 1 (top-level)
  title: "1. [Курирование]",
  email_user_to: "user@example.com",
  datestart: "15.01.2025",
  dateend: "01.03.2025",
});

// → Сохраняем в object.external_id = ws_task_id
```

### 3. Создание Section → Subtask (Level 2)

```javascript
// eneca.work
const section = {
  section_name: "10. АК 64/24-С",
  section_object_id: "object-uuid",
  section_responsible: "user-uuid",
  section_start_date: "2025-01-20T00:00:00Z",
  section_end_date: "2025-02-15T00:00:00Z",
  external_id: null,
};

// Worksection API
await wsWriter.postTask({
  id_project: wsProjectId,        // ← Тот же проект!
  id_parent: objectTaskId,        // ← Из object.external_id
  title: "10. АК 64/24-С",
  email_user_to: "user@example.com",
  datestart: "20.01.2025",
  dateend: "15.02.2025",
});

// → Сохраняем в section.external_id = ws_task_id
```

### 4. Создание Decomposition Stage → Sub-subtask (Level 3)

```javascript
// eneca.work
const decomp = {
  decomposition_stage_name: "Этап 10.1",
  decomposition_stage_start: "2025-01-20T00:00:00Z",
  decomposition_stage_finish: "2025-02-01T00:00:00Z",
  items: [
    { decomposition_item_description: "Разработка ТЗ", decomposition_item_planned_hours: 4, decomposition_item_status_id: null },
    { decomposition_item_description: "Согласование", decomposition_item_planned_hours: 2, decomposition_item_status_id: null },
    { decomposition_item_description: "Подготовка", decomposition_item_planned_hours: 6, decomposition_item_status_id: 1 },
  ],
  external_id: null,
};

// Строим чеклист
const checklist = `[ ] Разработка ТЗ (4ч)
[ ] Согласование (2ч)
[x] Подготовка (6ч)`;

const maxTime = 4 + 2 + 6; // = 12ч

// Worksection API
await wsWriter.postTask({
  id_project: wsProjectId,        // ← Тот же проект!
  id_parent: sectionTaskId,       // ← Из section.external_id
  title: "Этап 10.1",
  datestart: "20.01.2025",
  dateend: "01.02.2025",
  max_time: 12,
  text: checklist,                // ← Чеклист (только при CREATE!)
});

// → Сохраняем в decomposition_stage.external_id = ws_task_id
```

---

## Важные правила

### 1. ВСЕ сущности в ОДНОМ WS проекте

✅ **ПРАВИЛЬНО:**
```
Supabase Project "4-ПР-01/25-РД"
  → WS Project "4-ПР-01/25-РД" (ID: 129493)
      ├─ Task 1 (Object "1. [Курирование]")
      ├─ Task 2 (Object "2. [Проектування]")
      └─ Task 3 (Object "3. [ГИП]")
```

❌ **НЕПРАВИЛЬНО** (старая версия):
```
Supabase Project "4-ПР-01/25-РД"
  ├─ WS Project "1. [Курирование]" (Object 1)
  ├─ WS Project "2. [Проектування]" (Object 2)
  └─ WS Project "3. [ГИП]" (Object 3)
```

### 2. Один wsProjectId для всех уровней

```javascript
// ПРАВИЛЬНО: Все используют один wsProjectId
await wsWriter.postTask({ id_project: wsProjectId, id_parent: null });           // Object → Task
await wsWriter.postTask({ id_project: wsProjectId, id_parent: objectTaskId });   // Section → Subtask
await wsWriter.postTask({ id_project: wsProjectId, id_parent: sectionTaskId });  // Decomp → Sub-subtask
```

### 3. Чеклист можно установить ТОЛЬКО при создании

```javascript
// CREATE - можно передать text
await wsWriter.postTask({
  id_project: wsProjectId,
  id_parent: sectionTaskId,
  title: "Этап 10.1",
  text: "[ ] Задача 1\n[ ] Задача 2",  // ✅ OK
});

// UPDATE - text игнорируется!
await wsWriter.updateTask(taskId, {
  title: "Этап 10.1 (обновлено)",
  text: "[ ] Новая задача",  // ❌ НЕ РАБОТАЕТ! Чеклист не изменится!
});
```

### 4. parentId определяет уровень

```javascript
// Level 1 (Object → Task)
{ id_parent: null }

// Level 2 (Section → Subtask)
{ id_parent: object.external_id }

// Level 3 (Decomposition → Sub-subtask)
{ id_parent: section.external_id }
```

---

## Совместимость с ws-to-work

При правильной структуре **Project → WS Project** синхронизация work-to-ws **СОВМЕСТИМА** с ws-to-work:

```
┌─────────────────────────────────────────────────────┐
│  ДВУСТОРОННЯЯ СИНХРОНИЗАЦИЯ                         │
├─────────────────────────────────────────────────────┤
│                                                      │
│  work-to-ws (eneca.work → Worksection):             │
│    Project → WS Project                             │
│    Object → Task (Level 1)                          │
│    Section → Subtask (Level 2)                      │
│                                                      │
│  ↕ СОВМЕСТИМО ↕                                     │
│                                                      │
│  ws-to-work (Worksection → eneca.work):             │
│    WS Project → Project                             │
│    Task Group → Object                              │
│    Subtask → Section                                │
│                                                      │
└─────────────────────────────────────────────────────┘
```

**Результат:** Нет дубликатов, обе синхронизации работают с одной сущностью WS Project!

---

## Отличия от неправильной структуры

| Аспект | ❌ Неправильно (Object → WS Project) | ✅ Правильно (Project → WS Project) |
|--------|--------------------------------------|-------------------------------------|
| WS проектов | 3 (по одному на Object) | 1 (один на весь Project) |
| Совместимость с ws-to-work | Конфликты, дубликаты | Полная совместимость |
| Структура | Плоская (Objects в разных проектах) | Иерархическая (3 уровня в одном проекте) |
| external_id проекта | У каждого Object | У Project (один раз) |
| parentId для Sections | null (top-level в "своем" проекте) | object.external_id (Level 2) |
| Количество API запросов | Больше (создание нескольких проектов) | Меньше (один проект) |

---

## Заключение

**Правильная структура:**
1. 1 Supabase Project = 1 WS Project
2. Objects = Tasks внутри этого проекта (Level 1)
3. Sections = Subtasks объектов (Level 2)
4. Decomposition Stages = Sub-subtasks разделов (Level 3)

Это обеспечивает:
- ✅ Совместимость с ws-to-work
- ✅ Правильную иерархию в WS
- ✅ Использование всех 3 уровней WS API
- ✅ Отсутствие дубликатов
