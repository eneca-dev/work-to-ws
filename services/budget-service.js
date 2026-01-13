// Сервис для работы с бюджетами
// Загружает и кэширует бюджеты для синхронизации

const supabase = require('./supabase');
const logger = require('../utils/logger');

// Кэш бюджетов: Map<`${entity_type}_${entity_id}`, total_amount>
let budgetCache = new Map();

/**
 * Загрузить все бюджеты для проекта
 * @param {String} projectId - UUID проекта
 * @param {Array} objects - массив объектов
 * @param {Array} sections - массив секций (с decomposition_stages внутри)
 */
async function loadBudgetsForProject(projectId, objects = [], sections = []) {
  // Очищаем кэш
  budgetCache.clear();

  // Собираем ID всех сущностей
  const objectIds = objects.map(o => o.object_id);
  const sectionIds = sections.map(s => s.section_id);

  // Собираем ID всех decomposition_stages
  const decompositionStageIds = [];
  for (const section of sections) {
    if (section.decomposition_stages) {
      for (const stage of section.decomposition_stages) {
        decompositionStageIds.push(stage.decomposition_stage_id);
      }
    }
  }

  logger.info(`Loading budgets for: 1 project, ${objectIds.length} objects, ${sectionIds.length} sections, ${decompositionStageIds.length} stages`);

  // Загружаем бюджеты одним запросом
  const budgets = await supabase.getBudgetsForProject(
    projectId,
    objectIds,
    sectionIds,
    decompositionStageIds
  );

  // Кэшируем бюджеты
  let stats = { project: 0, object: 0, section: 0, decomposition_stage: 0 };

  for (const budget of budgets) {
    const key = `${budget.entity_type}_${budget.entity_id}`;
    const amount = parseFloat(budget.total_amount) || 0;

    if (amount > 0) {
      budgetCache.set(key, amount);
      stats[budget.entity_type] = (stats[budget.entity_type] || 0) + 1;
    }
  }

  logger.info(`Budgets cached: ${budgetCache.size} (project: ${stats.project}, objects: ${stats.object}, sections: ${stats.section}, stages: ${stats.decomposition_stage})`);

  return budgetCache;
}

/**
 * Получить бюджет для сущности
 * @param {String} entityType - тип сущности (project, object, section, decomposition_stage)
 * @param {String} entityId - UUID сущности
 * @returns {Number|null} - сумма бюджета или null
 */
function getBudgetForEntity(entityType, entityId) {
  if (!entityType || !entityId) return null;

  const key = `${entityType}_${entityId}`;
  const budget = budgetCache.get(key);

  return budget || null;
}

/**
 * Очистить кэш бюджетов
 */
function clearCache() {
  budgetCache.clear();
}

/**
 * Получить статистику кэша
 */
function getCacheStats() {
  return {
    size: budgetCache.size,
    entries: Array.from(budgetCache.entries())
  };
}

module.exports = {
  loadBudgetsForProject,
  getBudgetForEntity,
  clearCache,
  getCacheStats,
};
