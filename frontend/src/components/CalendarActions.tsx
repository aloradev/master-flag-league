import { useState } from 'react';
import { matchCalendar, downloadFile, type CalendarMatch } from '../lib/calendarExport';
export function CalendarActions({ game }: { game: CalendarMatch & { status: string } }) {
  const [error, setError] = useState('');
  const available = game.status === 'SCHEDULED' || game.status === 'LIVE';
  const location = game.field_location;
  return <div className="space-y-2">
    <div className="flex flex-wrap gap-2">
      {available && <button className="btn btn-sm btn-outline" onClick={() => {
        try { downloadFile(new Blob([matchCalendar(game, window.location.origin)], { type: 'text/calendar;charset=utf-8' }), `mfl-${game.id}.ics`); setError(''); }
        catch (e) { setError(e instanceof Error ? e.message : 'No se pudo descargar'); }
      }}>Agregar a mi calendario</button>}
      {location && <a className="btn btn-sm btn-ghost" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`} target="_blank" rel="noopener noreferrer">Ver ubicación ↗</a>}
    </div>
    {available && <p className="text-xs text-base-content/55">Hora de Cancún. El archivo descargado no sincroniza cambios posteriores.</p>}
    {error && <p role="alert" className="text-sm text-error">{error}</p>}
  </div>;
}
