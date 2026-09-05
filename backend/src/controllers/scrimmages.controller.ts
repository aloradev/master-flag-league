import type { Response } from 'express';
import { query, withTransaction } from '../config/database.js';
import { AppError, asyncHandler } from '../middleware/errorHandler.js';
import type { AuthRequest } from '../middleware/auth.js';
import { newPrefixedId } from '../utils/id.js';
import { audit } from '../services/audit.service.js';
import { generateAccessToken } from '../utils/jwt.js';

/** Partido de prueba: crea equipos temporales desde nombres, sin roster ni árbitro asignado. */
export const create = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { seasonId, categoryId, homeTeamId, awayTeamId, homeTeamName, awayTeamName, date, time, name } = req.body ?? {};
  if (![seasonId, categoryId, date, time].every((v) => typeof v === 'string' && v.trim())) throw new AppError('Faltan temporada, categoría, fecha y hora', 400);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new AppError('Indica una fecha y hora válidas. La hora se interpreta como hora local de Cancún.', 400);
  if ((!homeTeamId && !homeTeamName) || (!awayTeamId && !awayTeamName)) throw new AppError('Escribe los nombres de ambos equipos', 400);
  if (homeTeamId && awayTeamId && homeTeamId === awayTeamId) throw new AppError('Los equipos deben ser distintos', 400);
  const roundId = newPrefixedId('round'); const gameId = newPrefixedId('game');
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
    const home = await resolveTeam(homeTeamId, homeTeamName);
    const away = await resolveTeam(awayTeamId, awayTeamName);
    if (home === away) throw new AppError('Los equipos deben ser distintos', 400);
    createdTeams = { homeTeamId: home, awayTeamId: away };
    const number = (await q('SELECT COALESCE(MAX(number),0)+1 AS n FROM rounds WHERE season_id = $1', [seasonId])).rows[0].n;
    await q(`INSERT INTO rounds(id,season_id,number,name,scheduled_date,status,generated_by) VALUES($1,$2,$3,$4,$5,'PUBLISHED',$6)`, [roundId, seasonId, number, name?.trim() || 'Scrimmage de prueba', date, req.user!.id]);
    await q(`INSERT INTO games(id,season_id,round_id,category_id,home_team_id,away_team_id,scheduled_time,game_type) VALUES($1,$2,$3,$4,$5,$6,$7,'SCRIMMAGE')`, [gameId, seasonId, roundId, categoryId, home, away, time]);
  });
  await audit(req, { action: 'CREATE_SCRIMMAGE', entityType: 'game', entityId: gameId, newValue: { seasonId, categoryId, ...createdTeams, date, time } });
  const accessToken = generateAccessToken({
    id: req.user!.id, email: req.user!.email, name: req.user!.name,
    role: 'REFEREE', leagueId: req.user!.leagueId ?? null,
    scope: 'SCRIMMAGE_REFEREE', scrimmageGameId: gameId,
  });
  const base = process.env.FRONTEND_URL || process.env.PUBLIC_APP_URL || 'https://master-flag-league.vercel.app';
  res.status(201).json({ success: true, data: {
    roundId, gameId, ...createdTeams, accessToken,
    accessUrl: `${base}/scrimmage/${gameId}?access=${encodeURIComponent(accessToken)}`,
  } });
});
