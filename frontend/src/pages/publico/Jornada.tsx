import { useQuery } from '@tanstack/react-query';
import { DataFreshness } from '../../components/DataFreshness';
import { useParams } from 'react-router-dom';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../../lib/api';
import { Alert, EmptyState, Spinner } from '../../components/ui';
import { IconFootball } from '../../components/icons';
import { TeamCrest } from '../../components/AuthImage';
import { ETIQUETA_PARTIDO, type GameStatus, type RoundStatus } from '../../lib/competition';
import { fechaTexto } from '../../lib/format';
import { Marco, BotonCompartir } from './Marco';
import { JornadaAgenda } from '../../components/JornadaAgenda';

export interface PartidoPublico {
  statistics_status?: 'PENDING' | 'COMPLETE';
  game_type?: 'OFFICIAL' | 'SCRIMMAGE';
  id: string;
  category_name: string;
  category_color: string | null;
  field_name: string | null;
  scheduled_time: string | null;
  status: GameStatus;
  home_team_id: string;
  away_team_id: string;
  home_score: number | null;
  away_score: number | null;
  home_team_name: string;
  home_short_name: string | null;
  home_logo_url: string | null;
  home_color: string | null;
  away_team_name: string;
  away_short_name: string | null;
  away_logo_url: string | null;
  away_color: string | null;
  touchdowns: Array<{ team_id: string; points: number; quantity?: number; quarter: number | null; created_at: string }>;
}

export interface JornadaPublica {
  season: { id: string; name: string; year: number };
  round: {
    id: string;
    number: number;
    name: string | null;
    scheduled_date: string;
    status: RoundStatus;
  };
  games: PartidoPublico[];
  byes: Array<{
    team_id: string;
    team_name: string;
    short_name: string | null;
    logo_url: string | null;
    category_name: string;
  }>;
}

const Equipo = ({
  nombre,
  corto,
  logo,
  color,
  puntos,
  local,
  ganador,
}: {
  nombre: string;
  corto: string | null;
  logo: string | null;
  color: string | null;
  puntos: number | null;
  local: boolean;
  ganador: boolean;
}) => (
  <div className="public-match-team">
    <TeamCrest name={nombre} shortName={corto} logoUrl={logo} color={color ?? undefined} className="size-9 shrink-0" />
    <div className="min-w-0"><p className={`public-match-name ${ganador ? 'font-bold' : 'font-semibold'}`}>{nombre}</p><p className="public-match-side">{local ? 'Local' : 'Visitante'}{ganador && <span className="ml-2 font-semibold text-primary">Ganador</span>}</p></div>
    <span className={`public-match-score tabular ${ganador ? 'text-primary' : ''}`} aria-label={puntos == null ? 'Sin marcador' : `${puntos} puntos`}>{puntos ?? '—'}</span>
  </div>
);

export const Partido = ({ p }: { p: PartidoPublico }) => {
  const etiqueta = ETIQUETA_PARTIDO[p.status];
  const conMarcador = ['LIVE', 'FINISHED', 'WALKOVER'].includes(p.status) && p.home_score != null && p.away_score != null;
  const final = p.status === 'FINISHED' || p.status === 'WALKOVER';

  return (
    <article aria-label={`${p.home_team_name} vs ${p.away_team_name}`} className={`public-match-card ${p.status === 'LIVE' ? 'public-match-live' : ''}`}>
      <div className="public-match-heading">
        <span className="flex min-w-0 items-center gap-1.5">
          {p.category_color && (
            <span
              className="size-2 shrink-0 rounded-full"
              style={{ backgroundColor: p.category_color }}
              aria-hidden
            />
          )}
          <span className="break-words">{p.category_name}</span>
          {p.game_type === 'SCRIMMAGE' && <span className="badge badge-sm badge-info">Scrimmage</span>}
        </span>
        <span className={`badge badge-sm shrink-0 ${etiqueta.tono}`}>{etiqueta.texto}</span>
      </div>

      <div className="public-match-teams">
        <Equipo
          nombre={p.home_team_name}
          corto={p.home_short_name}
          logo={p.home_logo_url}
          color={p.home_color}
          puntos={conMarcador ? p.home_score : null}
          local
          ganador={final && conMarcador && p.home_score! > p.away_score!}
        />
        <Equipo
          nombre={p.away_team_name}
          corto={p.away_short_name}
          logo={p.away_logo_url}
          color={p.away_color}
          puntos={conMarcador ? p.away_score : null}
          local={false}
          ganador={final && conMarcador && p.away_score! > p.home_score!}
        />
      </div>
      <dl className="public-match-details"><div><dt>Hora de Cancún</dt><dd className="tabular">{p.scheduled_time || 'Por confirmar'}</dd></div><div><dt>Cancha</dt><dd>{p.field_name || 'Por confirmar'}</dd></div></dl>
      {final && p.statistics_status === 'PENDING' && <p className="mt-2 text-xs text-warning">Estadísticas pendientes</p>}
      {conMarcador && p.touchdowns?.length > 0 && (
        <div className="mt-3 border-t border-base-300 pt-2 text-xs text-base-content/70">
          <span className="font-semibold">Touchdowns:</span>{' '}
          {p.touchdowns.map((t, i) => (
            <span key={`${t.created_at}-${i}`} className="mr-2 inline-flex max-w-full flex-wrap items-center gap-1 break-words rounded bg-base-200 px-2 py-0.5 [overflow-wrap:anywhere]">
              {t.team_id === p.home_team_id ? p.home_short_name || p.home_team_name : p.away_short_name || p.away_team_name}
              {t.quarter ? ` · Q${t.quarter}` : ''}
              {(t.quantity ?? 1)>1 ? ` · ${t.quantity} TD` : ''}
            </span>
          ))}
        </div>
      )}
      <Link to={`/partido/${p.id}`} className="mt-3 flex min-h-11 items-center justify-center border-t border-base-300 text-xs font-semibold text-primary hover:bg-base-200">{p.status === 'LIVE' ? 'Ver partido en vivo' : 'Ver partido'}</Link>
    </article>
  );
};

/**
 * La jornada, sin sesión.
 *
 * Sin id en la ruta, el servidor elige la vigente. Eso es lo que hace que
 * el enlace se pegue UNA vez en el grupo y sirva toda la temporada.
 */
export default function JornadaPublicaPage() {
  const { id } = useParams<{ id?: string }>();

  const consulta = useQuery({
    queryKey: ['publico-jornada', id ?? 'vigente'],
    queryFn: ({ signal }) => api.get<JornadaPublica>(id ? `/public/round/${id}` : '/public/round', signal),
    retry: false,
    refetchInterval: 15000,
  });

  const scrimmages = useQuery({
    queryKey: ['publico-scrimmages'],
    queryFn: ({ signal }) => api.get<PartidoPublico[]>('/public/scrimmages', signal),
    retry: false,
    refetchInterval: 10000,
  });
  const pruebas = <section className="mt-5 space-y-2">
    {scrimmages.isError && <Alert tone="warning">No se pudieron actualizar los scrimmages. Se reintentará automáticamente.</Alert>}
    {!!scrimmages.data?.length && <>
      <h2 className="font-bold">Scrimmages · Hoy</h2>
      <p className="text-sm text-base-content/60">Partidos de prueba de la fecha actual. Sus resultados no cuentan para la tabla ni los rankings.</p>
      {scrimmages.data.map((p) => <Partido key={p.id} p={p} />)}
    </>}
  </section>;

  if (consulta.isLoading) return <Marco titulo="Jornada"><Spinner /></Marco>;

  if (!consulta.data) {
    return (
      <Marco titulo="Jornada">
        {(!scrimmages.data?.length || id) && <EmptyState
          icon={<IconFootball size={40} />}
          title={consulta.error instanceof ApiError && consulta.error.status === 404 ? id ? 'Jornada no encontrada' : 'Todavía no hay jornada publicada' : 'No se pudo cargar la jornada'}
          description={consulta.error?.message ?? 'Intenta nuevamente en un momento.'}
          action={consulta.error instanceof ApiError && consulta.error.status === 404 ? <Link to={id ? '/jornada' : '/tabla'} className="btn min-h-11">{id ? 'Ver jornada' : 'Ver equipos'}</Link> : <button className="btn min-h-11" onClick={() => void consulta.refetch()}>Reintentar</button>}
        />}
        {pruebas}
      </Marco>
    );
  }

  const { round, games } = consulta.data;
  const fecha = fechaTexto(round.scheduled_date, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  const titulo = round.name || `Jornada ${round.number}`;

  const mensaje =
    `${titulo} — ${fecha}\n\n` +
    games
      .map(
        (p) =>
          `${p.scheduled_time ?? ''} ${p.home_team_name} vs ${p.away_team_name}` +
          `${p.field_name ? ` · ${p.field_name}` : ''}`
      )
      .join('\n') +
    `\n\nJornada: ${window.location.origin}/jornada/${round.id}${window.location.search}`;

  return (
    <Marco
      titulo={titulo}
      subtitulo={fecha}
      acciones={<BotonCompartir texto={mensaje} />}
    >
      {consulta.isError && <Alert tone="warning">Reconectando… Se muestran los últimos resultados recibidos.</Alert>}
      <JornadaAgenda data={consulta.data} />
      <DataFreshness label="Jornada" query={consulta} />
      {pruebas}
    </Marco>
  );
}
