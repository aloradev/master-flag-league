export interface CalendarMatch {
  id: string; scheduled_date: string; scheduled_time: string;
  home_team_name: string; away_team_name: string; field_name: string | null;
  field_location?: string | null;
}
const escapeCalendar = (value: string) => value.replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,');
export function matchCalendar(game: CalendarMatch, origin: string, now = new Date()) {
  const day = game.scheduled_date.slice(0, 10);
  const time = game.scheduled_time?.slice(0, 5);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error('El partido aún no tiene fecha y horario confirmados.');
  const start = new Date(`${day}T${time}:00-05:00`);
  if (new Date(`${day}T12:00:00Z`).toISOString().slice(0,10) !== day) throw new Error('Fecha inválida');
  if (!Number.isFinite(start.getTime())) throw new Error('Fecha inválida');
  const stamp = (date: Date) => date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//MFL//Calendario//ES', 'BEGIN:VEVENT',
    `UID:${encodeURIComponent(game.id)}@mfl`, `DTSTAMP:${stamp(now)}`, `DTSTART:${stamp(start)}`,
    `SUMMARY:${escapeCalendar(`${game.home_team_name} vs ${game.away_team_name}`)}`,
    `LOCATION:${escapeCalendar([game.field_name, game.field_location].filter(Boolean).join(' · '))}`,
    `DESCRIPTION:${escapeCalendar('Horario de Cancún. Revisa el calendario de MFL para cambios; esta copia no se actualiza automáticamente.')}`,
    `URL:${origin}/partido/${encodeURIComponent(game.id)}`, 'END:VEVENT', 'END:VCALENDAR'];
  // RFC 5545: líneas plegadas a menos de 75 octetos UTF-8.
  return lines.map(line => {
    const chunks: string[] = []; let chunk = ''; let bytes = 0;
    for (const char of line) {
      const size = new TextEncoder().encode(char).length;
      if (bytes + size > 70) { chunks.push(chunk); chunk = ' '; bytes = 1; }
      chunk += char; bytes += size;
    }
    return [...chunks, chunk].join('\r\n');
  }).join('\r\n') + '\r\n';
}
export function downloadFile(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a'); link.href = url; link.download = name; link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
