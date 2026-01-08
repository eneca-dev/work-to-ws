// Маппер дат: ISO → DD.MM.YYYY

function formatDateForWS(isoDate) {
  if (!isoDate) return null;

  const date = new Date(isoDate);
  if (isNaN(date.getTime())) return null;

  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();

  return `${day}.${month}.${year}`;
}

function parseWSDate(wsDate) {
  if (!wsDate) return null;

  // DD.MM.YYYY → ISO
  const parts = wsDate.split('.');
  if (parts.length !== 3) return null;

  const [day, month, year] = parts;
  return `${year}-${month}-${day}`;
}

function datesEqual(isoDate, wsDate) {
  const formatted = formatDateForWS(isoDate);
  return formatted === wsDate;
}

module.exports = {
  formatDateForWS,
  parseWSDate,
  datesEqual,
};
