class Logger {
  constructor() {
    this.logs = [];
  }

  log(message, level = 'info') {
    const timestamp = new Date().toISOString();
    const logEntry = { timestamp, level, message };

    this.logs.push(logEntry);

    const emoji = this.getEmoji(level);
    console.log(`${emoji} [${timestamp}] ${message}`);
  }

  info(message) {
    this.log(message, 'info');
  }

  success(message) {
    this.log(message, 'success');
  }

  warning(message) {
    this.log(message, 'warning');
  }

  error(message) {
    this.log(message, 'error');
  }

  getEmoji(level) {
    const emojis = {
      info: 'i',
      success: '+',
      warning: '!',
      error: 'x'
    };
    return emojis[level] || 'i';
  }

  getLogs() {
    return this.logs;
  }

  clearLogs() {
    this.logs = [];
  }

  /**
   * Логирует детали изменений при UPDATE
   * @param {String} entityType - Тип сущности (Project, Object, Section, Decomposition)
   * @param {String} entityName - Название сущности
   * @param {Object} changes - Объект изменений { field: { old: 'x', new: 'y' } }
   */
  logChanges(entityType, entityName, changes) {
    if (!changes || Object.keys(changes).length === 0) {
      return;
    }

    this.info(`  Changes in ${entityType} "${entityName}":`);
    for (const [field, change] of Object.entries(changes)) {
      this.info(`    ${field}: "${change.old}" → "${change.new}"`);
    }
  }
}

module.exports = new Logger();
