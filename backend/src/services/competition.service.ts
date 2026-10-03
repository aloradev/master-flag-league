import { query, withTransaction } from '../config/database.js';
import { AppError } from '../middleware/errorHandler.js';
import { query as defaultQuery } from '../config/database.js';
import { newPrefixedId } from '../utils/id.js';
import {
  pairKey,
  historialVacio,
  proponerJornada,
  type Historial,
  type Propuesta,
  type CategoriaEntrada,
} from '../lib/fixture.js';

/**
 * CATÁLOGO DE JUGADAS
 *
 * Vive en el código y no en la base porque el Modo Árbitro dibuja sus
 * botones a partir de él: la etiqueta, los puntos y de qué lado va la
 * jugada son una sola definición, y así no hay forma de que el botón
 * diga "Touchdown" y sume 3.
 *
 * `team_id` en game_events es SIEMPRE el equipo que RECIBE los puntos o
 * al que se le acredita la estadística. En el safety eso es la defensa,
 * que es la que anota; el árbitro no tiene que pensar en la inversión.
 */
export interface Jugada {
  label: string;
  points: number;
  side: 'OFFENSE' | 'DEFENSE';
  /** Si es false, la jugada se puede registrar sin señalar jugador. */
  needsPlayer: boolean;
  /** Aparece en la fila de botones grandes del Modo Árbitro. */
  primary?: boolean;
}

export const JUGADAS: Record<string, Jugada> = {
  TOUCHDOWN:     { label: 'Touchdown',        points: 6, side: 'OFFENSE', needsPlayer: true, primary: true },
  PAT_1:         { label: 'Extra de 1',       points: 1, side: 'OFFENSE', needsPlayer: true, primary: true },
  PAT_2:         { label: 'Extra de 2',       points: 2, side: 'OFFENSE', needsPlayer: true, primary: true },
  SAFETY:        { label: 'Safety',           points: 2, side: 'DEFENSE', needsPlayer: false, primary: true },
  PASS_COMPLETE: { label: 'Pase completo',    points: 0, side: 'OFFENSE', needsPlayer: true },
  RECEPTION:     { label: 'Recepción',        points: 0, side: 'OFFENSE', needsPlayer: true },
  RUSH:          { label: 'Acarreo',          points: 0, side: 'OFFENSE', needsPlayer: true },
  INTERCEPTION:  { label: 'Intercepción',     points: 0, side: 'DEFENSE', needsPlayer: true },
  PASS_DEFENDED: { label: 'Pase defendido',   points: 0, side: 'DEFENSE', needsPlayer: true },
  FLAG_PULL:     { label: 'Quite de flag',    points: 0, side: 'DEFENSE', needsPlayer: true },
};

export const esJugadaValida = (tipo: string): boolean =>
  Object.prototype.hasOwnProperty.call(JUGADAS, tipo);

// ─────────────────────────── REGLAS DE LA LIGA ────────────────────────────

export interface ReglasCompetencia {
  points_win: number;
  points_draw: number;
  points_loss: number;
  walkover_score: [number, number];
  periods: number;
  tiebreakers: string[];
}

const REGLAS_POR_OMISION: ReglasCompetencia = {
  points_win: 3,
  points_draw: 1,
  points_loss: 0,
  walkover_score: [20, 0],
  periods: 2,
  tiebreakers: ['points', 'wins', 'point_diff', 'points_for', 'head_to_head'],
};

/**
 * Lee las reglas de `settings`. Si la temporada no las tiene, se usan las
 * de omisión en lugar de fallar: una liga nueva debe poder jugar antes de
 * que alguien entre a configurarla.
 */
export const cargarReglas = async (seasonId: string, query: typeof defaultQuery = defaultQuery): Promise<ReglasCompetencia> => {
  const r = await query(
    `SELECT value FROM settings WHERE season_id = $1 AND key = 'competition'`,
    [seasonId]
  );
  return { ...REGLAS_POR_OMISION, ...(r.rows[0]?.value ?? {}) };
};

// ──────────────────────── MARCADOR DERIVADO ───────────────────────────────

/**
 * Recalcula el marcador de un partido sumando sus eventos vigentes.
 *
 * Se llama después de registrar y de anular. El marcador guardado es
 * caché: si alguna vez se desincroniza, esta función es la verdad y una
 * sola llamada lo corrige.
 */
export const refrescarMarcador = async (gameId: string, query: typeof import('../config/database.js').query = defaultQuery): Promise<{ home: number; away: number }> => {
  const partido = await query(
    `SELECT home_team_id, away_team_id, status, walkover_team_id, season_id,
            score_source, home_score, away_score FROM games WHERE id = $1`,
    [gameId]
  );
  const g = partido.rows[0];
  if (!g) return { home: 0, away: 0 };

  // Transcribir o anular estadísticas nunca modifica un resultado capturado del acta.
  if (g.score_source === 'MANUAL') return { home: g.home_score, away: g.away_score };

  // Un partido por incomparecencia no tiene eventos que sumar: el
  // marcador lo dicta el reglamento, no el campo.
  if (g.status === 'WALKOVER' && g.walkover_team_id) {
    const reglas = await cargarReglas(g.season_id, query);
    const [ganador, perdedor] = reglas.walkover_score;
    const gana = g.walkover_team_id === g.home_team_id;
    const home = gana ? ganador : perdedor;
    const away = gana ? perdedor : ganador;
    await query(`UPDATE games SET home_score = $1, away_score = $2, updated_at = NOW() WHERE id = $3`,
      [home, away, gameId]);
    return { home, away };
  }

  const suma = await query(
    `SELECT team_id, COALESCE(SUM(points), 0)::int AS puntos
     FROM game_events
     WHERE game_id = $1 AND voided_at IS NULL
     GROUP BY team_id`,
    [gameId]
  );

  const porEquipo = new Map<string, number>(suma.rows.map((r) => [r.team_id, r.puntos]));
  const home = porEquipo.get(g.home_team_id) ?? 0;
  const away = porEquipo.get(g.away_team_id) ?? 0;

  await query(`UPDATE games SET home_score = $1, away_score = $2, updated_at = NOW() WHERE id = $3`,
    [home, away, gameId]);
  return { home, away };
};

// ──────────────────────── HISTORIAL PARA EL GENERADOR ─────────────────────

/**
 * Arma el historial que necesita el generador.
 *
 * Incluye borradores guardados como compromisos; una propuesta sin guardar
 * no altera el historial. Excluye cancelaciones y playoffs.
 */
export const cargarHistorial = async (seasonId: string): Promise<Historial> => {
  const h = historialVacio();

  const partidos = await query(
    `SELECT g.home_team_id, g.away_team_id, g.field_id, g.scheduled_time
     FROM games g
     JOIN rounds r ON r.id = g.round_id
     WHERE g.season_id = $1
       AND r.status <> 'CANCELLED' AND r.round_type = 'OFFICIAL' AND r.playoff_id IS NULL
       AND COALESCE(g.game_type, 'OFFICIAL') = 'OFFICIAL'
       AND g.status <> 'CANCELLED'`,
    [seasonId]
  );

  const sube = (mapa: Record<string, number>, clave: string) => {
    mapa[clave] = (mapa[clave] ?? 0) + 1;
  };
  const sube2 = (mapa: Record<string, Record<string, number>>, a: string, b: string) => {
    mapa[a] = mapa[a] ?? {};
    mapa[a][b] = (mapa[a][b] ?? 0) + 1;
  };

  for (const p of partidos.rows) {
    sube(h.vecesEnfrentados, pairKey(p.home_team_id, p.away_team_id));
    sube(h.comoLocal, p.home_team_id);
    sube(h.comoVisitante, p.away_team_id);
    // `scheduled_time` llega como "19:00:00"; el generador compara con
    // "19:00", así que se recorta aquí y no en cinco lugares distintos.
    const hora = String(p.scheduled_time ?? '').slice(0, 5);
    if (hora) {
      sube2(h.porHorario, p.home_team_id, hora);
      sube2(h.porHorario, p.away_team_id, hora);
    }
    if (p.field_id) {
      sube2(h.porCampo, p.home_team_id, p.field_id);
      sube2(h.porCampo, p.away_team_id, p.field_id);
    }
  }

  const descansos = await query(
    `SELECT rb.team_id
     FROM round_byes rb
     JOIN rounds r ON r.id = rb.round_id
     WHERE r.season_id = $1 AND r.status <> 'CANCELLED' AND r.round_type = 'OFFICIAL' AND r.playoff_id IS NULL`,
    [seasonId]
  );
  for (const d of descansos.rows) sube(h.descansos, d.team_id);

  return h;
};

/** Categorías con sus equipos activos, tal como las quiere el generador. */
export const cargarCategoriasConEquipos = async (
  seasonId: string, query: typeof defaultQuery = defaultQuery, date?: string
): Promise<CategoriaEntrada[]> => {
  const r = await query(
    `SELECT c.id AS category_id, c.name AS category_name, c.sort_order,
            t.id AS team_id, t.name AS team_name
     FROM categories c
     LEFT JOIN teams t ON t.category_id = c.id
       AND t.season_id = c.season_id
       AND t.status = 'ACTIVE'
       AND t.team_type = 'OFFICIAL'
       AND ($2::date IS NULL OR t.competition_start_date IS NULL OR t.competition_start_date <= $2::date)
     WHERE c.season_id = $1
     ORDER BY c.sort_order, c.name, t.name`,
    [seasonId, date ?? null]
  );

  const mapa = new Map<string, CategoriaEntrada>();
  for (const row of r.rows) {
    if (!mapa.has(row.category_id)) {
      mapa.set(row.category_id, { id: row.category_id, name: row.category_name, teams: [] });
    }
    if (row.team_id) mapa.get(row.category_id)!.teams.push({ id: row.team_id, name: row.team_name });
  }
  return [...mapa.values()];
};

/** Horarios de una jornada; si no tiene, los de la temporada. */
export const cargarHorarios = async (
  seasonId: string,
  roundId?: string
): Promise<string[]> => {
  if (roundId) {
    const r = await query(
      `SELECT to_char(start_time, 'HH24:MI') AS hora
       FROM round_time_slots WHERE round_id = $1 ORDER BY sort_order, start_time`,
      [roundId]
    );
    if (r.rows.length > 0) return r.rows.map((x) => x.hora);
  }
  const s = await query(
    `SELECT value FROM settings WHERE season_id = $1 AND key = 'game_times'`,
    [seasonId]
  );
  const slots = s.rows[0]?.value?.slots;
  if (Array.isArray(slots) && slots.length > 0) return slots.map((x: string) => String(x).slice(0, 5));

  const temporada = await query(
    `SELECT to_char(default_start_time, 'HH24:MI') AS hora FROM seasons WHERE id = $1`,
    [seasonId]
  );
  return temporada.rows[0]?.hora ? [temporada.rows[0].hora] : ['19:00'];
};

// ─────────────────────────── PROPUESTA ────────────────────────────────────

/** Compromisos de campo y equipo en la fecha, incluso de borradores guardados. */
async function reservasDeFecha(seasonId: string, date: string, q = query) {
  return (await q(`SELECT g.home_team_id,g.away_team_id,NULL::text AS bye_team_id,g.field_id,
    to_char(g.scheduled_time,'HH24:MI') AS time
    FROM games g JOIN rounds r ON r.id=g.round_id
    WHERE g.season_id=$1 AND r.scheduled_date=$2::date AND r.status<>'CANCELLED'
      AND g.status<>'CANCELLED' AND g.game_type='OFFICIAL'
    UNION ALL SELECT NULL,NULL,b.team_id,NULL,NULL FROM round_byes b JOIN rounds r ON r.id=b.round_id
    WHERE r.season_id=$1 AND r.scheduled_date=$2::date AND r.status<>'CANCELLED' AND r.round_type='OFFICIAL'`,[seasonId,date])).rows;
}

/** Se vuelve a comprobar al cambiar la fecha o publicar un borrador anterior. */
export async function validarIncorporacionesJornada(roundId: string, date: string, q = query) {
  const conflicts = await q(`SELECT t.name FROM teams t WHERE t.competition_start_date>$2::date AND
    (EXISTS (SELECT 1 FROM games g WHERE g.round_id=$1 AND g.status<>'CANCELLED'
      AND (g.home_team_id=t.id OR g.away_team_id=t.id))
    OR EXISTS (SELECT 1 FROM round_byes b WHERE b.round_id=$1 AND b.team_id=t.id))`,[roundId,date]);
  if (conflicts.rows.length) throw new AppError(`Hay equipos cuya incorporación es posterior a la jornada: ${conflicts.rows.map(t=>t.name).join(', ')}. Revisa la fecha o su incorporación.`,409);
}

export interface OpcionesPropuesta {
  restTeamIds?: string[];
  earliestTimes?: Record<string, string>;
  seasonId: string;
  /** Fecha de la jornada. Si no se da, se calcula a partir de la anterior. */
  scheduledDate?: string;
  /** Horarios de esta jornada. Si no se dan, los de la temporada. */
  slots?: string[];
}

/**
 * La fecha de la próxima jornada: siete días después de la última
 * publicada, o el arranque de la temporada si es la primera. Se calcula
 * porque el administrador no debería teclear una fecha que el sistema ya
 * sabe; sigue pudiendo cambiarla.
 */
const siguienteFecha = async (seasonId: string): Promise<string> => {
  const ultima = await query(
    `SELECT scheduled_date FROM rounds WHERE season_id = $1 AND round_type = 'OFFICIAL' AND playoff_id IS NULL AND status <> 'CANCELLED' ORDER BY scheduled_date DESC, number DESC LIMIT 1`,
    [seasonId]
  );
  if (ultima.rows[0]?.scheduled_date) {
    const d = new Date(ultima.rows[0].scheduled_date);
    d.setUTCDate(d.getUTCDate() + 7);
    return d.toISOString().slice(0, 10);
  }
  const t = await query(`SELECT start_date FROM seasons WHERE id = $1`, [seasonId]);
  const inicio = t.rows[0]?.start_date;
  return inicio ? new Date(inicio).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);
};

export const construirPropuesta = async (
  opciones: OpcionesPropuesta
): Promise<Propuesta & { seasonId: string }> => {
  const { seasonId } = opciones;
  await validarCupoJornadas(seasonId);
  const date = opciones.scheduledDate ?? await siguienteFecha(seasonId);
  await validarFechaJornada(seasonId, date);

  const [categorias, campos, historial, siguienteNumero] = await Promise.all([
    cargarCategoriasConEquipos(seasonId, query, date),
    query(`SELECT id, name FROM fields WHERE season_id = $1 AND status = 'ACTIVE' ORDER BY name`, [seasonId]),
    cargarHistorial(seasonId),
    query(`SELECT COALESCE(MAX(number), 0) + 1 AS n FROM rounds WHERE season_id = $1 AND round_type = 'OFFICIAL'`, [seasonId]),
  ]);

  const availability = await query("SELECT value FROM settings WHERE season_id=$1 AND key='game_times'", [seasonId]);
  const fieldSlots = { ...(availability.rows[0]?.value?.field_slots ?? {}) };
  const slots = opciones.slots?.length
    ? opciones.slots.map((s) => s.slice(0, 5))
    : await cargarHorarios(seasonId);

  const reservations = await reservasDeFecha(seasonId, date);
  const busy = new Set(reservations.flatMap(r => [r.home_team_id,r.away_team_id,r.bye_team_id].filter(Boolean)));
  for (const field of campos.rows) {
    fieldSlots[field.id] = (fieldSlots[field.id] ?? slots).filter((time: string) => !reservations.some(r => r.field_id === field.id && r.time === time));
  }
  const allTeams = await cargarCategoriasConEquipos(seasonId);
  const available = new Set(allTeams.flatMap((c) => c.teams.map((t) => t.id)));
  const rests = opciones.restTeamIds ?? [];
  const earliest = opciones.earliestTimes ?? {};
  if (!Array.isArray(rests) || rests.some((id) => !available.has(id)) ||
      typeof earliest !== 'object' || earliest === null || Array.isArray(earliest) ||
      Object.entries(earliest).some(([id, time]) => !available.has(id) || typeof time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time))) {
    throw new AppError('Revisa los equipos y horarios seleccionados: deben ser equipos oficiales disponibles para generar.', 400);
  }

  const propuesta = proponerJornada({
    roundNumber: siguienteNumero.rows[0].n,
    scheduledDate: date,
    categories: categorias.map((c) => ({ ...c, teams: c.teams.filter((t) => !rests.includes(t.id) && !busy.has(t.id)) })),
    earliestTimes: earliest,
    fields: campos.rows,
    fieldSlots,
    slots,
    history: historial,
  });

  await validarFechaJornada(seasonId, propuesta.scheduledDate);
  for (const cat of categorias) for (const team of cat.teams.filter((t) => rests.includes(t.id) && !busy.has(t.id))) {
    propuesta.byes.push({ teamId: team.id, teamName: team.name, categoryId: cat.id,
      categoryName: cat.name, reason: 'MANUAL', totalAfter: (historial.descansos[team.id] ?? 0) + 1 });
  }

  const eligible = new Set(categorias.flatMap(c => c.teams.map(t => t.id)));
  const future = allTeams.flatMap(c => c.teams).filter(t => !eligible.has(t.id));
  if (future.length) propuesta.warnings.push(`Aún no se incorporan en esta fecha: ${future.map(t => t.name).join(', ')}. No se les asigna partido ni descanso.`);
  if (busy.size) propuesta.warnings.push('Se respetaron los equipos y horarios ya asignados en esta fecha, incluidos borradores.');
  propuesta.warnings.push('La propuesta agrega una jornada; no modifica partidos existentes. Los equipos sin fecha de incorporación confirmada se consideran disponibles.');

  return { ...propuesta, seasonId };
};

export const validarFechaJornada = async (seasonId: string, date: string, q = query): Promise<void> => {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) {
    throw new AppError('Indica una fecha válida para la jornada', 400);
  }
  const result = await q(`SELECT to_char(start_date, 'YYYY-MM-DD') AS start,
    to_char(end_date, 'YYYY-MM-DD') AS finish FROM seasons WHERE id = $1`, [seasonId]);
  const season = result.rows[0];
  if (!season) throw new AppError('Temporada no encontrada', 404);
  if (date < season.start || (season.finish && date > season.finish)) {
    throw new AppError('La fecha de jornada debe estar dentro del periodo de la temporada', 400);
  }
};

/**
 * Guarda la propuesta como jornada en borrador.
 *
 * Todo dentro de una transacción: una jornada a medio guardar —con
 * partidos pero sin descansos— haría que el siguiente generador contara
 * mal el historial y arrastrara el error a toda la temporada.
 */
async function validarCupoJornadas(seasonId: string, executor: typeof defaultQuery = defaultQuery) {
  const result = await executor(`SELECT st.value->>'rounds_planned' AS planned,
    (SELECT count(*) FROM rounds r WHERE r.season_id=$1 AND r.round_type='OFFICIAL'
      AND r.playoff_id IS NULL AND r.status <> 'CANCELLED') AS total
    FROM settings st WHERE st.season_id=$1 AND st.key='competition'`, [seasonId]);
  const row = result.rows[0];
  if (Number(row?.planned) > 0 && Number(row.total) >= Number(row.planned)) throw new AppError('Ya se alcanzaron las jornadas configuradas. Ajusta el calendario de temporada si necesitas más.', 409);
}

export const guardarPropuesta = async (
  propuesta: Propuesta & { seasonId: string; manual?: boolean },
  userId: string
): Promise<string> => {
  const roundId = newPrefixedId('round');
  if (propuesta.games.some((g) => !g.fieldId || !g.time)) {
    throw new AppError('Hay partidos sin horario compatible. Ajusta la disponibilidad y recalcula.', 400);
  }

  return withTransaction(async (query) => {
    const season = await query(`SELECT s.id FROM seasons s JOIN users u ON u.league_id=s.league_id
      WHERE s.id=$1 AND u.id=$2 FOR UPDATE OF s`, [propuesta.seasonId, userId]);
    if (!season.rows.length) throw new AppError('Temporada no encontrada', 404);
    await validarCupoJornadas(propuesta.seasonId, query);
    if (!Array.isArray(propuesta.byes)) throw new AppError('Descansos inválidos', 400);
    await validarFechaJornada(propuesta.seasonId, propuesta.scheduledDate, query);
    const categories = await cargarCategoriasConEquipos(propuesta.seasonId, query, propuesta.scheduledDate);
    const teams = new Map(categories.flatMap((c) => c.teams.map((t) => [t.id, c.id] as const)));
    const fields = await query("SELECT id FROM fields WHERE season_id=$1 AND status='ACTIVE'", [propuesta.seasonId]);
    const reservations = await reservasDeFecha(propuesta.seasonId, propuesta.scheduledDate, query);
    const reserved = new Set<string>(reservations.flatMap(r => [r.home_team_id,r.away_team_id,r.bye_team_id].filter(Boolean)));
    const used = new Set<string>();
    const occupied = new Set<string>(reservations.filter(r => r.field_id).map(r => `${r.field_id}:${r.time}`));
    const reserve = (id: string, category: string) => {
      if (!teams.has(id) || teams.get(id) !== category || reserved.has(id) || (!propuesta.manual && used.has(id))) throw new AppError('Revisa los equipos: deben estar activos e incorporados para la fecha, ser de la misma categoría y no tener otra asignación ese día. Actualiza la propuesta.', 400);
      used.add(id);
    };
    for (const g of propuesta.games) {
      if (g.homeTeamId === g.awayTeamId) throw new AppError('Los equipos deben ser distintos', 400);
      reserve(g.homeTeamId, g.categoryId); reserve(g.awayTeamId, g.categoryId);
      const slot = `${g.fieldId}:${g.time}`;
      if (!fields.rows.some((f) => f.id === g.fieldId) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(g.time ?? '') || occupied.has(slot)) throw new AppError('Campo u horario inválido u ocupado por otro partido.', 400);
      occupied.add(slot);
    }
    for (const b of propuesta.byes) {
      reserve(b.teamId, b.categoryId);
      if (!['MANUAL','CAPACITY','ODD_TEAMS'].includes(b.reason)) throw new AppError('Motivo de descanso inválido', 400);
    }
    const next = await query("SELECT COALESCE(MAX(number),0)+1 AS n FROM rounds WHERE season_id=$1 AND round_type='OFFICIAL'", [propuesta.seasonId]);
    propuesta.roundNumber = next.rows[0].n;
    await validarFechaJornada(propuesta.seasonId, propuesta.scheduledDate, query);
    await query(
      `INSERT INTO rounds (id, season_id, number, name, scheduled_date, status, generated_by, allow_team_repeats)
       VALUES ($1, $2, $3, $4, $5, 'DRAFT', $6, $7)`,
      [
        roundId,
        propuesta.seasonId,
        propuesta.roundNumber,
        `Jornada ${propuesta.roundNumber}`,
        propuesta.scheduledDate,
        userId,
        Boolean(propuesta.manual),
      ]
    );

    const horarios = [...new Set(propuesta.games.map((g) => g.time).filter(Boolean))].sort();
    for (let i = 0; i < horarios.length; i++) {
      await query(
        `INSERT INTO round_time_slots (id, round_id, start_time, sort_order) VALUES ($1, $2, $3, $4)`,
        [newPrefixedId('slot'), roundId, horarios[i], i]
      );
    }

    for (const g of propuesta.games) {
      await query(
        `INSERT INTO games (id, season_id, round_id, category_id, field_id,
                            home_team_id, away_team_id, scheduled_time)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          newPrefixedId('game'),
          propuesta.seasonId,
          roundId,
          g.categoryId,
          g.fieldId,
          g.homeTeamId,
          g.awayTeamId,
          g.time,
        ]
      );
    }

    for (const b of propuesta.byes) {
      await query(
        `INSERT INTO round_byes (id, round_id, team_id, reason) VALUES ($1, $2, $3, $4)`,
        [newPrefixedId('bye'), roundId, b.teamId, b.reason]
      );
    }

    return roundId;
  });
};

// ───────────────────────── TABLA DE POSICIONES ────────────────────────────

export interface FilaPosiciones {
  team_id: string;
  team_name: string;
  short_name: string | null;
  logo_url: string | null;
  category_id: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  points_for: number;
  points_against: number;
  point_diff: number;
  points: number;
  /** Racha actual, p. ej. "G3" o "P1". */
  streak: string;
  /** Últimos cinco resultados, del más reciente al más antiguo. */
  form: ('W' | 'D' | 'L')[];
  position: number;
}

/**
 * La tabla se CALCULA, no se guarda.
 *
 * El documento de arquitectura contemplaba una tabla `standings`, pero
 * una copia se desincroniza: basta corregir el marcador de un partido de
 * la jornada 3 para que las posiciones queden mintiendo hasta que alguien
 * recuerde recalcularlas. Calcularla en cada consulta cuesta una consulta
 * con índice y no puede mentir nunca.
 */
export const calcularPosiciones = async (
  seasonId: string,
  categoryId?: string
): Promise<FilaPosiciones[]> => {
  const reglas = await cargarReglas(seasonId);

  const r = await query(
    `WITH resultados AS (
       SELECT g.category_id, g.home_team_id AS team_id, g.away_team_id AS rival_id,
              g.home_score AS pf, g.away_score AS pa, ro.number AS jornada
       FROM games g JOIN rounds ro ON ro.id = g.round_id
       WHERE g.season_id = $1 AND g.status IN ('FINISHED', 'WALKOVER') AND ro.playoff_id IS NULL
         AND COALESCE(g.game_type, 'OFFICIAL') = 'OFFICIAL'
       UNION ALL
       SELECT g.category_id, g.away_team_id, g.home_team_id,
              g.away_score, g.home_score, ro.number
       FROM games g JOIN rounds ro ON ro.id = g.round_id
       WHERE g.season_id = $1 AND g.status IN ('FINISHED', 'WALKOVER') AND ro.playoff_id IS NULL
         AND COALESCE(g.game_type, 'OFFICIAL') = 'OFFICIAL'
     )
     SELECT t.id AS team_id, t.name AS team_name, t.short_name, t.logo_url, t.category_id,
            COUNT(r.team_id)::int                                  AS played,
            COUNT(*) FILTER (WHERE r.pf >  r.pa)::int              AS wins,
            COUNT(*) FILTER (WHERE r.pf =  r.pa)::int              AS draws,
            COUNT(*) FILTER (WHERE r.pf <  r.pa)::int              AS losses,
            COALESCE(SUM(r.pf), 0)::int                            AS points_for,
            COALESCE(SUM(r.pa), 0)::int                            AS points_against,
            COALESCE(
              json_agg(
                json_build_object('jornada', r.jornada, 'pf', r.pf, 'pa', r.pa, 'rival', r.rival_id)
                ORDER BY r.jornada DESC
              ) FILTER (WHERE r.team_id IS NOT NULL),
              '[]'
            ) AS historial
     FROM teams t
     LEFT JOIN resultados r ON r.team_id = t.id
     WHERE t.season_id = $1
       AND t.status = 'ACTIVE'
       AND t.team_type = 'OFFICIAL'
       AND ($2::text IS NULL OR t.category_id = $2)
     GROUP BY t.id, t.name, t.short_name, t.logo_url, t.category_id
     ORDER BY t.name`,
    [seasonId, categoryId ?? null]
  );

  const filas = r.rows.map((row) => {
    const historial: { jornada: number; pf: number; pa: number; rival: string }[] = row.historial;
    const resultado = (x: { pf: number; pa: number }): 'W' | 'D' | 'L' =>
      x.pf > x.pa ? 'W' : x.pf === x.pa ? 'D' : 'L';

    let streak = '—';
    if (historial.length > 0) {
      const ultimo = resultado(historial[0]);
      let n = 0;
      for (const x of historial) {
        if (resultado(x) !== ultimo) break;
        n++;
      }
      streak = `${ultimo === 'W' ? 'G' : ultimo === 'D' ? 'E' : 'P'}${n}`;
    }

    return {
      team_id: row.team_id,
      team_name: row.team_name,
      short_name: row.short_name,
      logo_url: row.logo_url,
      category_id: row.category_id,
      played: row.played,
      wins: row.wins,
      draws: row.draws,
      losses: row.losses,
      points_for: row.points_for,
      points_against: row.points_against,
      point_diff: row.points_for - row.points_against,
      points:
        row.wins * reglas.points_win +
        row.draws * reglas.points_draw +
        row.losses * reglas.points_loss,
      streak,
      form: historial.slice(0, 5).map(resultado),
      historial,
      position: 0,
    };
  });

  /**
   * El desempate por enfrentamiento directo no se puede resolver en SQL
   * con una sola pasada: depende de quiénes hayan quedado empatados, que
   * es justo lo que se sabe al final. Así que el orden se termina aquí,
   * con los criterios que la liga tenga configurados.
   */
  const directo = (a: typeof filas[0], b: typeof filas[0]): number => {
    const deA = a.historial.filter((x) => x.rival === b.team_id);
    if (deA.length === 0) return 0;
    const gA = deA.filter((x) => x.pf > x.pa).length;
    const gB = deA.filter((x) => x.pf < x.pa).length;
    if (gA !== gB) return gB - gA;
    const difA = deA.reduce((s, x) => s + x.pf - x.pa, 0);
    return -difA;
  };

  const criterio: Record<string, (a: typeof filas[0], b: typeof filas[0]) => number> = {
    points: (a, b) => b.points - a.points,
    wins: (a, b) => b.wins - a.wins,
    point_diff: (a, b) => b.point_diff - a.point_diff,
    points_for: (a, b) => b.points_for - a.points_for,
    head_to_head: directo,
  };

  // Formato clásico MFL: la tabla se ordena por victorias y diferencia.
  // Los puntos quedan calculados para compatibilidad, pero no participan.
  const criteriosActivos = reglas.tiebreakers.filter((nombre) => nombre !== 'points');
  filas.sort((a, b) => {
    for (const nombre of criteriosActivos) {
      const fn = criterio[nombre];
      if (!fn) continue;
      const d = fn(a, b);
      if (d !== 0) return d;
    }
    // Último recurso estable: el nombre. Sin esto, dos equipos idénticos
    // cambiarían de lugar entre consultas y parecería un error.
    return a.team_name.localeCompare(b.team_name, 'es');
  });

  return filas.map(({ historial: _h, ...fila }, i) => ({ ...fila, position: i + 1 }));
};
