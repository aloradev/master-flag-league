import type { Response } from 'express';
import { query, withTransaction } from '../config/database.js';
import { AppError, asyncHandler } from '../middleware/errorHandler.js';
import type { AuthRequest } from '../middleware/auth.js';
import { newPrefixedId } from '../utils/id.js';
import { audit } from '../services/audit.service.js';
import { generateAccessToken, verifyToken } from '../utils/jwt.js';

export const list = asyncHandler(async (req: AuthRequest, res: Response) => {
  const seasonId = String(req.query.seasonId ?? '');
  const result = await query(`
    SELECT g.id AS game_id, g.scheduled_time, g.status, g.home_score, g.away_score,
           r.id AS round_id, r.scheduled_date,
           h.name AS home_team_name, a.name AS away_team_name,
           c.name AS category_name
    FROM games g
    JOIN rounds r ON r.id = g.round_id
    JOIN teams h ON h.id = g.home_team_id
    JOIN teams a ON a.id = g.away_team_id
    JOIN categories c ON c.id = g.category_id
    WHERE g.game_type = 'SCRIMMAGE' AND ($1::text = '' OR g.season_id = $1)
    ORDER BY r.scheduled_date DESC, g.scheduled_time DESC`, [seasonId]);
  const base = process.env.FRONTEND_URL || process.env.PUBLIC_APP_URL || 'https://master-flag-league.vercel.app';
  const data = result.rows.map((row) => {
    const accessToken = generateAccessToken({
      sessionVersion: req.user!.sessionVersion,
      id: req.user!.id, email: req.user!.email, name: req.user!.name,
      role: 'REFEREE', leagueId: req.user!.leagueId ?? null,
      scope: 'SCRIMMAGE_REFEREE', scrimmageGameId: row.game_id,
    });
    return { ...row, access_expires_at: new Date(verifyToken(accessToken)!.exp! * 1000).toISOString(), access_url: `${base.replace(/\/$/, '')}/scrimmage/${row.game_id}?access=${encodeURIComponent(accessToken)}` };
  });
  res.json({ success: true, data });
});

export const remove = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  await withTransaction(async (q) => {
    const game = await q(`SELECT id, round_id, home_team_id, away_team_id, game_type FROM games WHERE id = $1 FOR UPDATE`, [id]);
    if (!game.rows[0]) throw new AppError('Scrimmage no encontrado', 404);
    if (game.rows[0].game_type !== 'SCRIMMAGE') throw new AppError('Solo se pueden eliminar partidos de scrimmage desde aquí', 409);
    await q('DELETE FROM games WHERE id = $1', [id]);
    const remaining = await q('SELECT 1 FROM games WHERE round_id = $1 LIMIT 1', [game.rows[0].round_id]);
    if (!remaining.rows[0]) await q('DELETE FROM rounds WHERE id = $1', [game.rows[0].round_id]);
    for (const teamId of [game.rows[0].home_team_id, game.rows[0].away_team_id]) {
      await q(`DELETE FROM teams t
        WHERE t.id = $1 AND t.team_type = 'SCRIMMAGE'
          AND NOT EXISTS (SELECT 1 FROM games g WHERE g.home_team_id = t.id OR g.away_team_id = t.id)
          AND NOT EXISTS (SELECT 1 FROM players p WHERE p.team_id = t.id)
          AND NOT EXISTS (SELECT 1 FROM team_users tu WHERE tu.team_id = t.id)`, [teamId]);
    }
  });
  await audit(req, { action: 'DELETE_SCRIMMAGE', entityType: 'game', entityId: id });
  res.json({ success: true, data: { id } });
});

export const revokeAccess = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const result = await query(
    `UPDATE games SET scrimmage_access_revoked_at = NOW(), updated_at = NOW()
     WHERE id = $1 AND game_type = 'SCRIMMAGE' AND status <> 'CANCELLED'
     RETURNING id`, [id]
  );
  if (!result.rows[0]) throw new AppError('Scrimmage no encontrado o ya cancelado', 404);
  await audit(req, { action: 'REVOKE_SCRIMMAGE_ACCESS', entityType: 'game', entityId: id });
  res.json({ success: true, data: { id } });
});

/** Partido de prueba: crea equipos temporales desde nombres, sin roster ni árbitro asignado. */
export const create = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { seasonId, categoryId, homeTeamId, awayTeamId, homeTeamName, awayTeamName, date, time, name } = req.body ?? {};
  if (![seasonId, categoryId, date, time].every((v) => typeof v === 'string' && v.trim())) throw new AppError('Faltan temporada, categoría, fecha y hora', 400);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new AppError('Indica una fecha y hora válidas. La hora se interpreta como hora local de Cancún.', 400);
  if ((!homeTeamId && !homeTeamName) || (!awayTeamId && !awayTeamName)) throw new AppError('Escribe los nombres de ambos equipos', 400);
  if (homeTeamId && awayTeamId && homeTeamId === awayTeamId) throw new AppError('Los equipos deben ser distintos', 400);
  let roundId = newPrefixedId('round'); const gameId = newPrefixedId('game');
  let createdTeams: { homeTeamId: string; awayTeamId: string } = { homeTeamId: '', awayTeamId: '' };
  await withTransaction(async (q) => {
    const resolveTeam = async (id: string | undefined, label: string | undefined) => {
      if (id) {
        const existing = await q('SELECT id FROM teams WHERE id = $1 AND season_id = $2 AND category_id = $3', [id, seasonId, categoryId]);
        if (!existing.rows[0]) throw new AppError('El equipo seleccionado no pertenece a la temporada y categoría', 400);
        return id;
      }
      const clean = String(label ?? '').trim();
      if (clean.length < 2 || clean.length > 80) throw new AppError('El nombre de cada equipo debe tener entre 2 y 80 caracteres', 400);
      const idNuevo = newPrefixedId('team');
      await q(`INSERT INTO teams(id, season_id, category_id, name, short_name, status, team_type)
               VALUES($1,$2,$3,$4,$5,'ACTIVE','SCRIMMAGE')`, [idNuevo, seasonId, categoryId, `Scrimmage · ${clean}`, clean.slice(0, 3).toUpperCase()]);
      return idNuevo;
    };
    const season = await q('SELECT id FROM seasons WHERE id = $1 AND league_id = $2 FOR UPDATE', [seasonId, req.user!.leagueId]);
    if (!season.rows.length) throw new AppError('Temporada no encontrada', 404);
    const category = await q('SELECT id FROM categories WHERE id = $1 AND season_id = $2', [categoryId, seasonId]);
    if (!category.rows.length) throw new AppError('La categoría no pertenece a la temporada', 400);
    const home = await resolveTeam(homeTeamId, homeTeamName);
    const away = await resolveTeam(awayTeamId, awayTeamName);
    if (home === away) throw new AppError('Los equipos deben ser distintos', 400);
    createdTeams = { homeTeamId: home, awayTeamId: away };
    const existingRound = await q(`SELECT r.id FROM rounds r
      JOIN games sg ON sg.round_id = r.id AND sg.game_type = 'SCRIMMAGE'
      WHERE r.season_id = $1 AND r.scheduled_date = $2
        AND r.round_type = 'SCRIMMAGE'
        AND r.status IN ('PUBLISHED','IN_PROGRESS','FINISHED') ORDER BY r.number LIMIT 1`, [seasonId, date]);
    if (existingRound.rows[0]) {
      roundId = existingRound.rows[0].id;
      await q("UPDATE rounds SET status = 'PUBLISHED' WHERE id = $1 AND status = 'FINISHED'", [roundId]);
    } else {
      const number = (await q("SELECT COALESCE(MAX(number),0)+1 AS n FROM rounds WHERE season_id = $1 AND round_type = 'SCRIMMAGE'", [seasonId])).rows[0].n;
      await q(`INSERT INTO rounds(id,season_id,number,name,scheduled_date,status,generated_by,round_type) VALUES($1,$2,$3,$4,$5,'PUBLISHED',$6,'SCRIMMAGE')`, [roundId, seasonId, number, name?.trim() || 'Scrimmage de prueba', date, req.user!.id]);
    }
    await q(`INSERT INTO games(id,season_id,round_id,category_id,home_team_id,away_team_id,scheduled_time,game_type) VALUES($1,$2,$3,$4,$5,$6,$7,'SCRIMMAGE')`, [gameId, seasonId, roundId, categoryId, home, away, time]);
  });
  await audit(req, { action: 'CREATE_SCRIMMAGE', entityType: 'game', entityId: gameId, newValue: { seasonId, categoryId, ...createdTeams, date, time } });
  const accessToken = generateAccessToken({
    sessionVersion: req.user!.sessionVersion,
    id: req.user!.id, email: req.user!.email, name: req.user!.name,
    role: 'REFEREE', leagueId: req.user!.leagueId ?? null,
    scope: 'SCRIMMAGE_REFEREE', scrimmageGameId: gameId,
  });
  const base = process.env.FRONTEND_URL || process.env.PUBLIC_APP_URL || 'https://master-flag-league.vercel.app';
  res.status(201).json({ success: true, data: {
    roundId, gameId, ...createdTeams, accessToken,
    accessExpiresAt: new Date(verifyToken(accessToken)!.exp! * 1000).toISOString(),
    accessUrl: `${base}/scrimmage/${gameId}?access=${encodeURIComponent(accessToken)}`,
  } });
});
