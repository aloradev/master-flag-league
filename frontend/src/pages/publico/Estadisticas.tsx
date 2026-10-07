import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { api, ApiError } from '../../lib/api';
import type { PlayerStat } from '../../lib/competition';
import { Alert, Card, EmptyState, Spinner } from '../../components/ui';
import { Marco, BotonCompartir } from './Marco';
import type { TablaPublica } from './Tabla';
import { ShareCard } from '../../components/ShareCard';
import { PublicFilters } from '../../components/PublicFilters';
import { DataFreshness } from '../../components/DataFreshness';

const METRICS = [
  { key: 'touchdowns', label: 'Touchdowns' },
  { key: 'yards', label: 'Yardas' },
  { key: 'receptions', label: 'Recepciones' },
  { key: 'completions', label: 'Pases completos' },
  { key: 'interceptions', label: 'Intercepciones' },
  { key: 'flag_pulls', label: 'Quite de flags' },
  { key: 'passes_defended', label: 'Pases defendidos' },
  { key: 'offensive_mvps', label: 'MVP ofensivos' },
  { key: 'defensive_mvps', label: 'MVP defensivos' },
] as const satisfies readonly { key: keyof PlayerStat; label: string }[];

export default function EstadisticasPublicas() {
  const [params, setParams] = useSearchParams();
  const categoryId = params.get('categoria') ?? '';
  const teamId = params.get('equipo') ?? '';
  const metric = METRICS.find(item => item.key === params.get('metrica')) ?? METRICS[0];
  const tabla = useQuery({
    queryKey: ['publico-tabla'],
    queryFn: ({ signal }) => api.get<TablaPublica>('/public/standings', signal),
    retry: false,
  });
  const season = tabla.data?.season;
  const stats = useQuery({
    queryKey: ['public-player-rankings', season?.id, categoryId],
    queryFn: ({ signal }) => {
      const query = new URLSearchParams({ seasonId: season!.id });
      if (categoryId) query.set('categoryId', categoryId);
      return api.get<PlayerStat[]>(`/public/statistics/players?${query}`, signal);
    },
    enabled: !!season,
    retry: false,
    refetchInterval: 60000,
  });
  const teams = [...new Map((stats.data ?? []).map(player => [player.team_id, player.team_name])).entries()]
    .sort((a, b) => a[1].localeCompare(b[1], 'es'));
  const rows = (stats.data ?? []).filter(player => (!teamId || player.team_id === teamId) && Number(player[metric.key]) > 0)
    .sort((a, b) => Number(b[metric.key]) - Number(a[metric.key]) || a.player_name.localeCompare(b.player_name, 'es'));
  const category = tabla.data?.categories.find(group => group.category.id === categoryId)?.category.name;
  const teamName = teams.find(([id]) => id === teamId)?.[1];
  const scope = `${categoryId ? category ?? 'Categoría no disponible' : 'Todas las categorías'} · ${teamId ? teamName ?? 'Equipo no disponible' : 'Todos los equipos'}`;
  const update = (key: string, value: string) => {
    setParams(previous => {
      const next = new URLSearchParams(previous);
      if (value) next.set(key, value); else next.delete(key);
      if (key === 'categoria') next.delete('equipo');
      return next;
    }, { replace: true });
  };
  const share = `${metric.label} · ${scope} · ${season?.name ?? 'Master Flag League'}\n${window.location.href}`;
  const clearFilters = () => setParams(previous => {
    const next = new URLSearchParams(previous);
    next.delete('categoria'); next.delete('equipo');
    return next;
  }, { replace: true });
  return <Marco titulo="Estadísticas" subtitulo={season?.name} acciones={<BotonCompartir texto={share} />}>
    <div className="space-y-5">
      <div className="public-stats-filters"><PublicFilters label="Filtros de estadísticas" activeCount={[categoryId, teamId].filter(Boolean).length} onClear={clearFilters} threeColumns>
        <div className="min-w-0 text-sm font-semibold"><label htmlFor="stats-metric">Estadística</label><select id="stats-metric" className="select mt-1 w-full" value={metric.key} onChange={event => update('metrica', event.target.value)}>
          {METRICS.map(item => <option key={item.key} value={item.key}>{item.label}</option>)}
        </select></div>
        <div className="min-w-0 text-sm font-semibold"><label htmlFor="stats-category">Categoría</label><select id="stats-category" className="select mt-1 w-full" value={categoryId} onChange={event => update('categoria', event.target.value)} disabled={!tabla.data}>
          <option value="">Todas las categorías</option>{tabla.data?.categories.map(group => <option key={group.category.id} value={group.category.id}>{group.category.name}</option>)}
        </select></div>
        <div className="min-w-0 text-sm font-semibold"><label htmlFor="stats-team">Equipo</label><select id="stats-team" className="select mt-1 w-full" value={teamId} onChange={event => update('equipo', event.target.value)} disabled={stats.isPending}>
          <option value="">Todos los equipos</option>{teams.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select></div>
      </PublicFilters></div>
      {tabla.isLoading || (season && stats.isLoading) ? <Spinner label="Cargando estadísticas..." />
        : (tabla.isError && !tabla.data) || (stats.isError && !stats.data) ? <EmptyState
          title={tabla.error instanceof ApiError && tabla.error.status === 404 ? 'Todavía no hay temporada activa' : 'No pudimos cargar las estadísticas'}
          description={(tabla.error ?? stats.error)?.message}
          action={<button className="btn btn-primary" onClick={() => void (tabla.isError ? tabla.refetch() : stats.refetch())}>Reintentar</button>}
        /> : <>
          {(stats.isError || tabla.isError) && <Alert tone="warning">No se pudieron actualizar todos los datos. Se muestra la última información recibida.</Alert>}
          <section aria-labelledby="ranking-title" aria-describedby="ranking-context">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h2 id="ranking-title" className="text-xl font-bold">Líderes en {metric.label.toLocaleLowerCase('es')}</h2><p id="ranking-context" className="min-w-0 break-words text-xs text-base-content/60 [overflow-wrap:anywhere]">{scope}</p></div>
            {!rows.length ? <EmptyState title="Aún no hay registros para este filtro" description="Los líderes aparecerán cuando se publiquen estadísticas completas de jugadores para esta categoría y equipo." /> : <Card className="overflow-hidden">
              <ol aria-label={`Ranking de ${metric.label}`} className="divide-y divide-base-300">
                {rows.slice(0, 25).map((player, index) => {
                  const position = rows.findIndex(item => Number(item[metric.key]) === Number(player[metric.key])) + 1;
                  return <li key={player.player_id} className={`flex min-w-0 items-center gap-3 px-3 py-4 sm:px-5 ${index < 3 ? 'bg-primary/5' : ''}`}>
                    <span className="w-7 shrink-0 text-center text-lg font-black tabular">{position}</span>
                    <div className="min-w-0 flex-1"><Link className="link block break-words font-semibold" to={`/jugador/${player.player_id}`}>{player.player_name}</Link><p className="mt-1 break-words text-xs text-base-content/60">{player.team_name} · {player.category_name}</p><p className="text-xs text-base-content/60">{player.games_played} partidos</p></div>
                    <span className="shrink-0 text-2xl font-black tabular" aria-label={`${Number(player[metric.key])} ${metric.label}`}>{Number(player[metric.key])}</span>
                  </li>;
                })}
              </ol>
            </Card>}
            {!!rows.length && <p className="mt-3 text-xs text-base-content/60">{Math.min(rows.length, 25)} de {rows.length} jugadores con registros. Los empates comparten posición.</p>}
            <p className="mt-3 text-sm text-base-content/65">Solo partidos oficiales terminados con estadísticas completas. Los partidos pendientes de captura y los scrimmages no cuentan.</p>
            <DataFreshness label="Estadísticas" query={stats} />
            {!!rows.length && <div className="mt-5"><ShareCard title={`Líderes · ${metric.label}`} subtitle={`${scope} · ${season?.name ?? 'MFL'}`} lines={[]} table={{ headers: ['POS', 'JUGADOR', 'EQUIPO', metric.label], rows: rows.slice(0, 25).map(player => [String(rows.findIndex(item => Number(item[metric.key]) === Number(player[metric.key])) + 1), player.player_name, player.team_name, String(Number(player[metric.key]))]) }} filename={`mfl-lideres-${metric.key}`} url={window.location.href} /></div>}
          </section>
        </>}
    </div>
  </Marco>;
}
