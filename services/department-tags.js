// Сервис для работы с тегами отделов
// Загружает допустимые теги из WS и валидирует department_name

const wsWriter = require('./worksection-writer');
const { getDepartmentNameByUserId } = require('../mappers/department-mapper');
const logger = require('../utils/logger');

// Кэш допустимых тегов отделов (названия)
let validDepartmentTags = new Set();

// Название группы тегов в Worksection
const DEPARTMENT_TAG_GROUP = 'Отдел';

/**
 * Загрузить допустимые теги отделов из WS
 * Вызывается один раз при старте синхронизации
 * @returns {Set<string>} Set с названиями тегов
 */
async function loadValidDepartmentTags() {
  try {
    logger.info(`Loading department tags from WS group "${DEPARTMENT_TAG_GROUP}"...`);

    const tags = await wsWriter.getTaskTags(DEPARTMENT_TAG_GROUP);

    // Извлекаем только названия (title) в Set
    validDepartmentTags = new Set(tags.map(tag => tag.title));

    if (validDepartmentTags.size === 0) {
      logger.warning(`No tags found in WS group "${DEPARTMENT_TAG_GROUP}"`);
    } else {
      logger.info(`Loaded ${validDepartmentTags.size} department tags: ${[...validDepartmentTags].join(', ')}`);
    }

    return validDepartmentTags;
  } catch (error) {
    logger.error(`Failed to load department tags: ${error.message}`);
    validDepartmentTags = new Set();
    return validDepartmentTags;
  }
}

/**
 * Проверить, является ли название отдела допустимым тегом в WS
 * @param {string} departmentName - Название отдела из Supabase
 * @returns {boolean}
 */
function isValidDepartmentTag(departmentName) {
  if (!departmentName) return false;
  return validDepartmentTags.has(departmentName);
}

/**
 * Получить тег отдела для ответственного пользователя
 * @param {string} userId - UUID пользователя
 * @returns {string|null} Название тега или null если не найден/не валиден
 */
async function getDepartmentTagForUser(userId) {
  if (!userId) return null;

  // Получаем название отдела из Supabase
  const departmentName = await getDepartmentNameByUserId(userId);

  if (!departmentName) {
    return null;
  }

  // Проверяем есть ли такой тег в WS
  if (!isValidDepartmentTag(departmentName)) {
    logger.warning(`Department "${departmentName}" not found in WS "${DEPARTMENT_TAG_GROUP}" tags, skipping`);
    return null;
  }

  return departmentName;
}

/**
 * Извлечь текущий тег отдела из тегов задачи WS
 * @param {Object} wsTags - Теги задачи из WS (формат: {id: name, ...})
 * @returns {string|null} Название тега отдела или null
 */
function extractCurrentDepartmentTag(wsTags) {
  if (!wsTags || typeof wsTags !== 'object') return null;

  // Ищем тег, который есть в нашем списке допустимых отделов
  const tagNames = Object.values(wsTags);
  for (const tagName of tagNames) {
    if (validDepartmentTags.has(tagName)) {
      return tagName;
    }
  }

  return null;
}

/**
 * Получить Set допустимых тегов (для внешнего использования)
 * @returns {Set<string>}
 */
function getValidTags() {
  return validDepartmentTags;
}

/**
 * Очистить кэш тегов
 */
function clearCache() {
  validDepartmentTags = new Set();
}

module.exports = {
  loadValidDepartmentTags,
  isValidDepartmentTag,
  getDepartmentTagForUser,
  extractCurrentDepartmentTag,
  getValidTags,
  clearCache,
  DEPARTMENT_TAG_GROUP,
};
