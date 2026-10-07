import { useState } from 'react';
import { Link } from 'react-router-dom';
import { clearNotices, favoriteHref, markNoticeRead, markNoticesRead, setNoticesEnabled, toggleFavorite, useFavorites, type NoticeKind } from '../../lib/favorites';
import { IconCircleX, IconCheckCircle, IconFootball, IconInbox, IconSettings, IconTrophy, IconWarning } from '../../components/icons';
import { EmptyState } from '../../components/ui';
import { Marco } from './Marco';

const noticeTypes = {
  live: { label: 'Partido en vivo', Icon: IconFootball },
  result: { label: 'Resultado final', Icon: IconTrophy },
  schedule: { label: 'Horario o cancha', Icon: IconSettings },
  status: { label: 'Estado del partido', Icon: IconWarning },
  update: { label: 'Actualización', Icon: IconInbox },
} satisfies Record<NoticeKind, { label: string; Icon: typeof IconInbox }>;

export default function Favoritos() {
  const { favorites, enabled, notices } = useFavorites();
  const [error, setError] = useState('');
  const result = (ok: boolean) => setError(ok ? '' : 'No se pudo guardar en este dispositivo.');
  const types = { team: 'Equipo', player: 'Jugador', game: 'Partido' };
  const unread = notices.filter(notice => !notice.read);
  const groups = [{ label: 'Sin leer', items: unread }, { label: 'Leídos', items: notices.filter(notice => notice.read) }];
  return <Marco titulo="Favoritos y avisos" subtitulo="Guardados en este dispositivo, sin cuenta.">
    <div className="space-y-6">
      {error && <p role="alert" className="text-sm text-error">{error}</p>}
      <section aria-labelledby="favorites-title"><h2 id="favorites-title" className="text-xl font-bold">Mis favoritos</h2>
        {!favorites.length ? <EmptyState title="Todavía no tienes favoritos" action={<Link to="/tabla" className="btn btn-sm">Ver equipos</Link>} /> : <ul className="public-favorite-list divide-y divide-base-300">{favorites.map(item => <li key={`${item.kind}-${item.id}`} className="flex items-center justify-between gap-3 py-3"><div className="min-w-0"><p className="text-xs text-base-content/60">{types[item.kind]}</p><Link className="link break-words font-semibold [overflow-wrap:anywhere]" to={favoriteHref(item)}>{item.name}</Link></div><button className="btn btn-sm btn-ghost shrink-0" aria-label={`Quitar ${item.name}`} title={`Quitar ${item.name}`} onClick={() => setError(toggleFavorite(item))}><IconCircleX /></button></li>)}</ul>}
      </section>
      <section aria-labelledby="notices-title" className="border-t border-base-300 pt-5"><div className="flex flex-wrap items-center justify-between gap-3"><h2 id="notices-title" className="text-xl font-bold">Avisos</h2><label className="flex items-center gap-2 text-sm"><input type="checkbox" className="toggle toggle-primary toggle-sm" checked={enabled} onChange={event => result(setNoticesEnabled(event.target.checked))} />Avisos en esta web</label></div>
        <p className="mt-2 text-sm text-base-content/60">Horarios, inicio y resultados de equipos y partidos favoritos. Solo mientras visitas la web; no se envían notificaciones push.</p>
        <div className="public-notice-toolbar"><p role="status" className="text-sm font-semibold">{unread.length} sin leer</p><div className="flex flex-wrap gap-2"><button className="btn btn-sm btn-outline" disabled={!unread.length} onClick={() => result(markNoticesRead())}>Marcar como leídos</button><button className="btn btn-sm btn-ghost" disabled={!notices.length} onClick={() => result(clearNotices())}>Borrar avisos</button></div></div>
        {!notices.length ? <p className="text-sm text-base-content/60">No hay avisos nuevos.</p> : groups.filter(group => group.items.length).map(group => <div key={group.label} className="public-notice-group"><h3 className="mb-2 text-sm font-semibold">{group.label} <span className="text-base-content/60">· {group.items.length}</span></h3><ul aria-label={`Avisos ${group.label.toLowerCase()}`} className="public-notice-list">{group.items.map(notice => {
          const kind = notice.kind ?? 'update';
          const { label, Icon } = noticeTypes[kind];
          return <li key={notice.id} className={`public-notice public-notice-${kind} ${notice.read ? 'public-notice-read' : 'public-notice-unread'}`}>
            <span className="public-notice-icon"><Icon size={20} /></span>
            <Link className="public-notice-link" to={`/partido/${encodeURIComponent(notice.gameId)}`} onClick={event => { if (!notice.read && !markNoticeRead(notice.id)) { event.preventDefault(); result(false); } }}>
              <span className="public-notice-heading"><strong>{label}</strong><span className="public-notice-state">{notice.read ? 'Leído' : 'Nuevo'}</span></span>
              <span className="public-notice-text">{notice.text}</span>
              <time dateTime={new Date(notice.created).toISOString()} className="public-notice-time">{new Date(notice.created).toLocaleString('es-MX', { timeZone: 'America/Cancun' })}</time>
            </Link>
            {!notice.read && <button type="button" className="btn btn-sm btn-ghost public-notice-read-button" aria-label={`Marcar como leído: ${notice.text}`} title="Marcar como leído" onClick={() => result(markNoticeRead(notice.id))}><IconCheckCircle size={20} /></button>}
          </li>;
        })}</ul></div>)}
      </section>
    </div>
  </Marco>;
}
