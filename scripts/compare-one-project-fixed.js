#!/usr/bin/env node

// Сравнение ОДНОГО проекта Supabase с WS
// ПРАВИЛЬНАЯ структура:
// Project → WS Project
// Object → Task (Level 1)
// Section → Subtask (Level 2)
// Decomposition Stage → Sub-subtask (Level 3)
// Decomposition Item → чеклист в text

require('dotenv').config();

const fs = require('fs');
const { config, validateConfig } = require('../config/env');
const supabaseService = require('../services/supabase');
const wsWriter = require('../services/worksection-writer');
const { formatDateForWS, datesEqual } = require('../mappers/date-mapper');
const { getEmailByUserId, clearCache } = require('../mappers/user-mapper');

function escapeCsv(str) {
  if (!str) return '';
  return String(str).replace(/;/g, ',');
}

// Вычисление суммы плановых часов из items
function calculatePlannedHours(items) {
  if (!items || items.length === 0) return null;
  const total = items.reduce((sum, item) => {
    const hours = parseFloat(item.decomposition_item_planned_hours) || 0;
    return sum + hours;
  }, 0);
  return total > 0 ? total : null;
}

// Поиск задачи в массиве по external_id (как в sync логике)
function findTaskInArray(tasks, externalId) {
  if (!tasks || tasks.length === 0) {
    return { task: null, matchedBy: null };
  }

  // Поиск только по external_id (как в sync)
  if (externalId) {
    const taskById = tasks.find(t => String(t.id) === String(externalId));
    if (taskById) {
      return { task: taskById, matchedBy: 'external_id' };
    }
  }

  return { task: null, matchedBy: null };
}

async function main() {
  try {
    validateConfig();
  } catch (e) {
    console.error('[x] Config error:', e.message);
    process.exit(1);
  }

  clearCache();
  const csv = [];

  // ID проекта из аргумента или по умолчанию
  const projectId = process.argv[2] || 'ac79a2b1-8b35-40f5-ad10-5ce5d4e5ba90';

  console.log('\n=== СРАВНЕНИЕ ОДНОГО ПРОЕКТА (ПРАВИЛЬНАЯ СТРУКТУРА) ===\n');
  console.log(`Supabase Project ID: ${projectId}\n`);

  // ============ LOAD SUPABASE DATA ============
  console.log('[1/3] Loading Supabase project...');
  const fullProject = await supabaseService.getProjectFull(projectId);
  const { project, stages, objects, sections } = fullProject;

  console.log(`      Project: ${project.project_name}`);
  console.log(`      Objects: ${objects.length}`);
  console.log(`      Sections: ${sections.length}`);

  // Подсчёт decomposition
  let totalStages = 0;
  let totalItems = 0;
  sections.forEach(s => {
    totalStages += s.decomposition_stages?.length || 0;
    s.decomposition_stages?.forEach(st => {
      totalItems += st.items?.length || 0;
    });
  });
  console.log(`      Decomposition Stages: ${totalStages}`);
  console.log(`      Decomposition Items: ${totalItems}\n`);

  // ============ LOAD WS PROJECT ============
  console.log('[2/3] Loading Worksection project...');

  let wsProject = null;
  let wsTasks = [];
  let projectInWs = false;

  if (!project.external_id) {
    console.log('      ⚠️  No external_id - WS project will be CREATED\n');
  } else {
    try {
      wsTasks = await wsWriter.getTasks(project.external_id);
      projectInWs = true;
      console.log(`      ✓ WS project found (ID: ${project.external_id})`);
      console.log(`      ✓ Top-level tasks: ${wsTasks.length}\n`);
    } catch (e) {
      console.log(`      ⚠️  Cannot load WS project: ${e.message}\n`);
    }
  }

  // ============ BUILD CSV ============
  csv.push('DETAILED COMPARISON: Supabase vs Worksection (CORRECT STRUCTURE)');
  csv.push(`Supabase Project: ${project.project_name}`);
  csv.push(`Project ID: ${projectId}`);
  csv.push(`WS Project ID: ${project.external_id || 'NOT YET CREATED'}`);
  csv.push(`Generated: ${new Date().toISOString()}`);
  csv.push('');
  csv.push('STRUCTURE: Project → WS Project, Objects → Tasks (L1), Sections → Subtasks (L2), Decomposition → Sub-subtasks (L3)');
  csv.push('');
  csv.push('type;level;supabase_name;supabase_id;external_id;ws_name;ws_id;ws_status;supabase_responsible;ws_responsible;matched_by;action;changes');

  let stats = { create: 0, update: 0, noChange: 0 };
  let matchStats = { byExternalId: 0, notFound: 0 };

  // ============ PROJECT ============
  const projectAction = projectInWs ? 'noChange' : 'create';
  stats[projectAction]++;

  csv.push([
    'PROJECT→PROJECT',
    '0',
    escapeCsv(project.project_name),
    project.project_id,
    project.external_id || '',
    projectInWs ? escapeCsv(project.project_name) : '',
    projectInWs ? project.external_id : '',
    projectInWs ? 'active' : '',
    '', // supabase_responsible - projects don't have responsibles
    '', // ws_responsible
    projectInWs ? 'external_id' : '-',
    projectAction,
    projectInWs ? '' : 'new WS project'
  ].join(';'));

  // ============ PROCESS OBJECTS → TASKS (Level 1) ============
  console.log('[3/3] Processing entities...\n');

  for (const obj of objects) {
    console.log(`  Object: ${obj.object_name}`);

    // Проверка на placeholder от ws-to-work OS проектов
    const isPlaceholder = obj.external_id && obj.external_id.includes('_placeholder');

    let wsObject = null;
    let objMatchedBy = null;

    if (isPlaceholder) {
      console.log(`    ⚠️  Object has placeholder ID (OS project from ws-to-work)`);
      objMatchedBy = 'placeholder';
    } else {
      // Найти object в top-level tasks WS проекта
      const result = findTaskInArray(wsTasks, obj.external_id);
      wsObject = result.task;
      objMatchedBy = result.matchedBy;

      if (objMatchedBy === 'external_id') matchStats.byExternalId++;
      else matchStats.notFound++;
    }

    const objAction = (wsObject || isPlaceholder) ? 'noChange' : 'create';
    stats[objAction]++;

    csv.push([
      'OBJECT→TASK',
      '1',
      escapeCsv(obj.object_name),
      obj.object_id,
      obj.external_id || '',
      isPlaceholder ? 'placeholder (OS project)' : (wsObject ? escapeCsv(wsObject.name) : ''),
      isPlaceholder ? obj.external_id : (wsObject ? wsObject.id : ''),
      wsObject ? (wsObject.status || '') : '',
      'NOONE', // supabase_responsible - objects don't sync responsibles
      wsObject?.user_to?.email || '', // ws_responsible
      objMatchedBy || '-',
      objAction,
      isPlaceholder ? 'OS project - sections are top-level' : ''
    ].join(';'));

    // ============ SECTIONS → SUBTASKS (Level 2) или TOP-LEVEL (для OS) ============
    const objectSections = sections.filter(s => s.section_object_id === obj.object_id);
    console.log(`    Sections: ${objectSections.length}`);

    for (const section of objectSections) {
      const sectionName = section.section_name;

      let wsSection = null;
      let secMatchedBy = null;

      if (isPlaceholder) {
        // Для OS проектов sections - это top-level tasks в WS проекте
        const result = findTaskInArray(wsTasks, section.external_id);
        wsSection = result.task;
        secMatchedBy = result.matchedBy;
      } else {
        // Для обычных проектов sections - это subtasks объектов
        const wsObjectSubtasks = wsObject?.subtasks || [];
        const result = findTaskInArray(wsObjectSubtasks, section.external_id);
        wsSection = result.task;
        secMatchedBy = result.matchedBy;
      }

      if (secMatchedBy === 'external_id') matchStats.byExternalId++;
      else matchStats.notFound++;

      const secAction = wsSection ? 'noChange' : 'create';
      stats[secAction]++;

      // Ответственный из Supabase
      const sectionResponsibleEmail = section.section_responsible
        ? await getEmailByUserId(section.section_responsible)
        : 'NOONE';

      csv.push([
        'SECTION→SUBTASK',
        '2',
        escapeCsv(sectionName),
        section.section_id,
        section.external_id || '',
        wsSection ? escapeCsv(wsSection.name) : '',
        wsSection ? wsSection.id : '',
        wsSection ? (wsSection.status || '') : '',
        sectionResponsibleEmail, // supabase_responsible
        wsSection?.user_to?.email || '', // ws_responsible
        secMatchedBy || '-',
        secAction,
        wsObject ? '' : 'parent object not found'
      ].join(';'));

      // ============ DECOMPOSITION STAGES → SUB-SUBTASKS (Level 3) ============
      const decompositionStages = section.decomposition_stages || [];

      for (const stage of decompositionStages) {
        const stageName = stage.decomposition_stage_name;

        // Искать stage в sub-subtasks секции
        const wsSectionSubtasks = wsSection?.subtasks || [];
        const { task: wsStage, matchedBy: stageMatchedBy } = findTaskInArray(
          wsSectionSubtasks,
          stage.external_id
        );

        if (stageMatchedBy === 'external_id') matchStats.byExternalId++;
        else matchStats.notFound++;

        const stageAction = wsStage ? 'noChange' : 'create';
        stats[stageAction]++;

        // Ответственный из Supabase (первый из массива)
        const responsibles = stage.decomposition_stage_responsibles || [];
        let stageResponsibleEmail = 'NOONE';
        if (responsibles.length > 0) {
          stageResponsibleEmail = await getEmailByUserId(responsibles[0]);
        }

        csv.push([
          'STAGE→SUB-SUBTASK',
          '3',
          escapeCsv(stageName),
          stage.decomposition_stage_id,
          stage.external_id || '',
          wsStage ? escapeCsv(wsStage.name) : '',
          wsStage ? wsStage.id : '',
          wsStage ? (wsStage.status || '') : '',
          stageResponsibleEmail, // supabase_responsible
          wsStage?.user_to?.email || '', // ws_responsible
          stageMatchedBy || '-',
          stageAction,
          wsSection ? '' : 'parent section not found'
        ].join(';'));

        // ============ DECOMPOSITION ITEMS → CHECKLIST ============
        const items = stage.items || [];
        const wsChecklistText = wsStage?.text || '';

        for (const item of items) {
          const itemDesc = item.decomposition_item_description;
          const itemHours = item.decomposition_item_planned_hours;
          const itemName = itemHours ? `${itemDesc} (${itemHours}ч)` : itemDesc;

          // Проверить есть ли этот item в чеклисте WS
          const inChecklist = wsChecklistText.includes(itemDesc);

          csv.push([
            'ITEM→CHECKLIST',
            '4',
            escapeCsv(itemName),
            item.decomposition_item_id,
            '', // items не имеют external_id
            inChecklist ? 'in checklist' : 'NOT IN CHECKLIST',
            wsStage ? wsStage.id : '',
            '',
            '', // supabase_responsible - items don't have responsibles
            '', // ws_responsible
            inChecklist ? 'text_field' : '-',
            inChecklist ? 'noChange' : 'create',
            inChecklist ? '' : 'missing from checklist'
          ].join(';'));
        }
      }
    }

    csv.push(''); // Пустая строка между объектами
  }

  // ============ SUMMARY ============
  csv.push('');
  csv.push('SUMMARY');
  csv.push('');
  csv.push(`Total records;${stats.create + stats.update + stats.noChange}`);
  csv.push(`Will CREATE;${stats.create}`);
  csv.push(`Will UPDATE;${stats.update}`);
  csv.push(`No changes;${stats.noChange}`);
  csv.push('');
  csv.push('MATCH STATISTICS');
  csv.push(`Matched by external_id;${matchStats.byExternalId}`);
  csv.push(`Not found in WS;${matchStats.notFound}`);
  csv.push('');
  csv.push('STRUCTURE VERIFICATION');
  csv.push(`Project in WS;${projectInWs ? 'YES' : 'NO - WILL BE CREATED'}`);
  csv.push(`Objects as top-level tasks;${wsTasks.length}`);
  csv.push(`Expected objects;${objects.length}`);

  // ============ SAVE ============
  const filename = `compare_${new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5)}.csv`;
  fs.writeFileSync(filename, csv.join('\n'), 'utf8');

  console.log(`\n✅ Comparison saved: ${filename}`);
  console.log(`   Total: ${stats.create + stats.update + stats.noChange} records`);
  console.log(`   CREATE: ${stats.create}, UPDATE: ${stats.update}, NO CHANGE: ${stats.noChange}`);
  console.log(`   Matched by external_id: ${matchStats.byExternalId}`);
  console.log(`   Not found: ${matchStats.notFound}\n`);
}

main().catch(err => {
  console.error('[x] Error:', err.message);
  console.error(err.stack);
  process.exit(1);
});
