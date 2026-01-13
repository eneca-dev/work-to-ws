// Оркестратор синхронизации eneca.work → Worksection
// ПРАВИЛЬНАЯ СТРУКТУРА: Project → WS Project, Object → Task, Section → Subtask

const supabase = require('../services/supabase');
const { syncProject } = require('./project-sync');
const { syncObjects } = require('./object-sync');
const { syncSections } = require('./section-sync');
const { syncDecomposition } = require('./decomposition-sync');
const { clearCache } = require('../mappers/user-mapper');
const { clearCache: clearDepartmentCache } = require('../mappers/department-mapper');
const departmentTags = require('../services/department-tags');
const budgetService = require('../services/budget-service');
const logger = require('../utils/logger');
const telegram = require('../services/telegram');
const { config } = require('../config/env');

/**
 * Основная функция синхронизации проекта из eneca.work в Worksection
 * @param {String} projectId - UUID проекта в Supabase
 * @param {Boolean} dryRun - Если true, только логирование без изменений в WS
 * @param {Boolean} sendNotifications - Отправлять ли уведомления в Telegram (по умолчанию автоматически)
 * @returns {Object} Результат синхронизации
 */
async function syncProjectToWS(projectId, dryRun = false, sendNotifications = null) {
  const startTime = new Date();
  logger.clearLogs();
  clearCache(); // Очистка кэша пользователей
  clearDepartmentCache(); // Очистка кэша отделов
  departmentTags.clearCache(); // Очистка кэша тегов отделов
  budgetService.clearCache(); // Очистка кэша бюджетов

  // Автоматическое определение отправки уведомлений
  if (sendNotifications === null) {
    sendNotifications = config.telegram.enabled;
  }

  if (dryRun) {
    logger.warning('⚠️  DRY-RUN MODE: NO CHANGES WILL BE MADE TO WORKSECTION');
  }

  logger.info(`Starting sync for project: ${projectId}`);

  const stats = {
    project: { action: null, wsProjectId: null, error: null },
    objects: { created: 0, updated: 0, unchanged: 0, errors: [], taskMap: null },
    sections: { created: 0, updated: 0, unchanged: 0, errors: [], taskMap: null },
    decomposition: { created: 0, updated: 0, unchanged: 0, errors: [] },
    totalErrors: 0,
    duration_ms: 0,
  };

  let project = null;
  let objects = null;
  let sections = null;

  try {
    // ============ ШАГ 1: ЗАГРУЗКА ДАННЫХ ============
    logger.info('Step 1: Loading data from eneca.work');
    const projectData = await supabase.getProjectFull(projectId);
    project = projectData.project;
    objects = projectData.objects;
    sections = projectData.sections;

    logger.info(`Loaded project: ${project.project_name}`);
    logger.info(`  Stage: ${project.stage_type || 'none'}`);
    logger.info(`  Objects: ${objects.length}`);
    logger.info(`  Sections: ${sections.length}`);

    let totalDecomposition = 0;
    sections.forEach(s => {
      totalDecomposition += s.decomposition_stages?.length || 0;
    });
    logger.info(`  Decomposition Stages: ${totalDecomposition}`);

    // Загрузить бюджеты для всех сущностей (один раз для всей синхронизации)
    await budgetService.loadBudgetsForProject(projectId, objects, sections);

    // Загрузить допустимые теги отделов из WS (один раз для всей синхронизации)
    await departmentTags.loadValidDepartmentTags();

    // Отправить уведомление о начале синхронизации
    if (sendNotifications) {
      await telegram.sendSyncStarted(projectId, project.project_name, {
        stageType: project.stage_type,
        objectsCount: objects.length,
        sectionsCount: sections.length,
        stagesCount: totalDecomposition
      });
    }

    // ============ ШАГ 2: СИНХРОНИЗАЦИЯ ПРОЕКТА ============
    logger.info('Step 2: Syncing project');
    stats.project = await syncProject(project, dryRun);

    if (stats.project.error) {
      throw new Error(`Project sync failed: ${stats.project.error}`);
    }

    const wsProjectId = stats.project.wsProjectId;
    logger.info(`Project ${stats.project.action}: ${project.project_name} (WS ID: ${wsProjectId})`);

    // ============ ШАГ 3: СИНХРОНИЗАЦИЯ OBJECTS → TASKS (Level 1) ============
    logger.info('Step 3: Syncing objects as tasks (Level 1)');
    stats.objects = await syncObjects(objects, wsProjectId, dryRun);

    if (!stats.objects.taskMap || stats.objects.taskMap.size === 0) {
      logger.warning('No objects were synced - skipping sections and decomposition');
      stats.duration_ms = Date.now() - startTime;
      stats.totalErrors = stats.objects.errors.length;

      // Отправить отчёт даже если нет объектов
      if (sendNotifications) {
        const endTime = new Date();
        const csvStats = collectSyncStats(project, objects, sections, stats, wsProjectId);

        const allChanges = {
          project: stats.project.changes,
          objects: [],
          sections: [],
          decomposition: []
        };

        await telegram.sendCsvFile(logger.getLogs(), csvStats, startTime, endTime, projectId, allChanges);
      }

      return {
        success: true,
        project_id: projectId,
        ws_project_id: wsProjectId,
        stats,
        logs: logger.getLogs(),
        dryRun,
      };
    }

    const objectTaskMap = stats.objects.taskMap;

    // Подсчет unchanged объектов
    stats.objects.unchanged = objects.length - stats.objects.created - stats.objects.updated - stats.objects.errors.length;
    logger.info(`Objects: ${stats.objects.created} created, ${stats.objects.updated} updated, ${stats.objects.unchanged} unchanged`);

    // ============ ШАГ 4: СИНХРОНИЗАЦИЯ SECTIONS → SUBTASKS (Level 2) ============
    logger.info('Step 4: Syncing sections as subtasks (Level 2)');
    stats.sections = await syncSections(sections, wsProjectId, objectTaskMap, dryRun);

    // Подсчет unchanged секций
    stats.sections.unchanged = sections.length - stats.sections.created - stats.sections.updated - stats.sections.errors.length;
    logger.info(`Sections: ${stats.sections.created} created, ${stats.sections.updated} updated, ${stats.sections.unchanged} unchanged`);

    // ============ ШАГ 5: СИНХРОНИЗАЦИЯ DECOMPOSITION → SUB-SUBTASKS (Level 3) ============
    logger.info('Step 5: Syncing decomposition stages as sub-subtasks (Level 3)');
    stats.decomposition = await syncDecomposition(sections, wsProjectId, dryRun);

    // Подсчет unchanged decomposition stages
    let totalDecompStages = 0;
    sections.forEach(s => {
      totalDecompStages += s.decomposition_stages?.length || 0;
    });
    stats.decomposition.unchanged = totalDecompStages - stats.decomposition.created - stats.decomposition.updated - stats.decomposition.errors.length;
    logger.info(`Decomposition: ${stats.decomposition.created} created, ${stats.decomposition.updated} updated, ${stats.decomposition.unchanged} unchanged`);

    // ============ ИТОГИ ============
    stats.totalErrors =
      (stats.project.error ? 1 : 0) +
      stats.objects.errors.length +
      stats.sections.errors.length +
      stats.decomposition.errors.length;

    stats.duration_ms = Date.now() - startTime;

    logger.success(`Sync completed in ${stats.duration_ms}ms`);
    logger.info(`Total entities processed: ${stats.objects.created + stats.objects.updated + stats.objects.unchanged + stats.sections.created + stats.sections.updated + stats.sections.unchanged + stats.decomposition.created + stats.decomposition.updated + stats.decomposition.unchanged}`);
    logger.info(`  Created: ${stats.objects.created + stats.sections.created + stats.decomposition.created}, Updated: ${stats.objects.updated + stats.sections.updated + stats.decomposition.updated}, Unchanged: ${stats.objects.unchanged + stats.sections.unchanged + stats.decomposition.unchanged}`);

    if (stats.totalErrors > 0) {
      logger.warning(`Total errors: ${stats.totalErrors}`);
    }

    // Отправить CSV отчёт в Telegram
    if (sendNotifications) {
      const endTime = new Date();
      const csvStats = collectSyncStats(project, objects, sections, stats, wsProjectId);

      // Собрать все изменения для детального отчета
      const allChanges = {
        project: stats.project.changes,
        objects: stats.objects.changes || [],
        sections: stats.sections.changes || [],
        decomposition: stats.decomposition.changes || []
      };

      await telegram.sendCsvFile(logger.getLogs(), csvStats, startTime, endTime, projectId, allChanges);
    }

    return {
      success: true,
      project_id: projectId,
      ws_project_id: wsProjectId,
      stats,
      logs: logger.getLogs(),
      dryRun,
    };

  } catch (error) {
    stats.duration_ms = Date.now() - startTime;
    logger.error(`Sync failed: ${error.message}`);

    // Отправить уведомление об ошибке в Telegram
    if (sendNotifications) {
      await telegram.sendError(error, 'syncProjectToWS', projectId);
    }

    return {
      success: false,
      project_id: projectId,
      error: error.message,
      stats,
      logs: logger.getLogs(),
    };
  }
}

/**
 * Собрать статистику для CSV отчёта
 */
function collectSyncStats(project, objects, sections, stats, wsProjectId) {
  const csvStats = {
    // Project information
    wsProjectId: wsProjectId,
    projectName: project?.project_name || 'Unknown',
    projectStatus: project?.status || 'active',
    stageTag: project?.stage_type || '',

    // Objects
    objects: objects ? objects.map(obj => ({
      id: obj.id,
      name: obj.object_name || obj.name,
      wsTaskId: obj.ws_task_id || '',
      status: obj.status || '',
      priority: obj.priority || '',
      createdAt: obj.created_at
    })) : [],

    // Sections
    sections: sections ? sections.map(section => ({
      id: section.id,
      name: section.section_name || section.name,
      parentTaskId: section.object_id,
      wsSubtaskId: section.ws_subtask_id || '',
      status: section.status || '',
      budget: section.budget || '',
      createdAt: section.created_at
    })) : [],

    // Decomposition stages
    stages: [],
    items: [],

    // Собрать все decomposition stages и items из sections
    projectsCount: 1,
    objectsCreated: stats.objects.created || 0,
    objectsUpdated: stats.objects.updated || 0,
    sectionsCreated: stats.sections.created || 0,
    sectionsUpdated: stats.sections.updated || 0,
    stagesCreated: stats.decomposition.created || 0,
    stagesUpdated: stats.decomposition.updated || 0,
    itemsCreated: 0,
    errorsCount: stats.totalErrors || 0
  };

  // Собрать decomposition stages и items
  if (sections) {
    sections.forEach(section => {
      if (section.decomposition_stages && section.decomposition_stages.length > 0) {
        section.decomposition_stages.forEach((stage, index) => {
          csvStats.stages.push({
            id: stage.id,
            name: stage.stage_name || stage.name,
            parentSubtaskId: section.ws_subtask_id || '',
            wsSubSubtaskId: stage.ws_task_id || '',
            status: stage.status || '',
            duration: stage.duration || '',
            order: stage.order || index + 1,
            createdAt: stage.created_at
          });

          // Собрать decomposition items
          if (stage.decomposition_items && stage.decomposition_items.length > 0) {
            stage.decomposition_items.forEach(item => {
              csvStats.items.push({
                id: item.id,
                content: item.item_content || item.content,
                stageId: stage.id,
                parentTaskId: stage.ws_task_id || '',
                checked: item.checked || false,
                order: item.order || 0,
                createdAt: item.created_at
              });
              csvStats.itemsCreated++;
            });
          }
        });
      }
    });
  }

  return csvStats;
}

module.exports = {
  syncProjectToWS,
};
