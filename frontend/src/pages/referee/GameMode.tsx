import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Alert, Button, Card, Spinner } from '../../components/ui';
import { IconCheckCircle, IconCircleX, IconWarning } from '../../components/icons';
import { TeamCrest } from '../../components/AuthImage';
import { useContador } from '../../lib/motion';
import {
  competition,
  hora12,
  nombreCompleto,
  type GameDetail,
  type GameEvent,
  type Jugada,
  type RosterPlayer,
} from '../../lib/competition';

/** Cada cuántos milisegundos se pregunta por lo que registró el otro árbitro. */
const SONDEO_MS = 4000;

type Hoja =
  | { tipo: 'jugador'; teamId: string; eventType: string }
  | { tipo: 'estadistica'; teamId: string }
  | { tipo: 'cerrar' }
  | null;

/**
 * MODO ÁRBITRO
 *
 * Se diseñó para una sola mano, de pie, con sol en la pantalla y sin
 * tiempo: el marcador ocupa la mitad de arriba y las jugadas que se
 * registran cada minuto son botones grandes. Todo lo demás —estadísticas
 * detalladas, bitácora, cierre— vive detrás de un toque, porque estorba
 * al árbitro que solo necesita anotar el touchdown que acaba de pasar.
 */
const GameMode = ({ client = competition, temporary = false }: { client?: typeof competition; temporary?: boolean }) => {
  const competition = client;
  const { id = '' } = useParams();
  const navigate = useNavigate();

  const [game, setGame] = useState<GameDetail | null>(null);
  const [score, setScore] = useState({ home: 0, away: 0 });
  const [events, setEvents] = useState<GameEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [hoja, setHoja] = useState<Hoja>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [bitacora, setBitacora] = useState(false);
  const [mvpOfensivo, setMvpOfensivo] = useState('');
  const [mvpDefensivo, setMvpDefensivo] = useState('');

  // Marca de tiempo del servidor: se pregunta "desde" aquí para recibir
  // solo lo nuevo. El reloj del celular no sirve, puede ir desfasado.
  const desde = useRef<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      const d = await competition.game(id);
      setGame(d);
      setScore({ home: d.home_score, away: d.away_score });
      setEvents(d.events);
      setMvpOfensivo(d.mvp_offensive_player_id ?? '');
      setMvpDefensivo(d.mvp_defensive_player_id ?? '');
      desde.current = new Date().toISOString();
    } catch (e) {
      setError((e as Error).message);
    }
  }, [id, competition]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  // ── Sincronización con el otro árbitro ──
  const enVivo = game?.status === 'LIVE';
  useEffect(() => {
    if (!enVivo) return;
    let vigente = true;

    const tic = async () => {
      try {
        const live = await competition.live(id, desde.current ?? undefined);
        if (!vigente) return;
        desde.current = live.server_time;
        setScore({ home: live.home_score, away: live.away_score });
        if (live.changes.length > 0) {
          setEvents((previos) => {
            const mapa = new Map(previos.map((e) => [e.id, e]));
            for (const c of live.changes) mapa.set(c.id, c);
            return [...mapa.values()].sort((a, b) => b.created_at.localeCompare(a.created_at));
          });
        }
        if (live.status !== 'LIVE') void cargar();
      } catch {
        // Un sondeo perdido no es un error que valga interrumpir el
        // partido: en la cancha la señal se cae y vuelve. El siguiente
        // intento traerá lo que faltó, porque `desde` no avanzó.
      }
    };

    const reloj = setInterval(tic, SONDEO_MS);
    return () => {
      vigente = false;
      clearInterval(reloj);
    };
  }, [enVivo, id, cargar, competition]);

  const jugadasPrincipales = useMemo(
    () =>
      Object.entries(game?.plays ?? {}).filter(([, j]) => j.primary) as [string, Jugada][],
    [game]
  );
  const jugadasDetalle = useMemo(
    () =>
      Object.entries(game?.plays ?? {}).filter(([, j]) => !j.primary) as [string, Jugada][],
    [game]
  );

  const plantillaDe = (teamId: string): RosterPlayer[] =>
    teamId === game?.home_team_id ? game.rosters.home : (game?.rosters.away ?? []);

  const nombreDe = (teamId: string) =>
    teamId === game?.home_team_id ? game.home_team_name : (game?.away_team_name ?? '');

  // ── Acciones ──

  const arrancar = async () => {
    setOcupado('start');
    setError(null);
    try {
      await competition.startGame(id);
      await cargar();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setOcupado(null);
    }
  };

  const tocarJugada = (teamId: string, eventType: string) => {
    const jugada = game?.plays[eventType];
    if (!jugada) return;
    setAviso(null);
    setError(null);
    // Lo que no necesita jugador se registra de una vez: obligar a elegir
    // a alguien para un safety sería inventar un dato.
    if (!jugada.needsPlayer || game?.game_type === 'SCRIMMAGE') void registrar(teamId, eventType);
    else setHoja({ tipo: 'jugador', teamId, eventType });
  };

  const registrar = async (teamId: string, eventType: string, playerId?: string) => {
    setOcupado(`${eventType}:${playerId ?? teamId}`);
    setError(null);
    try {
      const r = await competition.addEvent(id, { eventType, teamId, playerId });
      setScore(r.score);
      setAviso(
        `${r.label} de ${nombreDe(teamId)}${r.points ? ` · +${r.points}` : ''}`
      );
      setHoja(null);
      // Se recarga la bitácora para que el otro árbitro y este vean lo
      // mismo sin esperar el siguiente sondeo.
      const live = await competition.live(id);
      desde.current = live.server_time;
      setEvents(live.changes);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setOcupado(null);
    }
  };

  const deshacer = async (eventId: string) => {
    setOcupado(`void:${eventId}`);
    setError(null);
    try {
      const r = await competition.voidEvent(id, eventId);
      if (r.score) setScore(r.score);
      const live = await competition.live(id);
      desde.current = live.server_time;
      setEvents(live.changes);
      setAviso('Jugada anulada');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setOcupado(null);
    }
  };

  const cerrar = async () => {
    setOcupado('finish');
    setError(null);
    try {
      await competition.finishGame(id, {
        mvpOffensivePlayerId: mvpOfensivo || null,
        mvpDefensivePlayerId: mvpDefensivo || null,
      });
      setHoja(null);
      await cargar();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setOcupado(null);
    }
  };

  if (error && !game) return <Alert tone="error">{error}</Alert>;
  if (!game) return <Spinner label="Abriendo el partido…" />;

  const vigentes = events.filter((e) => !e.voided_at);
  const ultima = vigentes[0];
  const terminado = game.status === 'FINISHED' || game.status === 'WALKOVER';

  return (
    <div className="space-y-4 pb-24">
      {/* ─────────────── MARCADOR ─────────────── */}
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-base-300/60 px-4 py-2 text-xs">
          <span className="font-semibold" style={{ color: game.category_color }}>
            {game.category_name}
          </span>
          <span className="text-base-content/60">
            {game.field_name ?? 'Sin campo'} · {hora12(game.scheduled_time)}
          </span>
          <span
            className={`badge badge-sm ${
              game.status === 'LIVE' ? 'badge-error animate-pulse' : 'badge-ghost'
            }`}
          >
            {game.status === 'LIVE' ? 'EN VIVO' : terminado ? 'FINAL' : 'POR INICIAR'}
          </span>
        </div>

        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-4 py-5">
          <div className="flex flex-col items-center gap-2 text-center">
            <TeamCrest
              name={game.home_team_name}
              shortName={game.home_short_name}
              logoUrl={game.home_logo_url}
              color={game.home_color ?? undefined}
              className="size-14"
            />
            <p className="text-sm font-bold leading-tight">{game.home_team_name}</p>
          </div>

          {/* items-center y no items-baseline: alineado a la base, el guion
              queda por debajo de los dígitos y se lee "2 _ 0". */}
          <Marcador home={score.home} away={score.away} />

          <div className="flex flex-col items-center gap-2 text-center">
            <TeamCrest
              name={game.away_team_name}
              shortName={game.away_short_name}
              logoUrl={game.away_logo_url}
              color={game.away_color ?? undefined}
              className="size-14"
            />
            <p className="text-sm font-bold leading-tight">{game.away_team_name}</p>
          </div>
        </div>

        {game.referees.length > 0 && (
          <p className="border-t border-base-300/60 px-4 py-2 text-center text-xs text-base-content/60">
            {game.referees
              .map((r) => `${r.role === 'PRINCIPAL' ? 'Árbitro 1' : 'Árbitro 2'}: ${r.name}`)
              .join('  ·  ')}
          </p>
        )}
      </Card>

      {error && (
        <div className="mfl-aviso">
          <Alert tone="error">{error}</Alert>
        </div>
      )}
      {aviso && !error && (
        // `key` con el texto para que la animación se repita en cada
        // jugada: sin ella, React reutiliza el nodo y el segundo
        // touchdown seguido no se anunciaría con movimiento.
        <div className="mfl-aviso" key={aviso}>
          <Alert tone="success">{aviso}</Alert>
        </div>
      )}

      {/* ─────────────── ACCIÓN PRINCIPAL ─────────────── */}
      {game.status === 'SCHEDULED' && (
        <Button
          tone="primary"
          block
          className="min-h-11"
          loading={ocupado === 'start'}
          onClick={arrancar}
        >
          Iniciar partido
        </Button>
      )}

      {terminado && (
        <Alert tone="success" title="Partido cerrado">
          {game.game_type === 'SCRIMMAGE'
            ? 'El resultado del scrimmage quedó guardado. Gracias por registrar el partido.'
            : 'El resultado ya está en la tabla de posiciones. Si algo quedó mal, avisa a administración.'}
        </Alert>
      )}

      {game.status === 'LIVE' && (
        <>
          {/* Botones grandes, dos columnas: una por equipo. */}
          <div className="grid grid-cols-2 gap-3">
            {[game.home_team_id, game.away_team_id].map((teamId) => (
              <div key={teamId} className="space-y-2">
                <p className="truncate text-center text-xs font-semibold text-base-content/60">
                  {teamId === game.home_team_id
                    ? (game.home_short_name ?? game.home_team_name)
                    : (game.away_short_name ?? game.away_team_name)}
                </p>
                {jugadasPrincipales.map(([tipo, jugada]) => (
                  <button
                    key={tipo}
                    type="button"
                    onClick={() => tocarJugada(teamId, tipo)}
                    disabled={Boolean(ocupado)}
                    className="btn mfl-toque h-16 w-full flex-col gap-0 border-base-300
                               bg-base-100 text-base font-bold hover:bg-primary
                               hover:text-primary-content disabled:opacity-60"
                  >
                    <span>{jugada.label}</span>
                    {jugada.points > 0 && (
                      <span className="text-xs font-normal opacity-70">+{jugada.points}</span>
                    )}
                  </button>
                ))}
              </div>
            ))}
          </div>

          {/* 44 px de alto como mínimo (`min-h-11`): es la medida que
              recomiendan iOS y las pautas de accesibilidad para un blanco
              táctil, y estos botones se tocan de pie, con guantes de frío
              o con sol encima. Por omisión median 40. */}
          <div className="grid grid-cols-2 gap-3">
            <Button
              tone="secondary"
              outline
              className="min-h-11"
              onClick={() => setHoja({ tipo: 'estadistica', teamId: game.home_team_id })}
            >
              Estadísticas
            </Button>
            <Button
              tone="error"
              outline
              className="min-h-11"
              disabled={!ultima}
              loading={ocupado === `void:${ultima?.id}`}
              onClick={() => ultima && deshacer(ultima.id)}
            >
              Deshacer
            </Button>
          </div>

          {ultima && (
            <p className="text-center text-xs text-base-content/50">
              Última jugada: {ultima.label}
              {ultima.player_name ? ` · ${ultima.player_name}` : ''}
              {ultima.recorded_by_name ? ` · registró ${ultima.recorded_by_name}` : ''}
            </p>
          )}

          <Button
            tone="primary"
            block
            className="min-h-11"
            onClick={() => setHoja({ tipo: 'cerrar' })}
          >
            Finalizar partido
          </Button>
        </>
      )}

      {/* ─────────────── BITÁCORA ─────────────── */}
      <Card>
        <button
          type="button"
          onClick={() => setBitacora((v) => !v)}
          className="flex w-full items-center justify-between px-4 py-3 text-sm font-semibold"
        >
          <span>Bitácora del partido</span>
          <span className="text-base-content/50">
            {vigentes.length} {vigentes.length === 1 ? 'jugada' : 'jugadas'}
          </span>
        </button>

        {bitacora && (
          <div className="border-t border-base-300/60">
            {events.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-base-content/50">
                Todavía no se registra ninguna jugada.
              </p>
            ) : (
              <ul className="divide-y divide-base-300/50">
                {events.map((e) => (
                  <li
                    key={e.id}
                    className={`flex items-center gap-3 px-4 py-2 text-sm ${
                      e.voided_at ? 'opacity-45' : ''
                    }`}
                  >
                    <span className="tabular w-10 shrink-0 text-xs text-base-content/50">
                      {e.points > 0 ? `+${e.points}` : '—'}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={e.voided_at ? 'line-through' : 'font-medium'}>
                        {e.label}
                      </span>
                      <span className="block truncate text-xs text-base-content/55">
                        {[
                          e.player_name && `#${e.jersey_number ?? '—'} ${e.player_name}`,
                          nombreDe(e.team_id),
                          e.recorded_by_name,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </span>
                    {!e.voided_at && game.status === 'LIVE' && (
                      <Button
                        size="xs"
                        tone="ghost"
                        loading={ocupado === `void:${e.id}`}
                        onClick={() => deshacer(e.id)}
                      >
                        Anular
                      </Button>
                    )}
                    {e.voided_at && (
                      <span className="badge badge-ghost badge-sm shrink-0">Anulada</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Card>

      {/* ─────────────── HOJAS INFERIORES ─────────────── */}
      {hoja?.tipo === 'jugador' && (
        <HojaJugadores
          titulo={game.plays[hoja.eventType]?.label ?? 'Jugada'}
          equipo={nombreDe(hoja.teamId)}
          jugadores={plantillaDe(hoja.teamId)}
          ocupado={ocupado}
          onElegir={(playerId) => registrar(hoja.teamId, hoja.eventType, playerId)}
          onCerrar={() => setHoja(null)}
        />
      )}

      {hoja?.tipo === 'estadistica' && (
        <HojaEstadisticas
          game={game}
          teamId={hoja.teamId}
          jugadas={jugadasDetalle}
          ocupado={ocupado}
          onEquipo={(teamId) => setHoja({ tipo: 'estadistica', teamId })}
          onRegistrar={(eventType, playerId) => registrar(hoja.teamId, eventType, playerId)}
          onCerrar={() => setHoja(null)}
        />
      )}

      {hoja?.tipo === 'cerrar' && (
        <HojaCierre
          game={game}
          score={score}
          mvpOfensivo={mvpOfensivo}
          mvpDefensivo={mvpDefensivo}
          setMvpOfensivo={setMvpOfensivo}
          setMvpDefensivo={setMvpDefensivo}
          ocupado={ocupado}
          onConfirmar={cerrar}
          onCerrar={() => setHoja(null)}
        />
      )}

      {terminado && !temporary && (
        <Button tone="ghost" block onClick={() => navigate('/arbitro')}>
          Volver a mis partidos
        </Button>
      )}
    </div>
  );
};

// ─────────────────────────────── MARCADOR ─────────────────────────────────

/**
 * El marcador, con el número contando hasta su nuevo valor y un destello
 * en el lado que anotó.
 *
 * Es la única animación de esta pantalla que existe por una razón
 * funcional y no estética: el cambio puede venir del OTRO árbitro y
 * llegar por sondeo, sin que este haya tocado nada. Sin movimiento, un
 * 14 que se vuelve 20 pasa desapercibido.
 */
const Marcador = ({ home, away }: { home: number; away: number }) => {
  const local = useContador(home);
  const visita = useContador(away);

  return (
    <div className="tabular flex items-center gap-3 text-5xl font-black leading-none">
      <span className={local.cambio ? 'mfl-anoto inline-block' : 'inline-block'}>
        {local.mostrado}
      </span>
      <span className="text-3xl font-light text-base-content/25">—</span>
      <span className={visita.cambio ? 'mfl-anoto inline-block' : 'inline-block'}>
        {visita.mostrado}
      </span>
    </div>
  );
};

// ─────────────────────────── HOJA: JUGADORES ──────────────────────────────

/**
 * Rejilla de números de camiseta.
 *
 * Se muestra el número grande y el nombre chico porque en la cancha el
 * árbitro vio un número, no una cara. El semáforo va en el mismo botón:
 * un jugador no elegible se ve rojo y no se puede tocar, así que el
 * rechazo ocurre antes del toque y no como un error después.
 */
const HojaJugadores = ({
  titulo,
  equipo,
  jugadores,
  ocupado,
  onElegir,
  onCerrar,
}: {
  titulo: string;
  equipo: string;
  jugadores: RosterPlayer[];
  ocupado: string | null;
  onElegir: (playerId: string) => void;
  onCerrar: () => void;
}) => {
  const elegibles = jugadores.filter((j) => j.is_eligible);
  const noElegibles = jugadores.filter((j) => !j.is_eligible);

  return (
    <Hoja titulo={`${titulo} · ${equipo}`} onCerrar={onCerrar}>
      {jugadores.length === 0 && (
        <Alert tone="warning">Este equipo no tiene jugadores registrados.</Alert>
      )}

      {elegibles.length > 0 && (
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
          {elegibles.map((j) => (
            <button
              key={j.id}
              type="button"
              disabled={Boolean(ocupado)}
              onClick={() => onElegir(j.id)}
              className="mfl-toque flex flex-col items-center gap-1 rounded-box
                         border border-success/40 bg-success/5 px-1 py-2
                         transition-colors hover:bg-success/20 disabled:opacity-50"
            >
              <span className="tabular text-xl font-black leading-none">
                {j.jersey_number ?? '—'}
              </span>
              <span className="line-clamp-2 text-[10px] leading-tight text-base-content/70">
                {j.last_name_paternal}
              </span>
            </button>
          ))}
        </div>
      )}

      {noElegibles.length > 0 && (
        <div className="space-y-2">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-error">
            <IconCircleX size={14} />
            No elegibles ({noElegibles.length}) — no pueden registrar jugadas
          </p>
          <ul className="space-y-1">
            {noElegibles.map((j) => (
              <li
                key={j.id}
                className="flex items-start gap-2 rounded-field border border-error/30
                           bg-error/5 px-2 py-1.5 text-xs"
              >
                <span className="tabular w-7 shrink-0 text-center font-bold">
                  {j.jersey_number ?? '—'}
                </span>
                <span className="min-w-0">
                  <span className="block truncate font-medium">{nombreCompleto(j)}</span>
                  <span className="block text-base-content/60">
                    {j.eligibility_reason ?? 'Documentación pendiente'}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Hoja>
  );
};

// ──────────────────────── HOJA: ESTADÍSTICAS ──────────────────────────────

const HojaEstadisticas = ({
  game,
  teamId,
  jugadas,
  ocupado,
  onEquipo,
  onRegistrar,
  onCerrar,
}: {
  game: GameDetail;
  teamId: string;
  jugadas: [string, Jugada][];
  ocupado: string | null;
  onEquipo: (teamId: string) => void;
  onRegistrar: (eventType: string, playerId?: string) => void;
  onCerrar: () => void;
}) => {
  const [jugador, setJugador] = useState('');
  const plantilla = teamId === game.home_team_id ? game.rosters.home : game.rosters.away;
  const elegido = plantilla.find((p) => p.id === jugador);

  return (
    <Hoja titulo="Registrar estadística" onCerrar={onCerrar}>
      <div className="join w-full">
        {[game.home_team_id, game.away_team_id].map((tid) => (
          <button
            key={tid}
            type="button"
            onClick={() => {
              setJugador('');
              onEquipo(tid);
            }}
            className={`btn join-item flex-1 ${teamId === tid ? 'btn-primary' : ''}`}
          >
            {tid === game.home_team_id
              ? (game.home_short_name ?? game.home_team_name)
              : (game.away_short_name ?? game.away_team_name)}
          </button>
        ))}
      </div>

      <label className="block">
        <span className="mb-1 block text-xs font-semibold text-base-content/70">Jugador</span>
        <select
          className="select select-bordered w-full"
          value={jugador}
          onChange={(e) => setJugador(e.target.value)}
        >
          <option value="">Selecciona…</option>
          {plantilla.map((p) => (
            <option key={p.id} value={p.id} disabled={!p.is_eligible}>
              {p.jersey_number != null ? `#${p.jersey_number} · ` : ''}
              {nombreCompleto(p)}
              {p.is_eligible ? '' : ' — NO ELEGIBLE'}
            </option>
          ))}
        </select>
      </label>

      {elegido && (
        <div
          className={`flex items-start gap-2 rounded-field border px-3 py-2 text-xs ${
            elegido.is_eligible
              ? 'border-success/40 bg-success/10 text-success'
              : 'border-error/40 bg-error/10 text-error'
          }`}
        >
          {elegido.is_eligible ? <IconCheckCircle size={16} /> : <IconWarning size={16} />}
          <span>
            <span className="block font-semibold">
              {elegido.is_eligible ? 'Elegible' : 'No elegible'}
            </span>
            {!elegido.is_eligible && (
              <span className="block opacity-90">
                {elegido.eligibility_reason ?? 'Documentación pendiente'}
              </span>
            )}
          </span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        {jugadas.map(([tipo, jugada]) => (
          <Button
            key={tipo}
            tone="neutral"
            outline
            disabled={!jugador || !elegido?.is_eligible}
            loading={ocupado === `${tipo}:${jugador}`}
            onClick={() => onRegistrar(tipo, jugador)}
          >
            {jugada.label}
          </Button>
        ))}
      </div>
    </Hoja>
  );
};

// ─────────────────────────── HOJA: CIERRE ─────────────────────────────────

const HojaCierre = ({
  game,
  score,
  mvpOfensivo,
  mvpDefensivo,
  setMvpOfensivo,
  setMvpDefensivo,
  ocupado,
  onConfirmar,
  onCerrar,
}: {
  game: GameDetail;
  score: { home: number; away: number };
  mvpOfensivo: string;
  mvpDefensivo: string;
  setMvpOfensivo: (v: string) => void;
  setMvpDefensivo: (v: string) => void;
  ocupado: string | null;
  onConfirmar: () => void;
  onCerrar: () => void;
}) => {
  const todos = [...game.rosters.home, ...game.rosters.away].filter((p) => p.is_eligible);
  const ganador =
    score.home === score.away
      ? 'Empate'
      : score.home > score.away
        ? game.home_team_name
        : game.away_team_name;

  return (
    <Hoja titulo="Finalizar partido" onCerrar={onCerrar}>
      <Card className="px-4 py-3 text-center">
        <p className="tabular text-3xl font-black">
          {score.home} – {score.away}
        </p>
        <p className="mt-1 text-sm text-base-content/70">{ganador}</p>
        <p className="mt-2 text-xs text-base-content/50">
          El marcador sale de las jugadas registradas. Si algo no cuadra, cancela y
          corrige la jugada en la bitácora.
        </p>
      </Card>

      {[
        ['MVP ofensivo', mvpOfensivo, setMvpOfensivo] as const,
        ['MVP defensivo', mvpDefensivo, setMvpDefensivo] as const,
      ].map(([etiqueta, valor, poner]) => (
        <label key={etiqueta} className="block">
          <span className="mb-1 block text-xs font-semibold text-base-content/70">
            {etiqueta} <span className="font-normal opacity-60">(opcional)</span>
          </span>
          <select
            className="select select-bordered min-h-11 w-full"
            value={valor}
            onChange={(e) => poner(e.target.value)}
          >
            <option value="">Sin designar</option>
            {todos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.jersey_number != null ? `#${p.jersey_number} · ` : ''}
                {nombreCompleto(p)}
              </option>
            ))}
          </select>
        </label>
      ))}

      <Button
        tone="primary"
        block
        className="min-h-11"
        loading={ocupado === 'finish'}
        onClick={onConfirmar}
      >
        Confirmar y cerrar
      </Button>
      <Button tone="ghost" block className="min-h-11" onClick={onCerrar}>
        Seguir registrando
      </Button>
    </Hoja>
  );
};

// ──────────────────────── ENVOLTURA DE LAS HOJAS ──────────────────────────

/**
 * Hoja inferior.
 *
 * Sube desde abajo porque es donde alcanza el pulgar, y el fondo oscuro
 * es tocable para cerrarla: en el campo se abre por error más de una vez.
 */
const Hoja = ({
  titulo,
  children,
  onCerrar,
}: {
  titulo: string;
  children: React.ReactNode;
  onCerrar: () => void;
}) => (
  <div className="fixed inset-0 z-50 flex items-end justify-center">
    {/* El fondo cierra al tocarlo, pero se oculta del árbol de
        accesibilidad: si se anuncia como un botón "Cerrar", quien usa
        lector de pantalla oye dos controles con el mismo nombre y el
        primero es invisible. El botón visible de la cabecera ya cubre
        teclado y lectores. */}
    <div
      aria-hidden="true"
      onClick={onCerrar}
      className="mfl-fondo absolute inset-0 bg-black/60"
    />
    <div
      role="dialog"
      aria-label={titulo}
      className="mfl-hoja relative max-h-[85vh] w-full max-w-lg space-y-3
                 overflow-y-auto rounded-t-box border-t border-base-300
                 bg-base-200 p-4 shadow-2xl"
    >
      <div className="sticky -top-4 -mx-4 -mt-4 mb-1 flex items-center justify-between
                      border-b border-base-300/60 bg-base-200 px-4 py-3">
        <h2 className="text-sm font-bold">{titulo}</h2>
        <Button size="sm" tone="ghost" className="min-h-11 px-3" onClick={onCerrar}>
          Cerrar
        </Button>
      </div>
      {children}
    </div>
  </div>
);

export default GameMode;
