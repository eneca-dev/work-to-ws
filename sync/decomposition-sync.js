// Синхронизация Decomposition Stages → Sub-subtasks (уровень 3)

const supabase = require('../services/supabase');
const wsWriter = require('../services/worksection-writer');
const { formatDateForWS } = require('../mappers/date-mapper');
const { buildChecklist } = require('../mappers/checklist-mapper');
const { getDepartmentTagForUser, extractCurrentDepartmentTag } = require('../services/department-tags');
const { getBudgetForEntity } = require('../services/budget-service');
const { compareTaskData } = require('../utils/data-comparator');
const logger = require('../utils/logger');

// Вычисление суммы плановых часов из items
function calculatePlannedHours(items) {
  if (!items || items.length === 0) return null;

  const total = items.reduce((sum, item) => {
    const hours = parseFloat(item.decomposition_item_planned_hours) || 0;
    return sum + hours;
  }, 0);

  return total > 0 ? total : null;
}

/**
 * Синхронизирует Decomposition Stages как Sub-subtasks (уровень 3)
 * @param {Array} sections - Массив разделов с decomposition_stages
 * @param {String} wsProjectId - ID WS проекта
 * @param {Boolean} dryRun - Режим dry-run (без изменений)
 * @returns {Object} Результат синхронизации
 */
async function syncDecomposition(sections, wsProjectId, dryRun = false) {
  const result = {
    created: 0,
    updated: 0,
    errors: [],
    changes: [], // Детальная информация об изменениях
  };

  if (!wsProjectId) {
    throw new Error('wsProjectId is required for syncDecomposition');
  }

  // Устанавливаем режим dry-run
  wsWriter.setDryRun(dryRun);

  for (const section of sections) {
    const decompositionStages = section.decomposition_stages || [];

    for (const decomp of decompositionStages) {
      try {
        // Родитель - это section (его WS task ID)
        const parentId = section.external_id;
        if (!parentId) {
          logger.warning(`Parent section not synced for decomp: ${decomp.decomposition_stage_name}`);
          result.errors.push({
            decomposition_stage_id: decomp.decomposition_stage_id,
            name: decomp.decomposition_stage_name,
            error: 'Parent section not synced',
          });
          continue;
        }

        // Вычисляем плановые часы как сумму из items
        const plannedHours = calculatePlannedHours(decomp.items);

        // Ответственный: берем первого из массива
        const responsibles = decomp.decomposition_stage_responsibles || [];
        let responsibleEmail = 'NOONE';
        let departmentTag = null;

        if (responsibles.length > 0) {
          const { getEmailByUserId } = require('../mappers/user-mapper');
          responsibleEmail = await getEmailByUserId(responsibles[0]);
          departmentTag = await getDepartmentTagForUser(responsibles[0]);

          if (responsibles.length > 1) {
            logger.warning(`Decomposition stage "${decomp.decomposition_stage_name}" has ${responsibles.length} responsibles, using first`);
          }
        }

        const taskData = {
          projectId: wsProjectId,    // WS проект (из Supabase Project)
          parentId: parentId,         // Section task ID (Level 3)
          title: decomp.decomposition_stage_name,
          emailUserTo: responsibleEmail, // Ответственный
          dateStart: formatDateForWS(decomp.decomposition_stage_start),
          dateEnd: formatDateForWS(decomp.decomposition_stage_finish),
        };

        // Добавляем бюджет если есть
        const budget = getBudgetForEntity('decomposition_stage', decomp.decomposition_stage_id);
        if (budget) {
          taskData.maxMoney = budget;
          logger.info(`Decomposition "${decomp.decomposition_stage_name}" has budget: ${budget}`);
        }

        // Добавляем maxTime ТОЛЬКО если есть реальное значение (избегаем null)
        if (plannedHours !== null && plannedHours > 0) {
          taskData.maxTime = plannedHours;
        }

        // Добавляем тег отдела только при CREATE (при UPDATE обновляем отдельно)
        if (!decomp.external_id && departmentTag) {
          taskData.tags = departmentTag;
          logger.info(`Decomposition "${decomp.decomposition_stage_name}" will have department tag: ${departmentTag}`);
        }

        if (decomp.external_id) {
          // UPDATE (без text - чеклист нельзя изменить!)
          logger.info(`Decomposition has external_id: ${decomp.external_id}, checking for changes`);

          try {
            // 1. Загрузить текущие данные из WS
            const wsTask = await wsWriter.getTask(decomp.external_id);

            // 2. Сравнить данные (БЕЗ text - чеклист нельзя обновить!)
            const comparison = compareTaskData(wsTask, taskData, { skipText: true });

            // 3. Если нет изменений - пропустить
            if (!comparison.hasChanges) {
              logger.info(`✓ Decomposition unchanged, skipping UPDATE: ${decomp.decomposition_stage_name}`);
              continue; // НЕ увеличиваем счетчик updated
            }

            // 4. Логировать детали изменений
            logger.info(`Updating decomposition: ${decomp.decomposition_stage_name}`);
            logger.logChanges('Decomposition', decomp.decomposition_stage_name, comparison.changes);

            // 5. Выполнить UPDATE
            await wsWriter.updateTask(decomp.external_id, taskData);
            logger.info(`✓ Updated decomposition: ${decomp.decomposition_stage_name}`);
            result.updated++;

            // 6. Обновить тег отдела если изменился
            const currentDeptTag = extractCurrentDepartmentTag(wsTask.tags);
            if (departmentTag !== currentDeptTag) {
              if (departmentTag || currentDeptTag) {
                await wsWriter.updateTaskTags(decomp.external_id, departmentTag, currentDeptTag);
                logger.info(`Updated department tag: "${currentDeptTag || 'none'}" → "${departmentTag || 'none'}"`);
                comparison.changes.push({
                  field: 'departmentTag',
                  from: currentDeptTag || 'none',
                  to: departmentTag || 'none'
                });
              }
            }

            // Сохранить детали изменений для отчета
            result.changes.push({
              entity_type: 'Decomposition',
              entity_id: decomp.decomposition_stage_id,
              entity_name: decomp.decomposition_stage_name,
              ws_task_id: decomp.external_id,
              action: 'updated',
              changes: comparison.changes
            });
          } catch (updateError) {
            // Задача не существует (возможно, старый external_id)
            logger.warning(`UPDATE failed for decomposition ${decomp.decomposition_stage_name}: ${updateError.message}`);
            logger.warning(`Creating new task and updating external_id...`);

            // Добавляем тег отдела для нового создания
            if (departmentTag) {
              taskData.tags = departmentTag;
            }

            // Создаем новую задачу с чеклистом
            const checklist = buildChecklist(decomp.items);
            if (checklist) {
              taskData.text = checklist;
            }

            const wsTask = await wsWriter.postTask(taskData);

            // Обновляем external_id в Supabase на новый (только в реальном режиме!)
            if (!dryRun) {
              await supabase.updateDecompositionStageExternalId(
                decomp.decomposition_stage_id,
                wsTask.id
              );
            } else {
              logger.info(`[DRY-RUN] Would save decomposition external_id to Supabase: ${wsTask.id}`);
            }
            result.created++;

            logger.info(`✓ Created new task and updated external_id: ${wsTask.id}`);
          }
        } else {
          // CREATE (с чеклистом!)
          const checklist = buildChecklist(decomp.items);
          if (checklist) {
            taskData.text = checklist;
            logger.info(`Creating decomposition with checklist: ${decomp.decomposition_stage_name}`);
          } else {
            logger.info(`Creating decomposition: ${decomp.decomposition_stage_name}`);
          }

          const wsTask = await wsWriter.postTask(taskData);

          // Сохраняем external_id в Supabase (только в реальном режиме!)
          if (!dryRun) {
            await supabase.updateDecompositionStageExternalId(
              decomp.decomposition_stage_id,
              wsTask.id
            );
          } else {
            logger.info(`[DRY-RUN] Would save decomposition external_id to Supabase: ${wsTask.id}`);
          }
          result.created++;

          // Сохранить информацию о создании
          result.changes.push({
            entity_type: 'Decomposition',
            entity_id: decomp.decomposition_stage_id,
            entity_name: decomp.decomposition_stage_name,
            ws_task_id: wsTask.id,
            action: 'created',
            data: taskData,
            checklist_items: decomp.items?.length || 0
          });
        }
      } catch (error) {
        logger.error(`Decomposition sync error (${decomp.decomposition_stage_name}): ${error.message}`);
        result.errors.push({
          decomposition_stage_id: decomp.decomposition_stage_id,
          name: decomp.decomposition_stage_name,
          error: error.message,
        });
      }
    }
  }

  return result;
}

module.exports = {
  syncDecomposition,
};
