import type { Response } from 'express';
import { query, withTransaction } from '../config/database.js';
import { AppError, asyncHandler } from '../middleware/errorHandler.js';
import { audit as writeAudit } from '../services/audit.service.js';
import { drainEmailQueue } from '../services/email-queue.service.js';
import { audit } from '../services/audit.service.js';
import { newPrefixedId } from '../utils/id.js';
import type { AuthRequest } from '../middleware/auth.js';
import { notifyRoundPublished } from '../services/notification.service.js';
import {
  construirPropuesta,
  guardarPropuesta,
  calcularPosiciones,
  cargarHorarios,
} from '../services/competition.service.js';

/**
 * Se enumeran las columnas en lugar de usar `SELECT g.*` por la misma
 * razón que en equipos y jugadores: el comodín publica sola cualquier
 * columna nueva. Aquí además hay que decidir qué ve el público, y esa
 * decisión debe ser explícita.
 */
const GAME_COLUMNS = `g.id, g.season_id, g.round_id, g.category_id, g.field_id,
  g.home_team_id, g.away_team_id, to_char(g.scheduled_time, 'HH24:MI') AS scheduled_time,
  g.status, g.home_score, g.away_score, g.walkover_team_id,
  g.mvp_offensive_player_id, g.mvp_defensive_player_id,
  g.started_at, g.ended_at, g.notes, g.created_at, g.updated_at`;

/** Un partido con los nombres que hacen falta para mostrarlo. */
const partidosDeJornada = async (roundId: string) => {
  const r = await query(
    `SELECT ${GAME_COLUMNS},
            c.name AS category_name, c.color AS category_color,
            f.name AS field_name,
            hl.name AS home_team_name, hl.short_name AS home_short_name, hl.logo_url AS home_logo_url,
            aw.name AS away_team_name, aw.short_name AS away_short_name, aw.logo_url AS away_logo_url,
            COALESCE(
              (SELECT json_agg(json_build_object(
                        'referee_id', gr.referee_id, 'role', gr.role, 'name', rf.name)
                      ORDER BY gr.role)
               FROM game_referees gr JOIN referees rf ON rf.id = gr.referee_id
               WHERE gr.game_id = g.id),
              '[]'
            ) AS referees
     FROM games g
     JOIN categories c ON c.id = g.category_id
     JOIN teams hl ON hl.id = g.home_team_id
     JOIN teams aw ON aw.id = g.away_team_id
     LEFT JOIN fields f ON f.id = g.field_id
     WHERE g.round_id = $1
     ORDER BY g.scheduled_time, f.name, c.sort_order`,
    [roundId]
  );
  return r.rows;
};

const descansosDeJornada = async (roundId: string) => {
  const r = await query(
    `SELECT rb.team_id, rb.reason, t.name AS team_name, t.short_name, t.logo_url,
            c.id AS category_id, c.name AS category_name
     FROM round_byes rb
     JOIN teams t ON t.id = rb.team_id
     JOIN categories c ON c.id = t.category_id
     WHERE rb.round_id = $1
     ORDER BY c.sort_order, t.name`,
    [roundId]
  );
  return r.rows;
};

/**
 * GET /api/v1/rounds?seasonId=&status=
 *
 * Las jornadas en borrador solo las ve administración: publicar un
 * calendario que todavía puede cambiar genera más llamadas que las que
 * ahorra.
 */
export const listRounds = asyncHandler(async (req: AuthRequest, res: Response) => {
  const seasonId = req.query.seasonId as string | undefined;
  const esAdmin = ['SUPER_ADMIN', 'SPORTS_ADMIN'].includes(req.user?.role ?? '');

  const r = await query(
    `SELECT ro.id, ro.season_id, ro.number, ro.name, ro.scheduled_date, ro.status,
            ro.notes, ro.published_at, ro.created_at,
            (SELECT COUNT(*) FROM games   WHERE round_id = ro.id AND status <> 'CANCELLED')::int AS games_count,
            (SELECT COUNT(*) FROM games   WHERE round_id = ro.id AND status IN ('FINISHED','WALKOVER'))::int AS finished_count,
            (SELECT COUNT(*) FROM round_byes WHERE round_id = ro.id)::int AS byes_count,
            COALESCE((SELECT json_agg(to_char(start_time,'HH24:MI') ORDER BY sort_order, start_time)
                      FROM round_time_slots WHERE round_id = ro.id), '[]') AS slots
     FROM rounds ro
     WHERE ($1::text IS NULL OR ro.season_id = $1)
       AND ($2::boolean OR ro.status <> 'DRAFT')
     ORDER BY ro.number DESC`,
    [seasonId ?? null, esAdmin]
  );

  res.json({ success: true, data: r.rows });
});

/** GET /api/v1/rounds/:id */
export const getRound = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const esAdmin = ['SUPER_ADMIN', 'SPORTS_ADMIN'].includes(req.user?.role ?? '');

  const r = await query(
    `SELECT ro.*, u.name AS generated_by_name,
            -- La MISMA forma que en /rounds: un arreglo de "HH:MM".
            -- Antes el detalle devolvía objetos {id, time} y la lista
            -- cadenas, con el mismo nombre de campo; la pantalla que
            -- consumía las dos reventaba en una y no en la otra. Los ids
            -- no hacen falta: al editar los horarios se reemplazan todos.
            COALESCE((SELECT json_agg(to_char(s.start_time,'HH24:MI')
                                      ORDER BY s.sort_order, s.start_time)
                      FROM round_time_slots s WHERE s.round_id = ro.id), '[]') AS slots
     FROM rounds ro
     LEFT JOIN users u ON u.id = ro.generated_by
     WHERE ro.id = $1`,
    [id]
  );
  const round = r.rows[0];
  if (!round) throw new AppError('Jornada no encontrada', 404);
  if (round.status === 'DRAFT' && !esAdmin) throw new AppError('Jornada no encontrada', 404);

  const [games, byes] = await Promise.all([partidosDeJornada(id), descansosDeJornada(id)]);
  res.json({ success: true, data: { ...round, games, byes } });
});

/**
 * POST /api/v1/admin/rounds/propose
 *
 * Calcula la propuesta y la devuelve SIN guardarla. El administrador ve
 * los enfrentamientos, los horarios, los campos y quién descansa antes de
 * que exista nada en la base; si no le gusta, no queda basura que borrar.
 */
export const proposeRound = asyncHandler(async (req: AuthRequest, res: Response) => {
  const body = req.body ?? {};
  const seasonId = (body.seasonId ?? req.query.seasonId) as string | undefined;
  if (!seasonId) throw new AppError('Falta seasonId', 400);

  const temporada = await query(`SELECT id FROM seasons WHERE id = $1`, [seasonId]);
  if (!temporada.rows[0]) throw new AppError('Temporada no encontrada', 404);

  const propuesta = await construirPropuesta({
    seasonId,
    scheduledDate: body.scheduledDate,
    slots: Array.isArray(body.slots) ? body.slots : undefined,
  });

  res.json({ success: true, data: propuesta });
});

/**
 * POST /api/v1/admin/rounds
 *
 * Guarda una propuesta como borrador. Acepta la propuesta editada por el
 * administrador —así "ajustar manual" no obliga a recalcular— y si no
 * llega ninguna, la genera.
 */
export const createRound = asyncHandler(async (req: AuthRequest, res: Response) => {
  const body = req.body ?? {};
  const seasonId = body.seasonId as string | undefined;
  if (!seasonId) throw new AppError('Falta seasonId', 400);

  const propuesta = body.proposal
    ? { ...body.proposal, seasonId }
    : await construirPropuesta({
        seasonId,
        scheduledDate: body.scheduledDate,
        slots: Array.isArray(body.slots) ? body.slots : undefined,
      });

  if (!Array.isArray(propuesta.games) || propuesta.games.length === 0) {
    throw new AppError('La propuesta no tiene partidos que guardar', 400);
  }

  const roundId = await guardarPropuesta(propuesta, req.user!.id);

  await audit(req, {
    action: 'CREATE_ROUND',
    entityType: 'round',
    entityId: roundId,
    newValue: {
      number: propuesta.roundNumber,
      games: propuesta.games.length,
      byes: propuesta.byes?.length ?? 0,
    },
  });

  const [round, games, byes] = await Promise.all([
    query(`SELECT * FROM rounds WHERE id = $1`, [roundId]),
    partidosDeJornada(roundId),
    descansosDeJornada(roundId),
  ]);

  res.status(201).json({ success: true, data: { ...round.rows[0], games, byes } });
});

/** PUT /api/v1/admin/rounds/:id — fecha, nombre, notas y horarios */
export const updateRound = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const actual = await query(`SELECT * FROM rounds WHERE id = $1`, [id]);
  const round = actual.rows[0];
  if (!round) throw new AppError('Jornada no encontrada', 404);
  if (round.status === 'FINISHED') throw new AppError('La jornada ya terminó', 409);

  const { name, scheduledDate, notes, slots } = req.body ?? {};

  await query(
    `UPDATE rounds SET
       name = COALESCE($1, name),
       scheduled_date = COALESCE($2::date, scheduled_date),
       notes = COALESCE($3, notes),
       updated_at = NOW()
     WHERE id = $4`,
    [name ?? null, scheduledDate ?? null, notes ?? null, id]
  );

  if (Array.isArray(slots)) {
    const horas = [...new Set(slots.map((s: string) => String(s).slice(0, 5)))].sort();
    await query(`DELETE FROM round_time_slots WHERE round_id = $1`, [id]);
    for (let i = 0; i < horas.length; i++) {
      await query(
        `INSERT INTO round_time_slots (id, round_id, start_time, sort_order) VALUES ($1, $2, $3, $4)`,
        [newPrefixedId('slot'), id, horas[i], i]
      );
    }
  }

  await audit(req, {
    action: 'UPDATE_ROUND',
    entityType: 'round',
    entityId: id,
    oldValue: { scheduled_date: round.scheduled_date, name: round.name },
    newValue: { scheduled_date: scheduledDate, name, slots },
  });

  const r = await query(`SELECT * FROM rounds WHERE id = $1`, [id]);
  res.json({ success: true, data: r.rows[0] });
});

/**
 * POST /api/v1/admin/rounds/:id/publish
 *
 * A partir de aquí la jornada es pública y cuenta para el historial del
 * generador. Se revisa antes que no haya quedado nada a medias: un
 * partido sin campo u hora no se puede jugar, y descubrirlo el viernes
 * por la noche es peor que no poder publicar.
 */
export const publishRound = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const result = await withTransaction(async (query) => {
  const audit: typeof writeAudit = (request, entry) => writeAudit(request, entry, query);
  const r = await query(`SELECT * FROM rounds WHERE id = $1 FOR UPDATE`, [id]);
  const round = r.rows[0];
  if (!round) throw new AppError('Jornada no encontrada', 404);
  if (round.status !== 'DRAFT') throw new AppError('La jornada ya está publicada', 409);

  const incompletos = await query(
    `SELECT COUNT(*)::int AS n FROM games
     WHERE round_id = $1 AND status <> 'CANCELLED'
       AND (field_id IS NULL OR scheduled_time IS NULL)`,
    [id]
  );
  if (incompletos.rows[0].n > 0) {
    throw new AppError(
      `${incompletos.rows[0].n} partido(s) sin campo u horario asignado. ` +
        `Asígnalos antes de publicar.`,
      400
    );
  }

  const cuantos = await query(
    `SELECT COUNT(*)::int AS n FROM games WHERE round_id = $1 AND status <> 'CANCELLED'`,
    [id]
  );
  if (cuantos.rows[0].n === 0) throw new AppError('La jornada no tiene partidos', 400);

  await query(
    `UPDATE rounds SET status = 'PUBLISHED', published_at = NOW(), updated_at = NOW() WHERE id = $1`,
    [id]
  );

  await audit(req, {
    action: 'PUBLISH_ROUND',
    entityType: 'round',
    entityId: id,
    oldValue: { status: 'DRAFT' },
    newValue: { status: 'PUBLISHED', games: cuantos.rows[0].n },
  });

  const actualizada = await query(`SELECT * FROM rounds WHERE id = $1`, [id]);
  await notifyRoundPublished({
    seasonId: round.season_id,
    roundId: id,
    roundName: round.name || `Jornada ${round.number}`,
    scheduledDate: new Date(round.scheduled_date).toLocaleDateString('es-MX', { timeZone: 'UTC' }),
  }, query);
  return { success: true, data: actualizada.rows[0] };
  });
  void drainEmailQueue();
  res.json(result);
});

/** DELETE /api/v1/admin/rounds/:id — solo borradores */
export const deleteRound = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const r = await query(`SELECT * FROM rounds WHERE id = $1`, [id]);
  const round = r.rows[0];
  if (!round) throw new AppError('Jornada no encontrada', 404);
  if (round.playoff_id) throw new AppError('Una fase de playoffs no se puede borrar. Reprograma su fecha y partidos.', 409);
  if (round.status !== 'DRAFT') {
    throw new AppError(
      'Solo se puede descartar una jornada en borrador. Una publicada se cancela, no se borra.',
      409
    );
  }

  await query(`DELETE FROM rounds WHERE id = $1`, [id]);
  await audit(req, {
    action: 'DELETE_ROUND',
    entityType: 'round',
    entityId: id,
    oldValue: { number: round.number },
  });
  res.json({ success: true, data: { id } });
});

/** POST /api/v1/admin/rounds/:id/cancel */
export const cancelRound = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { reason } = req.body ?? {};
  const round = await withTransaction(async (query) => {
  const r = await query(`SELECT * FROM rounds WHERE id = $1 FOR UPDATE`, [id]);
  const round = r.rows[0];
  if (!round) throw new AppError('Jornada no encontrada', 404);
  if (round.playoff_id) throw new AppError('Una fase de playoffs no se puede cancelar. Reprograma su fecha y partidos.', 409);

    // Los partidos ya jugados se conservan: cancelar la jornada por lluvia
    // no debe borrar el resultado del que sí alcanzó a jugarse.
    await query(
      `UPDATE games SET status = 'CANCELLED', updated_at = NOW()
       WHERE round_id = $1 AND status IN ('SCHEDULED', 'LIVE')`,
      [id]
    );
    await query(
      `UPDATE rounds SET status = 'CANCELLED', notes = COALESCE($2, notes), updated_at = NOW()
       WHERE id = $1`,
      [id, reason ?? null]
    );
    return round;
  });

  await audit(req, {
    action: 'CANCEL_ROUND',
    entityType: 'round',
    entityId: id,
    oldValue: { status: round.status },
    newValue: { status: 'CANCELLED', reason },
  });

  const actualizada = await query(`SELECT * FROM rounds WHERE id = $1`, [id]);
  res.json({ success: true, data: actualizada.rows[0] });
});

/**
 * GET /api/v1/standings?seasonId=&categoryId=
 *
 * Calculada en cada consulta. Ver el comentario en
 * competition.service.ts sobre por qué no se guarda.
 */
export const getStandings = asyncHandler(async (req: AuthRequest, res: Response) => {
  const seasonId = req.query.seasonId as string | undefined;
  const categoryId = req.query.categoryId as string | undefined;
  if (!seasonId) throw new AppError('Falta seasonId', 400);

  const filas = await calcularPosiciones(seasonId, categoryId);

  // Agrupadas por categoría: una tabla que mezcle Varonil con Femenil no
  // significa nada, y la web siempre las muestra separadas.
  const categorias = await query(
    `SELECT id, name, color, sort_order FROM categories WHERE season_id = $1 ORDER BY sort_order, name`,
    [seasonId]
  );

  const data = categorias.rows
    .filter((c) => !categoryId || c.id === categoryId)
    .map((c) => ({
      category: { id: c.id, name: c.name, color: c.color },
      rows: filas
        .filter((f) => f.category_id === c.id)
        .map((f, i) => ({ ...f, position: i + 1 })),
    }));

  res.json({ success: true, data });
});

/** GET /api/v1/seasons/:seasonId/slots — horarios vigentes de la temporada */
export const getSeasonSlots = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { seasonId } = req.params;
  const slots = await cargarHorarios(seasonId);
  res.json({ success: true, data: { slots } });
});
