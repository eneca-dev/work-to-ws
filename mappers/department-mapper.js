// Маппер отделов: user_id → department_name

const supabase = require('../services/supabase');
const logger = require('../utils/logger');

// Кэш отделов для оптимизации
const departmentCache = new Map();

/**
 * Получить название отдела по ID пользователя
 * @param {String} userId - UUID пользователя
 * @returns {String|null} Название отдела или null
 */
async function getDepartmentNameByUserId(userId) {
  if (!userId) return null;

  // Проверяем кэш
  if (departmentCache.has(userId)) {
    return departmentCache.get(userId);
  }

  try {
    // 1. Получаем пользователя
    const user = await supabase.getUserById(userId);
    if (!user || !user.department_id) {
      logger.info(`User ${userId} has no department`);
      departmentCache.set(userId, null);
      return null;
    }

    // 2. Получаем название отдела
    const department = await supabase.getDepartmentById(user.department_id);
    if (!department || !department.department_name) {
      logger.warning(`Department ${user.department_id} not found`);
      departmentCache.set(userId, null);
      return null;
    }

    const departmentName = department.department_name;
    logger.info(`User ${userId} department: ${departmentName}`);

    // Сохраняем в кэш
    departmentCache.set(userId, departmentName);
    return departmentName;

  } catch (error) {
    logger.error(`Error getting department for user ${userId}: ${error.message}`);
    departmentCache.set(userId, null);
    return null;
  }
}

function clearCache() {
  departmentCache.clear();
}

module.exports = {
  getDepartmentNameByUserId,
  clearCache,
};
