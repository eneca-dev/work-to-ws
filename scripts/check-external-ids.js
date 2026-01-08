#!/usr/bin/env node

// Проверка external_id в базе данных

require('dotenv').config();

const supabaseService = require('../services/supabase');

async function main() {
  const projectId = process.argv[2] || 'ac79a2b1-8b35-40f5-ad10-5ce5d4e5ba90';

  console.log('\n=== ПРОВЕРКА EXTERNAL_ID ===\n');
  console.log(`Project ID: ${projectId}\n`);

  const fullProject = await supabaseService.getProjectFull(projectId);
  const { project, objects, sections } = fullProject;

  console.log('📁 PROJECT:');
  console.log(`   Name: ${project.project_name}`);
  console.log(`   Stage: ${project.stage_type || 'none'}`);
  console.log(`   external_id: ${project.external_id || 'NULL ❌'}`);
  console.log(`   external_source: ${project.external_source || 'NULL'}`);
  console.log('');

  console.log('🏢 OBJECTS:');
  for (const obj of objects) {
    console.log(`   ${obj.object_name}`);
    console.log(`      external_id: ${obj.external_id || 'NULL ❌'}`);
  }
  console.log('');

  console.log('📋 SECTIONS:');
  let sectionsWithId = 0;
  let sectionsWithoutId = 0;
  for (const section of sections) {
    if (section.external_id) {
      sectionsWithId++;
    } else {
      sectionsWithoutId++;
    }
  }
  console.log(`   С external_id: ${sectionsWithId}`);
  console.log(`   БЕЗ external_id: ${sectionsWithoutId}`);
  console.log('');

  console.log('🔧 DECOMPOSITION STAGES:');
  let stagesWithId = 0;
  let stagesWithoutId = 0;
  sections.forEach(s => {
    (s.decomposition_stages || []).forEach(st => {
      if (st.external_id) {
        stagesWithId++;
      } else {
        stagesWithoutId++;
      }
    });
  });
  console.log(`   С external_id: ${stagesWithId}`);
  console.log(`   БЕЗ external_id: ${stagesWithoutId}`);
  console.log('');

  console.log('=== ВЫВОДЫ ===\n');

  if (project.external_id) {
    console.log('⚠️  У PROJECT есть external_id!');
    console.log('    Это от старой синхронизации (ws-to-work)?');
    console.log(`    WS Project ID: ${project.external_id}`);
    console.log('');
  }

  const objectsWithoutId = objects.filter(o => !o.external_id);
  if (objectsWithoutId.length > 0) {
    console.log(`⚠️  У ${objectsWithoutId.length} Objects НЕТ external_id!`);
    console.log('    Эти Objects будут созданы как новые WS проекты.');
    objectsWithoutId.forEach(o => {
      console.log(`    - ${o.object_name}`);
    });
    console.log('');
  }

  const objectsWithId = objects.filter(o => o.external_id);
  if (objectsWithId.length > 0) {
    console.log(`✅ У ${objectsWithId.length} Objects есть external_id:`);
    objectsWithId.forEach(o => {
      console.log(`    - ${o.object_name} → WS Project ${o.external_id}`);
    });
    console.log('');
  }

  console.log('📊 ИТОГО:');
  console.log(`   Project external_id: ${project.external_id ? '✅' : '❌'}`);
  console.log(`   Objects с external_id: ${objectsWithId.length}/${objects.length}`);
  console.log(`   Sections с external_id: ${sectionsWithId}/${sections.length}`);
  console.log(`   Stages с external_id: ${stagesWithId}/${stagesWithId + stagesWithoutId}`);
}

main().catch(err => {
  console.error('[x] Error:', err.message);
  console.error(err.stack);
  process.exit(1);
});
