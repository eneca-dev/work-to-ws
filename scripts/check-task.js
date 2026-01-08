// Скрипт для проверки задачи в Worksection
// Использование: node scripts/check-task.js <task_id>

const wsWriter = require('../services/worksection-writer');

async function checkTask() {
  const taskId = process.argv[2];

  if (!taskId) {
    console.error('Usage: node scripts/check-task.js <task_id>');
    console.error('Example: node scripts/check-task.js 12345678');
    process.exit(1);
  }

  console.log(`\nПроверка задачи WS ID: ${taskId}\n`);

  try {
    const task = await wsWriter.getTask(taskId);

    console.log('Результат:');
    console.log('─'.repeat(60));
    console.log(`Название: ${task.name}`);
    console.log(`Статус: ${task.status}`);
    console.log(`Ответственный: ${task.user_to?.email || 'NOONE'}`);
    console.log(`Даты: ${task.date_start} — ${task.date_end}`);
    console.log(`\n📊 ПЛАНОВЫЕ ЧАСЫ (max_time): ${task.max_time || '(не установлено)'}`);
    console.log(`💰 План затрат (max_money): ${task.max_money || '(не установлено)'}`);

    if (task.text) {
      console.log(`\n📋 Чеклист:`);
      console.log(task.text);
    }

    console.log('─'.repeat(60));
    console.log('\nПолный ответ API:');
    console.log(JSON.stringify(task, null, 2));

  } catch (error) {
    console.error(`Ошибка: ${error.message}`);
    process.exit(1);
  }
}

checkTask();
