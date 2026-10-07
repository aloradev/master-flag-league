import { Link, useParams } from 'react-router-dom';
import { FavoriteButton } from '../../components/Favorites';
import { useQuery } from '@tanstack/react-query';
import { api, ApiError } from '../../lib/api';
import type { PlayerStat } from '../../lib/competition';
import { Alert, EmptyState, Spinner } from '../../components/ui';
import { PlayerAvatar, TeamCrest } from '../../components/AuthImage';
import { ShareCard } from '../../components/ShareCard';
import { Marco, BotonCompartir } from './Marco';

interface PublicPlayer {
  id: string; full_name: string; jersey_number: number | null; position: string | null;
  avatar_url: string | null; team_id: string; team_name: string; team_logo: string | null;
  team_color: string | null; category_name: string; season_name: string; season_id: string;
}

export default function PublicPlayer() {
  const { id = '' } = useParams();
  const player = useQuery({
    queryKey: ['public-player', id],
    queryFn: ({ signal }) => api.get<PublicPlayer>(`/public/players/${encodeURIComponent(id)}`, signal),
    retry: false,
  });
  const stats = useQuery({
    queryKey: ['public-player-stats', id, player.data?.season_id],
    queryFn: ({ signal }) => api.get<PlayerStat[]>(`/public/statistics/players?${new URLSearchParams({ seasonId: player.data!.season_id, playerId: id })}`, signal),
    enabled: !!player.data?.season_id,
    retry: false,
    refetchInterval: 60000,
  });
  if (player.isLoading) return <Marco titulo="Perfil de jugador"><Spinner /></Marco>;
  if (!player.data) return <Marco titulo="Perfil de jugador"><EmptyState title={player.error instanceof ApiError && player.error.status === 404 ? 'Jugador no encontrado' : 'No pudimos cargar el perfil'} description={player.error?.message} action={<button className="btn" onClick={() => void player.refetch()}>Reintentar</button>} /></Marco>;
  const p = player.data;
  const s = stats.data?.find(row => row.player_id === id);
  const games = Number(s?.games_played ?? 0);
  const metrics: { title: string; items: [string, number][] }[] = [
    { title: 'Ofensiva', items: [['Touchdowns', Number(s?.touchdowns ?? 0)], ['Yardas', Number(s?.yards ?? 0)], ['Recepciones', Number(s?.receptions ?? 0)], ['Pases completos', Number(s?.completions ?? 0)]] },
    { title: 'Defensiva', items: [['Intercepciones', Number(s?.interceptions ?? 0)], ['Quite de flags', Number(s?.flag_pulls ?? 0)], ['Pases defendidos', Number(s?.passes_defended ?? 0)]] },
  ];
  const awards = [['MVP ofensivos', Number(s?.offensive_mvps ?? 0)], ['MVP defensivos', Number(s?.defensive_mvps ?? 0)]] as const;
  const url = `${window.location.origin}/jugador/${p.id}`;
  return <Marco titulo={p.full_name} subtitulo={`${p.category_name} · ${p.season_name}`} seo={{ description: `${p.full_name} · ${p.team_name} · ${p.category_name}. Estadísticas y reconocimientos de temporada.`, image: p.avatar_url || undefined }} acciones={<BotonCompartir texto={`${p.full_name} · ${p.team_name}\n${url}`} />}>
    <div className="space-y-6">
      <FavoriteButton favorite={{ kind: 'player', id: p.id, name: p.full_name }} />
      {player.isError && <Alert tone="warning">No se pudo actualizar el perfil. Se muestra la última información recibida.</Alert>}
      <section aria-label="Identidad deportiva" className="flex flex-wrap items-center gap-5 border-b border-base-300 pb-6">
        <PlayerAvatar avatarUrl={p.avatar_url} name={p.full_name} jersey={p.jersey_number} size="lg" />
        <div className="min-w-0 flex-1"><p className="text-3xl font-black">{p.jersey_number != null ? `#${p.jersey_number}` : 'Sin dorsal'}</p><p className="mt-1 break-words text-sm text-base-content/65">{p.position || 'Posición por confirmar'}</p>
          <Link aria-label={`Ver equipo ${p.team_name}`} className="mt-3 inline-flex max-w-full items-center gap-2 text-sm font-semibold text-primary hover:underline" to={`/equipos/${p.team_id}`}><TeamCrest name={p.team_name} logoUrl={p.team_logo} color={p.team_color ?? undefined} className="size-8 shrink-0" /><span className="min-w-0 break-words">{p.team_name}</span></Link>
        </div>
      </section>
      <section aria-labelledby="player-season"><h2 id="player-season" className="text-xl font-bold">Temporada en números</h2>
        <p className="mt-2 text-sm text-base-content/60">Solo partidos oficiales terminados con estadísticas completas. Los encuentros pendientes de captura y scrimmages no cuentan.</p>
        {stats.isLoading ? <Spinner label="Cargando estadísticas..." /> : stats.isError && !stats.data ? <EmptyState title="No se pudieron cargar las estadísticas" description={stats.error.message} action={<button className="btn" onClick={() => void stats.refetch()}>Reintentar estadísticas</button>} /> : <>
          {stats.isError && <Alert tone="warning">No se pudieron actualizar las estadísticas. Se muestran los últimos datos recibidos.</Alert>}
          {games === 0 && <p role="status" className="mt-4 text-sm">Todavía no hay partidos con estadísticas completas para este jugador.</p>}
          <p className="my-5 text-sm"><strong className="text-2xl tabular">{games}</strong> {games === 1 ? 'partido' : 'partidos'} con estadísticas</p>
          <div className="grid gap-6 lg:grid-cols-2">{metrics.map(group => <section key={group.title} className="border-t border-base-300 pt-4"><h3 className="mb-4 font-bold">{group.title}</h3><dl className="grid grid-cols-2 gap-5">{group.items.map(([label, value]) => <div key={label}><dt className="text-xs text-base-content/60">{label}</dt><dd className="text-2xl font-black tabular">{value}</dd></div>)}</dl></section>)}</div>
          {games > 0 && <section aria-labelledby="player-averages" className="mt-6 border-t border-base-300 pt-4"><h3 id="player-averages" className="mb-4 font-bold">Promedios por partido con estadísticas</h3><dl className="grid grid-cols-3 gap-3">{[
            ['Touchdowns', s?.touchdowns], ['Yardas', s?.yards], ['Intercepciones', s?.interceptions],
          ].map(([label, value]) => <div key={label}><dt className="break-words text-xs text-base-content/60">{label}</dt><dd className="text-xl font-bold tabular">{(Number(value ?? 0) / games).toLocaleString('es-MX', { maximumFractionDigits: 2 })}</dd></div>)}</dl></section>}
          <section aria-labelledby="player-awards" className="mt-6 border-t border-base-300 pt-4"><h3 id="player-awards" className="mb-4 font-bold">Reconocimientos</h3><dl className="grid grid-cols-2 gap-4">{awards.map(([label, count]) => <div key={label}><dt className="text-xs text-base-content/60">{label}</dt><dd className="text-2xl font-black tabular text-primary">{count}</dd></div>)}</dl></section>
          <div className="mt-6"><ShareCard title={p.full_name} subtitle={`${p.team_name} · ${p.category_name}`} lines={[p.season_name, `${games} partidos · ${Number(s?.touchdowns ?? 0)} TD`, `${Number(s?.yards ?? 0)} yardas · ${Number(s?.interceptions ?? 0)} intercepciones`, `${awards[0][1]} MVP ofensivos · ${awards[1][1]} MVP defensivos`]} filename={`mfl-jugador-${p.id}`} url={url} /></div>
        </>}
      </section>
    </div>
  </Marco>;
}
