import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import type { RoundStatus } from '../lib/competition';
import { fechaTexto } from '../lib/format';
import { Alert, EmptyState } from './ui';
import { PublicFilters } from './PublicFilters';
import { Partido, type JornadaPublica } from '../pages/publico/Jornada';

export function JornadaAgenda({ data }: { data: JornadaPublica }) {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { round, games, season, byes } = data;
  const calendar = useQuery({
    queryKey: ['publico-calendario'],
    queryFn: ({ signal }) => api.get<{ rounds: { id: string; number: number; name: string | null; scheduled_date: string; status: RoundStatus }[] }>('/public/rounds', signal),
    retry: false,
    staleTime: 60000,
  });
  const categories = [...new Set(games.map(game => game.category_name))].sort((a, b) => a.localeCompare(b, 'es'));
  const fields = [...new Set(games.map(game => game.field_name || 'Cancha por confirmar'))].sort((a, b) => a.localeCompare(b, 'es'));
  const category = categories.includes(params.get('categoria') ?? '') ? params.get('categoria')! : '';
  const field = fields.includes(params.get('cancha') ?? '') ? params.get('cancha')! : '';
  const status = ['LIVE', 'SCHEDULED', 'FINISHED', 'POSTPONED'].includes(params.get('estado') ?? '') ? params.get('estado')! : '';
  const grouping = ['categoria', 'cancha'].includes(params.get('agrupar') ?? '') ? params.get('agrupar')! : 'horario';
  const filtered = games.filter(game => (!category || game.category_name === category) && (!field || (game.field_name || 'Cancha por confirmar') === field) && (!status || game.status === status || status === 'FINISHED' && game.status === 'WALKOVER'))
    .sort((a, b) => (a.scheduled_time || '99:99').localeCompare(b.scheduled_time || '99:99') || (a.field_name ?? '').localeCompare(b.field_name ?? '', 'es'));
  const groups = new Map<string, typeof games>();
  for (const game of filtered) {
    const key = grouping === 'categoria' ? game.category_name : grouping === 'cancha' ? game.field_name || 'Cancha por confirmar' : game.scheduled_time || 'Hora por confirmar';
    groups.set(key, [...(groups.get(key) ?? []), game]);
  }
  const live = games.filter(game => game.status === 'LIVE');
  const finished = games.filter(game => game.status === 'FINISHED' || game.status === 'WALKOVER');
  const visibleByes = byes.filter(team => !category || team.category_name === category);
  const touchdowns = games.reduce((total, game) => total + (game.touchdowns ?? []).reduce((sum, event) => sum + (event.quantity ?? 1), 0), 0);
  const featured = filtered.find(game => game.status === 'LIVE') || filtered.find(game => game.status === 'SCHEDULED');
  const times = games.map(game => game.scheduled_time).filter((time): time is string => !!time).sort();
  const rounds = calendar.data?.rounds ?? [];
  const update = (key: string, value: string) => setParams(previous => {
    const next = new URLSearchParams(previous);
    if (value) next.set(key, value); else next.delete(key);
    return next;
  }, { replace: true });
  const activeCount = [category, field, status].filter(Boolean).length;
  const clearFilters = () => setParams(previous => {
    const next = new URLSearchParams(previous);
    for (const key of ['categoria', 'cancha', 'estado']) next.delete(key);
    return next;
  }, { replace: true });
  return <div className="space-y-6">
    <section aria-label="Información de la jornada" className="border-b border-base-300 pb-5">
      <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="font-semibold">{season.name}</p><p className="mt-1 text-sm text-base-content/65">{times.length ? `${times[0]}${times.at(-1) !== times[0] ? ` – ${times.at(-1)}` : ''} · Hora de Cancún` : 'Horarios por confirmar'}</p><p className="mt-1 break-words text-sm text-base-content/65">{fields.join(' · ') || 'Canchas por confirmar'}</p></div>
        <div className="w-full sm:w-72"><label className="text-xs font-semibold" htmlFor="public-round">Jornada publicada</label><select id="public-round" className="select mt-1 w-full" value={round.id} onChange={event => navigate(`/jornada/${event.target.value}`)}>
          {!rounds.some(item => item.id === round.id) && <option value={round.id}>{round.name || `Jornada ${round.number}`}</option>}
          {rounds.map(item => <option key={item.id} value={item.id}>{item.name || `Jornada ${item.number}`} · {fechaTexto(item.scheduled_date)}</option>)}
        </select></div>
      </div>
      {calendar.isError && <p role="status" className="mt-3 text-sm text-warning">No se pudo cargar el calendario. <button className="link" onClick={() => void calendar.refetch()}>Reintentar calendario</button></p>}
      <dl className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">{[['Partidos', games.length], ['En vivo', live.length], ['Finalizados', finished.length], ['Touchdowns', touchdowns]].map(([label, value]) => <div key={label}><dt className="text-xs text-base-content/60">{label}</dt><dd className="text-2xl font-black tabular">{value}</dd></div>)}</dl>
    </section>
    <PublicFilters label="Filtros de la jornada" activeCount={activeCount} onClear={clearFilters}>
      <div className="min-w-0"><label htmlFor="round-category" className="text-xs font-semibold">Categoría</label><select id="round-category" className="select mt-1 w-full" value={category} onChange={event => update('categoria', event.target.value)}><option value="">Todas</option>{categories.map(name => <option key={name}>{name}</option>)}</select></div>
      <div className="min-w-0"><label htmlFor="round-field" className="text-xs font-semibold">Cancha</label><select id="round-field" className="select mt-1 w-full" value={field} onChange={event => update('cancha', event.target.value)}><option value="">Todas</option>{fields.map(name => <option key={name}>{name}</option>)}</select></div>
      <div className="min-w-0"><label htmlFor="round-status" className="text-xs font-semibold">Estado</label><select id="round-status" className="select mt-1 w-full" value={status} onChange={event => update('estado', event.target.value)}><option value="">Todos</option><option value="LIVE">En vivo</option><option value="SCHEDULED">Programados</option><option value="FINISHED">Finalizados</option><option value="POSTPONED">Pospuestos</option></select></div>
      <div className="min-w-0"><label htmlFor="round-group" className="text-xs font-semibold">Agrupar por</label><select id="round-group" className="select mt-1 w-full" value={grouping} onChange={event => update('agrupar', event.target.value)}><option value="horario">Horario</option><option value="categoria">Categoría</option><option value="cancha">Cancha</option></select></div>
    </PublicFilters>
    {featured && <section aria-labelledby="featured-match" className="border-l-4 border-primary pl-4"><h2 id="featured-match" className="text-sm font-bold text-primary">{featured.status === 'LIVE' ? 'Ahora en la cancha' : 'Próximo encuentro de esta jornada'}</h2><Link className="link mt-1 block break-words font-semibold" to={`/partido/${featured.id}`}>{featured.home_team_name} vs {featured.away_team_name}</Link><p className="mt-1 text-xs text-base-content/60">{featured.scheduled_time || 'Hora por confirmar'} · {featured.field_name || 'Cancha por confirmar'} · {featured.category_name}</p></section>}
    {games.length === 0 ? <Alert tone="info">Esta jornada todavía no tiene partidos.</Alert> : !filtered.length ? <EmptyState title="No hay partidos para estos filtros" /> : <div className="space-y-6">{[...groups].map(([name, matches]) => <section key={name} aria-label={name}><div className="mb-3 flex flex-wrap items-baseline justify-between gap-2 border-b border-base-300 pb-2"><h2 className="break-words text-lg font-bold">{name}{grouping === 'horario' && name !== 'Hora por confirmar' ? ' h' : ''}</h2><span className="text-xs text-base-content/60">{matches.length} {matches.length === 1 ? 'partido' : 'partidos'}</span></div><div className="grid gap-3 lg:grid-cols-2">{matches.map(game => <Partido key={game.id} p={game} />)}</div></section>)}</div>}
    {!!visibleByes.length && <section aria-labelledby="round-byes"><h2 id="round-byes" className="mb-3 text-lg font-bold">Descansan esta jornada</h2><ul className="divide-y divide-base-300">{visibleByes.map(team => <li key={team.team_id} className="flex flex-wrap justify-between gap-2 py-3 text-sm"><Link className="link break-words font-semibold" to={`/equipos/${team.team_id}`}>{team.team_name}</Link><span className="text-base-content/60">{team.category_name}</span></li>)}</ul></section>}
  </div>;
}
