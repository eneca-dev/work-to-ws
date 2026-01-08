// Синхронизация Sections → Subtasks (Level 2)

const supabase = require('../services/supabase');
const wsWriter = require('../services/worksection-writer');
const { formatDateForWS } = require('../mappers/date-mapper');
const { getEmailByUserId } = require('../mappers/user-mapper');
const { getDepartmentNameByUserId } = require('../mappers/department-mapper');
const { compareTaskData } = require('../utils/data-comparator');
const logger = require('../utils/logger');

/**
 * Синхронизирует Sections как Subtasks (уровень 2)
 * @param {Array} sections - Массив разделов из Supabase
 * @param {String} wsProjectId - ID WS проекта
 * @param {Map} objectTaskMap - Маппинг object_id → ws_task_id (parentId для sections)
 * @param {Boolean} dryRun - Режим dry-run (без изменений)
 * @returns {Object} Результат синхронизации с taskMap (section_id → ws_task_id)
 */
async function syncSections(sections, wsProjectId, objectTaskMap, dryRun = false) {
  const result = {
    created: 0,
    updated: 0,
    errors: [],
    taskMap: new Map(), // section_id → ws_task_id (для Decomposition Stages)
    changes: [], // Детальная информация об изменениях
  };

  if (!wsProjectId) {
    throw new Error('wsProjectId is required for syncSections');
  }

  if (!objectTaskMap) {
    throw new Error('objectTaskMap is required for syncSections');
  }

  // Устанавливаем режим dry-run
  wsWriter.setDryRun(dryRun);

  for (const section of sections) {
    try {
      // Найти WS task ID родительского объекта
      let parentTaskId = objectTaskMap.get(section.section_object_id);

      // Проверка на placeholder от ws-to-work OS проектов
      if (parentTaskId && parentTaskId.includes('_placeholder')) {
        logger.info(`Object has placeholder ID (ws-to-work OS project), section will be top-level`);
        parentTaskId = null; // Sections в OS проектах - это top-level tasks!
      } else if (parentTaskId === undefined) {
        // Объект не найден в мапе - ошибка
        logger.warning(`Parent object task not found for section: ${section.section_name}`);
        result.errors.push({
          section_id: section.section_id,
          name: section.section_name,
          error: 'Parent object not synced or missing task ID',
        });
        continue;
      }
      // Если parentTaskId === null - это нормально (для OS проектов)

      const responsibleEmail = await getEmailByUserId(section.section_responsible);

      const taskData = {
        projectId: wsProjectId,     // WS проект
        parentId: parentTaskId,     // Level 2 - subtask родительского Object
        title: section.section_name,
        emailUserTo: responsibleEmail,
        dateStart: formatDateForWS(section.section_start_date),
        dateEnd: formatDateForWS(section.section_end_date),
      };

      if (section.external_id) {
        // UPDATE - с проверкой изменений
        logger.info(`Section has external_id: ${section.external_id}, checking for changes`);

        try {
          // 1. Загрузить текущие данные из WS
          const wsTask = await wsWriter.getTask(section.external_id);

          // 2. Сравнить данные
          const comparison = compareTaskData(wsTask, taskData);

          // 3. Если нет изменений - пропустить
          if (!comparison.hasChanges) {
            logger.info(`✓ Section unchanged, skipping UPDATE: ${section.section_name}`);
            result.taskMap.set(section.section_id, section.external_id);
            continue; // НЕ увеличиваем счетчик updated
          }

          // 4. Логировать детали изменений
          logger.info(`Updating section: ${section.section_name}`);
          logger.logChanges('Section', section.section_name, comparison.changes);

          // 5. Выполнить UPDATE
          await wsWriter.updateTask(section.external_id, taskData);
          logger.info(`✓ Updated section as subtask: ${section.section_name}`);
          result.updated++;
          result.taskMap.set(section.section_id, section.external_id);

          // Сохранить детали изменений для отчета
          result.changes.push({
            entity_type: 'Section',
            entity_id: section.section_id,
            entity_name: section.section_name,
            ws_task_id: section.external_id,
            action: 'updated',
            changes: comparison.changes
          });
        } catch (updateError) {
          // Задача с таким ID не существует или в другом проекте
          logger.warning(`UPDATE failed for section ${section.section_name}: ${updateError.message}`);
          logger.warning(`Trying to CREATE new task and update external_id...`);

          // Создаем новую задачу (с fallback без тега)
          let wsTask;
          try {
            wsTask = await wsWriter.postTask(taskData);
          } catch (createError) {
            // Если ошибка связана с тегом - попробовать без тега
            if (createError.message.includes('Invalid email') || createError.message.includes('Tag is invalid')) {
              if (taskData.tags) {
                logger.warning(`CREATE failed with tags, retrying without tags: ${createError.message}`);
                const taskDataWithoutTags = { ...taskData };
                delete taskDataWithoutTags.tags;
                wsTask = await wsWriter.postTask(taskDataWithoutTags);
                logger.info(`✓ Created successfully without tags`);
              } else {
                throw createError;
              }
            } else {
              throw createError;
            }
          }

          // Обновляем external_id в Supabase на новый (только в реальном режиме!)
          if (!dryRun) {
            await supabase.updateSectionExternalId(section.section_id, wsTask.id);
          } else {
            logger.info(`[DRY-RUN] Would save section external_id to Supabase: ${wsTask.id}`);
          }
          section.external_id = wsTask.id;
          result.taskMap.set(section.section_id, wsTask.id);
          result.created++;

          logger.info(`✓ Created new task and updated external_id: ${wsTask.id}`);
        }
      } else {
        // CREATE
        logger.info(`Creating section as subtask: ${section.section_name}`);

        let wsTask;
        try {
          wsTask = await wsWriter.postTask(taskData);
        } catch (createError) {
          // Если ошибка связана с тегом - попробовать без тега
          if (createError.message.includes('Invalid email') || createError.message.includes('Tag is invalid')) {
            if (taskData.tags) {
              logger.warning(`CREATE failed with tags, retrying without tags: ${createError.message}`);
              const taskDataWithoutTags = { ...taskData };
              delete taskDataWithoutTags.tags;
              wsTask = await wsWriter.postTask(taskDataWithoutTags);
              logger.info(`✓ Created successfully without tags`);
            } else {
              throw createError;
            }
          } else {
            throw createError;
          }
        }

        // Сохраняем external_id в Supabase (только в реальном режиме!)
        if (!dryRun) {
          await supabase.updateSectionExternalId(section.section_id, wsTask.id);
        } else {
          logger.info(`[DRY-RUN] Would save section external_id to Supabase: ${wsTask.id}`);
        }
        section.external_id = wsTask.id; // Для использования далее
        result.taskMap.set(section.section_id, wsTask.id);
        result.created++;

        // Сохранить информацию о создании
        result.changes.push({
          entity_type: 'Section',
          entity_id: section.section_id,
          entity_name: section.section_name,
          ws_task_id: wsTask.id,
          action: 'created',
          data: taskData
        });
      }
    } catch (error) {
      logger.error(`Section sync error (${section.section_name}): ${error.message}`);
      result.errors.push({
        section_id: section.section_id,
        name: section.section_name,
        error: error.message,
      });
    }
  }

  return result;
}

module.exports = {
  syncSections,
};
