// Синхронизация проекта eneca.work → Worksection

const supabase = require('../services/supabase');
const wsWriter = require('../services/worksection-writer');
const { formatDateForWS } = require('../mappers/date-mapper');
const { getEmailByUserId } = require('../mappers/user-mapper');
const { compareProjectData } = require('../utils/data-comparator');
const logger = require('../utils/logger');

async function syncProject(project, stages, dryRun = false) {
  const result = {
    action: null, // 'created', 'updated' or 'unchanged'
    wsProjectId: null,
    error: null,
    changes: null, // Детальная информация об изменениях
  };

  try {
    // Устанавливаем режим dry-run
    wsWriter.setDryRun(dryRun);

    // Подготовка данных
    const stageTags = stages.map(s => s.stage_name).join(',');
    const managerEmail = await getEmailByUserId(project.project_manager);

    const projectData = {
      title: project.project_name,
      emailManager: managerEmail,
      dateStart: formatDateForWS(project.project_start_date),
      dateEnd: formatDateForWS(project.project_end_date),
    };

    // Добавляем теги только если есть стадии
    if (stageTags) {
      projectData.tags = stageTags;
    }

    // Создание или обновление
    if (project.external_id) {
      // UPDATE - с проверкой изменений
      logger.info(`Project has external_id: ${project.external_id}, checking for changes`);

      // 1. Загрузить текущие данные из WS
      const wsProject = await wsWriter.getProject(project.external_id);

      // 2. Сравнить данные
      const comparison = compareProjectData(wsProject, projectData);

      // 3. Если нет изменений - пропустить
      if (!comparison.hasChanges) {
        logger.info(`✓ Project unchanged, skipping UPDATE: ${project.project_name}`);
        result.action = 'unchanged';
        result.wsProjectId = project.external_id;
        return result;
      }

      // 4. Логировать детали изменений
      logger.info(`Updating project: ${project.project_name}`);
      logger.logChanges('Project', project.project_name, comparison.changes);

      // 5. Выполнить UPDATE
      await wsWriter.updateProject(project.external_id, projectData);
      result.action = 'updated';
      result.wsProjectId = project.external_id;
      result.changes = comparison.changes;
    } else {
      // CREATE
      logger.info(`Creating project: ${project.project_name}`);
      const wsProject = await wsWriter.postProject(projectData);
      result.wsProjectId = wsProject.id;
      result.action = 'created';
      result.changes = projectData;

      // Сохраняем external_id в eneca.work (только в реальном режиме!)
      if (!dryRun) {
        await supabase.updateProjectExternalId(project.project_id, wsProject.id);
      } else {
        logger.info(`[DRY-RUN] Would save external_id to Supabase: ${wsProject.id}`);
      }
    }

  } catch (error) {
    logger.error(`Project sync error: ${error.message}`);
    result.error = error.message;
  }

  return result;
}

module.exports = {
  syncProject,
};
