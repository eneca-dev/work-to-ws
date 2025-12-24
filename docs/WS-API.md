# Worksection API - Документация для записи

> Этот файл содержит справочник методов Worksection API, необходимых для синхронизации eneca.work → Worksection.

## Аутентификация

**Base URL:** `https://{domain}.worksection.com/api/admin/v2/`

**Формирование запроса:**
```javascript
// 1. Собираем query параметры
const queryParams = new URLSearchParams({ action, ...params });
const queryString = queryParams.toString();

// 2. Генерируем MD5 хеш: query + API_KEY
const hash = MD5(queryString + API_KEY);

// 3. Добавляем хеш к параметрам
queryParams.append('hash', hash);

// 4. Делаем GET запрос
const url = `${baseUrl}?${queryParams.toString()}`;
```

**Ограничения:**
- Частота запросов: **1 запрос в секунду**
- GET запросы: максимум 8 KB
- POST описания: максимум 65 KB
- Записей в ответе: максимум 10,000

---

## Проекты

### post_project - Создание проекта

```
?action=post_project&title=Название проекта
```

| Параметр | Обязательный | Описание |
|----------|--------------|----------|
| `title` | Да | Название проекта |
| `email_user_from` | Нет | Email автора |
| `email_manager` | Нет | Email менеджера |
| `email_user_to` | Нет | Email ответственного |
| `members` | Нет | Участники (emails через запятую) |
| `text` | Нет | Описание проекта |
| `datestart` | Нет | Дата начала (DD.MM.YYYY) |
| `dateend` | Нет | Дата окончания (DD.MM.YYYY) |
| `max_time` | Нет | Плановые часы |
| `max_money` | Нет | Бюджет |
| `tags` | Нет | Теги (названия или ID через запятую) |

**Ответ:**
```json
{
  "status": "ok",
  "data": {
    "id": "123456",
    "name": "Название проекта",
    "page": "/project/123456/"
  }
}
```

### update_project - Обновление проекта

```
?action=update_project&id_project=123456&title=Новое название
```

| Параметр | Обязательный | Описание |
|----------|--------------|----------|
| `id_project` | Да | ID проекта |
| `title` | Нет | Новое название |
| `email_manager` | Нет | Новый менеджер |
| `email_user_to` | Нет | Новый ответственный |
| `members` | Нет | Новые участники |
| `datestart` | Нет | Новая дата начала |
| `dateend` | Нет | Новая дата окончания |
| `max_time` | Нет | Новые плановые часы |
| `max_money` | Нет | Новый бюджет |
| `tags` | Нет | Новые теги |

**Нельзя обновить:** `email_user_from`, `text`, `company`

### get_projects - Получение списка проектов

```
?action=get_projects
```

| Параметр | Описание |
|----------|----------|
| `filter` | active / pending / archived |
| `extra` | text, html, options, users |

---

## Задачи (Tasks)

### post_task - Создание задачи/подзадачи

```
?action=post_task&id_project=123456&title=Название задачи
```

| Параметр | Обязательный | Описание |
|----------|--------------|----------|
| `id_project` | Да | ID проекта |
| `title` | Да | Название задачи |
| `id_parent` | Нет | ID родительской задачи (для подзадач) |
| `email_user_from` | Нет | Email автора |
| `email_user_to` | Нет | Email ответственного. Спец.значения: `ANY` (любой), `NOONE` (без ответственного) |
| `priority` | Нет | Приоритет 0-10 |
| `text` | Нет | Описание задачи (для чеклиста!) |
| `datestart` | Нет | Дата начала (DD.MM.YYYY) |
| `dateend` | Нет | Дата окончания (DD.MM.YYYY) |
| `max_time` | Нет | Плановые часы |
| `max_money` | Нет | Бюджет |
| `tags` | Нет | Теги |
| `subscribe` | Нет | Подписчики (emails) |

**Ответ:**
```json
{
  "status": "ok",
  "data": {
    "id": "789012",
    "name": "Название задачи",
    "page": "/project/123456/789012/"
  }
}
```

### update_task - Обновление задачи

```
?action=update_task&id_task=789012&title=Новое название
```

| Параметр | Обязательный | Описание |
|----------|--------------|----------|
| `id_task` | Да | ID задачи |
| `title` | Нет | Новое название |
| `email_user_to` | Нет | Новый ответственный |
| `priority` | Нет | Новый приоритет |
| `datestart` | Нет | Новая дата начала |
| `dateend` | Нет | Новая дата окончания |
| `max_time` | Нет | Новые плановые часы |
| `max_money` | Нет | Новый бюджет |
| `tags` | Нет | Новые теги |

**ВАЖНО! Нельзя обновить:**
- `text` (описание) - чеклист можно добавить только при создании!
- `email_user_from` (автор)
- `subscribe` (подписчики)

### complete_task - Закрытие задачи

```
?action=complete_task&id_task=789012
```

### reopen_task - Переоткрытие задачи

```
?action=reopen_task&id_task=789012
```

### get_tasks - Получение задач проекта

```
?action=get_tasks&id_project=123456
```

| Параметр | Описание |
|----------|----------|
| `extra` | subtasks, text, html, files, comments |
| `filter` | active (только незакрытые) |

---

## Теги

### get_task_tags - Получение тегов задач

```
?action=get_task_tags
```

| Параметр | Описание |
|----------|----------|
| `group` | ID или название группы |
| `type` | status / label |
| `access` | public / private |

### add_task_tags - Создание тегов

```
?action=add_task_tags&group=GroupName&title=Tag1,Tag2
```

### update_task_tags - Назначение тегов задаче

```
?action=update_task_tags&id_task=789012&plus=Tag1,Tag2&minus=OldTag
```

| Параметр | Описание |
|----------|----------|
| `id_task` | ID задачи |
| `plus` | Теги для добавления (через запятую) |
| `minus` | Теги для удаления (через запятую) |

### get_project_tags / update_project_tags

Аналогично тегам задач, но для проектов.

---

## Пользователи

### get_users - Получение списка пользователей

```
?action=get_users
```

**Ответ включает:** ID, имя, email, телефон, роль, аватар, группа, отдел, ставка.

---

## Затраты (Costs)

### add_costs - Добавление затрат

```
?action=add_costs&id_task=789012&time=2.5&comment=Описание работы
```

| Параметр | Обязательный | Описание |
|----------|--------------|----------|
| `id_task` | Да | ID задачи |
| `time` | Условно | Время (часы: 2.5 или 2:30) |
| `money` | Условно | Деньги (в валюте аккаунта) |
| `is_rate` | Нет | =1 для расчета по ставке |
| `comment` | Нет | Комментарий |
| `date` | Нет | Дата (DD.MM.YYYY) |

**Требуется хотя бы один:** `time` или `money`

---

## Иерархия задач в Worksection

```
Проект (id_project)
  └── Задача (id_task, id_parent = null)      ← Уровень 1
        └── Подзадача (id_parent = task_id)    ← Уровень 2
              └── Под-подзадача (id_parent)     ← Уровень 3
                    └── Чеклист в описании (text)
```

**Максимум 3 уровня вложенности!**

---

## Формат дат

Worksection использует формат **DD.MM.YYYY**

```javascript
function formatDateForWS(isoDate) {
  if (!isoDate) return null;
  const date = new Date(isoDate);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}.${month}.${year}`;
}
```

---

## Формат чеклиста в описании

Чеклист добавляется в поле `text` при создании задачи:

```
Описание задачи

[x] Выполненный пункт
[ ] Невыполненный пункт
[ ] Еще один пункт
```

**ВАЖНО:** После создания задачи описание (text) нельзя изменить через API!

---

## Коды ошибок

| Статус | Описание |
|--------|----------|
| `ok` | Успешно |
| `error` | Ошибка (см. message) |

Частые ошибки:
- `Access denied` - нет прав
- `Project not found` - проект не найден
- `Task not found` - задача не найдена
- `Invalid hash` - неверный хеш аутентификации
- `Rate limit exceeded` - превышен лимит запросов
