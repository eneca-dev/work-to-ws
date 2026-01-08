// Маппер чеклиста: decomposition_items → текст

function buildChecklist(decompositionItems) {
  if (!decompositionItems || decompositionItems.length === 0) {
    return null;
  }

  const lines = decompositionItems.map(item => {
    // Статус: выполнено или нет
    const status = item.decomposition_item_status_id ? '[x]' : '[ ]';

    // Описание задачи
    const description = item.decomposition_item_description || 'Без описания';

    // Плановые часы (опционально)
    const hours = item.decomposition_item_planned_hours
      ? ` (${item.decomposition_item_planned_hours}ч)`
      : '';

    return `${status} ${description}${hours}`;
  });

  return lines.join('\n');
}

// Пример результата:
// [ ] Разработка ТЗ (4ч)
// [ ] Согласование с заказчиком (2ч)
// [x] Подготовка документации (8ч)

module.exports = {
  buildChecklist,
};
