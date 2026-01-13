// Supabase клиент для work-to-ws
// Чтение данных из eneca.work + запись external_id

const { createClient } = require('@supabase/supabase-js');
const { config } = require('../config/env');
const logger = require('../utils/logger');

class SupabaseService {
  constructor() {
    this.client = createClient(config.supabase.url, config.supabase.key);
  }

  // ============ ПРОЕКТ ============

  async getProjectById(projectId) {
    try {
      const { data, error } = await this.client
        .from('projects')
        .select('*')
        .eq('project_id', projectId)
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      logger.error(`Error getting project: ${error.message}`);
      throw error;
    }
  }

  // ============ СТАДИИ ПРОЕКТА ============
  // УДАЛЕНО: stages теперь хранятся как project.stage_type (поле в projects)

  // ============ OBJECTS ============

  async getObjectsByProjectId(projectId) {
    try {
      // Objects напрямую связаны с проектом через object_project_id
      const { data, error } = await this.client
        .from('objects')
        .select('*')
        .eq('object_project_id', projectId);

      if (error) throw error;
      return data || [];
    } catch (error) {
      logger.error(`Error getting objects: ${error.message}`);
      throw error;
    }
  }

  // ============ SECTIONS ============

  async getSectionsByProjectId(projectId) {
    try {
      const { data, error } = await this.client
        .from('sections')
        .select('*')
        .eq('section_project_id', projectId);

      if (error) throw error;
      return data || [];
    } catch (error) {
      logger.error(`Error getting sections: ${error.message}`);
      throw error;
    }
  }

  // ============ DECOMPOSITION STAGES ============

  async getDecompositionStagesBySectionId(sectionId) {
    try {
      const { data, error } = await this.client
        .from('decomposition_stages')
        .select('*')
        .eq('decomposition_stage_section_id', sectionId);

      if (error) throw error;
      return data || [];
    } catch (error) {
      logger.error(`Error getting decomposition stages: ${error.message}`);
      throw error;
    }
  }

  // ============ DECOMPOSITION ITEMS ============

  async getDecompositionItemsByStageId(decompositionStageId) {
    try {
      const { data, error } = await this.client
        .from('decomposition_items')
        .select('*')
        .eq('decomposition_item_stage_id', decompositionStageId);

      if (error) throw error;
      return data || [];
    } catch (error) {
      logger.error(`Error getting decomposition items: ${error.message}`);
      throw error;
    }
  }

  // ============ ПОЛНАЯ ЗАГРУЗКА ПРОЕКТА ============

  async getProjectFull(projectId) {
    logger.info(`Loading full project data for: ${projectId}`);

    // 1. Проект
    const project = await this.getProjectById(projectId);
    if (!project) {
      throw new Error(`Project not found: ${projectId}`);
    }
    logger.info(`Project loaded: ${project.project_name}`);
    logger.info(`  Stage type: ${project.stage_type || 'none'}`);

    // 2. Объекты
    const objects = await this.getObjectsByProjectId(projectId);
    logger.info(`Objects loaded: ${objects.length}`);

    // 3. Разделы
    const sections = await this.getSectionsByProjectId(projectId);
    logger.info(`Sections loaded: ${sections.length}`);

    // 4. Декомпозиция для каждого раздела
    for (const section of sections) {
      section.decomposition_stages = await this.getDecompositionStagesBySectionId(
        section.section_id
      );

      // 5. Items для каждого этапа декомпозиции
      for (const stage of section.decomposition_stages) {
        stage.items = await this.getDecompositionItemsByStageId(
          stage.decomposition_stage_id
        );
      }
    }

    const totalDecomp = sections.reduce(
      (sum, s) => sum + (s.decomposition_stages?.length || 0),
      0
    );
    logger.info(`Decomposition stages loaded: ${totalDecomp}`);

    return { project, objects, sections };
  }

  // ============ ЗАПИСЬ EXTERNAL_ID ============

  async updateProjectExternalId(projectId, externalId) {
    try {
      const { error } = await this.client
        .from('projects')
        .update({ external_id: externalId, external_source: 'worksection' })
        .eq('project_id', projectId);

      if (error) throw error;
      logger.success(`Project external_id updated: ${externalId}`);
    } catch (error) {
      logger.error(`Error updating project external_id: ${error.message}`);
      throw error;
    }
  }

  async updateObjectExternalId(objectId, externalId) {
    try {
      const { error } = await this.client
        .from('objects')
        .update({ external_id: externalId, external_source: 'worksection' })
        .eq('object_id', objectId);

      if (error) throw error;
      logger.success(`Object external_id updated: ${externalId}`);
    } catch (error) {
      logger.error(`Error updating object external_id: ${error.message}`);
      throw error;
    }
  }

  async updateSectionExternalId(sectionId, externalId) {
    try {
      const { error } = await this.client
        .from('sections')
        .update({ external_id: externalId, external_source: 'worksection' })
        .eq('section_id', sectionId);

      if (error) throw error;
      logger.success(`Section external_id updated: ${externalId}`);
    } catch (error) {
      logger.error(`Error updating section external_id: ${error.message}`);
      throw error;
    }
  }

  async updateDecompositionStageExternalId(decompositionStageId, externalId) {
    try {
      const { error } = await this.client
        .from('decomposition_stages')
        .update({ external_id: externalId, external_source: 'worksection' })
        .eq('decomposition_stage_id', decompositionStageId);

      if (error) throw error;
      logger.success(`Decomposition stage external_id updated: ${externalId}`);
    } catch (error) {
      logger.error(`Error updating decomposition stage external_id: ${error.message}`);
      throw error;
    }
  }

  // ============ PROFILES (для маппинга ответственных) ============

  async getUserById(userId) {
    if (!userId) return null;

    try {
      const { data, error } = await this.client
        .from('profiles')
        .select('user_id, email, first_name, last_name, department_id')
        .eq('user_id', userId)
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      return data || null;
    } catch (error) {
      logger.error(`Error getting user: ${error.message}`);
      return null;
    }
  }

  async getDepartmentById(departmentId) {
    if (!departmentId) return null;

    try {
      const { data, error } = await this.client
        .from('departments')
        .select('department_id, department_name')
        .eq('department_id', departmentId)
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      return data || null;
    } catch (error) {
      logger.error(`Error getting department: ${error.message}`);
      return null;
    }
  }

  async getEmailByUserId(userId) {
    const user = await this.getUserById(userId);
    return user?.email || null;
  }

  // ============ БЮДЖЕТЫ ============

  /**
   * Загрузить все бюджеты для проекта и его сущностей
   * @param {String} projectId - UUID проекта
   * @param {Array} objectIds - массив UUID объектов
   * @param {Array} sectionIds - массив UUID секций
   * @param {Array} decompositionStageIds - массив UUID этапов декомпозиции
   * @returns {Array} Массив бюджетов [{entity_type, entity_id, total_amount}, ...]
   */
  async getBudgetsForProject(projectId, objectIds = [], sectionIds = [], decompositionStageIds = []) {
    try {
      // Собираем все entity_id для запроса
      const allEntityIds = [
        projectId,
        ...objectIds,
        ...sectionIds,
        ...decompositionStageIds
      ].filter(Boolean);

      if (allEntityIds.length === 0) {
        return [];
      }

      const { data, error } = await this.client
        .from('budgets')
        .select('entity_type, entity_id, total_amount')
        .in('entity_id', allEntityIds)
        .eq('is_active', true);

      if (error) throw error;

      logger.info(`Budgets loaded: ${data?.length || 0}`);
      return data || [];
    } catch (error) {
      logger.error(`Error getting budgets: ${error.message}`);
      return [];
    }
  }
}

module.exports = new SupabaseService();
