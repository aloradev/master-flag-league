import { useQuery } from '@tanstack/react-query';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { api, ApiError } from '../../lib/api';
import type { PublicTeam } from '../../lib/publicSports';
import { Alert, EmptyState, Spinner } from '../../components/ui';
import { PlayerAvatar, TeamCrest } from '../../components/AuthImage';
import { fechaTexto } from '../../lib/format';
import { Partido } from './Jornada';
import { Marco, BotonCompartir } from './Marco';

export default function EquipoPublico() {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const views = [{ key: 'proximos', label: 'Próximos' }, { key: 'resultados', label: 'Resultados' }, { key: 'plantilla', label: 'Plantilla' }];
  const view = views.find(item => item.key === params.get('vista'))?.key ?? 'proximos';
  const query = useQuery({ queryKey: ['public-team', id], queryFn: ({ signal }) => api.get<PublicTeam>(`/public/teams/${encodeURIComponent(id)}`, signal), retry: false, refetchInterval: 60000 });
  if (query.isLoading) return <Marco titulo="Equipo"><Spinner /></Marco>;
  if (!query.data) return <Marco titulo="Equipo"><EmptyState title={query.error instanceof ApiError && query.error.status === 404 ? 'Equipo no encontrado' : 'No pudimos cargar el equipo'} description={query.error?.message} action={<button className="btn" onClick={() => void query.refetch()}>Reintentar</button>} /></Marco>;
  const { team, standing, roster, games } = query.data;
  const results = games.filter(game => game.status === 'FINISHED' || game.status === 'WALKOVER').sort((a, b) => b.scheduled_date.localeCompare(a.scheduled_date) || (b.scheduled_time ?? '').localeCompare(a.scheduled_time ?? ''));
  const upcoming = games.filter(game => ['LIVE', 'SCHEDULED', 'POSTPONED'].includes(game.status)).sort((a, b) => Number(b.status === 'LIVE') - Number(a.status === 'LIVE') || a.scheduled_date.localeCompare(b.scheduled_date) || (a.scheduled_time ?? '').localeCompare(b.scheduled_time ?? ''));
  const selectedGames = view === 'resultados' ? results : upcoming;
  const message = `${team.name} · ${team.category_name}\n${team.season_name}\n${window.location.href}`;
  return <Marco titulo={team.name} subtitulo={`${team.category_name} · ${team.season_name}`} acciones={<BotonCompartir texto={message} />}>
    <div className="space-y-6">
      {query.isError && <Alert tone="warning">No se pudo actualizar el equipo. Se muestra la última información recibida.</Alert>}
      <div className="flex items-center gap-4 border-b border-base-300 pb-5"><TeamCrest name={team.name} shortName={team.short_name} logoUrl={team.logo_url} color={team.color_primary ?? undefined} className="size-20 shrink-0" /><div><p className="font-bold">{team.category_name}</p><p className="text-sm text-base-content/60">{roster.length} jugadores en la plantilla pública</p></div></div>
      {standing ? <section aria-label="Resumen de temporada"><dl className="grid grid-cols-3 gap-y-4 sm:grid-cols-6">{[
        ['Posición', standing.position], ['Jugados', standing.played], ['Ganados', standing.wins], ['Empatados', standing.draws], ['Perdidos', standing.losses], ['Diferencia', standing.point_diff > 0 ? `+${standing.point_diff}` : standing.point_diff],
      ].map(([label, value]) => <div key={label} className="text-center"><dt className="text-xs text-base-content/60">{label}</dt><dd className="text-2xl font-black tabular">{value}</dd></div>)}</dl><p className="mt-4 text-center text-xs text-base-content/60">{standing.points_for} puntos a favor · {standing.points_against} en contra</p></section>
        : <p className="text-sm text-base-content/60">Todavía no hay posición disponible para este equipo.</p>}
      <nav aria-label="Vistas del equipo" className="grid grid-cols-3 border-b border-base-300">{views.map(item => <Link key={item.key} to={`?vista=${item.key}`} replace aria-current={view === item.key ? 'page' : undefined} className={`flex min-h-12 items-center justify-center border-b-2 text-sm font-semibold ${view === item.key ? 'border-primary text-primary' : 'border-transparent text-base-content/65'}`}>{item.label}</Link>)}</nav>
      <section aria-labelledby="team-view"><h2 id="team-view" className="mb-4 text-lg font-bold">{views.find(item => item.key === view)?.label}</h2>
        {view === 'plantilla' ? !roster.length ? <EmptyState title="Plantilla por publicar" description="Los jugadores aparecerán cuando estén aprobados por la liga." /> : <ul className="grid gap-x-6 divide-y divide-base-300 sm:grid-cols-2">{roster.map(player => <li key={player.id} className="flex min-w-0 items-center gap-3 py-3"><PlayerAvatar name={player.full_name} avatarUrl={player.avatar_url} jersey={player.jersey_number} /><div className="min-w-0"><Link className="link break-words font-semibold" to={`/jugador/${player.id}`}>{player.full_name}</Link><p className="text-xs text-base-content/60">{player.jersey_number != null ? `#${player.jersey_number}` : 'Sin dorsal'}{player.position ? ` · ${player.position}` : ''}</p></div></li>)}</ul>
          : !selectedGames.length ? <EmptyState title={view === 'resultados' ? 'Todavía no hay resultados' : 'No hay próximos partidos publicados'} description="Consulta nuevamente cuando la liga publique más encuentros." /> : <div className="space-y-4">{selectedGames.map(game => <div key={game.id}><p className="mb-2 text-xs font-semibold text-base-content/60">Jornada {game.round_number} · {fechaTexto(game.scheduled_date)}</p><Partido p={game} /></div>)}</div>}
      </section>
    </div>
  </Marco>;
}
