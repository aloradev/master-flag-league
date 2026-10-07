import { Link, useParams } from 'react-router-dom';
import { FavoriteButton } from '../../components/Favorites';
import { useQuery } from '@tanstack/react-query';
import { ShareCard } from '../../components/ShareCard';
import { CalendarActions } from '../../components/CalendarActions';
import { api, ApiError } from '../../lib/api';
import { Alert, EmptyState, Spinner } from '../../components/ui';
import { TeamCrest } from '../../components/AuthImage';
import { ETIQUETA_PARTIDO } from '../../lib/competition';
import type { PublicGame } from '../../lib/publicSports';
import { Marco, BotonCompartir } from './Marco';
import { fechaTexto } from '../../lib/format';

export default function PartidoPublico() {
  const { id = '' } = useParams();
  const consulta = useQuery({
    queryKey: ['public-game', id],
    queryFn: ({ signal }) => api.get<PublicGame>(`/public/games/${encodeURIComponent(id)}`, signal),
    retry: false,
    refetchInterval: query => query.state.data?.status === 'LIVE' ? 10000 : 60000,
  });
  if (consulta.isLoading) return <Marco titulo="Partido"><Spinner /></Marco>;
  if (!consulta.data) return <Marco titulo="Partido"><EmptyState title={consulta.error instanceof ApiError && consulta.error.status === 404 ? 'Partido no disponible' : 'No se pudo cargar el partido'} description={consulta.error?.message} action={<button className="btn" onClick={() => void consulta.refetch()}>Reintentar</button>} /></Marco>;
  const p = consulta.data;
  const final = p.status === 'FINISHED' || p.status === 'WALKOVER';
  const scored = (final || p.status === 'LIVE') && p.home_score != null && p.away_score != null;
  const status = ETIQUETA_PARTIDO[p.status];
  const title = final ? 'Resultado final' : p.status === 'LIVE' ? 'Partido en vivo' : p.status === 'SCHEDULED' ? 'Próximo partido' : p.status === 'POSTPONED' ? 'Partido pospuesto' : 'Partido';
  const score = scored ? `${p.home_score} - ${p.away_score}` : 'VS';
  const message = `${p.home_team_name} ${score} ${p.away_team_name}\n${status.texto} · ${fechaTexto(p.scheduled_date)}\n${window.location.origin}/partido/${p.id}`;
  const individual = p.players ?? [];
  const mvps = [
    { label: 'MVP ofensivo', player: individual.find(player => player.offensive_mvp) },
    { label: 'MVP defensivo', player: individual.find(player => player.defensive_mvp) },
  ];
  const teamSide = (side: 'home' | 'away') => {
    const name = p[`${side}_team_name`];
    const content = <><TeamCrest name={name} shortName={p[`${side}_short_name`]} logoUrl={p[`${side}_logo_url`]} color={p[`${side}_color`] ?? undefined} className="size-16 shrink-0 sm:size-24" /><span className="break-words text-sm font-bold sm:text-lg">{name}</span><span className="text-xs text-base-content/55">{side === 'home' ? 'Local' : 'Visitante'}</span></>;
    const className = 'flex min-w-0 flex-col items-center gap-2 text-center';
    return p.game_type === 'SCRIMMAGE' ? <div className={className}>{content}</div> : <Link className={`${className} hover:text-primary`} to={`/equipos/${p[`${side}_team_id`]}`}>{content}</Link>;
  };
  return <Marco titulo={title} subtitulo={p.category_name} seo={{ title: `${p.home_team_name} ${score} ${p.away_team_name}`, description: `${status.texto} · ${p.category_name} · ${p.scheduled_date.slice(0, 10)} · ${p.scheduled_time || 'Hora por confirmar'} · ${p.field_name || 'Cancha por confirmar'}.` }} acciones={<BotonCompartir texto={message} />}>
    <div className="space-y-7">
      <FavoriteButton favorite={{ kind: 'game', id: p.id, name: `${p.home_team_name} vs ${p.away_team_name}` }} />
      <nav aria-label="Volver a la jornada"><Link className="link text-sm" to={p.round_id ? `/jornada/${p.round_id}` : '/jornada'}>{p.round_number ? `Jornada ${p.round_number}` : 'Ver jornada'}</Link></nav>
      {consulta.isError && <Alert tone="warning">No se pudo actualizar el partido. Se muestra la última información recibida.</Alert>}
      {p.game_type === 'SCRIMMAGE' && <Alert tone="info">Scrimmage. No cuenta para posiciones ni rankings oficiales.</Alert>}
      <section aria-label="Marcador" className="border-y border-base-300 py-6">
        <p className="mb-5 text-center"><span className={`badge ${status.tono}`}>{status.texto}</span></p>
        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 sm:gap-6">
          {teamSide('home')}
          <p aria-label={scored ? `Marcador ${p.home_score} a ${p.away_score}` : 'Sin marcador'} className="text-center text-3xl font-black tabular sm:text-5xl">{score}</p>
          {teamSide('away')}
        </div>
        {p.status === 'LIVE' && <p role="status" className="mt-4 text-center text-sm text-error">En vivo · Actualización cada 10 segundos</p>}
        {final && scored && <p className="mt-4 break-words text-center text-sm font-semibold">{p.home_score === p.away_score ? 'Empate' : `Ganador: ${p.home_score! > p.away_score! ? p.home_team_name : p.away_team_name}`}</p>}
      </section>
      <section aria-labelledby="match-details"><h2 id="match-details" className="mb-3 text-lg font-bold">Fecha y sede</h2>
        <dl className="grid gap-4 text-sm sm:grid-cols-3">
          <div><dt className="text-base-content/60">Fecha</dt><dd className="mt-1 font-semibold">{fechaTexto(p.scheduled_date, { weekday: 'long', day: 'numeric', month: 'long' })}</dd></div>
          <div><dt className="text-base-content/60">Hora de Cancún</dt><dd className="mt-1 font-semibold">{p.scheduled_time || 'Por confirmar'}</dd></div>
          <div><dt className="text-base-content/60">Cancha</dt><dd className="mt-1 break-words font-semibold">{p.field_name || 'Por confirmar'}</dd></div>
        </dl><div className="mt-4"><CalendarActions game={{ ...p, scheduled_time: p.scheduled_time ?? '' }} /></div>
      </section>
      <section aria-labelledby="match-stats"><h2 id="match-stats" className="mb-3 text-lg font-bold">Estadísticas del partido</h2>
        {p.statistics_status === 'PENDING' && p.status !== 'LIVE' ? <Alert tone="warning">{final ? 'Resultado confirmado. Estadísticas individuales pendientes de captura.' : 'Estadísticas individuales pendientes de captura.'}</Alert>
          : !individual.length ? <p className="text-sm text-base-content/60">Todavía no hay estadísticas individuales publicadas.</p> : <>
            {p.status === 'LIVE' && <p className="mb-3 text-xs text-base-content/60">Estadísticas provisionales del partido en curso.</p>}
            {mvps.some(item => item.player) && <dl className="mb-5 grid gap-4 sm:grid-cols-2">{mvps.filter(item => item.player).map(({ label, player }) => <div key={label} className="border-l-4 border-primary pl-3"><dt className="text-xs font-bold text-primary">{label}</dt><dd><Link className="link break-words font-semibold" to={`/jugador/${player!.player_id}`}>{player!.player_name}</Link></dd></div>)}</dl>}
            <ul className="divide-y divide-base-300">{individual.map(player => <li key={player.player_id} className="py-3">
              <Link className="link break-words font-semibold" to={`/jugador/${player.player_id}`}>{player.jersey_number != null ? `#${player.jersey_number} ` : ''}{player.player_name}</Link>
              <p className="text-xs text-base-content/60">{player.team_id === p.home_team_id ? p.home_team_name : p.away_team_name}</p>
              <dl className="mt-2 grid grid-cols-3 gap-2 text-xs sm:grid-cols-5">{[
                ['Touchdowns', player.touchdowns], ['Recepciones', player.receptions], ['Intercepciones', player.interceptions], ['Flags', player.flag_pulls], ['Pases defendidos', player.passes_defended],
              ].map(([label, value]) => <div key={label}><dt className="text-base-content/60">{label}</dt><dd className="text-lg font-bold tabular">{value}</dd></div>)}</dl>
            </li>)}</ul>
          </>}
      </section>
      {!!p.touchdowns?.length && <section aria-labelledby="match-td"><h2 id="match-td" className="mb-3 text-lg font-bold">Touchdowns registrados</h2><ol className="divide-y divide-base-300 text-sm">{p.touchdowns.map((event, index) => <li key={`${event.created_at}-${index}`} className="flex flex-wrap justify-between gap-2 py-2"><span>{event.team_id === p.home_team_id ? p.home_team_name : p.away_team_name}</span><span>{event.quantity ?? 1} TD{event.quarter ? ` · Periodo ${event.quarter}` : ''}</span></li>)}</ol></section>}
      <ShareCard title={title} subtitle={`${p.category_name} · ${fechaTexto(p.scheduled_date)}`} match={{ home: { name: p.home_team_name, score: scored ? p.home_score : null, logo: p.home_logo_url }, away: { name: p.away_team_name, score: scored ? p.away_score : null, logo: p.away_logo_url } }} lines={[p.home_team_name, score, p.away_team_name, `${p.scheduled_time || 'Hora por confirmar'} · ${p.field_name || 'Sede por confirmar'}`, status.texto]} filename={`mfl-partido-${p.id}`} url={`${window.location.origin}/partido/${p.id}`} />
    </div>
  </Marco>;
}
