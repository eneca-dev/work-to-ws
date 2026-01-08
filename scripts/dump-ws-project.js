#!/usr/bin/env node

// Полный дамп ВСЕХ данных из WS для одного проекта
// Включая: задачи, subtasks, sub-subtasks, text (чеклисты), все поля

require('dotenv').config();

const fs = require('fs');
const { config, validateConfig } = require('../config/env');
const wsWriter = require('../services/worksection-writer');

async function main() {
  try {
    validateConfig();
  } catch (e) {
    console.error('[x] Config error:', e.message);
    process.exit(1);
  }

  // Project ID из аргумента
  const projectId = process.argv[2];

  if (!projectId) {
    console.error('\n❌ Project ID is required!\n');
    console.log('Usage: node scripts/dump-ws-project.js <ws-project-id>');
    console.log('Example: node scripts/dump-ws-project.js 129612\n');
    process.exit(1);
  }

  console.log('\n=== ПОЛНЫЙ ДАМП ПРОЕКТА ИЗ WS ===\n');
  console.log(`Project ID: ${projectId}\n`);
  console.log('Загрузка...\n');

  const tasks = await wsWriter.getTasks(projectId);

  const output = [];
  output.push('═'.repeat(80));
  output.push(`WORKSECTION PROJECT: ${projectId}`);
  output.push(`Total top-level tasks: ${tasks.length}`);
  output.push('═'.repeat(80));
  output.push('');

  tasks.forEach((task, idx) => {
    printTask(task, 1, idx + 1, output);
  });

  // Статистика
  const stats = countTasks(tasks);
  output.push('');
  output.push('═'.repeat(80));
  output.push('STATISTICS');
  output.push('═'.repeat(80));
  output.push(`Level 1 tasks: ${stats.level1}`);
  output.push(`Level 2 subtasks: ${stats.level2}`);
  output.push(`Level 3 sub-subtasks: ${stats.level3}`);
  output.push(`Tasks with text/checklist: ${stats.withText}`);
  output.push('');

  // Вывод в файл с timestamp
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const filename = `ws-project-${projectId}-${timestamp}.txt`;
  fs.writeFileSync(filename, output.join('\n'), 'utf8');

  console.log(`✅ Дамп сохранён в файл: ${filename}`);
  console.log(`   Всего строк: ${output.length}`);
  console.log(`   Level 1: ${stats.level1}, Level 2: ${stats.level2}, Level 3: ${stats.level3}`);
  console.log(`   С чеклистами: ${stats.withText}\n`);
}

function printTask(task, level, index, output, prefix = '') {
  const indent = '  '.repeat(level - 1);

  output.push('');
  output.push(`${indent}${'─'.repeat(80 - indent.length)}`);
  output.push(`${indent}[LEVEL ${level}] ${prefix}${index}. ${task.name}`);
  output.push(`${indent}${'─'.repeat(80 - indent.length)}`);
  output.push(`${indent}ID: ${task.id}`);
  output.push(`${indent}Status: ${task.status || 'N/A'}`);
  output.push(`${indent}Priority: ${task.priority || 'N/A'}`);
  output.push(`${indent}User from: ${task.user_from || 'N/A'}`);
  output.push(`${indent}User to: ${task.user_to || 'N/A'}`);
  output.push(`${indent}Date added: ${task.date_added || 'N/A'}`);
  output.push(`${indent}Date start: ${task.date_start || 'N/A'}`);
  output.push(`${indent}Date end: ${task.date_end || 'N/A'}`);
  output.push(`${indent}Max time: ${task.max_time || 'N/A'}`);
  output.push(`${indent}Tags: ${task.tags || 'N/A'}`);

  // TEXT / CHECKLIST
  if (task.text) {
    output.push(`${indent}HAS TEXT/CHECKLIST: YES (${task.text.length} chars)`);
    output.push(`${indent}Text preview:`);
    const lines = task.text.split('\n').slice(0, 10);
    lines.forEach(line => {
      output.push(`${indent}  | ${line}`);
    });
    if (task.text.split('\n').length > 10) {
      output.push(`${indent}  | ... (ещё ${task.text.split('\n').length - 10} строк)`);
    }
  } else {
    output.push(`${indent}HAS TEXT/CHECKLIST: NO`);
  }

  // SUBTASKS
  if (task.subtasks && task.subtasks.length > 0) {
    output.push(`${indent}SUBTASKS: ${task.subtasks.length} штук`);
    output.push('');

    task.subtasks.forEach((subtask, subIdx) => {
      printTask(subtask, level + 1, subIdx + 1, output, `${prefix}${index}.`);
    });
  } else {
    output.push(`${indent}SUBTASKS: 0`);
  }
}

function countTasks(tasks, stats = { level1: 0, level2: 0, level3: 0, withText: 0 }, level = 1) {
  for (const task of tasks) {
    if (level === 1) stats.level1++;
    else if (level === 2) stats.level2++;
    else if (level === 3) stats.level3++;

    if (task.text) stats.withText++;

    if (task.subtasks) {
      countTasks(task.subtasks, stats, level + 1);
    }
  }
  return stats;
}

main().catch(err => {
  console.error('[x] Error:', err.message);
  console.error(err.stack);
  process.exit(1);
});
