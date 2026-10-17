import type { Response } from 'express';
import { withLockedGame } from '../services/game-transaction.service.js';
import { query, withTransaction } from '../config/database.js';
import { AppError, asyncHandler } from '../middleware/errorHandler.js';
import { audit as writeAudit } from '../services/audit.service.js';
import { audit } from '../services/audit.service.js';
import { newPrefixedId } from '../utils/id.js';
import { ROLES, type AuthRequest } from '../middleware/auth.js';
import {
  JUGADAS,
  esJugadaValida,
  refrescarMarcador,
  cargarReglas,
} from '../services/competition.service.js';

const GAME_COLUMNS = `g.id, g.season_id, g.round_id, g.category_id, g.field_id,
  g.home_team_id, g.away_team_id, to_char(g.scheduled_time, 'HH24:MI') AS scheduled_time,
  g.status, g.game_type, g.home_score, g.away_score, g.score_source, g.statistics_status, g.walkover_team_id,
  g.mvp_offensive_player_id, g.mvp_defensive_player_id,
  g.started_at, g.ended_at, g.notes, g.created_at, g.updated_at`;

const CONTEXTO = `c.name AS category_name, c.color AS category_color,
  f.name AS field_name, f.location AS field_location,
  ro.number AS round_number, ro.scheduled_date, ro.status AS round_status,
  hl.name AS home_team_name, hl.short_name AS home_short_name,
  hl.logo_url AS home_logo_url, hl.color_primary AS home_color,
  aw.name AS away_team_name, aw.short_name AS away_short_name,
  aw.logo_url AS away_logo_url, aw.color_primary AS away_color`;

const JOINS = `JOIN categories c ON c.id = g.category_id
  JOIN rounds ro ON ro.id = g.round_id
  JOIN teams hl ON hl.id = g.home_team_id
  JOIN teams aw ON aw.id = g.away_team_id
  LEFT JOIN fields f ON f.id = g.field_id`;

const esAdmin = (req: AuthRequest) =>
  [ROLES.SUPER_ADMIN, ROLES.SPORTS_ADMIN].includes((req.user?.role ?? '') as never);

/**
 * Un árbitro solo puede tocar los partidos que le asignaron.
 *
 * Se comprueba contra `game_referees` y no contra el rol, porque el rol
 * dice "es árbitro", no "es árbitro DE ESTE partido". Sin esta distinción
 * cualquier árbitro podría modificar el marcador de una cancha en la que
 * no estuvo.
 */
const exigirPermisoDePartido = async (req: AuthRequest, gameId: string) => {
  if (req.user?.scrimmageGameId && req.user.scrimmageGameId !== gameId) {
    throw new AppError('Este enlace solo permite operar el scrimmage para el que fue creado', 403);
  }
  if (esAdmin(req)) return;
  if (req.user?.role !== ROLES.REFEREE) {
    throw new AppError('Solo árbitros y administración pueden registrar en un partido', 403);
  }
  const r = await query(
    `SELECT 1 FROM games g LEFT JOIN game_referees gr ON gr.game_id = g.id
     LEFT JOIN referees rf ON rf.id = gr.referee_id
     WHERE g.id = $1 AND ((g.game_type = 'SCRIMMAGE' AND g.id = $3) OR rf.user_id = $2)`,
    [gameId, req.user.id, req.user.scrimmageGameId ?? null]
  );
  if (r.rows.length === 0) {
    throw new AppError('No estás asignado a este partido', 403);
  }
};

const arbitrosDe = async (gameId: string) => {
  const r = await query(
    `SELECT gr.referee_id, gr.role, rf.name, rf.user_id
     FROM game_referees gr JOIN referees rf ON rf.id = gr.referee_id
     WHERE gr.game_id = $1 ORDER BY gr.role`,
    [gameId]
  );
  return r.rows;
};

const eventosDe = async (gameId: string, desde?: string) => {
  const r = await query(
    `SELECT e.id, e.team_id, e.player_id, e.event_type, e.points, e.quarter, e.yards,
            e.recorded_by, e.voided_at, e.created_at, e.quantity, e.capture_source,
            p.first_name, p.last_name_paternal, p.last_name_maternal, p.jersey_number,
            u.name AS recorded_by_name
     FROM game_events e
     LEFT JOIN players p ON p.id = e.player_id
     LEFT JOIN users u ON u.id = e.recorded_by
     WHERE e.game_id = $1
       AND ($2::timestamptz IS NULL OR e.created_at > $2 OR e.voided_at > $2)
     ORDER BY e.created_at DESC`,
    [gameId, desde ?? null]
  );
  return r.rows.map((e) => ({
    ...e,
    label: `${JUGADAS[e.event_type]?.label ?? e.event_type}${e.capture_source === 'TOTALS' ? ` × ${e.quantity} (total del acta)` : ''}`,
    // Mismo armado que en jugadores, para que un jugador se llame igual
    // en la lista de plantilla y en la bitácora del partido.
    player_name: e.player_id
      ? [e.first_name, e.last_name_paternal, e.last_name_maternal].filter(Boolean).join(' ')
      : null,
  }));
};

/** GET /api/v1/games?roundId=&teamId=&status=&seasonId= */
export const listGames = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { roundId, teamId, status, seasonId, categoryId } = req.query as Record<string, string>;

  const r = await query(
    `SELECT ${GAME_COLUMNS}, ${CONTEXTO}
     FROM games g ${JOINS}
     WHERE ($1::text IS NULL OR g.round_id = $1)
       AND ($2::text IS NULL OR g.home_team_id = $2 OR g.away_team_id = $2)
       AND ($3::text IS NULL OR g.status = $3)
       AND ($4::text IS NULL OR g.season_id = $4)
       AND ($5::text IS NULL OR g.category_id = $5)
       AND ($6::boolean OR ro.status <> 'DRAFT')
     ORDER BY ro.scheduled_date DESC, g.scheduled_time, f.name`,
    [
      roundId ?? null,
      teamId ?? null,
      status ?? null,
      seasonId ?? null,
      categoryId ?? null,
      esAdmin(req),
    ]
  );

  res.json({ success: true, data: r.rows });
});

/**
 * GET /api/v1/games/mine
 *
 * Los partidos del árbitro que consulta. Es la primera pantalla del Modo
 * Árbitro: llega al campo, abre la app y ve su partido, sin buscarlo.
 */
export const listMyGames = asyncHandler(async (req: AuthRequest, res: Response) => {
  const r = await query(
    `SELECT ${GAME_COLUMNS}, ${CONTEXTO}, gr.role AS my_role
     FROM games g ${JOINS}
     LEFT JOIN game_referees gr ON gr.game_id = g.id
     LEFT JOIN referees rf ON rf.id = gr.referee_id
     WHERE (rf.user_id = $1 OR (g.game_type = 'SCRIMMAGE' AND $2::boolean))
       AND ro.status IN ('PUBLISHED', 'IN_PROGRESS')
       AND g.status IN ('SCHEDULED', 'LIVE')
     ORDER BY ro.scheduled_date, g.scheduled_time`,
    [req.user!.id, esAdmin(req) || req.user!.role === ROLES.REFEREE]
  );
  res.json({ success: true, data: r.rows });
});

/**
 * GET /api/v1/games/:id
 *
 * Incluye las plantillas con el semáforo de elegibilidad y SIN un solo
 * dato de los documentos: el árbitro necesita saber si el jugador puede
 * jugar, no ver su identificación (req. 9 y 12).
 */
export const getGame = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  if (req.user?.scrimmageGameId && req.user.scrimmageGameId !== id) {
    throw new AppError('Este enlace solo permite consultar su scrimmage', 403);
  }

  const r = await query(
    `SELECT ${GAME_COLUMNS}, ${CONTEXTO} FROM games g ${JOINS} WHERE g.id = $1`,
    [id]
  );
  const game = r.rows[0];
  if (!game) throw new AppError('Partido no encontrado', 404);
  if (game.round_status === 'DRAFT' && !esAdmin(req)) {
    throw new AppError('Partido no encontrado', 404);
  }

  const plantilla = async (teamId: string) => {
    const p = await query(
      `SELECT id, first_name, last_name_paternal, last_name_maternal, jersey_number, position,
              is_eligible, eligibility_reason, avatar_url
       FROM players
       WHERE team_id = $1 AND removed_at IS NULL
       ORDER BY jersey_number NULLS LAST, last_name_paternal`,
      [teamId]
    );
    return p.rows;
  };

  const [homeRoster, awayRoster, referees, events, reglas] = await Promise.all([
    plantilla(game.home_team_id),
    plantilla(game.away_team_id),
    arbitrosDe(id),
    eventosDe(id),
    cargarReglas(game.season_id),
  ]);

  res.json({
    success: true,
    data: {
      ...game,
      referees,
      events,
      rosters: { home: homeRoster, away: awayRoster },
      rules: { periods: reglas.periods },
      plays: JUGADAS,
    },
  });
});

/**
 * GET /api/v1/games/:id/live?since=<ISO>
 *
 * Sincronización entre los dos árbitros por sondeo.
 *
 * Se eligió sondeo y no WebSocket porque el servicio corre en el plan
 * gratuito de Render, que duerme el proceso: una conexión persistente se
 * cae y hay que reconectarla igual. Con `since`, cada consulta devuelve
 * solo lo que cambió, así que sondear cada pocos segundos cuesta unos
 * cientos de bytes y funciona igual en una cancha con mala señal.
 */
export const getGameLive = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  if (req.user?.scrimmageGameId && req.user.scrimmageGameId !== id) {
    throw new AppError('Este enlace solo permite consultar su scrimmage', 403);
  }
  const since = req.query.since as string | undefined;

  const r = await query(
    `SELECT g.id, g.status, g.home_score, g.away_score, g.score_source, g.statistics_status, g.home_team_id, g.away_team_id,
            g.started_at, g.ended_at, g.updated_at,
            g.mvp_offensive_player_id, g.mvp_defensive_player_id
     FROM games g WHERE g.id = $1`,
    [id]
  );
  const game = r.rows[0];
  if (!game) throw new AppError('Partido no encontrado', 404);

  const cambios = await eventosDe(id, since);

  res.json({
    success: true,
    data: {
      ...game,
      changes: cambios,
      // El reloj del servidor: dos celulares con la hora desfasada no
      // deben perder eventos por preguntar "desde" un momento equivocado.
      server_time: new Date().toISOString(),
    },
  });
});

/** POST /api/v1/games/:id/start */
export const startGame = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  await exigirPermisoDePartido(req, id);
  const result = await withLockedGame(id, async (query) => {
    const audit: typeof writeAudit = (request, entry) => writeAudit(request, entry, query);

    const r = await query(`SELECT status, round_id FROM games WHERE id = $1`, [id]);
    const game = r.rows[0];
    if (!game) throw new AppError('Partido no encontrado', 404);
    if (game.status === 'LIVE') {
      // No es un error: el otro árbitro ya lo arrancó. Responder 409 haría
      // que el segundo en abrir la app viera una pantalla de fallo.
      const actual = await query(`SELECT ${GAME_COLUMNS} FROM games g WHERE g.id = $1`, [id]);
      return ({ success: true, data: actual.rows[0], already_started: true });
    }
    if (game.status !== 'SCHEDULED') throw new AppError(`El partido está ${game.status}`, 409);

    await query(
      `UPDATE games SET status = 'LIVE', started_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [id]
    );
    // La jornada pasa a "en curso" con el primer partido que arranca.
    await query(
      `UPDATE rounds SET status = 'IN_PROGRESS', updated_at = NOW()
       WHERE id = $1 AND status = 'PUBLISHED'`,
      [game.round_id]
    );

    await audit(req, { action: 'START_GAME', entityType: 'game', entityId: id });

    const actual = await query(`SELECT ${GAME_COLUMNS} FROM games g WHERE g.id = $1`, [id]);
    return ({ success: true, data: actual.rows[0] });
  });
  res.json(result);
});

/**
 * POST /api/v1/games/:id/events
 *
 * El corazón del Modo Árbitro. Body: { eventType, teamId, playerId?,
 * quarter?, yards? }
 */
export const addEvent = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  await exigirPermisoDePartido(req, id);
  const result = await withLockedGame(id, async (query) => {
    const audit: typeof writeAudit = (request, entry) => writeAudit(request, entry, query);

    const { eventType, teamId, playerId, quarter, yards } = req.body ?? {};

    if (!esJugadaValida(eventType)) {
      throw new AppError(
        `Jugada desconocida: ${eventType}. Válidas: ${Object.keys(JUGADAS).join(', ')}`,
        400
      );
    }
    const jugada = JUGADAS[eventType];

    const g = await query(
    `SELECT g.id, g.status, g.game_type, g.season_id, g.home_team_id, g.away_team_id, s.require_approval_to_play
       FROM games g JOIN seasons s ON s.id = g.season_id WHERE g.id = $1`,
      [id]
    );
    const game = g.rows[0];
    if (!game) throw new AppError('Partido no encontrado', 404);
    if (!['LIVE', 'SCHEDULED'].includes(game.status)) {
      throw new AppError(`No se puede registrar en un partido ${game.status}`, 409);
    }
    if (![game.home_team_id, game.away_team_id].includes(teamId)) {
      throw new AppError('Ese equipo no juega este partido', 400);
    }

    if (jugada.needsPlayer && !playerId && game.game_type !== 'SCRIMMAGE') {
      throw new AppError(`"${jugada.label}" necesita señalar al jugador`, 400);
    }

    if (playerId) {
      const p = await query(
        `SELECT id, first_name, last_name_paternal, team_id, is_eligible, eligibility_reason
         FROM players WHERE id = $1 AND removed_at IS NULL`,
        [playerId]
      );
      const jugador = p.rows[0];
      if (!jugador) throw new AppError('Jugador no encontrado', 404);
      if (jugador.team_id !== teamId) {
        throw new AppError('Ese jugador no pertenece al equipo señalado', 400);
      }
      /**
       * Aquí es donde el concepto de "Jugador Elegible" deja de ser un
       * adorno de la pantalla y se convierte en la regla: si la temporada
       * exige aprobación, un jugador no elegible no puede registrar
       * jugadas. El árbitro ya vio el semáforo rojo antes de elegirlo, así
       * que el rechazo no lo sorprende, y el mensaje dice por qué.
       */
      if (game.require_approval_to_play && !jugador.is_eligible) {
        throw new AppError(
          `${jugador.first_name} ${jugador.last_name_paternal} no es elegible: ` +
            `${jugador.eligibility_reason ?? 'documentación incompleta'}`,
          409
        );
      }
    }

    const eventId = newPrefixedId('evt');
    await query(
      `INSERT INTO game_events (id, game_id, team_id, player_id, event_type, points,
                                quarter, yards, recorded_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        eventId,
        id,
        teamId,
        playerId ?? null,
        eventType,
        jugada.points,
        quarter ?? null,
        yards ?? null,
        req.user!.id,
      ]
    );

    const marcador = await refrescarMarcador(id, query);


    return ({
      success: true,
      data: {
        id: eventId,
        event_type: eventType,
        label: jugada.label,
        points: jugada.points,
        team_id: teamId,
        player_id: playerId ?? null,
        score: marcador,
      },
    });
  });
  res.status(201).json(result);
});

/**
 * POST /api/v1/games/:id/events/:eventId/void
 *
 * Deshacer. Anula el evento en lugar de borrarlo: al terminar el partido
 * se puede reconstruir qué pasó y quién lo corrigió, que es exactamente
 * lo que se pregunta cuando un marcador queda en duda.
 */
export const voidEvent = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id, eventId } = req.params;
  await exigirPermisoDePartido(req, id);
  const result = await withLockedGame(id, async (query) => {
    const audit: typeof writeAudit = (request, entry) => writeAudit(request, entry, query);

    const historical = await query('SELECT score_source FROM games WHERE id=$1', [id]);
    if (historical.rows[0]?.score_source === 'MANUAL') {
      throw new AppError('Usa la captura administrativa de estadísticas históricas e indica el motivo', 409);
    }

    const r = await query(
      `SELECT * FROM game_events WHERE id = $1 AND game_id = $2`,
      [eventId, id]
    );
    const evento = r.rows[0];
    if (!evento) throw new AppError('Jugada no encontrada en este partido', 404);
    if (evento.voided_at) {
      return ({ success: true, data: { id: eventId, already_voided: true } });
    }
    const frozen = await query(`SELECT 1 FROM playoff_games pg JOIN playoffs p ON p.id = pg.playoff_id WHERE pg.game_id = $1 AND (p.stage > pg.stage OR p.champion_id IS NOT NULL)`, [id]);
    if (frozen.rows.length) throw new AppError('La fase ya avanzó. No se pueden cambiar sus resultados.', 409);

    await query(
      `UPDATE game_events SET voided_at = NOW(), voided_by = $1 WHERE id = $2`,
      [req.user!.id, eventId]
    );
    const marcador = await refrescarMarcador(id, query);

    await audit(req, {
      action: 'VOID_GAME_EVENT',
      entityType: 'game',
      entityId: id,
      oldValue: { event: evento.event_type, points: evento.points, player: evento.player_id },
    });

    return ({ success: true, data: { id: eventId, score: marcador } });
  });
  res.json(result);
});

/**
 * POST /api/v1/games/:id/finish
 *
 * Body: { mvpOffensivePlayerId?, mvpDefensivePlayerId?, notes? }
 * El marcador no se recibe: se recalcula de los eventos. Si el árbitro
 * necesita corregirlo, corrige la jugada que está mal, no el número.
 */
export const finishGame = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  await exigirPermisoDePartido(req, id);
  const result = await withLockedGame(id, async (query) => {
    const audit: typeof writeAudit = (request, entry) => writeAudit(request, entry, query);

    const { mvpOffensivePlayerId, mvpDefensivePlayerId, notes } = req.body ?? {};

    const g = await query(
      `SELECT id, status, home_team_id, away_team_id, round_id FROM games WHERE id = $1`,
      [id]
    );
    const game = g.rows[0];
    if (!game) throw new AppError('Partido no encontrado', 404);
    if (game.status === 'FINISHED') {
      const actual = await query(`SELECT ${GAME_COLUMNS} FROM games g WHERE g.id = $1`, [id]);
      return ({ success: true, data: actual.rows[0], already_finished: true });
    }
    if (!['LIVE', 'SCHEDULED'].includes(game.status)) {
      throw new AppError(`El partido está ${game.status}`, 409);
    }

    for (const [campo, valor] of [
      ['mvpOffensivePlayerId', mvpOffensivePlayerId],
      ['mvpDefensivePlayerId', mvpDefensivePlayerId],
    ] as const) {
      if (!valor) continue;
      const p = await query(
        `SELECT team_id FROM players WHERE id = $1 AND removed_at IS NULL`,
        [valor]
      );
      if (!p.rows[0]) throw new AppError(`El jugador de ${campo} no existe`, 404);
      if (![game.home_team_id, game.away_team_id].includes(p.rows[0].team_id)) {
        throw new AppError('El MVP debe ser de uno de los dos equipos', 400);
      }
    }

    const marcador = await refrescarMarcador(id, query);

    if (marcador.home === marcador.away && (await query('SELECT game_id FROM playoff_games WHERE game_id = $1', [id])).rows.length) {
      throw new AppError('En playoffs debe haber ganador. Registra el desempate antes de finalizar.', 409);
    }
    await query(
      `UPDATE games SET status = 'FINISHED', ended_at = NOW(), closed_by = $1,
              mvp_offensive_player_id = $2, mvp_defensive_player_id = $3,
              notes = COALESCE($4, notes), updated_at = NOW()
       WHERE id = $5`,
      [req.user!.id, mvpOffensivePlayerId ?? null, mvpDefensivePlayerId ?? null, notes ?? null, id]
    );

    // La jornada termina sola cuando ya no queda partido pendiente: es un
    // dato que el sistema puede calcular, así que nadie lo captura.
    await query(
      `UPDATE rounds SET status = 'FINISHED', updated_at = NOW()
       WHERE id = $1
         AND NOT EXISTS (
           SELECT 1 FROM games WHERE round_id = $1 AND status IN ('SCHEDULED', 'LIVE')
         )`,
      [game.round_id]
    );

    await audit(req, {
      action: 'FINISH_GAME',
      entityType: 'game',
      entityId: id,
      newValue: { score: marcador, mvp_off: mvpOffensivePlayerId, mvp_def: mvpDefensivePlayerId },
    });

    const actual = await query(`SELECT ${GAME_COLUMNS} FROM games g WHERE g.id = $1`, [id]);
    return ({ success: true, data: actual.rows[0] });
  });
  res.json(result);
});

/** PUT /api/v1/admin/games/:id — ajuste manual de campo, hora o equipos */
export const updateGame = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const result = await withLockedGame(id, async (query) => {
    const audit: typeof writeAudit = (request, entry) => writeAudit(request, entry, query);
    const { fieldId, scheduledTime, homeTeamId, awayTeamId, notes, status } = req.body ?? {};
    if ([homeTeamId, awayTeamId, status].some((value) => value !== undefined) &&
        (await query('SELECT 1 FROM playoff_games WHERE game_id = $1', [id])).rows.length) {
      throw new AppError('Los equipos y el estado de playoffs se gestionan desde la llave y el cierre del partido.', 409);
    }

    const r = await query(`SELECT * FROM games WHERE id = $1`, [id]);
    const game = r.rows[0];
    if (!game) throw new AppError('Partido no encontrado', 404);
    const notesOnly = typeof notes === 'string' && Object.keys(req.body).every(key => key === 'notes');
    if (notes !== undefined && (typeof notes !== 'string' || notes.length > 10000)) {
      throw new AppError('El acta debe ser texto de hasta 10000 caracteres.', 400);
    }
    if (['FINISHED', 'WALKOVER'].includes(game.status) && !notesOnly) {
      throw new AppError('El partido ya está cerrado. Corrige las jugadas, no el registro.', 409);
    }

    if (game.status === 'LIVE' && [fieldId, scheduledTime, homeTeamId, awayTeamId].some((v) => v !== undefined)) {
      throw new AppError('No se puede reprogramar un partido en vivo', 409);
    }
    if (fieldId !== undefined) {
      const field = await query('SELECT id FROM fields WHERE id = $1 AND season_id = $2', [fieldId, game.season_id]);
      if (!field.rows.length) throw new AppError('El campo no pertenece a esta temporada', 400);
    }
    if (scheduledTime !== undefined) {
      if (typeof scheduledTime !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(scheduledTime)) {
        throw new AppError('Hora inválida', 400);
      }
      const conflict = await query(
        `SELECT 1 FROM game_referees current_ref
         JOIN game_referees other_ref ON other_ref.referee_id = current_ref.referee_id
         JOIN games other_game ON other_game.id = other_ref.game_id
         WHERE current_ref.game_id = $1 AND other_game.id <> $1
           AND other_game.round_id = $2 AND other_game.scheduled_time = $3::time
           AND other_game.status <> 'CANCELLED' LIMIT 1`, [id, game.round_id, scheduledTime]);
      if (conflict.rows.length) throw new AppError('Un árbitro asignado ya tiene otro partido a esa hora. Cambia la asignación primero.', 409);
    }

    try {
      await query(
        `UPDATE games SET
           field_id = COALESCE($1, field_id),
           scheduled_time = COALESCE($2::time, scheduled_time),
           home_team_id = COALESCE($3, home_team_id),
           away_team_id = COALESCE($4, away_team_id),
           notes = COALESCE($5, notes),
           status = COALESCE($6, status),
           updated_at = NOW()
         WHERE id = $7`,
        [
          fieldId ?? null,
          scheduledTime ?? null,
          homeTeamId ?? null,
          awayTeamId ?? null,
          notes ?? null,
          status ?? null,
          id,
        ]
      );
    } catch (e) {
      /**
       * La base rechaza el campo ocupado y el equipo repetido. Se traduce
       * aquí para que el administrador lea una frase y no un error de
       * Postgres: el mensaje es la única pista que va a tener.
       */
      const msg = (e as Error).message ?? '';
      if (msg.includes('uq_games_campo_hora')) {
        throw new AppError('Ese campo ya tiene un partido a esa hora en esta jornada', 409);
      }
      if (msg.includes('ya tiene partido en esta jornada')) {
        throw new AppError('Uno de los equipos ya juega en esta jornada', 409);
      }
      throw e;
    }

    await audit(req, {
      action: 'UPDATE_GAME',
      entityType: 'game',
      entityId: id,
      oldValue: {
        field_id: game.field_id,
        scheduled_time: game.scheduled_time,
        home: game.home_team_id,
        away: game.away_team_id,
      },
      newValue: { field_id: fieldId, scheduled_time: scheduledTime, home_team_id: homeTeamId, away_team_id: awayTeamId, status },
    });

    const actual = await query(`SELECT ${GAME_COLUMNS} FROM games g WHERE g.id = $1`, [id]);
    return ({ success: true, data: actual.rows[0] });
  });
  res.json(result);
});

/**
 * POST /api/v1/admin/games/:id/referees
 * Body: { assignments: [{ refereeId, role }] }
 *
 * Rechaza al árbitro que ya tiene otro partido a la misma hora, que es
 * el error que nadie nota hasta que el viernes falta un silbato en un
 * campo.
 */
export const assignReferees = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const asignaciones: { refereeId: string; role?: string }[] = req.body?.assignments ?? [];

  if (!Array.isArray(asignaciones) || asignaciones.length > 2 || asignaciones.some((a) => !a || typeof a.refereeId !== 'string' || !['PRINCIPAL', 'AUXILIAR'].includes(a.role ?? 'PRINCIPAL'))
    || new Set(asignaciones.map((a) => a.refereeId)).size !== asignaciones.length
    || new Set(asignaciones.map((a) => a.role ?? 'PRINCIPAL')).size !== asignaciones.length) {
    throw new AppError('Asigna como máximo un principal y un auxiliar distintos', 400);
  }

  const g = await query(
    `SELECT id, season_id, status, round_id, scheduled_time FROM games WHERE id = $1`,
    [id]
  );
  const game = g.rows[0];
  if (!game) throw new AppError('Partido no encontrado', 404);
  if (!['SCHEDULED', 'POSTPONED'].includes(game.status)) throw new AppError('Este partido ya no admite cambios de árbitros', 409);

  for (const a of asignaciones) {
    const referee = await query('SELECT id FROM referees WHERE id = $1 AND season_id = $2 AND status = $3', [a.refereeId, game.season_id, 'ACTIVE']);
    if (!referee.rows.length) throw new AppError('El árbitro debe estar activo y pertenecer a esta temporada', 400);
    const choque = await query(
      `SELECT g2.id, f.name AS field_name
       FROM game_referees gr
       JOIN games g2 ON g2.id = gr.game_id
       LEFT JOIN fields f ON f.id = g2.field_id
       WHERE gr.referee_id = $1
         AND g2.round_id = $2
         AND g2.scheduled_time = $3
         AND g2.id <> $4
         AND g2.status <> 'CANCELLED'`,
      [a.refereeId, game.round_id, game.scheduled_time, id]
    );
    if (choque.rows.length > 0) {
      const nombre = await query(`SELECT name FROM referees WHERE id = $1`, [a.refereeId]);
      throw new AppError(
        `${nombre.rows[0]?.name ?? 'Ese árbitro'} ya tiene partido a las ` +
          `${String(game.scheduled_time).slice(0, 5)} en ${choque.rows[0].field_name ?? 'otro campo'}`,
        409
      );
    }
  }

  try {
    await withTransaction(async (tx) => {
      await tx(`DELETE FROM game_referees WHERE game_id = $1`, [id]);
      for (const a of asignaciones) {
        await tx(
        `INSERT INTO game_referees (id, game_id, referee_id, role) VALUES ($1, $2, $3, $4)`
        , [newPrefixedId('gref'), id, a.refereeId, a.role ?? 'PRINCIPAL']
      );
      }
    });
  } catch (e) {
    const msg = (e as Error).message ?? '';
    if (msg.includes('game_referees_game_id_role_key')) {
      throw new AppError('Un partido lleva un árbitro principal y un auxiliar, no dos iguales', 409);
    }
    throw e;
  }

  await audit(req, {
    action: 'ASSIGN_REFEREES',
    entityType: 'game',
    entityId: id,
    newValue: { assignments: asignaciones },
  });

  res.json({ success: true, data: await arbitrosDe(id) });
});

/**
 * POST /api/v1/admin/games/:id/walkover
 * Body: { winnerTeamId, reason? }
 */
export const declareWalkover = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const result = await withLockedGame(id, async (query) => {
    const audit: typeof writeAudit = (request, entry) => writeAudit(request, entry, query);
    const { winnerTeamId, reason } = req.body ?? {};
    if ((await query(`SELECT 1 FROM playoff_games pg JOIN playoffs p ON p.id = pg.playoff_id
      WHERE pg.game_id = $1 AND (p.stage > pg.stage OR p.champion_id IS NOT NULL)`, [id])).rows.length) {
      throw new AppError('La fase ya avanzó. No se puede cambiar el ganador.', 409);
    }

    const g = await query(
      `SELECT id, status, home_team_id, away_team_id, round_id FROM games WHERE id = $1`,
      [id]
    );
    const game = g.rows[0];
    if (!game) throw new AppError('Partido no encontrado', 404);
    if (![game.home_team_id, game.away_team_id].includes(winnerTeamId)) {
      throw new AppError('El ganador debe ser uno de los dos equipos', 400);
    }
    if (game.status === 'FINISHED') {
      throw new AppError('El partido ya se jugó y tiene resultado', 409);
    }

    await query(
      `UPDATE games SET status = 'WALKOVER', walkover_team_id = $1, ended_at = NOW(),
              closed_by = $2, notes = COALESCE($3, notes), updated_at = NOW()
       WHERE id = $4`,
      [winnerTeamId, req.user!.id, reason ?? null, id]
    );
    const marcador = await refrescarMarcador(id, query);

    await query(
      `UPDATE rounds SET status = 'FINISHED', updated_at = NOW()
       WHERE id = $1
         AND NOT EXISTS (SELECT 1 FROM games WHERE round_id = $1 AND status IN ('SCHEDULED','LIVE'))`,
      [game.round_id]
    );

    await audit(req, {
      action: 'DECLARE_WALKOVER',
      entityType: 'game',
      entityId: id,
      newValue: { winner: winnerTeamId, reason, score: marcador },
    });

    const actual = await query(`SELECT ${GAME_COLUMNS} FROM games g WHERE g.id = $1`, [id]);
    return ({ success: true, data: actual.rows[0] });
  });
  res.json(result);
});

/** GET /api/v1/plays — catálogo de jugadas para dibujar los botones */
export const listPlays = asyncHandler(async (_req: AuthRequest, res: Response) => {
  res.json({ success: true, data: JUGADAS });
});

/** GET /api/v1/referees?seasonId= */
export const listReferees = asyncHandler(async (req: AuthRequest, res: Response) => {
  const seasonId = req.query.seasonId as string | undefined;
  const r = await query(
    `SELECT rf.id, rf.name, rf.phone, rf.badge_number, rf.certified, rf.status, rf.user_id,
            (SELECT COUNT(*) FROM game_referees gr WHERE gr.referee_id = rf.id)::int AS games_assigned
     FROM referees rf
     WHERE ($1::text IS NULL OR rf.season_id = $1)
     ORDER BY rf.name`,
    [seasonId ?? null]
  );
  res.json({ success: true, data: r.rows });
});

/** POST /api/v1/admin/referees */
export const createReferee = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { seasonId, name, phone, badgeNumber, certified, userId } = req.body ?? {};
  if (!seasonId || typeof name !== 'string' || !name.trim()) throw new AppError('Faltan seasonId y name', 400);

  const id = newPrefixedId('ref');
  await withTransaction(async (tx) => {
    // Serializa las altas por temporada para evitar duplicar una cuenta.
    const season = await tx('SELECT id FROM seasons WHERE id = $1 FOR UPDATE', [seasonId]);
    if (!season.rows.length) throw new AppError('Temporada no encontrada', 404);
    if (userId) {
      const user = await tx(`SELECT u.id FROM users u JOIN roles r ON r.id = u.role_id
        WHERE u.id = $1 AND u.active = true AND r.name = 'REFEREE'`, [userId]);
      if (!user.rows.length) throw new AppError('Selecciona una cuenta activa con rol Árbitro', 400);
      const duplicate = await tx('SELECT id FROM referees WHERE season_id = $1 AND user_id = $2', [seasonId, userId]);
      if (duplicate.rows.length) throw new AppError('Este usuario ya es árbitro de la temporada', 409);
    }
    await tx(
    `INSERT INTO referees (id, season_id, user_id, name, phone, badge_number, certified)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [id, seasonId, userId ?? null, name.trim(), phone ?? null, badgeNumber ?? null, Boolean(certified)]
  );
  });

  await audit(req, { action: 'CREATE_REFEREE', entityType: 'referee', entityId: id, newValue: { name } });

  const r = await query(`SELECT * FROM referees WHERE id = $1`, [id]);
  res.status(201).json({ success: true, data: r.rows[0] });
});
