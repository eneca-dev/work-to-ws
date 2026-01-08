const axios = require('axios');
const FormData = require('form-data');
const { config } = require('../config/env');
const logger = require('../utils/logger');

/**
 * Telegram notification service
 * Отправляет уведомления о синхронизации в Telegram
 */
class TelegramService {
  constructor() {
    this.botToken = config.telegram.botToken;
    this.chatIds = this._getChatIds();
    this.baseUrl = `https://api.telegram.org/bot${this.botToken}`;
  }

  /**
   * Получить список chat IDs для отправки
   */
  _getChatIds() {
    const chatIds = [];
    if (config.telegram.chatId) {
      chatIds.push(config.telegram.chatId);
    }
    if (config.telegram.chatId2) {
      chatIds.push(config.telegram.chatId2);
    }
    return chatIds;
  }

  /**
   * Форматировать дату в DD.MM.YYYY HH:MM:SS
   */
  _formatDate(date) {
    const d = new Date(date);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const seconds = String(d.getSeconds()).padStart(2, '0');
    return `${day}.${month}.${year} ${hours}:${minutes}:${seconds}`;
  }

  /**
   * Отправить текстовое сообщение в Telegram
   */
  async _sendMessage(chatId, text, options = {}) {
    if (!config.telegram.enabled) {
      logger.info('Telegram отключен, сообщение не отправлено');
      return;
    }

    try {
      await axios.post(`${this.baseUrl}/sendMessage`, {
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        ...options
      });
      logger.info(`✅ Сообщение отправлено в Telegram чат ${chatId}`);
    } catch (error) {
      logger.warning(`⚠️ Не удалось отправить сообщение в чат ${chatId}: ${error.message}`);
    }
  }

  /**
   * Отправить файл в Telegram
   */
  async _sendDocument(chatId, fileContent, fileName, caption) {
    if (!config.telegram.enabled) {
      logger.info('Telegram отключен, файл не отправлен');
      return;
    }

    try {
      const form = new FormData();
      form.append('chat_id', chatId);
      form.append('document', Buffer.from(fileContent, 'utf-8'), {
        filename: fileName,
        contentType: 'text/csv'
      });
      if (caption) {
        form.append('caption', caption);
        form.append('parse_mode', 'HTML');
      }

      await axios.post(`${this.baseUrl}/sendDocument`, form, {
        headers: form.getHeaders()
      });
      logger.info(`✅ Файл ${fileName} отправлен в Telegram чат ${chatId}`);
    } catch (error) {
      logger.warning(`⚠️ Не удалось отправить файл в чат ${chatId}: ${error.message}`);
    }
  }

  /**
   * Отправить уведомление о начале синхронизации
   */
  async sendSyncStarted(projectId, projectName, stats = {}) {
    if (!config.telegram.enabled) return;

    const stageInfo = stats.stageType ? ` (${stats.stageType})` : '';

    const message = `
🚀 <b>Синхронизация проекта запущена</b>

📋 <b>Проект:</b> ${projectName || 'Неизвестный'}${stageInfo}
🆔 <b>ID:</b> <code>${projectId}</code>
⏰ <b>Начало:</b> ${this._formatDate(new Date())}

📊 <b>Объём работ:</b>
├─ Objects: ${stats.objectsCount || 0}
├─ Sections: ${stats.sectionsCount || 0}
└─ Decomposition Stages: ${stats.stagesCount || 0}
    `.trim();

    for (const chatId of this.chatIds) {
      await this._sendMessage(chatId, message);
    }
  }

  /**
   * Генерировать CSV контент из логов и статистики
   */
  _generateCsvContent(logs, stats, allChanges = null) {
    const lines = [];

    // РАЗДЕЛ 1: PROJECT INFORMATION
    lines.push('=== PROJECT INFORMATION ===');
    lines.push('WS Project ID,Project Name,Status,Stage,Sync Date');
    lines.push([
      stats.wsProjectId || '',
      stats.projectName || '',
      stats.projectStatus || '',
      stats.stageTag || '',
      this._formatDate(new Date())
    ].map(field => `"${String(field).replace(/"/g, '""')}"`).join(','));
    lines.push('');

    // РАЗДЕЛ 2: OBJECTS → TASKS (Level 1)
    lines.push('=== OBJECTS → TASKS (Level 1) ===');
    lines.push('Object ID,Name,WS Task ID,Status,Priority,Created Date');
    if (stats.objects && stats.objects.length > 0) {
      stats.objects.forEach(obj => {
        lines.push([
          obj.id || '',
          obj.name || '',
          obj.wsTaskId || '',
          obj.status || '',
          obj.priority || '',
          obj.createdAt ? this._formatDate(obj.createdAt) : ''
        ].map(field => `"${String(field).replace(/"/g, '""')}"`).join(','));
      });
    }
    lines.push('');

    // РАЗДЕЛ 3: SECTIONS → SUBTASKS (Level 2)
    lines.push('=== SECTIONS → SUBTASKS (Level 2) ===');
    lines.push('Section ID,Name,Parent Task ID,WS Subtask ID,Status,Budget,Created Date');
    if (stats.sections && stats.sections.length > 0) {
      stats.sections.forEach(section => {
        lines.push([
          section.id || '',
          section.name || '',
          section.parentTaskId || '',
          section.wsSubtaskId || '',
          section.status || '',
          section.budget || '',
          section.createdAt ? this._formatDate(section.createdAt) : ''
        ].map(field => `"${String(field).replace(/"/g, '""')}"`).join(','));
      });
    }
    lines.push('');

    // РАЗДЕЛ 4: DECOMPOSITION STAGES → SUB-SUBTASKS (Level 3)
    lines.push('=== DECOMPOSITION STAGES → SUB-SUBTASKS (Level 3) ===');
    lines.push('Stage ID,Name,Parent Subtask ID,WS Sub-subtask ID,Status,Duration,Order,Created Date');
    if (stats.stages && stats.stages.length > 0) {
      stats.stages.forEach(stage => {
        lines.push([
          stage.id || '',
          stage.name || '',
          stage.parentSubtaskId || '',
          stage.wsSubSubtaskId || '',
          stage.status || '',
          stage.duration || '',
          stage.order || '',
          stage.createdAt ? this._formatDate(stage.createdAt) : ''
        ].map(field => `"${String(field).replace(/"/g, '""')}"`).join(','));
      });
    }
    lines.push('');

    // РАЗДЕЛ 5: DECOMPOSITION ITEMS → CHECKLIST
    lines.push('=== DECOMPOSITION ITEMS → CHECKLIST ===');
    lines.push('Item ID,Content,Stage ID,Parent Task ID,Checked,Order,Created Date');
    if (stats.items && stats.items.length > 0) {
      stats.items.forEach(item => {
        lines.push([
          item.id || '',
          item.content || '',
          item.stageId || '',
          item.parentTaskId || '',
          item.checked ? 'Yes' : 'No',
          item.order || '',
          item.createdAt ? this._formatDate(item.createdAt) : ''
        ].map(field => `"${String(field).replace(/"/g, '""')}"`).join(','));
      });
    }
    lines.push('');

    // РАЗДЕЛ 6: SYNC STATISTICS
    lines.push('=== SYNC STATISTICS ===');
    lines.push('Metric,Value');
    const syncStats = [
      ['Total Projects Synced', stats.projectsCount || 1],
      ['Objects Created', stats.objectsCreated || 0],
      ['Objects Updated', stats.objectsUpdated || 0],
      ['Sections Created', stats.sectionsCreated || 0],
      ['Sections Updated', stats.sectionsUpdated || 0],
      ['Decomposition Stages Created', stats.stagesCreated || 0],
      ['Decomposition Stages Updated', stats.stagesUpdated || 0],
      ['Checklist Items Added', stats.itemsCreated || 0],
      ['Total Errors', stats.errorsCount || 0],
      ['Duration (seconds)', stats.durationSeconds || 0]
    ];
    syncStats.forEach(([metric, value]) => {
      lines.push(`"${metric}","${value}"`);
    });
    lines.push('');

    // РАЗДЕЛ 7: DETAILED CHANGES (новый раздел!)
    if (allChanges) {
      lines.push('=== DETAILED CHANGES ===');
      lines.push('');

      // Project changes
      if (allChanges.project && (typeof allChanges.project === 'object')) {
        lines.push('--- PROJECT CHANGES ---');
        lines.push('Field,Old Value,New Value');
        Object.entries(allChanges.project).forEach(([field, change]) => {
          if (change && change.old !== undefined && change.new !== undefined) {
            lines.push([field, change.old || '(empty)', change.new || '(empty)']
              .map(f => `"${String(f).replace(/"/g, '""')}"`).join(','));
          }
        });
        lines.push('');
      }

      // Objects changes
      if (allChanges.objects && allChanges.objects.length > 0) {
        lines.push('--- OBJECTS CHANGES ---');
        lines.push('Object Name,WS Task ID,Action,Field,Old Value,New Value');
        allChanges.objects.forEach(change => {
          if (change.action === 'created') {
            // Для created показываем все данные
            lines.push([
              change.entity_name,
              change.ws_task_id,
              'CREATED',
              'ALL FIELDS',
              '',
              JSON.stringify(change.data)
            ].map(f => `"${String(f).replace(/"/g, '""')}"`).join(','));
          } else if (change.action === 'updated' && change.changes) {
            // Для updated показываем каждое изменение
            Object.entries(change.changes).forEach(([field, fieldChange]) => {
              lines.push([
                change.entity_name,
                change.ws_task_id,
                'UPDATED',
                field,
                fieldChange.old || '(empty)',
                fieldChange.new || '(empty)'
              ].map(f => `"${String(f).replace(/"/g, '""')}"`).join(','));
            });
          }
        });
        lines.push('');
      }

      // Sections changes
      if (allChanges.sections && allChanges.sections.length > 0) {
        lines.push('--- SECTIONS CHANGES ---');
        lines.push('Section Name,WS Task ID,Action,Field,Old Value,New Value');
        allChanges.sections.forEach(change => {
          if (change.action === 'created') {
            lines.push([
              change.entity_name,
              change.ws_task_id,
              'CREATED',
              'ALL FIELDS',
              '',
              JSON.stringify(change.data)
            ].map(f => `"${String(f).replace(/"/g, '""')}"`).join(','));
          } else if (change.action === 'updated' && change.changes) {
            Object.entries(change.changes).forEach(([field, fieldChange]) => {
              lines.push([
                change.entity_name,
                change.ws_task_id,
                'UPDATED',
                field,
                fieldChange.old || '(empty)',
                fieldChange.new || '(empty)'
              ].map(f => `"${String(f).replace(/"/g, '""')}"`).join(','));
            });
          }
        });
        lines.push('');
      }

      // Decomposition changes
      if (allChanges.decomposition && allChanges.decomposition.length > 0) {
        lines.push('--- DECOMPOSITION CHANGES ---');
        lines.push('Stage Name,WS Task ID,Action,Field,Old Value,New Value,Checklist Items');
        allChanges.decomposition.forEach(change => {
          if (change.action === 'created') {
            lines.push([
              change.entity_name,
              change.ws_task_id,
              'CREATED',
              'ALL FIELDS',
              '',
              JSON.stringify(change.data),
              change.checklist_items || 0
            ].map(f => `"${String(f).replace(/"/g, '""')}"`).join(','));
          } else if (change.action === 'updated' && change.changes) {
            Object.entries(change.changes).forEach(([field, fieldChange]) => {
              lines.push([
                change.entity_name,
                change.ws_task_id,
                'UPDATED',
                field,
                fieldChange.old || '(empty)',
                fieldChange.new || '(empty)',
                ''
              ].map(f => `"${String(f).replace(/"/g, '""')}"`).join(','));
            });
          }
        });
        lines.push('');
      }
    }

    // РАЗДЕЛ 8: DETAILED LOGS
    lines.push('=== DETAILED LOGS ===');
    lines.push('Timestamp,Level,Message');
    if (logs && logs.length > 0) {
      logs.forEach(log => {
        const timestamp = log.timestamp ? this._formatDate(log.timestamp) : '';
        const level = log.level || 'INFO';
        const message = log.message || '';
        lines.push([timestamp, level, message]
          .map(field => `"${String(field).replace(/"/g, '""')}"`).join(','));
      });
    }

    return lines.join('\n');
  }

  /**
   * Отправить CSV файл с результатами синхронизации
   */
  async sendCsvFile(logs, stats, startTime, endTime, projectId, allChanges = null) {
    if (!config.telegram.enabled) return;

    try {
      // Вычислить длительность
      const durationMs = new Date(endTime) - new Date(startTime);
      const durationSeconds = Math.round(durationMs / 1000);
      stats.durationSeconds = durationSeconds;

      // Генерировать CSV контент
      const csvContent = this._generateCsvContent(logs, stats, allChanges);

      // Создать имя файла
      const fileName = `sync_report_${projectId}_${Date.now()}.csv`;

      // Создать caption для сообщения
      const caption = `
📊 <b>Синхронизация завершена</b>

📋 <b>Проект:</b> ${stats.projectName || 'Неизвестный'}
🆔 <b>ID:</b> <code>${projectId}</code>
⏱ <b>Длительность:</b> ${durationSeconds}s

✅ <b>Objects:</b> ${stats.objectsCreated || 0} создано, ${stats.objectsUpdated || 0} обновлено
✅ <b>Sections:</b> ${stats.sectionsCreated || 0} создано, ${stats.sectionsUpdated || 0} обновлено
✅ <b>Stages:</b> ${stats.stagesCreated || 0} создано, ${stats.stagesUpdated || 0} обновлено
✅ <b>Items:</b> ${stats.itemsCreated || 0} добавлено
❌ <b>Ошибки:</b> ${stats.errorsCount || 0}
      `.trim();

      // Отправить файл в каждый чат
      for (const chatId of this.chatIds) {
        await this._sendDocument(chatId, csvContent, fileName, caption);
      }

      logger.info(`📊 CSV отчёт отправлен в Telegram`);
    } catch (error) {
      logger.warning(`⚠️ Не удалось отправить CSV отчёт в Telegram: ${error.message}`);
    }
  }

  /**
   * Отправить уведомление об ошибке
   */
  async sendError(error, context, projectId) {
    if (!config.telegram.enabled) return;

    const message = `
❌ <b>ОШИБКА СИНХРОНИЗАЦИИ</b>

📋 <b>Проект ID:</b> <code>${projectId || 'Unknown'}</code>
📍 <b>Контекст:</b> ${context || 'Unknown'}
⏰ <b>Время:</b> ${this._formatDate(new Date())}

🔴 <b>Ошибка:</b>
<code>${error.message || 'Unknown error'}</code>

🔍 <b>Stack:</b>
<code>${error.stack ? error.stack.substring(0, 500) : 'No stack trace'}</code>
    `.trim();

    for (const chatId of this.chatIds) {
      await this._sendMessage(chatId, message);
    }
  }
}

module.exports = new TelegramService();
