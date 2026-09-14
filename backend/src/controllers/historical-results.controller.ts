import type { Response } from 'express';
import { ROLES, type AuthRequest } from '../middleware/auth.js';
import { AppError, asyncHandler } from '../middleware/errorHandler.js';
import { withLockedGame } from '../services/game-transaction.service.js';
import { audit } from '../services/audit.service.js';

/** Resultado del acta, independiente de los eventos. Solo temporada regular publicada. */
export const saveHistoricalResult = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (![ROLES.SUPER_ADMIN, ROLES.SPORTS_ADMIN].includes(req.user?.role as never)) {
    throw new AppError('Solo administración deportiva puede capturar resultados históricos', 403);
  }
  const { homeScore, awayScore, reason } = req.body ?? {};
  if (![homeScore, awayScore].every(n => Number.isInteger(n) && n >= 0 && n <= 999)) {
    throw new AppError('Indica marcadores enteros entre 0 y 999', 400);
  }
  if (typeof reason !== 'string' || !reason.trim() || reason.length > 1000) {
    throw new AppError('Indica la fuente o motivo de la captura (máximo 1000 caracteres)', 400);
  }
  const result = await withLockedGame(req.params.id, async q => {
    const found = await q(`SELECT g.*, r.status AS round_status,
      r.scheduled_date <= (NOW() AT TIME ZONE 'America/Cancun')::date AS date_valid
      FROM games g JOIN rounds r ON r.id = g.round_id
      JOIN seasons s ON s.id = g.season_id WHERE g.id = $1 AND s.league_id = $2`,
    [req.params.id, req.user!.leagueId]);
    const game = found.rows[0];
    if (!game) throw new AppError('Partido no encontrado', 404);
    if (game.game_type !== 'OFFICIAL' || (await q('SELECT 1 FROM playoff_games WHERE game_id = $1', [game.id])).rows.length) {
      throw new AppError('La captura histórica solo está disponible para temporada regular oficial', 409);
    }
    if (!['PUBLISHED', 'IN_PROGRESS', 'FINISHED'].includes(game.round_status)) {
      throw new AppError('Publica la jornada antes de capturar el resultado', 409);
    }
    if (!game.date_valid) throw new AppError('No se puede capturar un resultado con fecha futura', 400);
    const correcting = game.status === 'FINISHED' && game.score_source === 'MANUAL';
    if (game.status !== 'SCHEDULED' && !correcting) {
      throw new AppError('Solo se admiten partidos programados o resultados históricos ya capturados', 409);
    }
    if (!correcting && (await q('SELECT 1 FROM game_events WHERE game_id = $1 LIMIT 1', [game.id])).rows.length) {
      throw new AppError('Este partido ya tiene jugadas; finalízalo desde la captura del partido', 409);
    }
    const saved = await q(`UPDATE games SET home_score=$1, away_score=$2,
      score_source='MANUAL', statistics_status='PENDING', status='FINISHED',
      ended_at=COALESCE(ended_at, NOW()), closed_by=$3, updated_at=NOW()
      WHERE id=$4 RETURNING id, home_score, away_score, score_source, statistics_status, status`,
    [homeScore, awayScore, req.user!.id, game.id]);
    await q(`UPDATE rounds SET status='FINISHED', updated_at=NOW()
      WHERE id=$1 AND NOT EXISTS (SELECT 1 FROM games WHERE round_id=$1
        AND status IN ('SCHEDULED','LIVE','POSTPONED'))`, [game.round_id]);
    await audit(req, { action: correcting ? 'CORRECT_HISTORICAL_RESULT' : 'SAVE_HISTORICAL_RESULT',
      entityType: 'game', entityId: game.id,
      oldValue: { homeScore: game.home_score, awayScore: game.away_score, status: game.status },
      newValue: { ...saved.rows[0], reason: reason.trim() } }, q);
    return saved.rows[0];
  });
  res.json({ success: true, data: result });
});
