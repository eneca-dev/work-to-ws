// Модуль для сравнения данных между Worksection и eneca.work
// Используется для определения необходимости UPDATE

const { formatDateForWS } = require('../mappers/date-mapper');

/**
 * Нормализация значений для сравнения
 */
function normalizeValue(value, type = 'string') {
  if (value === null || value === undefined) return null;

  switch (type) {
    case 'string':
      return String(value).trim();
    case 'email':
      // WS использует 'NOONE', eneca может использовать null
      if (!value || value === 'NOONE') return 'NOONE';
      return String(value).trim().toLowerCase();
    case 'date':
      // WS API возвращает даты в формате YYYY-MM-DD
      // Но UPDATE принимает DD.MM.YYYY
      // Конвертируем ВСЕ даты в DD.MM.YYYY для единообразия
      if (!value) return null;

      // Если уже в формате DD.MM.YYYY, вернуть как есть
      if (typeof value === 'string' && /^\d{2}\.\d{2}\.\d{4}$/.test(value)) {
        return value;
      }

      // Если формат YYYY-MM-DD (из WS API get_task)
      if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
        const [year, month, day] = value.split('-');
        return `${day}.${month}.${year}`;
      }

      // Иначе конвертировать через formatDateForWS (для ISO дат из Supabase)
      return formatDateForWS(value);
    case 'number':
      if (!value) return null;
      return parseFloat(value);
    case 'tags':
      // WS: строка через запятую или объект {id: name}, eneca: может быть массив или строка
      if (!value) return null;

      // Если объект (из get_task) - берем только значения (названия тегов)
      if (typeof value === 'object' && !Array.isArray(value)) {
        return Object.values(value).join(',').trim();
      }

      if (Array.isArray(value)) {
        return value.join(',').trim();
      }
      return String(value).trim();
    default:
      return value;
  }
}

/**
 * Сравнивает два значения с учетом типа
 */
function valuesEqual(oldValue, newValue, type = 'string') {
  const normalizedOld = normalizeValue(oldValue, type);
  const normalizedNew = normalizeValue(newValue, type);

  // Оба null/undefined считаются равными
  if (normalizedOld === null && normalizedNew === null) return true;

  return normalizedOld === normalizedNew;
}

/**
 * Сравнивает данные проекта
 * @param {Object} wsProject - Проект из Worksection
 * @param {Object} enevaData - Данные проекта из eneca.work (подготовленные для WS)
 * @returns {Object} Результат сравнения
 */
function compareProjectData(wsProject, enevaData) {
  const changes = {};
  const unchangedFields = [];

  // Поля для сравнения
  // ВАЖНО: WS API get_projects возвращает данные в другом формате:
  // - name (не title)
  // - date_start в формате YYYY-MM-DD (не DD.MM.YYYY)
  // - user_manager - это объект {id, email, name}, нужно брать .email
  const fields = [
    { key: 'title', type: 'string', wsKey: 'name' }, // WS использует 'name'
    { key: 'emailManager', type: 'email', wsKey: 'user_manager', transform: (val) => val?.email || null },
    { key: 'dateStart', type: 'date', wsKey: 'date_start' },
    { key: 'dateEnd', type: 'date', wsKey: 'date_end' },
    { key: 'tags', type: 'tags', wsKey: 'tags' },
  ];

  for (const field of fields) {
    let wsValue = wsProject[field.wsKey];

    // Применяем transform если есть (для user_manager.email и т.д.)
    if (field.transform) {
      wsValue = field.transform(wsValue);
    }

    const enevaValue = enevaData[field.key];

    if (!valuesEqual(wsValue, enevaValue, field.type)) {
      changes[field.key] = {
        old: normalizeValue(wsValue, field.type) || '(empty)',
        new: normalizeValue(enevaValue, field.type) || '(empty)',
      };
    } else {
      unchangedFields.push(field.key);
    }
  }

  return {
    hasChanges: Object.keys(changes).length > 0,
    changes,
    unchangedFields,
  };
}

/**
 * Сравнивает данные задачи
 * @param {Object} wsTask - Задача из Worksection
 * @param {Object} enevaData - Данные задачи из eneca.work (подготовленные для WS)
 * @param {Object} options - Опции сравнения
 * @param {Boolean} options.skipText - Пропустить сравнение text (для decomposition)
 * @returns {Object} Результат сравнения
 */
function compareTaskData(wsTask, enevaData, options = {}) {
  const changes = {};
  const unchangedFields = [];

  // Поля для сравнения
  // ВАЖНО: WS API get_task возвращает данные в другом формате:
  // - name (не title)
  // - date_start в формате YYYY-MM-DD (не DD.MM.YYYY)
  // - user_to - это объект {id, email, name}, нужно брать .email
  const fields = [
    { key: 'title', type: 'string', wsKey: 'name' }, // WS использует 'name'
    { key: 'emailUserTo', type: 'email', wsKey: 'user_to', transform: (val) => val?.email || null },
    { key: 'dateStart', type: 'date', wsKey: 'date_start' },
    { key: 'dateEnd', type: 'date', wsKey: 'date_end' },
    { key: 'maxTime', type: 'number', wsKey: 'max_time' },
    { key: 'tags', type: 'tags', wsKey: 'tags' },
  ];

  // Для decomposition не сравниваем text (его нельзя обновить)
  if (!options.skipText && enevaData.text !== undefined) {
    fields.push({ key: 'text', type: 'string', wsKey: 'text' });
  }

  for (const field of fields) {
    let wsValue = wsTask[field.wsKey];

    // Применяем transform если есть (для user_to.email и т.д.)
    if (field.transform) {
      wsValue = field.transform(wsValue);
    }

    const enevaValue = enevaData[field.key];

    // Пропускаем поля, которых нет в enevaData (не передавались для обновления)
    if (enevaValue === undefined) {
      continue;
    }

    if (!valuesEqual(wsValue, enevaValue, field.type)) {
      changes[field.key] = {
        old: normalizeValue(wsValue, field.type) || '(empty)',
        new: normalizeValue(enevaValue, field.type) || '(empty)',
      };
    } else {
      unchangedFields.push(field.key);
    }
  }

  return {
    hasChanges: Object.keys(changes).length > 0,
    changes,
    unchangedFields,
  };
}

module.exports = {
  compareProjectData,
  compareTaskData,
  normalizeValue,
  valuesEqual,
};
