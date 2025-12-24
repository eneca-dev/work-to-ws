# MVP План: work-to-ws

## Синхронизация eneca.work → Worksection

> **КРИТИЧНО:** Никогда не удалять данные в Worksection! Только создание и обновление.

---

## 1. Обзор проекта

### Цель
Создать сервис синхронизации структуры проекта из eneca.work в Worksection по запросу.

### Триггер
HTTP запрос с ID проекта eneca.work из интерфейса eneca.work (кнопка "Синхронизировать в WS").

### Принципы
1. **Только CREATE/UPDATE** - никогда не DELETE
2. **Идемпотентность** - повторный запуск обновляет, не дублирует
3. **По запросу** - не по таймеру
4. **Хранение связей** - сохраняем ws_id для повторной синхронизации

---

## 2. Структура данных

### eneca.work (Supabase)

```
projects
  └── stages                    (стадия проекта: "Стадия А")
        └── objects             (объект: "1. [Курирование]")
              └── sections      (раздел: "10. АК 64/24-С")
                    └── decomposition_stages    (этап: "Этап 10. АК...")
                          └── decomposition_items   (задача: с planned_hours)
```

### Worksection (3 уровня)

```
Project
  └── Task (уровень 1)           ← id_parent = null
        └── Subtask (уровень 2)   ← id_parent = task_id
              └── Sub-subtask (уровень 3) ← id_parent = subtask_id
                    └── Чеклист в описании (text)
```

### Маппинг сущностей

| eneca.work | Worksection | Уровень | Примечание |
|------------|-------------|---------|------------|
| Project | Project | - | Создается если нет |
| Stage | Tag проекта | - | Метка стадии |
| Object | Task | 1 | Верхний уровень |
| Section | Subtask | 2 | id_parent = object.ws_id |
| Decomposition Stage | Sub-subtask | 3 | id_parent = section.ws_id |
| Decomposition Item | Чеклист в описании | - | В text при создании |

---

## 3. Хранение связей с Worksection

### Используем существующие поля external_id

В таблицах eneca.work уже есть поля `external_id` и `external_source`:

| Таблица | external_id | external_source | Статус |
|---------|-------------|-----------------|--------|
| projects | ✅ Есть | ✅ Есть | Готово |
| objects | ✅ Есть | ✅ Есть | Готово |
| sections | ✅ Есть | ✅ Есть | Готово |
| decomposition_stages | ❌ Нет | ❌ Нет | Нужна миграция |

### Миграция для decomposition_stages

```sql
-- Добавляем поля для хранения связи с WS
ALTER TABLE decomposition_stages
ADD COLUMN IF NOT EXISTS external_id TEXT,
ADD COLUMN IF NOT EXISTS external_source TEXT;

-- Индекс для быстрого поиска
CREATE INDEX IF NOT EXISTS idx_decomposition_stages_external
ON decomposition_stages(external_id, external_source);
```

### Логика использования

```javascript
// При синхронизации:
if (entity.external_id) {
  // Уже есть в WS → обновляем
  await ws.updateTask(entity.external_id, data);
} else {
  // Нет в WS → создаем и сохраняем ID
  const result = await ws.postTask(data);
  await supabase.update(entity.id, {
    external_id: result.id,
    external_source: 'worksection'
  });
}
```

---

## 4. Архитектура приложения

```
work-to-ws/
│
├── config/
│   └── env.js                      # Конфигурация (копия из ws-to-work)
│
├── services/
│   ├── worksection-writer.js       # WS API клиент для ЗАПИСИ
│   └── supabase.js                 # Supabase клиент (чтение + запись external_id)
│
├── sync/
│   ├── sync-manager.js             # Оркестратор синхронизации
│   ├── project-sync.js             # Проект + теги стадий
│   ├── object-sync.js              # Objects → Tasks
│   ├── section-sync.js             # Sections → Subtasks
│   └── decomposition-sync.js       # Этапы → Sub-subtasks + чеклист
│
├── mappers/
│   ├── date-mapper.js              # ISO → DD.MM.YYYY
│   ├── user-mapper.js              # UUID → email по profiles
│   └── checklist-mapper.js         # decomposition_items → текст чеклиста
│
├── utils/
│   ├── logger.js                   # Логирование (копия)
│   ├── rate-limiter.js             # Ограничение 1 req/sec
│   └── validator.js                # Валидация данных
│
├── docs/
│   ├── WS-API.md                   # Документация WS API
│   └── MAPPING.md                  # Маппинг сущностей
│
├── app.js                          # Express сервер
├── package.json
├── .env
└── CLAUDE.md
```

---

## 5. Алгоритм синхронизации

### Входные данные
```
POST /api/sync
Content-Type: application/json

{
  "project_id": "uuid-проекта-eneca-work"
}
```

### Последовательность шагов

```
┌─────────────────────────────────────────────────────────────┐
│  1. ПОЛУЧЕНИЕ ДАННЫХ ИЗ ENECA.WORK                          │
├─────────────────────────────────────────────────────────────┤
│  • Получить проект по ID                                     │
│  • Получить stage проекта                                    │
│  • Получить все objects проекта                              │
│  • Получить все sections проекта                             │
│  • Получить decomposition_stages для каждого section         │
│  • Получить decomposition_items для каждого stage            │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  2. СИНХРОНИЗАЦИЯ ПРОЕКТА                                   │
├─────────────────────────────────────────────────────────────┤
│  • Проверить project.external_id: есть?                     │
│    ├─ НЕТ → post_project() → сохранить ID в external_id     │
│    └─ ДА  → update_project(external_id)                     │
│  • Добавить тег стадии к проекту                            │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  3. СИНХРОНИЗАЦИЯ OBJECTS → TASKS (уровень 1)               │
├─────────────────────────────────────────────────────────────┤
│  Для каждого object:                                         │
│  • Проверить object.external_id: есть?                      │
│    ├─ НЕТ → post_task(id_project) → сохранить в external_id │
│    └─ ДА  → update_task(external_id)                        │
│  • Назначить ответственного (object_responsible → email)    │
│  • Установить даты (object_start_date, object_end_date)     │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  4. СИНХРОНИЗАЦИЯ SECTIONS → SUBTASKS (уровень 2)           │
├─────────────────────────────────────────────────────────────┤
│  Для каждого section:                                        │
│  • Найти external_id родительского object (id_parent)       │
│  • Проверить section.external_id: есть?                     │
│    ├─ НЕТ → post_task(id_parent) → сохранить в external_id  │
│    └─ ДА  → update_task(external_id)                        │
│  • Назначить ответственного (section_responsible → email)   │
│  • Установить даты                                           │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  5. СИНХРОНИЗАЦИЯ DECOMPOSITION_STAGES → SUB-SUBTASKS       │
├─────────────────────────────────────────────────────────────┤
│  Для каждого decomposition_stage:                            │
│  • Найти external_id родительского section (id_parent)      │
│  • Собрать чеклист из decomposition_items                   │
│  • Проверить stage.external_id: есть?                       │
│    ├─ НЕТ → post_task(id_parent, text=чеклист)              │
│    │        → сохранить в external_id                       │
│    └─ ДА  → update_task() (без text - нельзя!)              │
│  • Назначить ответственных                                   │
│  • Установить даты и плановые часы (max_time)               │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  6. РЕЗУЛЬТАТ                                                │
├─────────────────────────────────────────────────────────────┤
│  Вернуть статистику:                                         │
│  • Проект: created/updated                                   │
│  • Objects (tasks): created/updated                          │
│  • Sections (subtasks): created/updated                      │
│  • Decomposition (sub-subtasks): created/updated             │
│  • Ошибки если были                                          │
└─────────────────────────────────────────────────────────────┘
```

---

## 6. Детали реализации

### 6.1 Получение данных из eneca.work

```javascript
// supabase-reader.js

async getProjectFull(projectId) {
  // 1. Проект
  const project = await this.getProjectById(projectId);

  // 2. Стадия проекта
  const stages = await this.getStagesByProjectId(projectId);

  // 3. Объекты
  const objects = await this.getObjectsByProjectId(projectId);

  // 4. Разделы
  const sections = await this.getSectionsByProjectId(projectId);

  // 5. Этапы декомпозиции для каждого раздела
  for (const section of sections) {
    section.decomposition_stages = await this.getDecompositionStages(section.section_id);

    // 6. Задачи декомпозиции для каждого этапа
    for (const stage of section.decomposition_stages) {
      stage.items = await this.getDecompositionItems(stage.decomposition_stage_id);
    }
  }

  return { project, stages, objects, sections };
}
```

### 6.2 Создание/обновление в Worksection

```javascript
// worksection-writer.js

async postProject(data) {
  return this.request('post_project', {
    title: data.name,
    email_manager: data.managerEmail,
    datestart: formatDate(data.startDate),
    dateend: formatDate(data.endDate),
    tags: data.stageName // Тег стадии
  });
}

async postTask(data) {
  return this.request('post_task', {
    id_project: data.projectId,
    id_parent: data.parentId || null,    // Для подзадач
    title: data.name,
    email_user_to: data.responsibleEmail || 'NOONE',
    datestart: formatDate(data.startDate),
    dateend: formatDate(data.endDate),
    max_time: data.plannedHours,
    text: data.description || data.checklist  // Чеклист только при создании!
  });
}

async updateTask(taskId, data) {
  // ВАЖНО: text (чеклист) нельзя обновить!
  return this.request('update_task', {
    id_task: taskId,
    title: data.name,
    email_user_to: data.responsibleEmail,
    datestart: formatDate(data.startDate),
    dateend: formatDate(data.endDate),
    max_time: data.plannedHours
  });
}
```

### 6.3 Формирование чеклиста

```javascript
// checklist-mapper.js

function buildChecklist(decompositionItems) {
  if (!decompositionItems || decompositionItems.length === 0) {
    return null;
  }

  const lines = decompositionItems.map(item => {
    const status = item.decomposition_item_status_id ? '[x]' : '[ ]';
    const hours = item.decomposition_item_planned_hours
      ? ` (${item.decomposition_item_planned_hours}ч)`
      : '';
    return `${status} ${item.decomposition_item_description}${hours}`;
  });

  return lines.join('\n');
}

// Пример результата:
// [ ] Разработка ТЗ (4ч)
// [ ] Согласование с заказчиком (2ч)
// [x] Подготовка документации (8ч)
```

### 6.4 Назначение ответственных

```javascript
// user-mapper.js

async getEmailByUserId(userId) {
  if (!userId) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select('email')
    .eq('user_id', userId)
    .single();

  return data?.email || null;
}

// Использование:
const responsibleEmail = await getEmailByUserId(section.section_responsible);
await ws.postTask({
  ...taskData,
  email_user_to: responsibleEmail || 'NOONE'
});
```

### 6.5 Rate Limiting

```javascript
// rate-limiter.js

class RateLimiter {
  constructor(delayMs = 1000) {
    this.delayMs = delayMs;
    this.lastRequest = 0;
  }

  async wait() {
    const now = Date.now();
    const elapsed = now - this.lastRequest;

    if (elapsed < this.delayMs) {
      await this.sleep(this.delayMs - elapsed);
    }

    this.lastRequest = Date.now();
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Использование в worksection-writer.js:
async request(action, params) {
  await this.rateLimiter.wait();  // Ждем 1 секунду между запросами
  // ... делаем запрос
}
```

---

## 7. Обработка ситуаций

### 7.1 Первая синхронизация (проект не существует в WS)

```
1. project.external_id пустой
2. Создаем проект: post_project() → получаем ws_project_id
3. Сохраняем: UPDATE projects SET external_id = ws_id
4. Создаем tasks для objects → сохраняем external_id
5. Создаем subtasks для sections → сохраняем external_id
6. Создаем sub-subtasks для decomposition_stages → сохраняем external_id
```

### 7.2 Повторная синхронизация (проект уже существует)

```
1. project.external_id есть → используем как ws_project_id
2. Обновляем проект: update_project(external_id)
3. Для каждого object:
   - Если external_id есть → update_task()
   - Если external_id пустой → post_task() (новый object)
4. Аналогично для sections и decomposition_stages
```

### 7.3 Новые сущности добавлены в eneca.work

```
1. При синхронизации проверяем external_id каждой сущности
2. Если пустой → создаем в WS и сохраняем ID в external_id
3. Если есть → обновляем
```

### 7.4 Сущность удалена в eneca.work

```
НИЧЕГО НЕ ДЕЛАЕМ!
- В WS задача остается
- Это предотвращает потерю данных (деньги, логи работы)
```

### 7.5 Ошибка при синхронизации

```
1. Логируем ошибку
2. Продолжаем синхронизацию остальных сущностей
3. В конце возвращаем список ошибок
```

### 7.6 Чеклист изменился (decomposition_items)

```
ОГРАНИЧЕНИЕ WS API: text нельзя обновить!

Варианты:
A) Игнорировать изменения чеклиста (MVP)
B) Добавлять комментарий с обновленным чеклистом
C) Показывать предупреждение пользователю

Для MVP: вариант A - чеклист фиксируется при первом создании
```

---

## 8. API Endpoints

### POST /api/sync

Запуск синхронизации проекта.

**Request:**
```json
{
  "project_id": "uuid-проекта"
}
```

**Response 200:**
```json
{
  "success": true,
  "project_id": "uuid-проекта",
  "ws_project_id": 123456,
  "stats": {
    "project": { "action": "updated" },
    "objects": { "created": 2, "updated": 5 },
    "sections": { "created": 10, "updated": 15 },
    "decomposition_stages": { "created": 5, "updated": 8 }
  },
  "errors": [],
  "duration_ms": 15230
}
```

**Response 400:**
```json
{
  "success": false,
  "error": "project_id is required"
}
```

**Response 500:**
```json
{
  "success": false,
  "error": "Sync failed",
  "details": "WS API error: Rate limit exceeded"
}
```

### GET /api/status/:project_id

Статус последней синхронизации.

### GET /api/health

Проверка здоровья сервиса.

---

## 9. MVP Scope

### Включено в MVP v1

- [x] Синхронизация проекта (create/update)
- [x] Тег стадии на проекте
- [x] Objects → Tasks (уровень 1)
- [x] Sections → Subtasks (уровень 2)
- [x] Decomposition Stages → Sub-subtasks (уровень 3)
- [x] Decomposition Items → Чеклист в описании
- [x] Назначение ответственных по email
- [x] Синхронизация дат (start/end)
- [x] Плановые часы (max_time)
- [x] Идемпотентность через sync_mappings
- [x] Rate limiting (1 req/sec)
- [x] Базовое логирование

### Отложено на v2

- [ ] Бюджеты (max_money) - "отдельно поговорим"
- [ ] Статусы задач (complete_task/reopen_task)
- [ ] Telegram уведомления
- [ ] Webhook из eneca.work
- [ ] Batch синхронизация нескольких проектов
- [ ] Обновление чеклиста через комментарии

---

## 10. Переменные окружения

```env
# Supabase (чтение из eneca.work)
SUPABASE_URL=https://gvrcbvifirhxxdnvrwlz.supabase.co
SUPABASE_ANON_KEY=xxx

# Worksection (запись)
WORKSECTION_DOMAIN=company.worksection.com
WORKSECTION_HASH=api_key_here

# Сервер
PORT=3002

# Ограничения
SYNC_DELAY_MS=1000
SYNC_MAX_RETRIES=3
```

---

## 11. Порядок разработки

### Этап 1: Boilerplate
1. Скопировать config/env.js из ws-to-work
2. Скопировать utils/logger.js
3. Создать package.json с зависимостями
4. Настроить .env

### Этап 2: Сервисы
1. supabase.js - чтение данных + запись external_id
2. Выполнить миграцию для decomposition_stages
3. Тестирование чтения данных

### Этап 3: Сервис записи в WS
1. worksection-writer.js - методы записи
2. rate-limiter.js
3. Тестирование на тестовом проекте

### Этап 4: Синхронизация
1. sync-manager.js - оркестратор
2. project-sync.js
3. object-sync.js
4. section-sync.js
5. decomposition-sync.js

### Этап 5: Mappers
1. date-mapper.js
2. user-mapper.js
3. checklist-mapper.js

### Этап 6: API и тестирование
1. app.js с endpoints
2. Тестирование на реальном проекте
3. Проверка идемпотентности

---

## 12. Вопросы для уточнения

1. **Права в WS:** Есть ли у API-ключа права на создание проектов и задач?

2. **Участники проекта:** Нужно ли добавлять members при создании проекта?

3. **Группы тегов:** Нужно ли создавать группу тегов для стадий или использовать существующую?

4. **Плановые часы:** Откуда брать для section - сумма decomposition_items или отдельное поле?

5. **Тестовый проект:** Есть ли тестовый проект в WS для отладки?

---

## 13. Риски и митигация

| Риск | Вероятность | Митигация |
|------|-------------|-----------|
| Rate limit WS | Высокая | Строгий rate limiter 1 req/sec |
| Нет прав в WS | Средняя | Проверить до начала разработки |
| Дубликаты при сбое | Низкая | Идемпотентность через sync_mappings |
| Потеря данных в WS | Низкая | Никогда не удаляем, только create/update |
| Изменение структуры БД | Низкая | Валидация данных перед синхронизацией |
