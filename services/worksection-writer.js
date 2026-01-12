// Worksection API клиент для ЗАПИСИ
// Создание и обновление проектов и задач

const axios = require('axios');
const crypto = require('crypto-js');
const { config } = require('../config/env');
const logger = require('../utils/logger');
const RateLimiter = require('../utils/rate-limiter');

// Нормализация структуры: WS API возвращает child, конвертируем в subtasks
function normalizeTasksStructure(tasks) {
  if (!Array.isArray(tasks)) return;

  for (const task of tasks) {
    // Переименовываем child -> subtasks
    if (task.child) {
      task.subtasks = task.child;
      delete task.child;
      // Рекурсивно обрабатываем вложенные subtasks
      normalizeTasksStructure(task.subtasks);
    }
  }
}

class WorksectionWriter {
  constructor() {
    this.baseUrl = `https://${config.worksection.domain}/api/admin/v2/`;
    this.apiKey = config.worksection.hash;
    this.rateLimiter = new RateLimiter(config.sync.delayMs);
    this.dryRun = false; // Флаг dry-run режима
  }

  setDryRun(enabled) {
    this.dryRun = enabled;
    if (enabled) {
      logger.warning('🔒 DRY-RUN MODE ENABLED: No changes will be made to Worksection');
    }
  }

  // MD5 хеш для аутентификации
  generateHash(queryParams) {
    const hashInput = queryParams + this.apiKey;
    return crypto.MD5(hashInput).toString();
  }

  async request(action, params = {}) {
    await this.rateLimiter.wait();

    try {
      const queryParams = new URLSearchParams({ action, ...params });
      const queryString = queryParams.toString();
      const hash = this.generateHash(queryString);
      queryParams.append('hash', hash);

      const url = `${this.baseUrl}?${queryParams.toString()}`;
      logger.info(`WS API: ${action}`);

      const response = await axios.get(url);

      if (response.data.status !== 'ok') {
        const errorMsg = response.data.message || 'Unknown API error';
        logger.error(`WS API error: ${errorMsg}`);
        logger.error(`  Action: ${action}`);
        logger.error(`  Params: ${JSON.stringify(params)}`);
        throw new Error(errorMsg);
      }

      return response.data;
    } catch (error) {
      if (!error.message.includes('WS API error:')) {
        logger.error(`WS API error: ${error.message}`);
        logger.error(`  Action: ${action}`);
        logger.error(`  Params: ${JSON.stringify(params)}`);
      }
      throw error;
    }
  }

  // ============ ПРОЕКТЫ ============

  async postProject(data) {
    if (this.dryRun) {
      logger.info(`[DRY-RUN] Would CREATE project: ${data.title}`);
      return { id: 'dry-run-project-id', name: data.title };
    }

    const params = {
      title: data.title,
    };

    if (data.emailManager) params.email_manager = data.emailManager;
    if (data.dateStart) params.datestart = data.dateStart;
    if (data.dateEnd) params.dateend = data.dateEnd;
    if (data.tags) params.tags = data.tags;
    if (data.text) params.text = data.text;

    const result = await this.request('post_project', params);
    logger.success(`Project created: ${result.data.id} - ${result.data.name}`);
    return result.data;
  }

  async updateProject(projectId, data) {
    if (this.dryRun) {
      logger.info(`[DRY-RUN] Would UPDATE project ${projectId}: ${data.title || 'no title change'}`);
      return { id: projectId, name: data.title || 'existing project' };
    }

    const params = {
      id_project: projectId,
    };

    if (data.title) params.title = data.title;
    if (data.emailManager) params.email_manager = data.emailManager;
    if (data.dateStart) params.datestart = data.dateStart;
    if (data.dateEnd) params.dateend = data.dateEnd;
    // ВАЖНО: tags НЕ отправляем при UPDATE! Они могут вызвать ошибку "Tag is invalid"
    // если тег не существует. Теги устанавливаются только при CREATE.

    const result = await this.request('update_project', params);
    logger.success(`Project updated: ${projectId}`);
    return result.data;
  }

  async getProject(projectId) {
    const result = await this.request('get_projects', { id_project: projectId });
    return result.data;
  }

  // ============ ЗАДАЧИ ============

  async postTask(data) {
    if (this.dryRun) {
      // Определяем уровень по наличию parent и наличию чеклиста
      // Level 1: parent = null (Objects)
      // Level 2: parent есть, но нет чеклиста (Sections)
      // Level 3: parent есть и есть чеклист (Decomposition stages)
      let level = 1;
      if (data.parentId) {
        level = data.text ? 3 : 2;
      }

      logger.info(`[DRY-RUN] Would CREATE task (Level ${level}): ${data.title}`);
      logger.info(`[DRY-RUN]   Project: ${data.projectId}, Parent: ${data.parentId || 'none'}, Responsible: ${data.emailUserTo || 'NOONE'}`);
      if (data.maxTime) logger.info(`[DRY-RUN]   Max time: ${data.maxTime}h`);
      if (data.text) logger.info(`[DRY-RUN]   Checklist: ${data.text.split('\n').length} items`);
      return { id: `dry-run-task-${Date.now()}`, name: data.title };
    }

    const params = {
      id_project: data.projectId,
      title: data.title,
    };

    // Родительская задача (для подзадач)
    if (data.parentId) params.id_parent = data.parentId;

    // Ответственный
    if (data.emailUserTo) {
      params.email_user_to = data.emailUserTo;
    } else {
      params.email_user_to = 'NOONE';
    }

    // Даты
    if (data.dateStart) params.datestart = data.dateStart;
    if (data.dateEnd) params.dateend = data.dateEnd;

    // Плановые часы
    if (data.maxTime) params.max_time = data.maxTime;

    // Описание/чеклист (только при создании!)
    if (data.text) params.text = data.text;

    // Теги
    if (data.tags) params.tags = data.tags;

    // Детальное логирование перед отправкой
    logger.info(`Sending postTask request with params:`);
    logger.info(`  title: "${params.title}"`);
    logger.info(`  email_user_to: "${params.email_user_to}"`);
    if (params.id_parent) logger.info(`  id_parent: ${params.id_parent}`);
    if (params.tags) logger.info(`  tags: "${params.tags}"`);
    if (params.datestart) logger.info(`  datestart: ${params.datestart}`);
    if (params.dateend) logger.info(`  dateend: ${params.dateend}`);

    const result = await this.request('post_task', params);
    logger.success(`Task created: ${result.data.id} - ${result.data.name}`);
    return result.data;
  }

  async updateTask(taskId, data) {
    if (this.dryRun) {
      logger.info(`[DRY-RUN] Would UPDATE task ${taskId}: ${data.title || 'no title change'}`);
      if (data.emailUserTo) logger.info(`[DRY-RUN]   Responsible: ${data.emailUserTo}`);
      if (data.maxTime) logger.info(`[DRY-RUN]   Max time: ${data.maxTime}h`);
      return { id: taskId, name: data.title || 'existing task' };
    }

    const params = {
      id_task: taskId,
    };

    if (data.title) params.title = data.title;
    if (data.emailUserTo) params.email_user_to = data.emailUserTo;
    if (data.dateStart) params.datestart = data.dateStart;
    if (data.dateEnd) params.dateend = data.dateEnd;
    if (data.maxTime) params.max_time = data.maxTime;
    // ВАЖНО: tags НЕ отправляем при UPDATE! Они могут вызвать ошибку "Tag is invalid"
    // если тег не существует или не добавлен к проекту. Теги устанавливаются только при CREATE.

    // ВАЖНО: text нельзя обновить!

    const result = await this.request('update_task', params);
    logger.success(`Task updated: ${taskId}`);
    return result.data;
  }

  async getTask(taskId) {
    const result = await this.request('get_task', {
      id_task: taskId,
      extra: 'subtasks,text'  // Запрашиваем subtasks и text
    });

    // Нормализуем структуру (child -> subtasks)
    if (result.data && result.data.child) {
      result.data.subtasks = result.data.child;
      delete result.data.child;
      normalizeTasksStructure(result.data.subtasks);
    }

    return result.data;
  }

  async getTasks(projectId) {
    const result = await this.request('get_tasks', {
      id_project: projectId,
      extra: 'subtasks,text',  // Добавлен text для получения чеклистов
    });

    // API возвращает подзадачи в поле "child", переименовываем в "subtasks" для совместимости
    const tasks = result.data || [];

    normalizeTasksStructure(tasks);

    return tasks;
  }

  // ============ ТЕГИ ПРОЕКТА ============

  async updateProjectTags(projectId, tagsToAdd, tagsToRemove) {
    const params = { id_project: projectId };

    if (tagsToAdd) params.plus = tagsToAdd;
    if (tagsToRemove) params.minus = tagsToRemove;

    const result = await this.request('update_project_tags', params);
    return result.data;
  }

  // ============ ТЕГИ ЗАДАЧ ============

  /**
   * Получить теги задач из группы
   * @param {String} groupName - Название группы (например "Отдел")
   * @returns {Array} Массив тегов [{id, title, group}, ...]
   */
  async getTaskTags(groupName) {
    const params = {};
    if (groupName) params.group = groupName;

    const result = await this.request('get_task_tags', params);
    return result.data || [];
  }

  /**
   * Обновить теги задачи (добавить/удалить)
   * @param {String} taskId - ID задачи
   * @param {String} tagsToAdd - Теги для добавления (через запятую)
   * @param {String} tagsToRemove - Теги для удаления (через запятую)
   */
  async updateTaskTags(taskId, tagsToAdd, tagsToRemove) {
    if (this.dryRun) {
      logger.info(`[DRY-RUN] Would UPDATE task tags ${taskId}: +${tagsToAdd || 'none'} -${tagsToRemove || 'none'}`);
      return { status: 'ok' };
    }

    const params = { id_task: taskId };

    if (tagsToAdd) params.plus = tagsToAdd;
    if (tagsToRemove) params.minus = tagsToRemove;

    const result = await this.request('update_task_tags', params);
    logger.success(`Task tags updated: ${taskId} (+${tagsToAdd || 'none'} -${tagsToRemove || 'none'})`);
    return result.data;
  }

  // ============ ВСПОМОГАТЕЛЬНЫЕ ============

  async getUsers() {
    const result = await this.request('get_users');
    return result.data || [];
  }

  async getProjects() {
    const result = await this.request('get_projects');
    return result.data || [];
  }
}

module.exports = new WorksectionWriter();
