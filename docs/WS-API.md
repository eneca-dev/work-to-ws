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




Задания 
Получение списка всех задач аккаунта через API: get_all_tasks
Получение задач проекта через API: get_tasks
Получение отдельной задачи через API: get_task
Создание задачи через API: post_task
Редактирование задачи через API: update_task
Закрытие задачи через API: complete_task
Повторное открытие задачи через API: reopen_task
Поиск задач через API: search_tasks
Получение списка всех задач аккаунта через API: get_all_tasks

Пример get_all_tasks запроса

?action=get_all_tasks
Возвращает открытые и закрытые задания по всем проектам
*кроме заданий с отложенной публикацией
*для возвращения подзаданий используйте параметр extra=subtasks

Необязательные параметры:
extra — дополнительные данные по заданиям, возможные значения (можно указывать через запятую, например extra=text,files):
text или html — описание в текстовом или html формате
files — информация о файлах, прикрепленных в описание задания
comments — пять последних комментариев
relations — информация о связях с другими заданиями
subtasks — информация о подзаданиях (в массиве child)
archive — задания архивных проектов
filter=active — только открытые задания (фильтр только по закрытым не предусмотрен) 
Возвращаемые данные: 
id — ID задания
name — название задания
page — ссылка на задание
status — состояние (active/done — открытая/закрытая)
priority — приоритет (диапазон значений: 0..10)
user_from и user_to — автор и ответственный по заданию
project — информация о проекте
text — описание задания в текстовом или html формате (если в запросе указан соответствующий параметр extra)
date_added — дата и время создания
date_start — дата старта (если указано)
date_end — дата завершения (если указано)
date_closed — дата и время закрытия
time_end — время завершения (если указано)
max_time и max_money — плановые временные и финансовые затраты (если указаны)
tags — теги задания в формате id: name (если указаны)
files — информация о прикрепленных файлах (если в запросе указан параметр extra=files):
id — ID файла (можно использовать в методе download для скачивания по API)
size — размер файла (в байтах)
name — название файла с расширением
page — часть ссылки для скачивания напрямую (для полного пути перед полученным значением укажите адрес вашего аккаунта, например https://youraccount.worksection.com/download/123456)
relations — информация о связях с другими заданиями (если в запросе указан параметр extra=relations):
from — входящие связи:
type — тип связи finish-to-start/start-to-start
task — информация о связанном задании
to — исходящие связи (аналогично from)
child — информация по подзаданиям (если в запросе указан параметр extra=subtasks)

Пример JSON ответа
При успешном выполнении запроса, ответ будет содержать статус ok и следующие данные:

{
    "status": "ok",
    "data": [
        {
            "id": "TASK_ID",
            "name": "TASK_NAME_1",
            "page": "/project/PROJECT_ID/TASK_ID/",
            "status": "done",
            "priority": "0..10",
            "user_from": {
                "id": "USER_ID",
                "email": "USER_EMAIL",
                "name": "USER_NAME"
            },
            "user_to": {
                "id": "USER_ID",
                "email": "USER_EMAIL",
                "name": "USER_NAME"
            },
            "project": {
                "id": "PROJECT_ID",
                "name": "PROJECT_NAME",
                "page": "/project/PROJECT_ID/"
            },
            "text": "TASK_TEXT",
            "date_added": "YYYY-MM-DD HH:II",
            "date_start": "YYYY-MM-DD",
            "date_end": "YYYY-MM-DD",
            "date_closed": "YYYY-MM-DD HH:II",
            "time_end": "HH:II",
            "max_time": "50",
            "max_money": "100",
            "tags": {
                "TAG_ID": "TAG_NAME_1",
                "TAG_ID": "TAG_NAME_2"
            },
            "files": [
                {
                    "id": "FILE_ID",
                    "size": "FILE_SIZE",
                    "name": "Example.docx",
                    "page": "/download/FILE_ID"
                }
            ],
            "relations": {
                "to": [
                    {
                        "type": "finish-to-start",
                        "task": {
                            "id": "SUBTASK_ID",
                            "name": "SUBTASK_NAME",
                            "page": "/project/PROJECT_ID/TASK_ID/SUBTASK_ID/",
                            "status": "active",
                            "priority": "0..10"
                        }
                    }
                ],
                "from": [
                    {
                        "type": "start-to-start",
                        "task": {
                            "id": "SUBTASK_ID",
                            "name": "SUBTASK_NAME",
                            "page": "/project/PROJECT_ID/TASK_ID/SUBTASK_ID/",
                            "status": "done",
                            "priority": "0..10"
                        }
                    }
                ]
            },
            "child": [
                {
                    "id": "SUBTASK_ID",
                    "name": "SUBTASK_NAME_1",
                    "page": "/project/PROJECT_ID/TASK_ID/SUBTASK_ID/",
                    ... ... ...,
                    "child": [
                        {
                         "id": "SUBTASK_ID",
                         "name": "SUBTASK_NAME_2",
                         "page": "/project/PROJECT_ID/TASK_ID/SUBTASK_ID/",
                         ... ... ...
                        }
                    ]
                }
            ]    
        },
        {
            "id": "TASK_ID",
            "name": "TASK_NAME_2",
            "page": "/project/PROJECT_ID/TASK_ID/",
            ... ... ...
        }
    ]
}
Эта статья была вам полезна? Да, спасибо! Нет
Получение задач проекта через API: get_tasks

Пример get_tasks запроса

?action=get_tasks&id_project=PROJECT_ID
Возвращает открытые и закрытые задания отдельного проекта
*кроме заданий с отложенной публикацией
*для возвращения подзаданий используйте параметр extra=subtasks


Обязательные параметры:
id_project — ID проекта
Необязательные параметры:
extra — дополнительные данные по заданиям, возможные значения (можно указывать через запятую, например extra=text,files):
text или html — описание в текстовом или html формате
files — информация о файлах, прикрепленных в описание задания
comments — пять последних комментариев
relations — информация о связях с другими заданиями
subtasks — информация о подзаданиях (в массиве child)
subscribers — список подписчиков
filter=active — только открытые задания (фильтр только по закрытым не предусмотрен)
Возвращаемые данные:
id — ID задания
name — название задания
page — ссылка на задание
status — состояние (active/done — открытая/закрытая)
priority — приоритет (диапазон значений: 0..10)
user_from и user_to — автор и ответственный по заданию
project — информация о проекте
text — описание задания в текстовом или html формате (если в запросе указан соответствующий параметр extra)
date_added — дата и время создания
date_start — дата старта (если указано)
date_end — дата завершения (если указано)
date_closed — дата и время закрытия
time_end — время завершения (если указано)
max_time и max_money — плановые временные и финансовые затраты (если указаны)
tags — теги задания в формате id: name (если указаны)
files — информация о прикрепленных файлах (если в запросе указан параметр extra=files):
id — ID файла (можно использовать в методе download для скачивания по API)
size — размер файла (в байтах)
name — название файла с расширением
page — часть ссылки для скачивания напрямую (для полного пути перед полученным значением укажите адрес вашего аккаунта, например https://youraccount.worksection.com/download/123456)
subscribers — список подписчиков (если в запросе указан параметр extra=subscribers)
relations — информация о связях с другими заданиями (если в запросе указан параметр extra=relations):
from — входящие связи:
type — тип связи finish-to-start/start-to-start
task — информация о связанном задании
to — исходящие связи (аналогично from)
child — информация по подзаданиям (если в запросе указан параметр extra=subtasks)

Пример JSON ответа
При успешном выполнении запроса, ответ будет содержать статус ok и следующие данные:

{
    "status": "ok",
    "data": [
        {
            "id": "TASK_ID",
            "name": "TASK_NAME_1",
            "page": "/project/PROJECT_ID/TASK_ID/",
            "status": "done",
            "priority": "0..10",
            "user_from": {
                "id": "USER_ID",
                "email": "USER_EMAIL",
                "name": "USER_NAME"
            },
            "user_to": {
                "id": "USER_ID",
                "email": "USER_EMAIL",
                "name": "USER_NAME"
            },
            "text": "TASK_TEXT",
            "date_added": "YYYY-MM-DD HH:II",
            "date_start": "YYYY-MM-DD",
            "date_end": "YYYY-MM-DD",
            "date_closed": "YYYY-MM-DD HH:II",
            "time_end": "HH:II",
            "max_time": "50",
            "max_money": "100",
            "tags": {
                "TAG_ID": "TAG_NAME_1",
                "TAG_ID": "TAG_NAME_2"
            },
            "files": [
                {
                    "id": "FILE_ID",
                    "size": "FILE_SIZE",
                    "name": "Example.docx",
                    "page": "/download/FILE_ID"
                }
            ],
            "subscribers": [
                {
                    "id": "USER_ID",
                    "email": "USER_EMAIL",
                    "name": "USER_NAME_1"
                },
                {
                    "id": "USER_ID",
                    "email": "USER_EMAIL",
                    "name": "USER_NAME_2"
                }
            ],
            "relations": {
                "to": [
                    {
                        "type": "finish-to-start",
                        "task": {
                            "id": "SUBTASK_ID",
                            "name": "SUBTASK_NAME",
                            "page": "/project/PROJECT_ID/TASK_ID/SUBTASK_ID/",
                            "status": "active",
                            "priority": "0..10"
                        }
                    }
                ],
                "from": [
                    {
                        "type": "start-to-start",
                        "task": {
                            "id": "SUBTASK_ID",
                            "name": "SUBTASK_NAME",
                            "page": "/project/PROJECT_ID/TASK_ID/SUBTASK_ID/",
                            "status": "done",
                            "priority": "0..10"
                        }
                    }
                ]
            },
            "child": [
                {
                    "id": "SUBTASK_ID",
                    "name": "SUBTASK_NAME_1",
                    "page": "/project/PROJECT_ID/TASK_ID/SUBTASK_ID/",
                    ... ... ...,
                    "child": [
                        {
                         "id": "SUBTASK_ID",
                         "name": "SUBTASK_NAME_2",
                         "page": "/project/PROJECT_ID/TASK_ID/SUBTASK_ID/",
                         ... ... ...
                        }
                    ]
                }
            ]    
        },
        {
            "id": "TASK_ID",
            "name": "TASK_NAME_2",
            "page": "/project/PROJECT_ID/TASK_ID/",
            ... ... ...
        }
    ]
}
Эта статья была вам полезна? Да, спасибо! Нет
Получение отдельной задачи через API: get_task

Пример get_task запроса

?action=get_task&id_task=TASK_ID
Возвращает отдельное задание (открытое или закрытое)
*кроме заданий с отложенной публикацией
*для возвращения задачи вместе с ее подзадачами используйте параметр extra=subtasks


Обязательные параметры:
id_task — ID задания
Необязательные параметры:
extra — дополнительные данные по заданиям, возможные значения (можно указывать через запятую, например extra=text,files):
text или html — описание в текстовом или html формате
files — информация о файлах, прикрепленных в описание задания
comments — пять последних комментариев
relations — информация о связях с другими заданиями
subtasks — информация о подзаданиях (в массиве child)
subscribers — список подписчиков
filter=active — только открытые подзадачи (при использовании параметра extra=subscribers)
Фильтр только по закрытым не предусмотрен
Возвращаемые данные:
id — ID задания
name — название задания
page — ссылка на задание
status — состояние (active/done — открытая/закрытая)
priority — приоритет (диапазон значений: 0..10)
user_from и user_to — автор и ответственный по заданию
project — информация о проекте
parent — родительская задача (если в запросе указан ID подзадания)
text — описание задания в текстовом или html формате (если в запросе указан соответствующий параметр extra)
date_added — дата и время создания
date_start — дата старта (если указано)
date_end — дата завершения (если указано)
date_closed — дата и время закрытия
time_end — время завершения (если указано)
max_time и max_money — плановые временные и финансовые затраты (если указаны)
tags — теги задания в формате id: name (если указаны)
files — информация о прикрепленных файлах (если в запросе указан параметр extra=files):
id — ID файла (можно использовать в методе download для скачивания по API)
size — размер файла (в байтах)
name — название файла с расширением
page — часть ссылки для скачивания напрямую (для полного пути перед полученным значением укажите адрес вашего аккаунта, например https://youraccount.worksection.com/download/123456)
subscribers — список подписчиков (если в запросе указан параметр extra=subscribers)
relations — информация о связях с другими заданиями (если в запросе указан параметр extra=relations):
from — входящие связи:
type — тип связи finish-to-start/start-to-start
task — информация о связанном задании
to — исходящие связи (аналогично from)
child — информация по подзаданиям (если в запросе указаны ID задачи и параметр extra=subtasks)

Пример JSON ответа
При успешном выполнении запроса, ответ будет содержать статус ok и следующие данные:

*для задачи

{
    "status": "ok",
    "data": {
        "id": "TASK_ID",
        "name": "TASK_NAME",
        "page": "/project/PROJECT_ID/TASK_ID/",
        "status": "active",
        "priority": "0..10",
        "user_from": {
            "id": "USER_ID",
            "email": "USER_EMAIL",
            "name": "USER_NAME"
        },
        "user_to": {
            "id": "USER_ID",
            "email": "USER_EMAIL",
            "name": "USER_NAME"
        },
        "project": {
            "id": "PROJECT_ID",
            "name": "PROJECT_NAME",
            "page": "/project/PROJECT_ID/"
        },
        "text": "TASK_TEXT",
        "date_added": "YYYY-MM-DD HH:II",
        "date_start": "YYYY-MM-DD",
        "date_end": "YYYY-MM-DD",
        "date_closed": "YYYY-MM-DD HH:II",
        "time_end": "HH:II",
        "max_time": "25",
        "max_money": "50",
        "tags": {
            "TAG_ID": "TAG_NAME_1",
            "TAG_ID": "TAG_NAME_2"
        },
        "files": [
            {
                "id": "FILE_ID",
                "size": "FILE_SIZE",
                "name": "Example.docx",
                "page": "/download/FILE_ID"
            }
        ],
        "subscribers": [
            {
                 "id": "USER_ID",
                 "email": "USER_EMAIL",
                 "name": "USER_NAME_1"
            },
            {
                 "id": "USER_ID",
                 "email": "USER_EMAIL",
                 "name": "USER_NAME_2"
            }
        ],
        "relations": {
            "to": [
                {
                     "type": "finish-to-start",
                     "task": {
                         "id": "TASK_ID",
                         "name": "TASK_NAME",
                         "page": "/project/PROJECT_ID/TASK_ID/",
                         "status": "active",
                         "priority": "0..10"
                     }
                }
            ],
            "from": [
                {
                     "type": "start-to-start",
                     "task": {
                         "id": "TASK_ID",
                         "name": "TASK_NAME",
                         "page": "/project/PROJECT_ID/TASK_ID/",
                         "status": "done",
                         "priority": "0..10"
                     }
                }
            ]
        },
        "child": [
            {
                "id": "SUBTASK_ID",
                "name": "SUBTASK_NAME_1",
                "page": "/project/PROJECT_ID/TASK_ID/SUBTASK_ID/",
                "status": "active",
                "priority": "0..10",
                "child": [
                    {
                     "id": "SUBTASK_ID",
                     "name": "SUBTASK_NAME_2",
                     "page": "/project/PROJECT_ID/TASK_ID/SUBTASK_ID/",
                     "status": "done",
                     "priority": "0..10"
                    }
                ]
            }
        ]
    }
}
*для подзадачи/под-подзадачи (идентичная структура ответа, только с дополнительным массивом данных parent и без массива child)

{
    "status": "ok",
    "data": {
        "id": "SUB-SUBTASK_ID",
        "name": "SUB-SUBTASK_NAME",
        "page": "/project/PROJECT_ID/TASK_ID/SUB-SUBTASK_ID/", 
        ... ... ...,
        "project": {
            ... ... ...
        },
        "parent": {
            "id": "SUBTASK_ID",
            "name": "SUBTASK_NAME",
            "page": "/project/PROJECT_ID/SUBTASK_ID/",
            "status": "active",
            "priority": "0..10",
            "parent": {
                "id": "TASK_ID",
                "name": "TASK_NAME",
                "page": "/project/PROJECT_ID/TASK_ID/",
                "status": "active",
                "priority": "0..10",
            }
        },
        "text": ...,
        ... ... ...
        "relations": {
            ... ... ...
        }
    }
}
Эта статья была вам полезна? Да, спасибо! Нет
Создание задачи через API: post_task

Пример post_task запроса

?action=post_task&id_project=PROJECT_ID&title=TASK_NAME
Создает (под)задачу в указанном проекте
*позволяет прикреплять файлы (см. детальнее)


Обязательные параметры:
id_project — ID проекта
title — название задания

Необязательные параметры:
id_parent — ID родительской задачи (при создании подзадач) 
email_user_from — email автора задания (автоматически указывается при использовании токена доступа)
email_user_to — email ответственного по заданию, дополнительные возможные значения: ANY – «Любой сотрудник», NOONE или отсутствие значения – «Без ответственного»
priority — приоритет (диапазон значений: 0..10)
text — описание задания
todo⦋⦌ — чекбокс в описании задания (для получения чеклиста используйте следующую логику: todo⦋⦌=текст1&todo⦋⦌=текст2) 
datestart — дата старта в формате DD.MM.YYYY
dateend — дата завершения в формате DD.MM.YYYY
subscribe — email сотрудников (через запятую), которые будут подписаны на задание
hidden — email сотрудников (через запятую), которые будут добавлены в круг видимости задания. Для других сотрудников задание будет скрытым
mention — email сотрудников (через запятую), которые будут упомянуты в конце описания задачи
max_time — плановые временные затраты
max_money — плановые финансовые затраты
tags — теги задания через запятую (например: tags=TAG1,TAG2)
Поддерживаются названия тегов (если они уникальны) или их ID (можно получить через метод get_task_tags). Допускаются только теги из наборов, добавленных в проект
Пример JSON ответа
При успешном выполнении запроса, ответ будет содержать статус ok и следующие данные:

{
    "status": "ok",
    "data": {
        "id": "TASK_ID",
        "name": "TASK_NAME",
        "page": "/project/PROJECT_ID/TASK_ID/",
        "status": "active",
        "priority": "0..10",
        "user_from": {
            "id": "USER_ID",  
            "email": "USER_EMAIL",
            "name": "USER_NAME"
        },
        "user_to": {
            "id": "USER_ID",
            "email": "USER_EMAIL",
            "name": "USER_NAME"
        },
        "project": {
            "id": "PROJECT_ID",
            "name": "PROJECT_NAME",
            "page": "/project/PROJECT_ID/"
        },
        "text": "TASK_TEXT",
        "date_added": "YYYY-MM-DD HH:II",
        "date_start": "YYYY-MM-DD",
        "date_end": "YYYY-MM-DD",
        "max_time": 40,
        "max_money": 200,
        "tags": {
            "TAG_ID": "TAG_NAME_1",
            "TAG_ID": "TAG_NAME_2",

        }
    }
}
Эта статья была вам полезна? Да, спасибо! Нет
Редактирование задачи через API: update_task

Пример update_task запроса

?action=update_task&id_task=TASK_ID&email_user_to=USER_EMAIL
Редактирует параметры указанной (под)задачы (открытой или закрытой)


Обязательные параметры:
id_task — ID задания

Необязательные параметры:
email_user_to — email ответственного по заданию, дополнительные возможные значения: ANY – «Любой сотрудник», NOONE или отсутствие значения – «Без ответственного»
priority — приоритет (диапазон значений: 0..10)
title — название задания
datestart — дата старта в формате DD.MM.YYYY
dateend — дата завершения в формате DD.MM.YYYY
dateclosed — дата закрытия в формате DD.MM.YYYY 
max_time — плановые затраты времени
max_money — плановые затраты денег
tags — теги задания через запятую (например: tags=TAG1,TAG2)
Поддерживаются названия тегов (если они уникальны) или их ID (можно получить через метод get_task_tags). Допускаются только теги из наборов, добавленных в проект.
Переданные теги перезаписывают ранее установленные. Для выборочного добавления или снятия тегов используйте метод update_task_tags

Недоступные к редактированию параметры:
email_user_from — email автора задания
text — описание задания
todo — чеклист
subscribe — участники, которые будут подписаны на задание
hidden — участники, у которых будет доступ к заданию
tags — теги задания (можно обновить через отдельный метод update_task_tags)
Пример JSON ответа
При успешном выполнении запроса, ответ будет содержать статус ok и следующие данные:

{
    "status": "ok",
    "data": {
        "id": "TASK_ID",
        "name": "TASK_NAME",
        "page": "/project/PROJECT_ID/TASK_ID/",
        "status": "active",
        "priority": "0..10",
        "user_from": {
            "id": "USER_ID",
            "email": "USER_EMAIL",
            "name": "USER_NAME"
        },
        "user_to": {
            "id": "USER_ID",
            "email": "USER_EMAIL",
            "name": "USER_NAME"
        },
        "project": {
            "id": "PROJECT_ID",
            "name": "PROJECT_NAME",
            "page": "/project/PROJECT_ID/"
        },
        "date_added": "YYYY-MM-DD HH:II",
        "date_start": "YYYY-MM-DD",
        "date_end": "YYYY-MM-DD",
        "max_time": 40,
        "max_money": 200,
        "tags": {
            "TAG_ID": "TAG_NAME_1",
            "TAG_ID": "TAG_NAME_2"
        }
    }
}
Эта статья была вам полезна? Да, спасибо! Нет
Закрытие задачи через API: complete_task

Пример complete_task запроса

?action=complete_task&id_task=TASK_ID
Закрывает указанную (под)задачу


Обязательные параметры:
id_task — ID задания
Пример JSON ответа
При успешном выполнении запроса, ответ будет содержать статус ok 

{
    "status": "ok"
}
Эта статья была вам полезна? Да, спасибо! Нет
Повторное открытие задачи через API: reopen_task

Пример reopen_task запроса

?action=reopen_task&id_task=TASK_ID
Повторно открывает указанную (под)задачу


Обязательные параметры:
id_task — ID задания
Пример JSON ответа
При успешном выполнении запроса, ответ будет содержать статус ok 

{
    "status": "ok"
}
Эта статья была вам полезна? Да, спасибо! Нет
Поиск задач через API: search_tasks

Пример search_tasks запроса

?action=search_tasks&id_project=PROJECT_ID&filter=(name has 'Report' or
name has 'Approval') and (dateend>'25.05.2021' and dateend<'31.05.2021')
Возвращает задания, которые удовлетворяют поисковому запросу

Условные параметры:
*обязателен минимум один из них
id_project — ID проекта
id_task — ID задания
email_user_from — email автора задания
email_user_to — email ответственного
filter — поисковый запрос (см. описание ниже)
Необязательные параметры:
status — состояние, возможные значения: active/done — открытое/закрытое
extra — дополнительные данные по заданиям, возможные значения (можно указывать через запятую, например extra=text,files):
text или html — описание в текстовом или html формате
files — информация о файлах, прикрепленных в описание задания
Возможные данные для использования в filter (для метода search_tasks):

Целочисленные поля (Integer):
id=TASK_ID — возвращает определенное задание
project=PROJECT_ID — возвращает задания определенного проекта
parent=TASK_ID — возвращает подзадания определенной родительской задачи
Операторы равенства и диапазона для указанного типа: =, in
project{=}2456
id {in} (1234, 1240)

Строковые поля (String):
name — название задания
Полное или частичное совпадение для указанного типа: =, has
name{=}'Task Report'
name {has} 'Report'

Поля даты:
dateadd — дата создания задания в формате 'DD.MM.YYYY'
datestart — дата старта задания в формате 'DD.MM.YYYY'
dateend — дата завершения задания в формате 'DD.MM.YYYY'
dateclose — дата закрытия задания в формате 'DD.MM.YYYY'
Реляционные операторы для полей даты: >, <, >=, <=, !=, =
dateadd{=}'01.05.2021'


Условия запроса можно объединять скобками ( ) и логическими операциями and, or (только в нижнем регистре)

Пример filter запроса
&filter=(name has 'Report' or name has 'Approval') and
(dateend>'25.05.2021' and dateend<'31.05.2021')


Метки 
Получение списка тегов для заданий через API: get_task_tags
Создание тегов для заданий через API: add_task_tags
Установка/снятие тегов у задания через API: update_task_tags
Получение списка наборов тегов для заданий через API: get_task_tag_groups
Создание наборов тегов для заданий через API: add_task_tag_groups
Получение списка тегов для проектов через API: get_project_tags
Создание тегов для проектов через API: add_project_tags
Установка/снятие тегов у проекта через API: update_project_tags
Получение списка наборов тегов для проектов через API: get_project_tag_groups
Создание набора тегов для проектов через API: add_project_tag_groups
Получение списка тегов для заданий через API: get_task_tags

Пример get_task_tags запроса

?action=get_task_tags
Возвращает данные по тегам для заданий

Необязательные параметры:
group — фильтр по набору тегов
Можно указывать название набора или ID набора (можно получить через этот же метод в возвращенном массиве group или через метод get_task_tag_groups)
type — фильтр по типу набора тегов, возможные значения: status, label
access — фильтр по видимости набора тегов, возможные значения:
public — доступен всем командам (в том числе клиентским)
статусы всегда видимы и имеют значение public
private — доступен только для внутренних команд компании
Возвращаемые данные:
id — ID тега
title — название тега
group — информация о наборе тегов

Пример JSON ответа
При успешном выполнении запроса, ответ будет содержать статус ok и следующие данные:

{
    "status": "ok",
    "data": [
        {
            "title": "LABEL_NAME",
            "id": "LABEL_ID",
            "group": {
                "title": "GROUP_NAME",
                "id": GROUP_ID,
                "type": "label",
                "access": "public"
                 }
        },
        {
            "title": "STATUS_NAME",
            "id": "STATUS_ID",
            "group": {
                "title": "GROUP_NAME",
                "id": GROUP_ID,
                "type": "status",
                "access": "public"
             }
        }
    ]
}

Эта статья была вам полезна? Да, спасибо! Нет
Создание тегов для заданий через API: add_task_tags

Пример add_task_tags запроса

?action=add_task_tags&title=LABEL_NAME_1,LABEL_NAME_2&group=GROUP_ID
Создает теги для заданий в выбранном наборе тегов
*при отсутствие тегов с аналогичным названием

Обязательные параметры:
group — набор тегов, в котором необходимо создать теги
Можно указывать название набора или ID набора (можно получить через этот же метод в возвращенном массиве group или через метод get_task_tag_groups)
title — названия тегов (через запятую)
Пример JSON ответа
При успешном выполнении запроса, ответ будет содержать статус ok и следующие данные:

{
    "status": "ok",
    "data": [
        {
            "title": "LABEL_NAME_1",
            "id": LABEL_ID
        },
        {
            "title": "LABEL_NAME_2",
            "id": LABEL_ID
        }
    ]
}
Эта статья была вам полезна? Да, спасибо! Нет
Установка/снятие тегов у задания через API: update_task_tags

Пример update_task_tags запроса

?action=update_task_tags&id_task=TASK_ID&plus=Tag1,Tag2&minus=Tag3,Tag4
Установка новых и снятие старых тегов у выбранного задания

Обязательные параметры:
id_task — ID задания

Необязательные параметры:
*теги можно указывать по их названиям (полное совпадение) или ID (можно получить через метод get_task_tags)
plus — список тегов (через запятую), которые необходимо установить
minus — список тегов (через запятую), которые необходимо снять 
Пример JSON ответа
При успешном выполнении запроса, ответ будет содержать статус ok

{
    "status": "ok"
}

Эта статья была вам полезна? Да, спасибо! Нет
Получение списка наборов тегов для заданий через API: get_task_tag_groups

Пример get_task_tag_groups запроса

?action=get_task_tag_groups
Возвращает данные по наборам тегов для заданий

Необязательные параметры:
type — фильтр по типу набора тегов, возможные значения: status, label
access — фильтр по видимости набора тегов, возможные значения:
public — доступен всем командам (в том числе клиентским)
статусы всегда видимы и имеют значение public
private — доступен только для внутренних команд компании
Возвращаемые данные: 
id — ID набора тегов
title — название набора тегов
type — типа набора тегов
access — видимость набора тегов

Пример JSON ответа
При успешном выполнении запроса, ответ будет содержать статус ok и следующие данные:

{
    "status": "ok",
    "data": [
        {
            "title": "GROUP_NAME_1",
            "id": GROUP_ID,
            "type": "status",
            "access": "public"
        },
        {
            "title": "GROUP_NAME_2",
            "id": GROUP_ID,
            "type": "label",
            "access": "public"
        },
        {
            "title": "GROUP_NAME_3",
            "id": GROUP_ID,
            "type": "label",
            "access": "private"
        }
    ]
}
Эта статья была вам полезна? Да, спасибо! Нет
Создание наборов тегов для заданий через API: add_task_tag_groups

Пример add_task_tag_groups запроса

?action=add_task_tag_groups&title=GROUP_NAME_1,GROUP_NAME_2&
type=label&access=public
Создает набор тегов для заданий
*при отсутствие наборов с аналогичным названием

Обязательные параметры:
title — названия наборов тегов (через запятую)
type — тип набора тегов, возможные значения: status, label  
access — видимость набора тегов (статусы всегда видимы и имеют значение public)
public — доступен всем командам (в том числе клиентским)
private — доступен только для внутренних команд компании
Пример JSON ответа
При успешном выполнении запроса, ответ будет содержать статус ok и следующие данные:

{
    "status": "ok",
    "data": [
        {
            "title": "GROUP_NAME_1",
            "id": GROUP_ID,
            "type": "label",
            "access": "public"
        },
        {
            "title": "GROUP_NAME_2",
            "id": GROUP_ID,
            "type": "status",
            "access": "public"
        }
    ]
}
Эта статья была вам полезна? Да, спасибо! Нет
Получение списка тегов для проектов через API: get_project_tags

Пример get_project_tags запроса

?action=get_project_tags
Возвращает данные по тегам для проектов

Необязательные параметры:
group — фильтр по набору тегов
Можно указывать название набора или ID набора (можно получить через этот же метод в возвращенном массиве group или через метод get_project_tag_groups)
type — фильтр по типу набора тегов, возможные значения: status, label
access — фильтр по видимости набора тегов, возможные значения:
public — доступен всем командам (в том числе клиентским)
private — доступен только для внутренних команд компании
Возвращаемые данные:
id — ID тега
title — название тега
group — информация о наборе тегов

Пример JSON ответа
При успешном выполнении запроса, ответ будет содержать статус ok и следующие данные:

{
    "status": "ok",
        "data": [
            {
                "title": "PROJECT_STATUS_NAME_1",
                "id": "PROJECT_STATUS_ID",
                "group": {          
                    "title": "PROJECT_GROUP_NAME",
                    "id": "PROJECT_GROUP_ID",
                    "type": "status",
                    "access": "public"
            },
            {
                "title": "_PROJECT_LABEL_NAME_2",
                "id": "PROJECT_LABEL_ID",
                "group": {             
                    "title": "PROJECT_GROUP_NAME",
                    "id": "PROJECT_GROUP_ID",
                    "type": "label",
                    "access": "public"
            }
        ]
}
Эта статья была вам полезна? Да, спасибо! Нет
Создание тегов для проектов через API: add_project_tags

Пример add_project_tags запроса

?action=add_project_tags&title=PROJECT_LABEL_NAME_1,PROJECT_LABEL_NAME_2&
group=PROJECT_GROUP_ID
Создает теги для проектов в выбранном наборе тегов
*при отсутствие тегов с аналогичным названием

Обязательные параметры:
group — набор тегов, в котором необходимо создать теги
Можно указывать название набора или ID набора (можно получить через этот же метод в возвращенном массиве group или через метод get_project_tag_groups)
title — названия тегов (через запятую)
Пример JSON ответа
При успешном выполнении запроса, ответ будет содержать статус ok и следующие данные:

{ 
    "status": "ok",
    "data": [
        {
            "title": "PROJECT_LABEL_NAME_1",
            "id": PROJECT_LABEL_ID
        },
        {
            "title": "PROJECT_LABEL_NAME_2",
            "id": PROJECT_LABEL_ID
        }
    ]
}
Эта статья была вам полезна? Да, спасибо! Нет
Установка/снятие тегов у проекта через API: update_project_tags

Пример update_project_tags запроса

?action=update_project_tags&id_project=PROJECT_ID&
plus=Tag1,Tag2&minus=Tag3,Tag4
Установка новых и снятие старых тегов у выбранного проекта

Обязательные параметры:
id_project — ID проекта

Необязательные параметры:
*теги можно указывать по их названиям (полное совпадение) или ID (можно получить через метод get_project_tags)
plus — список тегов (через запятую), которые необходимо установить
minus — список тегов (через запятую), которые необходимо снять 
Пример JSON ответа
При успешном выполнении запроса, ответ будет содержать статус ok

{
    "status": "ok",
}
Эта статья была вам полезна? Да, спасибо! Нет
Получение списка наборов тегов для проектов через API: get_project_tag_groups

Пример get_project_tag_groups запроса

?action=get_project_tag_groups
Возвращает данные по проектным наборам тегов

Необязательные параметры:
type — фильтр по типу набора тегов, возможные значения: status, label
access — фильтр по видимости набора тегов, возможные значения:
public — доступен всем командам (в том числе клиентским)
private — доступен только для внутренних команд компании
Возвращаемые данные: 
id — ID набора тегов
title — название набора тегов
type — тип набора тегов   
access — видимость набора меток

Пример JSON ответа
При успешном выполнении запроса, ответ будет содержать статус ok и следующие данные:

{
    "status": "ok",
    "data": [
        {
            "title": "GROUP_NAME_1",
            "id": GROUP_ID,
            "type": "status",
            "access": "public"
        },
        {
            "title": "GROUP_NAME_2",
            "id": GROUP_ID,
            "type": "label",
            "access": "public"
        },
        {
            "title": "GROUP_NAME_3",
            "id": GROUP_ID,
            "type": "label",
            "access": "private"
        }
    ]
}
Эта статья была вам полезна? Да, спасибо! Нет
Создание набора тегов для проектов через API: add_project_tag_groups

Пример add_project_tag_groups запроса

?action=add_project_tag_groups&title=GROUP_NAME_1,GROUP_NAME_2&
type=label&access=public
Создает проектные наборы тегов
*при отсутствие наборов с аналогичным названием

Обязательные параметры:
title — названия наборов меток (через запятую)  
access — видимость набора меток, возможные значения:
public — доступен всем командам (в том числе клиентским)
private — доступен только для внутренних команд компании
Пример JSON ответа
При успешном выполнении запроса, ответ будет содержать статус ok и следующие данные:

{
    "status": "ok",
    "data": [
        {
            "title": "GROUP_NAME_1",
            "id": GROUP_ID,
            "type": "",
            "access": "public"
        },
        {
            "title": "GROUP_NAME_2",
            "id": GROUP_ID,
            "type": "",
            "access": "public"
        }
    ]
}