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
│   ├── sync-mappings.js        # Таблица маппинга
│   └── telegram.js             # Отправка отчётов в Telegram
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
# Supabase
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=xxx

# Worksection
WORKSECTION_DOMAIN=company.worksection.com
WORKSECTION_HASH=api_key

# Server
PORT=3002
SYNC_DELAY_MS=1000

# Telegram (опционально)
TELEGRAM_BOT_TOKEN=xxx
TELEGRAM_CHAT_ID=xxx
TELEGRAM_CHAT_ID_2=xxx  # опционально, второй чат
```

## Telegram интеграция

### Автоматическая отправка отчётов

При каждой синхронизации автоматически отправляются:
1. 🚀 **Уведомление о начале** - отправляется перед запуском синхронизации
2. 📊 **CSV файл с отчётом** - детальная статистика после завершения
3. ❌ **Уведомления об ошибках** - при возникновении ошибок

### Формат отчёта

CSV файл содержит:
- **PROJECT INFORMATION** - информация о проекте и тегах
- **OBJECTS → TASKS** - все созданные/обновлённые объекты (уровень 1)
- **SECTIONS → SUBTASKS** - все секции (уровень 2)
- **DECOMPOSITION STAGES** - все этапы декомпозиции (уровень 3)
- **DECOMPOSITION ITEMS** - все элементы чеклистов
- **SYNC STATISTICS** - итоговая статистика (создано, обновлено, ошибки)
- **DETAILED LOGS** - полный лог синхронизации с временными метками

Формат даты в CSV: **DD.MM.YYYY HH:MM:SS**

### Настройка Telegram

1. **Создать бота через @BotFather:**
   ```
   /newbot
   Укажите имя и username бота
   Получите TELEGRAM_BOT_TOKEN
   ```

2. **Получить Chat ID:**
   - Отправьте любое сообщение вашему боту
   - Откройте: `https://api.telegram.org/bot<BOT_TOKEN>/getUpdates`
   - Найдите `"chat":{"id":123456789}`

3. **Добавить переменные в .env:**
   ```env
   TELEGRAM_BOT_TOKEN=your_bot_token
   TELEGRAM_CHAT_ID=your_chat_id
   TELEGRAM_CHAT_ID_2=second_chat_id  # опционально
   ```

4. **Перезапустить сервис:**
   ```bash
   npm start
   ```

### Отправка в два чата

Отчёты автоматически отправляются в оба чата, если указаны:
- `TELEGRAM_CHAT_ID` - основной чат (обязательный)
- `TELEGRAM_CHAT_ID_2` - дополнительный чат (опционально)

### Отключение Telegram

Чтобы отключить отправку отчётов:
- Удалите или закомментируйте `TELEGRAM_BOT_TOKEN` в .env
- Или удалите `TELEGRAM_CHAT_ID`

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
