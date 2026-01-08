#!/usr/bin/env node

// Запуск синхронизации проекта в DRY-RUN режиме
// Использование: node scripts/sync-dry-run.js <project-id>

require('dotenv').config();

const { config, validateConfig } = require('../config/env');
const { syncProjectToWS } = require('../sync/sync-manager');
const logger = require('../utils/logger');

async function main() {
  try {
    validateConfig();
  } catch (e) {
    console.error('[x] Config error:', e.message);
    process.exit(1);
  }

  // ID проекта из аргумента
  const projectId = process.argv[2];

  if (!projectId) {
    console.error('\n❌ Project ID is required!\n');
    console.log('Usage: node scripts/sync-dry-run.js <project-id>');
    console.log('Example: node scripts/sync-dry-run.js ac79a2b1-8b35-40f5-ad10-5ce5d4e5ba90\n');
    process.exit(1);
  }

  console.log('\n=== DRY-RUN SYNC ===\n');
  console.log('🔒 DRY-RUN MODE: NO CHANGES WILL BE MADE');
  console.log(`Project ID: ${projectId}\n`);

  const startTime = Date.now();

  try {
    // ЗАПУСК С DRY-RUN = true
    const result = await syncProjectToWS(projectId, true);

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log('\n=== RESULTS ===\n');
    console.log(`Duration: ${duration}s`);
    console.log(`Success: ${result.success}`);

    if (result.success) {
      console.log(`\nProject: ${result.stats.project.action || 'checked'}`);
      console.log(`  WS Project ID: ${result.stats.project.wsProjectId || 'N/A'}`);

      console.log(`\nObjects (Level 1 Tasks):`);
      console.log(`  Would CREATE: ${result.stats.objects.created}`);
      console.log(`  Would UPDATE: ${result.stats.objects.updated}`);
      console.log(`  Errors: ${result.stats.objects.errors.length}`);

      console.log(`\nSections (Level 2 Subtasks):`);
      console.log(`  Would CREATE: ${result.stats.sections.created}`);
      console.log(`  Would UPDATE: ${result.stats.sections.updated}`);
      console.log(`  Errors: ${result.stats.sections.errors.length}`);

      console.log(`\nDecomposition (Level 3 Sub-subtasks):`);
      console.log(`  Would CREATE: ${result.stats.decomposition.created}`);
      console.log(`  Would UPDATE: ${result.stats.decomposition.updated}`);
      console.log(`  Errors: ${result.stats.decomposition.errors.length}`);

      console.log(`\nTotal Errors: ${result.stats.totalErrors}`);

      // Показываем все логи
      console.log('\n=== DETAILED LOGS ===\n');
      result.logs.forEach(log => {
        const icon = log.level === 'error' ? '❌' :
                     log.level === 'warning' ? '⚠️' :
                     log.level === 'success' ? '✅' : 'ℹ️';
        console.log(`${icon} ${log.message}`);
      });

      console.log('\n✅ DRY-RUN COMPLETED SUCCESSFULLY');
      console.log('\n💡 To run REAL sync, use: node scripts/sync-real.js <project-id>\n');
    } else {
      console.log(`\n❌ Error: ${result.error}`);
      console.log('\n=== LOGS ===\n');
      result.logs.forEach(log => console.log(`${log.level}: ${log.message}`));
    }
  } catch (error) {
    console.error('\n❌ SYNC FAILED:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
