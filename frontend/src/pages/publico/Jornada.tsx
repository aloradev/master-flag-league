import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../../lib/api';
import { Alert, Card, EmptyState, Spinner } from '../../components/ui';
import { IconFootball } from '../../components/icons';
import { TeamCrest } from '../../components/AuthImage';
import { ETIQUETA_PARTIDO, type GameStatus, type RoundStatus } from '../../lib/competition';
import { fechaTexto } from '../../lib/format';
import { Marco, BotonCompartir } from './Marco';

interface PartidoPublico {
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
  touchdowns: Array<{ team_id: string; points: number; quarter: number | null; created_at: string }>;
}

interface JornadaPublica {
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
  alineado,
}: {
  nombre: string;
  corto: string | null;
  logo: string | null;
  color: string | null;
  puntos: number | null;
  alineado: 'izq' | 'der';
}) => (
  <div
    className={`flex min-w-0 flex-1 items-center gap-2 ${
      alineado === 'der' ? 'flex-row-reverse text-right' : ''
    }`}
  >
    <TeamCrest name={nombre} shortName={corto} logoUrl={logo} color={color ?? undefined} className="size-9" />
    <span className="min-w-0 flex-1 truncate text-sm font-medium">{nombre}</span>
    {puntos != null && <span className="tabular shrink-0 text-lg font-bold">{puntos}</span>}
  </div>
);

const Partido = ({ p }: { p: PartidoPublico }) => {
  const etiqueta = ETIQUETA_PARTIDO[p.status];
  const conMarcador = p.home_score != null && p.away_score != null;

  return (
    <Card className={`p-3 transition-shadow ${p.status === 'LIVE' ? 'border-error/60 shadow-lg shadow-error/10' : ''}`}>
      <div className="mb-2 flex items-center justify-between gap-2 text-xs text-base-content/60">
        <span className="flex min-w-0 items-center gap-1.5">
          {p.category_color && (
            <span
              className="size-2 shrink-0 rounded-full"
              style={{ backgroundColor: p.category_color }}
              aria-hidden
            />
          )}
          <span className="truncate">{p.category_name}</span>
          {p.game_type === 'SCRIMMAGE' && <span className="badge badge-sm badge-info">Scrimmage</span>}
        </span>
        <span className="flex shrink-0 items-center gap-2">
          {p.scheduled_time && <span className="tabular font-medium">{p.scheduled_time}</span>}
          {p.field_name && <span className="truncate">{p.field_name}</span>}
          <span className={`badge badge-sm ${etiqueta.tono} ${p.status === 'LIVE' ? 'animate-pulse' : ''}`}>{etiqueta.texto}</span>
        </span>
      </div>

      <div className="flex items-center gap-2">
        <Equipo
          nombre={p.home_team_name}
          corto={p.home_short_name}
          logo={p.home_logo_url}
          color={p.home_color}
          puntos={conMarcador ? p.home_score : null}
          alineado="izq"
        />
        {/* Guion al medio de los dígitos, no de la línea base: alineado
            abajo, "2 — 0" se lee como "2 _ 0". */}
        <span className="shrink-0 self-center px-1 text-base-content/30">
          {conMarcador ? '—' : 'vs'}
        </span>
        <Equipo
          nombre={p.away_team_name}
          corto={p.away_short_name}
          logo={p.away_logo_url}
          color={p.away_color}
          puntos={conMarcador ? p.away_score : null}
          alineado="der"
        />
      </div>
      {p.touchdowns?.length > 0 && (
        <div className="mt-3 border-t border-base-300 pt-2 text-xs text-base-content/70">
          <span className="font-semibold">Touchdowns:</span>{' '}
          {p.touchdowns.map((t, i) => (
            <span key={`${t.created_at}-${i}`} className="mr-2 inline-flex items-center gap-1 rounded-full bg-base-200 px-2 py-0.5">
              {t.team_id === p.home_team_id ? p.home_short_name || p.home_team_name : p.away_short_name || p.away_team_name}
              {t.quarter ? ` · Q${t.quarter}` : ''}
            </span>
          ))}
        </div>
      )}
      <Link to={`/partido/${p.id}`} className="mt-3 block text-center text-xs font-semibold text-primary">Ver partido en vivo</Link>
    </Card>
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
    queryFn: () => api.get<JornadaPublica>(id ? `/public/round/${id}` : '/public/round'),
    retry: false,
    refetchInterval: 15000,
  });

  const scrimmages = useQuery({
    queryKey: ['publico-scrimmages'],
    queryFn: () => api.get<PartidoPublico[]>('/public/scrimmages'),
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

  if (consulta.isLoading || scrimmages.isLoading) return <Marco titulo="Jornada"><Spinner /></Marco>;

  if (!consulta.data) {
    return (
      <Marco titulo="Jornada">
        {!scrimmages.data?.length && <EmptyState
          icon={<IconFootball size={40} />}
          title={consulta.error instanceof ApiError && consulta.error.status === 404 ? 'Todavía no hay jornada publicada' : 'No se pudo cargar la jornada'}
          description={consulta.error?.message ?? 'Intenta nuevamente en un momento.'}
          action={<button className="btn min-h-11" onClick={() => void consulta.refetch()}>Reintentar</button>}
        />}
        {pruebas}
      </Marco>
    );
  }

  const { round, games, byes } = consulta.data;
  const fecha = fechaTexto(round.scheduled_date, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  const titulo = round.name || `Jornada ${round.number}`;
  const enVivo = games.filter((p) => p.status === 'LIVE');
  const touchdowns = games.reduce((total, p) => total + (p.touchdowns?.length ?? 0), 0);

  const mensaje =
    `${titulo} — ${fecha}\n\n` +
    games
      .map(
        (p) =>
          `${p.scheduled_time ?? ''} ${p.home_team_name} vs ${p.away_team_name}` +
          `${p.field_name ? ` · ${p.field_name}` : ''}`
      )
      .join('\n') +
    `\n\nDetalle y tabla: ${window.location.origin}/jornada`;

  return (
    <Marco
      titulo={titulo}
      subtitulo={fecha}
      acciones={<BotonCompartir texto={mensaje} />}
    >
      {consulta.isError && <Alert tone="warning">Reconectando… Se muestran los últimos resultados recibidos.</Alert>}
      <Card className="grid grid-cols-3 gap-2 bg-primary/5 p-3 text-center">
        <div><p className="text-lg font-black tabular">{games.length}</p><p className="text-[11px] text-base-content/60">Partidos</p></div>
        <div><p className={`text-lg font-black tabular ${enVivo.length ? 'text-error' : ''}`}>{enVivo.length}</p><p className="text-[11px] text-base-content/60">En vivo</p></div>
        <div><p className="text-lg font-black tabular">{touchdowns}</p><p className="text-[11px] text-base-content/60">Touchdowns</p></div>
      </Card>
      {games.length === 0 ? (
        <Alert tone="info">Esta jornada todavía no tiene partidos.</Alert>
      ) : (
        <div className="space-y-2">
          {games.map((p) => (
            <Partido key={p.id} p={p} />
          ))}
        </div>
      )}

      {byes.length > 0 && (
        <section className="mt-5">
          <h2 className="mb-2 text-sm font-semibold text-base-content/70">Descansan</h2>
          <Card className="divide-y divide-base-300">
            {byes.map((b) => (
              <div key={b.team_id} className="flex items-center gap-2 px-3 py-2">
                <TeamCrest
                  name={b.team_name}
                  shortName={b.short_name}
                  logoUrl={b.logo_url}
                  className="size-7"
                />
                <span className="min-w-0 flex-1 truncate text-sm">{b.team_name}</span>
                <span className="shrink-0 text-xs text-base-content/50">{b.category_name}</span>
              </div>
            ))}
          </Card>
        </section>
      )}
      {pruebas}
    </Marco>
  );
}
