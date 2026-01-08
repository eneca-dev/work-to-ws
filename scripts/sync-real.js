#!/usr/bin/env node

// Запуск РЕАЛЬНОЙ синхронизации проекта
// ⚠️ ВНИМАНИЕ: Это создаст/обновит данные в Worksection!
// Использование: node scripts/sync-real.js <project-id>

require('dotenv').config();

const fs = require('fs');
const { config, validateConfig } = require('../config/env');
const { syncProjectToWS } = require('../sync/sync-manager');
const logger = require('../utils/logger');
const supabase = require('../services/supabase');
const wsWriter = require('../services/worksection-writer');

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
    console.log('Usage: node scripts/sync-real.js <project-id>');
    console.log('Example: node scripts/sync-real.js ac79a2b1-8b35-40f5-ad10-5ce5d4e5ba90\n');
    process.exit(1);
  }

  console.log('\n=== REAL SYNC ===\n');
  console.log('⚠️  REAL MODE: CHANGES WILL BE MADE TO WORKSECTION!');
  console.log(`Project ID: ${projectId}\n`);

  // Подтверждение
  console.log('⚠️  Are you sure you want to proceed?');
  console.log('   This will create/update projects and tasks in Worksection.');
  console.log('   Press Ctrl+C to cancel, or wait 5 seconds to continue...\n');

  await new Promise(resolve => setTimeout(resolve, 5000));

  console.log('Starting real sync...\n');

  const startTime = Date.now();

  try {
    // ЗАПУСК С DRY-RUN = false
    const result = await syncProjectToWS(projectId, false);

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log('\n=== RESULTS ===\n');
    console.log(`Duration: ${duration}s`);
    console.log(`Success: ${result.success}`);

    if (result.success) {
      console.log(`\nProject: ${result.stats.project.action || 'checked'}`);
      console.log(`  WS Project ID: ${result.stats.project.wsProjectId || 'N/A'}`);

      console.log(`\nObjects (Level 1 Tasks):`);
      console.log(`  CREATED: ${result.stats.objects.created}`);
      console.log(`  UPDATED: ${result.stats.objects.updated}`);
      console.log(`  Errors: ${result.stats.objects.errors.length}`);

      console.log(`\nSections (Level 2 Subtasks):`);
      console.log(`  CREATED: ${result.stats.sections.created}`);
      console.log(`  UPDATED: ${result.stats.sections.updated}`);
      console.log(`  Errors: ${result.stats.sections.errors.length}`);

      console.log(`\nDecomposition (Level 3 Sub-subtasks):`);
      console.log(`  CREATED: ${result.stats.decomposition.created}`);
      console.log(`  UPDATED: ${result.stats.decomposition.updated}`);
      console.log(`  Errors: ${result.stats.decomposition.errors.length}`);

      console.log(`\nTotal Errors: ${result.stats.totalErrors}`);

      // Показываем ошибки если есть
      if (result.stats.totalErrors > 0) {
        console.log('\n=== ERRORS ===\n');
        result.stats.objects.errors.forEach(e => console.log(`❌ Object: ${e.name} - ${e.error}`));
        result.stats.sections.errors.forEach(e => console.log(`❌ Section: ${e.name} - ${e.error}`));
        result.stats.decomposition.errors.forEach(e => console.log(`❌ Decomposition: ${e.name} - ${e.error}`));
      }

      // Показываем важные логи
      console.log('\n=== KEY LOGS ===\n');
      result.logs
        .filter(log => log.level === 'error' || log.level === 'warning' || log.level === 'success')
        .forEach(log => {
          const icon = log.level === 'error' ? '❌' :
                       log.level === 'warning' ? '⚠️' : '✅';
          console.log(`${icon} ${log.message}`);
        });

      console.log('\n✅ SYNC COMPLETED SUCCESSFULLY');
      console.log(`\n📊 View full logs at: GET http://localhost:${config.port}/api/logs\n`);

      // Создаем детальный отчет ВСЕГДА (даже если только UPDATE)
      console.log('📄 Generating detailed CSV report...\n');
      await generateDetailedReport(projectId, result);
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

async function generateDetailedReport(supabaseProjectId, syncResult) {
  try {
    // Загружаем обновленные данные из Supabase
    const { project, objects, sections } = await supabase.getProjectFull(supabaseProjectId);
    const wsProjectId = project.external_id;

    if (!wsProjectId) {
      console.log('⚠️  No WS project ID found, cannot generate detailed report');
      return;
    }

    // Загружаем задачи из WS
    const wsTasks = await wsWriter.getTasks(wsProjectId);

    const csv = [];
    csv.push('DETAILED SYNC REPORT');
    csv.push(`Supabase Project: ${project.project_name}`);
    csv.push(`Project ID: ${supabaseProjectId}`);
    csv.push(`WS Project ID: ${wsProjectId}`);
    csv.push(`Sync completed: ${new Date().toISOString()}`);
    csv.push('');
    csv.push('type;level;name;supabase_id;ws_id;action;responsible;dates;max_time;has_checklist;parent_name;notes');
    csv.push('');

    const details = [];

    // PROJECT
    details.push({
      type: 'PROJECT',
      level: 0,
      name: project.project_name,
      supabase_id: project.project_id,
      ws_id: wsProjectId,
      action: syncResult.stats.project.action || 'checked',
      responsible: '',
      dates: '',
      max_time: '',
      has_checklist: 'N/A',
      parent_name: '',
      notes: ''
    });

    // Helper: найти WS task по external_id
    function findWsTask(tasks, externalId) {
      if (!externalId || !tasks) return null;
      for (const task of tasks) {
        if (String(task.id) === String(externalId)) return task;
        if (task.subtasks) {
          const found = findWsTask(task.subtasks, externalId);
          if (found) return found;
        }
      }
      return null;
    }

    // OBJECTS
    for (const obj of objects) {
      const wsTask = findWsTask(wsTasks, obj.external_id);
      const action = syncResult.stats.objects.created > 0 && wsTask ? 'CREATED' :
                     syncResult.stats.objects.updated > 0 ? 'UPDATED' : 'NO CHANGE';

      details.push({
        type: 'OBJECT→TASK',
        level: 1,
        name: obj.object_name,
        supabase_id: obj.object_id,
        ws_id: obj.external_id || 'NOT SYNCED',
        action: obj.external_id ? action : 'SKIPPED',
        responsible: wsTask?.user_to?.email || 'NOONE',
        dates: wsTask ? `${wsTask.date_start || ''} - ${wsTask.date_end || ''}` : '',
        max_time: wsTask?.max_time || '',
        has_checklist: wsTask?.text ? 'YES' : 'NO',
        parent_name: '',
        notes: obj.external_id?.includes('placeholder') ? 'OS project placeholder' : ''
      });

      // SECTIONS для этого объекта
      const objectSections = sections.filter(s => s.section_object_id === obj.object_id);
      for (const section of objectSections) {
        const wsSection = findWsTask(wsTasks, section.external_id);
        const sectionAction = syncResult.stats.sections.created > 0 && wsSection ? 'CREATED' :
                             syncResult.stats.sections.updated > 0 ? 'UPDATED' : 'NO CHANGE';

        details.push({
          type: 'SECTION→SUBTASK',
          level: 2,
          name: section.section_name,
          supabase_id: section.section_id,
          ws_id: section.external_id || 'NOT SYNCED',
          action: section.external_id ? sectionAction : 'SKIPPED',
          responsible: wsSection?.user_to?.email || '',
          dates: wsSection ? `${wsSection.date_start || ''} - ${wsSection.date_end || ''}` : '',
          max_time: wsSection?.max_time || '',
          has_checklist: wsSection?.text ? 'YES' : 'NO',
          parent_name: obj.object_name,
          notes: ''
        });

        // DECOMPOSITION STAGES для этой секции
        const decompositionStages = section.decomposition_stages || [];
        for (const stage of decompositionStages) {
          const wsStage = findWsTask(wsTasks, stage.external_id);
          const stageAction = syncResult.stats.decomposition.created > 0 && wsStage ? 'CREATED' :
                             syncResult.stats.decomposition.updated > 0 ? 'UPDATED' : 'NO CHANGE';

          const checklistItems = stage.items?.length || 0;

          details.push({
            type: 'STAGE→SUB-SUBTASK',
            level: 3,
            name: stage.decomposition_stage_name,
            supabase_id: stage.decomposition_stage_id,
            ws_id: stage.external_id || 'NOT SYNCED',
            action: stage.external_id ? stageAction : 'SKIPPED',
            responsible: wsStage?.user_to?.email || '',
            dates: wsStage ? `${wsStage.date_start || ''} - ${wsStage.date_end || ''}` : '',
            max_time: wsStage?.max_time || '',
            has_checklist: wsStage?.text ? `YES (${checklistItems} items)` : 'NO',
            parent_name: section.section_name,
            notes: checklistItems > 0 ? `${checklistItems} checklist items` : ''
          });
        }
      }
    }

    // Конвертируем в CSV
    details.forEach(item => {
      csv.push([
        item.type,
        item.level,
        escapeCsv(item.name),
        item.supabase_id,
        item.ws_id,
        item.action,
        item.responsible,
        item.dates,
        item.max_time,
        item.has_checklist,
        escapeCsv(item.parent_name),
        escapeCsv(item.notes)
      ].join(';'));
    });

    // Статистика
    csv.push('');
    csv.push('SUMMARY');
    csv.push(`Total entities;${details.length - 1}`);  // -1 для проекта
    csv.push(`CREATED;${details.filter(d => d.action === 'CREATED').length}`);
    csv.push(`UPDATED;${details.filter(d => d.action === 'UPDATED').length}`);
    csv.push(`NO CHANGE;${details.filter(d => d.action === 'NO CHANGE').length}`);
    csv.push(`SKIPPED;${details.filter(d => d.action === 'SKIPPED').length}`);

    // Сохраняем в файл
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const filename = `sync-report-${supabaseProjectId.slice(0, 8)}-${timestamp}.csv`;
    fs.writeFileSync(filename, csv.join('\n'), 'utf8');

    console.log(`✅ Detailed report saved: ${filename}`);
    console.log(`   Total entities: ${details.length}`);
    console.log(`   CREATED: ${details.filter(d => d.action === 'CREATED').length}`);
    console.log(`   UPDATED: ${details.filter(d => d.action === 'UPDATED').length}\n`);

    // Выводим созданные задачи
    const created = details.filter(d => d.action === 'CREATED');
    if (created.length > 0) {
      console.log('📋 CREATED ENTITIES:\n');
      created.forEach(item => {
        console.log(`  ✅ ${item.type} (Level ${item.level}): ${item.name}`);
        console.log(`     WS ID: ${item.ws_id}`);
        console.log(`     Responsible: ${item.responsible || 'NOONE'}`);
        if (item.max_time) console.log(`     Max time: ${item.max_time}h`);
        if (item.has_checklist !== 'NO') console.log(`     Checklist: ${item.has_checklist}`);
        console.log('');
      });
    }

  } catch (error) {
    console.error('⚠️  Failed to generate detailed report:', error.message);
  }
}

function escapeCsv(str) {
  if (!str) return '';
  return String(str).replace(/;/g, ',');
}

main();
