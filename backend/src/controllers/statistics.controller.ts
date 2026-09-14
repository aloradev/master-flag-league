import type { Response } from 'express';
import { query } from '../config/database.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import type { AuthRequest } from '../middleware/auth.js';

/** Estadísticas derivadas de eventos vigentes; no se almacenan ni se desincronizan. */
const stats = asyncHandler(async (req: AuthRequest, res: Response) => {
  const seasonId = String(req.query.seasonId ?? '');
  const categoryId = req.query.categoryId ? String(req.query.categoryId) : null;
  const teamId = req.query.teamId ? String(req.query.teamId) : null;
  const playerId = req.query.playerId ? String(req.query.playerId) : null;
  if (!seasonId) return res.json({ success: true, data: [] });
  const r = await query(
    `SELECT p.id AS player_id,
            CONCAT_WS(' ', p.first_name, p.last_name_paternal, p.last_name_maternal) AS player_name,
            p.jersey_number, p.position, p.avatar_url,
            t.id AS team_id, t.name AS team_name, t.short_name,
            c.id AS category_id, c.name AS category_name,
            COUNT(DISTINCT g.id)::int AS games_played,
            COUNT(*) FILTER (WHERE e.event_type = 'TOUCHDOWN')::int AS touchdowns,
            COALESCE(SUM(e.yards) FILTER (WHERE e.event_type IN ('PASS_COMPLETE','RECEPTION','RUSH')), 0)::int AS yards,
            COUNT(*) FILTER (WHERE e.event_type = 'RECEPTION')::int AS receptions,
            COUNT(*) FILTER (WHERE e.event_type = 'PASS_COMPLETE')::int AS completions,
            COUNT(*) FILTER (WHERE e.event_type = 'INTERCEPTION')::int AS interceptions,
            COUNT(*) FILTER (WHERE e.event_type = 'FLAG_PULL')::int AS flag_pulls,
            COUNT(*) FILTER (WHERE e.event_type = 'PASS_DEFENDED')::int AS passes_defended,
            COUNT(DISTINCT g.id) FILTER (WHERE g.mvp_offensive_player_id = p.id)::int AS offensive_mvps,
            COUNT(DISTINCT g.id) FILTER (WHERE g.mvp_defensive_player_id = p.id)::int AS defensive_mvps,
            (COUNT(*) FILTER (WHERE e.event_type = 'TOUCHDOWN') * 6
             + COUNT(*) FILTER (WHERE e.event_type = 'RECEPTION')
             + COUNT(*) FILTER (WHERE e.event_type = 'PASS_COMPLETE') * 0.5
             + COALESCE(SUM(e.yards) FILTER (WHERE e.event_type IN ('PASS_COMPLETE','RECEPTION','RUSH')), 0) * 0.05)::numeric AS offensive_score,
            (COUNT(*) FILTER (WHERE e.event_type = 'INTERCEPTION') * 5
             + COUNT(*) FILTER (WHERE e.event_type = 'FLAG_PULL')
             + COUNT(*) FILTER (WHERE e.event_type = 'PASS_DEFENDED') * 2)::numeric AS defensive_score
     FROM players p
     JOIN teams t ON t.id = p.team_id
     JOIN categories c ON c.id = p.category_id
     LEFT JOIN games g ON (g.home_team_id = t.id OR g.away_team_id = t.id)
       AND g.statistics_status = 'COMPLETE'
       AND g.season_id = p.season_id AND g.status IN ('FINISHED','WALKOVER') AND COALESCE(g.game_type, 'OFFICIAL') = 'OFFICIAL'
     LEFT JOIN game_events e ON e.game_id = g.id AND e.player_id = p.id AND e.voided_at IS NULL
     WHERE p.season_id = $1 AND p.status = 'APPROVED' AND p.removed_at IS NULL
       AND ($2::text IS NULL OR p.category_id = $2)
       AND ($3::text IS NULL OR p.team_id = $3)
       AND ($4::text IS NULL OR p.id = $4)
     GROUP BY p.id, t.id, c.id
     ORDER BY touchdowns DESC, yards DESC, flag_pulls DESC, player_name`,
    [seasonId, categoryId, teamId, playerId]
  );
  res.json({ success: true, data: r.rows });
});

export const playerStats = stats;
export const publicPlayerStats = stats;
