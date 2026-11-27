const dateFormat = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Cancun',
  month: 'numeric',
  day: 'numeric',
});

export function calendarTheme(date = new Date()) {
  const [month, day] = dateFormat.format(date).split('/').map(Number);
  if ((month === 11 && day >= 25) || month === 12 || (month === 1 && day <= 6)) return 'fiestas';
  if (month <= 2) return 'invierno';
  if (month <= 5) return 'primavera';
  if (month <= 8) return 'verano';
  return 'otono';
}
