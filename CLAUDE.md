# CLAUDE.md

Инструкции для Claude Code при работе с этим репозиторием.

## Обзор проекта

Сервис синхронизации данных из eneca.work (Supabase) в Worksection.
Направление: **eneca.work → Worksection** (обратное от ws-to-work).

## КРИТИЧЕСКИЕ ПРАВИЛА

1. **НИКОГДА НЕ УДАЛЯТЬ** данные в Worksection
2. Только CREATE и UPDATE операции
3. Всегда проверять sync_mappings перед созданием
4. Rate limit: 1 запрос/сек к WS API
5. Формат дат WS: DD.MM.YYYY

## Структура проекта

```
work-to-ws/
├── config/env.js           # Конфигурация
├── services/
│   ├── worksection-writer.js   # WS API (запись)
│   ├── supabase-reader.js      # Supabase (чтение)
│   └── sync-mappings.js        # Таблица маппинга
├── sync/
│   ├── sync-manager.js         # Оркестратор
│   ├── project-sync.js         # Проекты
│   ├── object-sync.js          # Objects → Tasks
│   ├── section-sync.js         # Sections → Subtasks
│   └── decomposition-sync.js   # Этапы → Sub-subtasks
├── mappers/                 # Конвертеры данных
├── utils/                   # Утилиты
├── docs/
│   ├── WS-API.md            # Документация WS API
│   └── MAPPING.md           # Маппинг сущностей
└── app.js                   # Express сервер
```

## Маппинг сущностей

```
eneca.work              →    Worksection
─────────────────────────────────────────
Project                 →    Project
Stage                   →    Tag проекта
Object                  →    Task (уровень 1)
Section                 →    Subtask (уровень 2)
Decomposition Stage     →    Sub-subtask (уровень 3)
Decomposition Item      →    Чеклист в описании
```

## Команды

```bash
npm install          # Установка зависимостей
npm start            # Запуск сервера
npm run dev          # Разработка (nodemon)

# API
curl -X POST http://localhost:3002/api/sync \
  -H "Content-Type: application/json" \
  -d '{"project_id": "uuid"}'
```

## Переменные окружения

```env
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=xxx
WORKSECTION_DOMAIN=company.worksection.com
WORKSECTION_HASH=api_key
PORT=3002
SYNC_DELAY_MS=1000
```

## Документация

- [WS-API.md](docs/WS-API.md) - Методы Worksection API
- [MAPPING.md](docs/MAPPING.md) - Маппинг сущностей
- [MVP-PLAN.md](MVP-PLAN.md) - Подробный план разработки

## Правила кода

- Файлы до 300 строк
- Модульная архитектура
- Логирование через utils/logger.js
- Валидация данных перед отправкой
- Обработка ошибок с сохранением в sync_mappings
