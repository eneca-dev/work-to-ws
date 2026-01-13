// Синхронизация Objects → Tasks (Level 1)

const supabase = require('../services/supabase');
const wsWriter = require('../services/worksection-writer');
const { formatDateForWS } = require('../mappers/date-mapper');
const { getBudgetForEntity } = require('../services/budget-service');
const { compareTaskData } = require('../utils/data-comparator');
const logger = require('../utils/logger');

/**
 * Синхронизирует Objects как Tasks (уровень 1) в WS проекте
 * @param {Array} objects - Массив объектов из Supabase
 * @param {String} wsProjectId - ID WS проекта (из project.external_id)
 * @param {Boolean} dryRun - Режим dry-run (без изменений)
 * @returns {Object} Результат синхронизации с taskMap (object_id → ws_task_id)
 */
async function syncObjects(objects, wsProjectId, dryRun = false) {
  const result = {
    created: 0,
    updated: 0,
    errors: [],
    taskMap: new Map(), // object_id → ws_task_id (для Sections)
    changes: [], // Детальная информация об изменениях
  };

  if (!wsProjectId) {
    throw new Error('wsProjectId is required for syncObjects');
  }

  // Устанавливаем режим dry-run
  wsWriter.setDryRun(dryRun);

  for (const obj of objects) {
    try {
      // Проверка на placeholder от ws-to-work OS проектов
      if (obj.external_id && obj.external_id.includes('_placeholder')) {
        logger.info(`Object has placeholder ID (ws-to-work OS project), skipping: ${obj.object_name}`);
        // Добавляем в map с null значением для обработки в section-sync
        result.taskMap.set(obj.object_id, obj.external_id); // Сохраняем placeholder
        continue;
      }

      const taskData = {
        projectId: wsProjectId,
        parentId: null, // Level 1 - top-level task
        title: obj.object_name,
        emailUserTo: 'NOONE', // Objects не синхронизируют ответственных
        dateStart: formatDateForWS(obj.object_start_date),
        dateEnd: formatDateForWS(obj.object_end_date),
      };

      // Добавляем бюджет если есть
      const budget = getBudgetForEntity('object', obj.object_id);
      if (budget) {
        taskData.maxMoney = budget;
        logger.info(`Object "${obj.object_name}" has budget: ${budget}`);
      }

      if (obj.external_id) {
        // UPDATE - с проверкой изменений
        logger.info(`Object has external_id: ${obj.external_id}, checking for changes`);

        try {
          // 1. Загрузить текущие данные из WS
          const wsTask = await wsWriter.getTask(obj.external_id);

          // 2. Сравнить данные
          const comparison = compareTaskData(wsTask, taskData);

          // 3. Если нет изменений - пропустить
          if (!comparison.hasChanges) {
            logger.info(`✓ Object unchanged, skipping UPDATE: ${obj.object_name}`);
            result.taskMap.set(obj.object_id, obj.external_id);
            continue; // НЕ увеличиваем счетчик updated
          }

          // 4. Логировать детали изменений
          logger.info(`Updating object: ${obj.object_name}`);
          logger.logChanges('Object', obj.object_name, comparison.changes);

          // 5. Выполнить UPDATE
          await wsWriter.updateTask(obj.external_id, taskData);
          logger.info(`✓ Updated object as task: ${obj.object_name}`);
          result.updated++;
          result.taskMap.set(obj.object_id, obj.external_id);

          // Сохранить детали изменений для отчета
          result.changes.push({
            entity_type: 'Object',
            entity_id: obj.object_id,
            entity_name: obj.object_name,
            ws_task_id: obj.external_id,
            action: 'updated',
            changes: comparison.changes
          });
        } catch (updateError) {
          // Задача не существует (возможно, старый external_id от неправильной структуры)
          logger.warning(`UPDATE failed for object ${obj.object_name}: ${updateError.message}`);
          logger.warning(`Creating new task and updating external_id...`);

          // Создаем новую задачу
          const wsTask = await wsWriter.postTask(taskData);

          // Обновляем external_id в Supabase на новый (только в реальном режиме!)
          if (!dryRun) {
            await supabase.updateObjectExternalId(obj.object_id, wsTask.id);
          } else {
            logger.info(`[DRY-RUN] Would save object external_id to Supabase: ${wsTask.id}`);
          }
          obj.external_id = wsTask.id;
          result.taskMap.set(obj.object_id, wsTask.id);
          result.created++;

          logger.info(`✓ Created new task and updated external_id: ${wsTask.id}`);
        }
      } else {
        // CREATE
        logger.info(`Creating object as task: ${obj.object_name}`);
        const wsTask = await wsWriter.postTask(taskData);

        // Сохраняем external_id в Supabase (только в реальном режиме!)
        if (!dryRun) {
          await supabase.updateObjectExternalId(obj.object_id, wsTask.id);
        } else {
          logger.info(`[DRY-RUN] Would save object external_id to Supabase: ${wsTask.id}`);
        }
        obj.external_id = wsTask.id; // Для использования далее
        result.taskMap.set(obj.object_id, wsTask.id);
        result.created++;

        // Сохранить информацию о создании
        result.changes.push({
          entity_type: 'Object',
          entity_id: obj.object_id,
          entity_name: obj.object_name,
          ws_task_id: wsTask.id,
          action: 'created',
          data: taskData
        });
      }
    } catch (error) {
      logger.error(`Object sync error (${obj.object_name}): ${error.message}`);
      result.errors.push({
        object_id: obj.object_id,
        name: obj.object_name,
        error: error.message,
      });
    }
  }

  return result;
}

module.exports = {
  syncObjects,
};
