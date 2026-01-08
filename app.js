// Express сервер для work-to-ws
// Синхронизация eneca.work → Worksection

const express = require('express');
const cors = require('cors');
const path = require('path');
const { config, validateConfig } = require('./config/env');
const { syncProjectToWS } = require('./sync/sync-manager');
const logger = require('./utils/logger');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// POST /api/sync - Запуск синхронизации
app.post('/api/sync', async (req, res) => {
  const { project_id, dry_run } = req.body;

  if (!project_id) {
    return res.status(400).json({
      success: false,
      error: 'project_id is required',
    });
  }

  try {
    const dryRun = dry_run === true || dry_run === 'true';

    if (dryRun) {
      logger.info(`API: Starting DRY-RUN sync for project ${project_id}`);
    } else {
      logger.info(`API: Starting REAL sync for project ${project_id}`);
    }

    const result = await syncProjectToWS(project_id, dryRun);

    if (result.success) {
      res.json(result);
    } else {
      res.status(500).json(result);
    }
  } catch (error) {
    logger.error(`API error: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// GET /api/logs - Получить логи
app.get('/api/logs', (req, res) => {
  res.json({
    logs: logger.getLogs(),
  });
});

// GET /api/health - Проверка здоровья
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'work-to-ws',
    timestamp: new Date().toISOString(),
  });
});

// GET / - Главная страница
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Запуск сервера
function startServer() {
  try {
    validateConfig();

    app.listen(config.port, () => {
      console.log('');
      console.log('='.repeat(50));
      console.log('  work-to-ws: eneca.work -> Worksection sync');
      console.log('='.repeat(50));
      console.log(`  Server running on http://localhost:${config.port}`);
      console.log('');
      console.log('  Endpoints:');
      console.log('    POST /api/sync   - Start sync');
      console.log('    GET  /api/logs   - View logs');
      console.log('    GET  /api/health - Health check');
      console.log('');
      console.log('  Scripts:');
      console.log('    node scripts/sync-dry-run.js <project-id>');
      console.log('    node scripts/sync-real.js <project-id>');
      console.log('='.repeat(50));
    });
  } catch (error) {
    console.error('Failed to start server:', error.message);
    process.exit(1);
  }
}

startServer();
