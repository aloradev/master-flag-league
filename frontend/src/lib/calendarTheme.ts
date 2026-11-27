const dateFormat = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Cancun',
  month: 'numeric',
  day: 'numeric',
});

export function calendarTheme(date = new Date()) {
  const [month, day] = dateFormat.format(date).split('/').map(Number);
  if ((month === 12 && day >= 28) || (month === 1 && day === 1)) return 'nuevo';
  if (month === 1 && day <= 6) return 'reyes';
  if ((month === 11 && day >= 25) || month === 12) return 'navidad';
  if (month === 2 && day >= 10 && day <= 14) return 'amistad';
  if (month === 9 && day <= 16) return 'patrias';
  if ((month === 10 && day >= 28) || (month === 11 && day <= 2)) return 'muertos';
  if (month <= 2) return 'invierno';
  if (month <= 5) return 'primavera';
  if (month <= 8) return 'verano';
  return 'otono';
}
