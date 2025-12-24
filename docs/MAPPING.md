# Маппинг сущностей: eneca.work → Worksection

## Визуальная схема

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           eneca.work (Supabase)                         │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  projects ─────────────────────────────────────────────────────────┐    │
│    │ project_id                                                    │    │
│    │ project_name                                                  │    │
│    │ project_manager (uuid → profiles)                             │    │
│    │                                                               │    │
│    └──► stages ──────────────────────────────────────────────┐     │    │
│          │ stage_id                                          │     │    │
│          │ stage_name ("Стадия А")                           │     │    │
│          │ stage_project_id                                  │     │    │
│          │                                                   │     │    │
│          └──► objects ─────────────────────────────────┐     │     │    │
│                │ object_id                             │     │     │    │
│                │ object_name ("1. [Курирование]")      │     │     │    │
│                │ object_stage_id                       │     │     │    │
│                │ object_responsible                    │     │     │    │
│                │ object_start_date                     │     │     │    │
│                │ object_end_date                       │     │     │    │
│                │                                       │     │     │    │
│                └──► sections ────────────────────┐     │     │     │    │
│                      │ section_id                │     │     │     │    │
│                      │ section_name              │     │     │     │    │
│                      │ section_object_id         │     │     │     │    │
│                      │ section_responsible       │     │     │     │    │
│                      │ section_start_date        │     │     │     │    │
│                      │ section_end_date          │     │     │     │    │
│                      │                           │     │     │     │    │
│                      └──► decomposition_stages ──┴─────┴─────┴─────┘    │
│                            │ decomposition_stage_id                     │
│                            │ decomposition_stage_section_id             │
│                            │ decomposition_stage_name                   │
│                            │ decomposition_stage_start                  │
│                            │ decomposition_stage_finish                 │
│                            │ decomposition_stage_responsibles[]         │
│                            │                                            │
│                            └──► decomposition_items                     │
│                                  │ decomposition_item_id                │
│                                  │ decomposition_item_stage_id          │
│                                  │ decomposition_item_description       │
│                                  │ decomposition_item_planned_hours     │
│                                  │ decomposition_item_responsible       │
│                                  └──────────────────────────────────────┘
└─────────────────────────────────────────────────────────────────────────┘


                                    ↓ Синхронизация


┌─────────────────────────────────────────────────────────────────────────┐
│                           Worksection                                   │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Project ───────────────────────────────────────────────────────────┐   │
│    │ id_project                                                     │   │
│    │ title = project_name                                           │   │
│    │ email_manager = profiles[project_manager].email                │   │
│    │ tags = stage_name                                              │   │
│    │                                                                │   │
│    └──► Task (уровень 1) ──────────────────────────────────────┐    │   │
│          │ id_task                                             │    │   │
│          │ id_parent = null                                    │    │   │
│          │ title = object_name                                 │    │   │
│          │ email_user_to = profiles[object_responsible].email  │    │   │
│          │ datestart = object_start_date                       │    │   │
│          │ dateend = object_end_date                           │    │   │
│          │                                                     │    │   │
│          └──► Subtask (уровень 2) ─────────────────────────┐   │    │   │
│                │ id_task                                   │   │    │   │
│                │ id_parent = object.ws_id                  │   │    │   │
│                │ title = section_name                      │   │    │   │
│                │ email_user_to = section_responsible       │   │    │   │
│                │ datestart = section_start_date            │   │    │   │
│                │ dateend = section_end_date                │   │    │   │
│                │                                           │   │    │   │
│                └──► Sub-subtask (уровень 3) ───────────┐   │   │    │   │
│                      │ id_task                         │   │   │    │   │
│                      │ id_parent = section.ws_id       │   │   │    │   │
│                      │ title = decomposition_stage_name│   │   │    │   │
│                      │ datestart = stage_start         │   │   │    │   │
│                      │ dateend = stage_finish          │   │   │    │   │
│                      │ max_time = SUM(planned_hours)   │   │   │    │   │
│                      │                                 │   │   │    │   │
│                      │ text = Чеклист:                 │   │   │    │   │
│                      │   [ ] item_description (Xч)     │   │   │    │   │
│                      │   [ ] item_description (Xч)     │   │   │    │   │
│                      └─────────────────────────────────┴───┴───┴────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

## Таблица маппинга полей

### Project

| eneca.work | Worksection | Метод |
|------------|-------------|-------|
| `project_name` | `title` | post_project / update_project |
| `profiles[project_manager].email` | `email_manager` | post_project / update_project |
| `stages[0].stage_name` | `tags` | post_project / update_project |

### Object → Task (уровень 1)

| eneca.work | Worksection | Метод |
|------------|-------------|-------|
| `object_name` | `title` | post_task / update_task |
| `profiles[object_responsible].email` | `email_user_to` | post_task / update_task |
| `object_start_date` | `datestart` | post_task / update_task |
| `object_end_date` | `dateend` | post_task / update_task |
| - | `id_parent` = null | post_task |

### Section → Subtask (уровень 2)

| eneca.work | Worksection | Метод |
|------------|-------------|-------|
| `section_name` | `title` | post_task / update_task |
| `profiles[section_responsible].email` | `email_user_to` | post_task / update_task |
| `section_start_date` | `datestart` | post_task / update_task |
| `section_end_date` | `dateend` | post_task / update_task |
| `object.ws_id` | `id_parent` | post_task |

### Decomposition Stage → Sub-subtask (уровень 3)

| eneca.work | Worksection | Метод |
|------------|-------------|-------|
| `decomposition_stage_name` | `title` | post_task / update_task |
| `decomposition_stage_start` | `datestart` | post_task / update_task |
| `decomposition_stage_finish` | `dateend` | post_task / update_task |
| `SUM(items.planned_hours)` | `max_time` | post_task / update_task |
| `decomposition_items[]` | `text` (чеклист) | **только post_task!** |
| `section.ws_id` | `id_parent` | post_task |

### Decomposition Item → Строка чеклиста

| eneca.work | Worksection (в text) |
|------------|----------------------|
| `decomposition_item_description` | `[ ] Описание` |
| `decomposition_item_planned_hours` | `(Xч)` |
| `decomposition_item_status_id != null` | `[x]` (выполнено) |

## Формат даты

```
eneca.work:  2025-12-31T00:00:00+00:00  (ISO 8601)
Worksection: 31.12.2025                 (DD.MM.YYYY)
```

## Формат чеклиста

```
[ ] Разработка концепции (4ч)
[ ] Согласование с заказчиком (2ч)
[x] Подготовка ТЗ (8ч)
[ ] Проектирование (16ч)
```

## Ограничения

1. **Максимум 3 уровня вложенности** в WS
2. **text (чеклист) нельзя обновить** после создания
3. **1 запрос в секунду** к WS API
4. **Удаление запрещено** - только create/update
