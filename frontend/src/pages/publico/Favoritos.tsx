import { useState } from 'react';
import { Link } from 'react-router-dom';
import { clearNotices, favoriteHref, markNoticesRead, setNoticesEnabled, toggleFavorite, useFavorites } from '../../lib/favorites';
import { IconCircleX } from '../../components/icons';
import { EmptyState } from '../../components/ui';
import { Marco } from './Marco';

export default function Favoritos() {
  const { favorites, enabled, notices } = useFavorites();
  const [error, setError] = useState('');
  const result = (ok: boolean) => setError(ok ? '' : 'No se pudo guardar en este dispositivo.');
  const types = { team: 'Equipo', player: 'Jugador', game: 'Partido' };
  return <Marco titulo="Favoritos y avisos" subtitulo="Guardados en este dispositivo, sin cuenta.">
    <div className="space-y-8">
      {error && <p role="alert" className="text-sm text-error">{error}</p>}
      <section aria-labelledby="favorites-title"><h2 id="favorites-title" className="text-xl font-bold">Mis favoritos</h2>
        {!favorites.length ? <EmptyState title="Todavía no tienes favoritos" action={<Link to="/tabla" className="btn btn-sm">Ver equipos</Link>} /> : <ul className="divide-y divide-base-300">{favorites.map(item => <li key={`${item.kind}-${item.id}`} className="flex items-center justify-between gap-3 py-4"><div className="min-w-0"><p className="text-xs text-base-content/60">{types[item.kind]}</p><Link className="link break-words font-semibold" to={favoriteHref(item)}>{item.name}</Link></div><button className="btn btn-sm btn-ghost shrink-0" aria-label={`Quitar ${item.name}`} title={`Quitar ${item.name}`} onClick={() => setError(toggleFavorite(item))}><IconCircleX /></button></li>)}</ul>}
      </section>
      <section aria-labelledby="notices-title" className="border-t border-base-300 pt-5"><div className="flex flex-wrap items-center justify-between gap-3"><h2 id="notices-title" className="text-xl font-bold">Avisos</h2><label className="flex items-center gap-2 text-sm"><input type="checkbox" className="toggle toggle-primary toggle-sm" checked={enabled} onChange={event => result(setNoticesEnabled(event.target.checked))} />Avisos en esta web</label></div>
        <p className="mt-2 text-sm text-base-content/60">Horarios, inicio y resultados de equipos y partidos favoritos. Solo mientras visitas la web; no se envían notificaciones push.</p>
        <div className="my-4 flex flex-wrap gap-2"><button className="btn btn-sm btn-outline" disabled={!notices.some(notice => !notice.read)} onClick={() => result(markNoticesRead())}>Marcar como leídos</button><button className="btn btn-sm btn-ghost" disabled={!notices.length} onClick={() => result(clearNotices())}>Borrar avisos</button></div>
        {!notices.length ? <p className="text-sm text-base-content/60">No hay avisos nuevos.</p> : <ul className="divide-y divide-base-300">{notices.map(notice => <li key={notice.id} className="py-4"><Link to={`/partido/${encodeURIComponent(notice.gameId)}`} className={`link break-words text-sm ${notice.read ? 'text-base-content/60' : 'font-bold'}`}>{!notice.read && <span className="mr-2 text-primary">Nuevo</span>}{notice.text}</Link><p className="mt-1 text-xs text-base-content/60">{new Date(notice.created).toLocaleString('es-MX', { timeZone: 'America/Cancun' })}</p></li>)}</ul>}
      </section>
    </div>
  </Marco>;
}
