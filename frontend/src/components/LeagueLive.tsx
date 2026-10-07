import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { fechaTexto } from '../lib/format';
import { TeamCrest } from './AuthImage';
import { Partido, type JornadaPublica } from '../pages/publico/Jornada';
import type { TablaPublica } from '../pages/publico/Tabla';
import type { RoundStatus } from '../lib/competition';

export function LeagueLive() {
  const jornada = useQuery({
    queryKey: ['publico-jornada', 'vigente'],
    queryFn: ({ signal }) => api.get<JornadaPublica>('/public/round', signal),
    retry: false,
    refetchInterval: 15000,
  });
  const tabla = useQuery({
    queryKey: ['publico-tabla'],
    queryFn: ({ signal }) => api.get<TablaPublica>('/public/standings', signal),
    retry: false,
    refetchInterval: 60000,
  });
  const calendario = useQuery({
    queryKey: ['publico-calendario'],
    queryFn: ({ signal }) => api.get<{ rounds: { id: string; scheduled_date: string; status: RoundStatus }[] }>('/public/rounds', signal),
    retry: false,
    staleTime: 60000,
  });
  const ultima = calendario.data?.rounds.filter(round => round.status === 'FINISHED')
    .sort((a, b) => b.scheduled_date.localeCompare(a.scheduled_date))[0];
  const resultados = useQuery({
    queryKey: ['publico-jornada', ultima?.id],
    queryFn: ({ signal }) => api.get<JornadaPublica>(`/public/round/${ultima!.id}`, signal),
    enabled: !!ultima && ultima.id !== jornada.data?.round.id,
    retry: false,
    staleTime: 60000,
  });
  const games = jornada.data?.games ?? [];
  const proximos = games.filter(game => game.status === 'LIVE' || game.status === 'SCHEDULED')
    .sort((a, b) => Number(b.status === 'LIVE') - Number(a.status === 'LIVE') || (a.scheduled_time ?? '').localeCompare(b.scheduled_time ?? ''));
  const recientes = [...games, ...(resultados.data?.games ?? [])]
    .filter((game, index, all) => (game.status === 'FINISHED' || game.status === 'WALKOVER') && all.findIndex(item => item.id === game.id) === index);
  const groups = tabla.data?.categories.filter(group => group.rows.length) ?? [];
  const estado = (query: typeof jornada | typeof tabla) => {
    if (query.isPending) return <p role="status" className="py-4 text-sm">Cargando datos de la liga...</p>;
    if (query.isError && !query.data) return <div role="status" className="py-4 text-sm"><p>{query.error instanceof ApiError && query.error.status === 404 ? 'La liga publicará los datos cuando estén disponibles.' : query.error.message}</p><button className="btn btn-sm mt-3" onClick={() => void query.refetch()}>Reintentar</button></div>;
    return null;
  };
  return <section className="campaign-section league-live" aria-labelledby="liga-hoy">
    <div className="campaign-section-heading"><div><p className="campaign-eyebrow">LA LIGA HOY</p><h2 id="liga-hoy">PARTIDOS Y <em>POSICIONES.</em></h2></div><Link to="/jornada" className="link">Ver jornada completa</Link></div>
    {jornada.data && <p className="mb-5 text-sm">{jornada.data.season.name} · {jornada.data.round.name || `Jornada ${jornada.data.round.number}`} · {fechaTexto(jornada.data.round.scheduled_date, { day: 'numeric', month: 'long' })}</p>}
    <div className="grid min-w-0 gap-8 lg:grid-cols-2">
      <div className="min-w-0 space-y-3"><h3 className="text-lg font-bold">En vivo y próximos partidos</h3>
        {estado(jornada)}
        {jornada.data && !proximos.length && <p className="text-sm">No hay partidos en vivo ni próximos en esta jornada.</p>}
        {proximos.slice(0, 4).map(game => <Partido key={game.id} p={game} />)}
        <h3 className="pt-4 text-lg font-bold">Resultados recientes</h3>
        {recientes.slice(0, 3).map(game => <Partido key={game.id} p={game} />)}
        {!recientes.length && <p role="status" className="text-sm">{resultados.isFetching || calendario.isPending ? 'Consultando resultados...' : resultados.isError || calendario.isError ? 'No se pudieron consultar los resultados anteriores.' : 'Todavía no hay resultados publicados.'}</p>}
        {(resultados.isError || calendario.isError) && <button className="btn btn-sm" onClick={() => void (calendario.isError ? calendario.refetch() : resultados.refetch())}>Reintentar resultados</button>}
      </div>
      <div className="min-w-0 space-y-4"><div className="flex items-center justify-between gap-3"><h3 className="text-lg font-bold">Posiciones por categoría</h3><Link className="link text-sm" to="/tabla">Ver tabla</Link></div>
        {estado(tabla)}
        {tabla.data && !groups.length && <p className="text-sm">Todavía no hay equipos en la tabla.</p>}
        {groups.map(group => <section key={group.category.id} className="border-t border-base-content/20 pt-3"><h4 className="mb-2 font-bold">{group.category.name}</h4><ol className="divide-y divide-base-content/15">{group.rows.slice(0, 3).map(team => <li key={team.team_id} className="flex min-w-0 items-center gap-3 py-3"><span className="w-5 shrink-0 font-bold">{team.position}</span><TeamCrest name={team.team_name} shortName={team.short_name} logoUrl={team.logo_url} className="size-9 shrink-0" /><Link to={`/equipos/${team.team_id}`} className="link min-w-0 flex-1 break-words text-sm font-semibold">{team.team_name}</Link><span className="shrink-0 text-right text-xs">{team.wins} G · {team.losses} P<br />DIF {team.point_diff > 0 ? '+' : ''}{team.point_diff}</span></li>)}</ol></section>)}
      </div>
    </div>
    {(jornada.isError && jornada.data || tabla.isError && tabla.data) && <p role="status" className="mt-4 text-sm">No se pudieron actualizar todos los datos. Se muestra la última información recibida.</p>}
  </section>;
}
