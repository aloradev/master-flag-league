import type { Request, Response } from 'express';
import { query } from '../config/database.js';
import { AppError, asyncHandler } from '../middleware/errorHandler.js';
import { calcularPosiciones } from '../services/competition.service.js';

/**
 * LO QUE SE PUEDE VER SIN SESIÓN.
 *
 * Existe en lugar del aviso por WhatsApp Business API. La API de Meta
 * cobra por mensaje y exige un negocio legalmente constituido con
 * Constancia de Situación Fiscal; los encargados, en cambio, ya están en
 * un grupo de WhatsApp. Lo que faltaba no era un canal nuevo sino algo
 * que pegar en el grupo que ya existe: un enlace que siempre muestre lo
 * vigente. Si cambia un horario, el enlace ya está actualizado y no hay
 * que avisar otra vez.
 *
 * Estos controladores NO reutilizan los autenticados a propósito. Los de
 * administración usan `ro.*` y traen notas internas, quién generó la
 * jornada y los árbitros asignados. Aquí las columnas se enumeran una por
 * una, así que una columna nueva en `rounds` o en `games` no se publica
 * sola: hay que decidirlo.
 *
 * De los jugadores solo se publica identidad deportiva aprobada.
 * No se exponen documentos, finanzas, encargados ni nombres de árbitros.
 */

/** Solo lo que hace falta para leer un partido en la calle. */
const COLUMNAS_PARTIDO = `
  g.id, g.category_id, to_char(g.scheduled_time, 'HH24:MI') AS scheduled_time,
  g.status, g.game_type, g.home_score, g.away_score, g.score_source, g.statistics_status, g.walkover_team_id,
  g.home_team_id, g.away_team_id
`;

const partidos = async (roundId: string, gameType = 'OFFICIAL') => {
  const r = await query(
    `SELECT ${COLUMNAS_PARTIDO},
            c.name AS category_name, c.color AS category_color,
            f.name AS field_name, f.location AS field_location,
            hl.name AS home_team_name, hl.short_name AS home_short_name,
            hl.logo_url AS home_logo_url, hl.color_primary AS home_color,
            aw.name AS away_team_name, aw.short_name AS away_short_name,
            aw.logo_url AS away_logo_url, aw.color_primary AS away_color
            ,COALESCE((SELECT json_agg(json_build_object('team_id', ge.team_id, 'points', ge.points, 'quantity', ge.quantity, 'quarter', ge.quarter, 'created_at', ge.created_at) ORDER BY ge.created_at)
                       FROM game_events ge WHERE ge.game_id = g.id AND ge.voided_at IS NULL AND ge.event_type = 'TOUCHDOWN'), '[]'::json) AS touchdowns
     FROM games g
     JOIN categories c ON c.id = g.category_id
     JOIN teams hl ON hl.id = g.home_team_id
     JOIN teams aw ON aw.id = g.away_team_id
     LEFT JOIN fields f ON f.id = g.field_id
     WHERE g.round_id = $1
       AND g.status <> 'CANCELLED'
       AND COALESCE(g.game_type, 'OFFICIAL') = $2
     ORDER BY g.scheduled_time, f.name, c.sort_order`,
     [roundId, gameType]
  );
  return r.rows;
};

export const getPublicGame = asyncHandler(async (req: Request, res: Response) => {
  const id = (req.params as Record<string, string>).id;
  const r = await query(`
    SELECT g.id, g.season_id, g.round_id, g.status, g.game_type, g.home_score, g.away_score, g.score_source, g.statistics_status,
           to_char(g.scheduled_time, 'HH24:MI') AS scheduled_time,
           g.home_team_id, g.away_team_id,
           c.name AS category_name, c.color AS category_color,
           f.name AS field_name, f.location AS field_location,
           h.name AS home_team_name, h.short_name AS home_short_name,
           h.logo_url AS home_logo_url, h.color_primary AS home_color,
           a.name AS away_team_name, a.short_name AS away_short_name,
           a.logo_url AS away_logo_url, a.color_primary AS away_color,
           r.scheduled_date, r.number AS round_number,
           COALESCE((SELECT json_agg(json_build_object('team_id', e.team_id, 'points', e.points, 'quantity', e.quantity, 'quarter', e.quarter, 'created_at', e.created_at) ORDER BY e.created_at)
                     FROM game_events e WHERE e.game_id = g.id AND e.voided_at IS NULL AND e.event_type = 'TOUCHDOWN'), '[]'::json) AS touchdowns
    FROM games g
    JOIN rounds r ON r.id = g.round_id
    JOIN categories c ON c.id = g.category_id
    JOIN teams h ON h.id = g.home_team_id
    JOIN teams a ON a.id = g.away_team_id
    LEFT JOIN fields f ON f.id = g.field_id
    WHERE g.id = $1
      AND COALESCE(g.game_type, 'OFFICIAL') IN ('OFFICIAL', 'SCRIMMAGE')
      AND g.status <> 'CANCELLED'
      AND r.status IN ('PUBLISHED','IN_PROGRESS','FINISHED')`, [id]);
  if (!r.rows[0]) throw new AppError('Partido no encontrado o todavía no publicado', 404);
  const game = r.rows[0];
  const statistics = game.statistics_status === 'COMPLETE' || game.status === 'LIVE'
    ? await query(`SELECT p.id AS player_id,
        CONCAT_WS(' ', p.first_name, p.last_name_paternal, p.last_name_maternal) AS player_name,
        p.team_id, p.jersey_number,
        COALESCE(SUM(e.quantity) FILTER (WHERE e.event_type='TOUCHDOWN'),0)::int AS touchdowns,
        COALESCE(SUM(e.quantity) FILTER (WHERE e.event_type='RECEPTION'),0)::int AS receptions,
        COALESCE(SUM(e.quantity) FILTER (WHERE e.event_type='INTERCEPTION'),0)::int AS interceptions,
        COALESCE(SUM(e.quantity) FILTER (WHERE e.event_type='FLAG_PULL'),0)::int AS flag_pulls,
        COALESCE(SUM(e.quantity) FILTER (WHERE e.event_type='PASS_DEFENDED'),0)::int AS passes_defended,
        (g.mvp_offensive_player_id=p.id) AS offensive_mvp,
        (g.mvp_defensive_player_id=p.id) AS defensive_mvp
      FROM players p JOIN games g ON g.id=$1
      LEFT JOIN game_events e ON e.game_id=g.id AND e.player_id=p.id AND e.team_id=p.team_id AND e.voided_at IS NULL
      WHERE p.team_id IN (g.home_team_id,g.away_team_id)
        AND p.status='APPROVED' AND p.removed_at IS NULL
        AND (e.id IS NOT NULL OR g.mvp_offensive_player_id=p.id OR g.mvp_defensive_player_id=p.id)
      GROUP BY p.id, g.id ORDER BY touchdowns DESC, interceptions DESC, player_name`, [id])
    : { rows: [] };
  res.json({ success: true, data: { ...game, players: statistics.rows } });
});

/** Perfil deportivo público: no incluye encargados ni datos de inscripción. */
export const getPublicTeam = asyncHandler(async (req: Request, res: Response) => {
  const id = (req.params as Record<string, string>).id;
  const result = await query(`SELECT t.id, t.season_id, t.category_id, t.name, t.short_name,
      t.logo_url, t.color_primary, c.name AS category_name, s.name AS season_name
    FROM teams t JOIN categories c ON c.id=t.category_id
    JOIN seasons s ON s.id=t.season_id JOIN leagues l ON l.id=s.league_id
    WHERE t.id=$1 AND t.team_type='OFFICIAL' AND l.status='ACTIVE'`, [id]);
  const team = result.rows[0];
  if (!team) throw new AppError('Equipo no encontrado', 404);
  const [roster, games, standings] = await Promise.all([
    query(`SELECT p.id, CONCAT_WS(' ', p.first_name, p.last_name_paternal, p.last_name_maternal) AS full_name,
        p.jersey_number, p.position, p.avatar_url
      FROM players p WHERE p.team_id=$1 AND p.status='APPROVED' AND p.removed_at IS NULL
      ORDER BY p.jersey_number NULLS LAST, full_name`, [id]),
    query(`SELECT ${COLUMNAS_PARTIDO}, r.id AS round_id, r.number AS round_number,
        r.scheduled_date, c.name AS category_name, c.color AS category_color,
        f.name AS field_name, f.location AS field_location,
        h.name AS home_team_name, h.short_name AS home_short_name, h.logo_url AS home_logo_url, h.color_primary AS home_color,
        a.name AS away_team_name, a.short_name AS away_short_name, a.logo_url AS away_logo_url, a.color_primary AS away_color,
        '[]'::json AS touchdowns
      FROM games g JOIN rounds r ON r.id=g.round_id JOIN categories c ON c.id=g.category_id
      JOIN teams h ON h.id=g.home_team_id JOIN teams a ON a.id=g.away_team_id
      LEFT JOIN fields f ON f.id=g.field_id
      WHERE (g.home_team_id=$1 OR g.away_team_id=$1) AND g.season_id=$2
        AND COALESCE(g.game_type,'OFFICIAL')='OFFICIAL' AND g.status<>'CANCELLED'
        AND r.status IN ('PUBLISHED','IN_PROGRESS','FINISHED')
      ORDER BY r.scheduled_date, g.scheduled_time, g.id`, [id, team.season_id]),
    calcularPosiciones(team.season_id, team.category_id),
  ]);
  const index = standings.findIndex(row => row.team_id === id);
  res.json({ success: true, data: {
    team, roster: roster.rows, games: games.rows,
    standing: index < 0 ? null : { ...standings[index], position: index + 1 },
  } });
});

const descansos = async (roundId: string) => {
  const r = await query(
    `SELECT rb.team_id, t.name AS team_name, t.short_name, t.logo_url,
            c.name AS category_name
     FROM round_byes rb
     JOIN teams t ON t.id = rb.team_id
     JOIN categories c ON c.id = t.category_id
     WHERE rb.round_id = $1
     ORDER BY c.sort_order, t.name`,
    [roundId]
  );
  return r.rows;
};

/** La temporada vigente. Sin ella no hay nada público que mostrar. */
const temporadaActiva = async (req: Request) => {
  const league = typeof req.query.liga === 'string' && req.query.liga.trim()
    ? req.query.liga.trim() : (process.env.PUBLIC_LEAGUE_SLUG || 'cancun');
  const r = await query<{ id: string; name: string; year: number }>(
    `SELECT s.id, s.name, s.year FROM seasons s JOIN leagues l ON l.id=s.league_id
     WHERE s.status = 'ACTIVE' AND l.status='ACTIVE' AND (l.slug=$1 OR l.id=$1)
     ORDER BY s.year DESC, s.start_date DESC LIMIT 1`, [league]
  );
  return r.rows[0] ?? null;
};

/** Seguimiento de pruebas únicamente durante la fecha actual de Cancún. */
export const getPublicScrimmages = asyncHandler(async (req: Request, res: Response) => {
  const season = await temporadaActiva(req);
  if (!season) return res.json({ success: true, data: [] });
  const rounds = await query(`SELECT ro.id, to_char(ro.scheduled_date, 'YYYY-MM-DD') AS scheduled_date
    FROM rounds ro WHERE ro.season_id = $1
      AND ro.status IN ('PUBLISHED', 'IN_PROGRESS', 'FINISHED')
      AND EXISTS (SELECT 1 FROM games g WHERE g.round_id = ro.id
        AND g.game_type = 'SCRIMMAGE' AND g.status <> 'CANCELLED'
        AND ro.scheduled_date = (NOW() AT TIME ZONE 'America/Cancun')::date)
    ORDER BY ro.scheduled_date, ro.number`, [season.id]);
  const groups = await Promise.all(rounds.rows.map(async (round) =>
    (await partidos(round.id, 'SCRIMMAGE')).map((game) => ({ ...game, scheduled_date: round.scheduled_date }))));
  res.json({ success: true, data: groups.flat() });
});

/**
 * GET /api/v1/public/round        — la jornada vigente
 * GET /api/v1/public/round/:id    — una en concreto
 *
 * Sin id se elige sola, y ese es el punto: el enlace se pega UNA vez en
 * el grupo y sirve toda la temporada. Se prefiere la jornada en curso o
 * la más próxima sin terminar; si ya terminaron todas, la última.
 */
export const getPublicRound = asyncHandler(async (req: Request, res: Response) => {
  const id = (req.params as Record<string, string>).id;
  const temporada = await temporadaActiva(req);
  if (!temporada) throw new AppError('Todavía no hay una temporada activa', 404);

  const r = await query(
    `SELECT ro.id, ro.number, ro.name, ro.scheduled_date, ro.status, ro.published_at
     FROM rounds ro
     WHERE ro.season_id = $1
       AND ro.status IN ('PUBLISHED', 'IN_PROGRESS', 'FINISHED')
       AND EXISTS (
         SELECT 1 FROM games official_game
         WHERE official_game.round_id = ro.id
           AND COALESCE(official_game.game_type, 'OFFICIAL') = 'OFFICIAL'
           AND official_game.status <> 'CANCELLED'
       )
       AND ($2::text IS NULL OR ro.id = $2)
     ORDER BY
       -- En curso primero; después la más próxima sin terminar; al final,
       -- si ya se jugó todo, la última.
       CASE ro.status WHEN 'IN_PROGRESS' THEN 0 WHEN 'PUBLISHED' THEN 1 ELSE 2 END,
       CASE WHEN ro.status = 'FINISHED' THEN ro.scheduled_date END DESC,
       ro.scheduled_date ASC
     LIMIT 1`,
    [temporada.id, id ?? null]
  );

  const jornada = r.rows[0];
  if (!jornada) throw new AppError('Jornada no encontrada', 404);

  const [juegos, libres] = await Promise.all([partidos(jornada.id), descansos(jornada.id)]);

  res.json({
    success: true,
    data: {
      season: temporada,
      round: jornada,
      games: juegos,
      byes: libres,
    },
  });
});

/**
 * GET /api/v1/public/rounds — el calendario publicado, para navegar.
 */
export const listPublicRounds = asyncHandler(async (req: Request, res: Response) => {
  const temporada = await temporadaActiva(req);
  if (!temporada) throw new AppError('Todavía no hay una temporada activa', 404);

  const r = await query(
    `SELECT ro.id, ro.number, ro.name, ro.scheduled_date, ro.status
     FROM rounds ro
     WHERE ro.season_id = $1 AND ro.status IN ('PUBLISHED', 'IN_PROGRESS', 'FINISHED')
       AND EXISTS (
         SELECT 1 FROM games official_game
         WHERE official_game.round_id = ro.id
           AND COALESCE(official_game.game_type, 'OFFICIAL') = 'OFFICIAL'
           AND official_game.status <> 'CANCELLED'
       )
     ORDER BY ro.number ASC`,
    [temporada.id]
  );

  res.json({ success: true, data: { season: temporada, rounds: r.rows } });
});

/**
 * GET /api/v1/public/standings — la tabla, agrupada por categoría.
 *
 * Se calcula, nunca se guarda: una tabla almacenada se desincroniza del
 * primer partido que se corrige.
 */
export const getPublicStandings = asyncHandler(async (req: Request, res: Response) => {
  const temporada = await temporadaActiva(req);
  if (!temporada) throw new AppError('Todavía no hay una temporada activa', 404);

  const filas = await calcularPosiciones(temporada.id);

  const categorias = await query<{ id: string; name: string; color: string | null }>(
    `SELECT id, name, color FROM categories WHERE season_id = $1 ORDER BY sort_order, name`,
    [temporada.id]
  );

  res.json({
    success: true,
    data: {
      season: temporada,
      categories: categorias.rows.map((c) => ({
        category: { id: c.id, name: c.name, color: c.color },
        rows: filas
          .filter((f) => f.category_id === c.id)
          .map((f, i) => ({ ...f, position: i + 1 })),
      })),
    },
  });
});
