import type { Response } from 'express';
import { ROLES, type AuthRequest } from '../middleware/auth.js';
import { AppError, asyncHandler } from '../middleware/errorHandler.js';
import { withLockedGame } from '../services/game-transaction.service.js';
import { audit } from '../services/audit.service.js';
import { JUGADAS, esJugadaValida, cargarReglas } from '../services/competition.service.js';
import { newPrefixedId } from '../utils/id.js';

/** Captura administrativa del acta sin reabrir el partido ni recalcular su resultado. */
export const updateHistoricalStatistics = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (![ROLES.SUPER_ADMIN, ROLES.SPORTS_ADMIN].includes(req.user?.role as never)) {
    throw new AppError('Solo administración deportiva puede editar estadísticas históricas', 403);
  }
  const body = req.body ?? {};
  const { action, reason } = body;
  if (!['ADD', 'VOID', 'COMPLETE', 'REOPEN'].includes(action)) throw new AppError('Acción inválida', 400);
  if (typeof reason !== 'string' || !reason.trim() || reason.length > 1000) {
    throw new AppError('Indica la fuente o motivo del cambio (máximo 1000 caracteres)', 400);
  }
  const data = await withLockedGame(req.params.id, async q => {
    const found = await q(`SELECT g.*, r.status AS round_status, s.require_approval_to_play
      FROM games g JOIN rounds r ON r.id=g.round_id JOIN seasons s ON s.id=g.season_id
      WHERE g.id=$1 AND s.league_id=$2`, [req.params.id, req.user!.leagueId]);
    const game = found.rows[0];
    if (!game) throw new AppError('Partido no encontrado', 404);
    if (game.score_source !== 'MANUAL' || game.status !== 'FINISHED' || game.game_type !== 'OFFICIAL'
      || !['PUBLISHED','IN_PROGRESS','FINISHED'].includes(game.round_status)
      || (await q('SELECT 1 FROM playoff_games WHERE game_id=$1', [game.id])).rows.length) {
      throw new AppError('Solo se admiten resultados históricos de temporada regular publicados', 409);
    }
    if (game.statistics_status !== (action === 'REOPEN' ? 'COMPLETE' : 'PENDING')) {
      throw new AppError(action === 'REOPEN' ? 'Las estadísticas ya están pendientes' : 'Reabre las estadísticas antes de modificarlas', 409);
    }
    const player = async (id: unknown, teamId?: string) => {
      if (typeof id !== 'string' || !id) throw new AppError('Selecciona un jugador registrado', 400);
      const r = await q(`SELECT id, team_id, status, is_eligible FROM players
        WHERE id=$1 AND season_id=$2 AND removed_at IS NULL`, [id, game.season_id]);
      const p = r.rows[0];
      if (!p || ![game.home_team_id,game.away_team_id].includes(p.team_id) || (teamId && p.team_id !== teamId)) {
        throw new AppError('El jugador no pertenece al equipo de este partido', 400);
      }
      if (game.require_approval_to_play && !p.is_eligible) throw new AppError('El jugador aún no es elegible; completa su registro antes de capturar', 409);
      return p;
    };
    let change: unknown;
    if (action === 'ADD') {
      const { eventType, teamId, playerId, quarter, yards } = body;
      if (!esJugadaValida(eventType)) throw new AppError('Jugada inválida', 400);
      if (![game.home_team_id,game.away_team_id].includes(teamId)) throw new AppError('El equipo no juega este partido', 400);
      const play = JUGADAS[eventType];
      if (play.needsPlayer || playerId) await player(playerId, teamId);
      const rules = await cargarReglas(game.season_id, q);
      if (quarter != null && (!Number.isInteger(quarter) || quarter < 1 || quarter > rules.periods)) throw new AppError('Periodo inválido', 400);
      if (yards != null && (!Number.isInteger(yards) || yards < -100 || yards > 100
        || !['PASS_COMPLETE','RECEPTION','RUSH'].includes(eventType))) throw new AppError('Yardas inválidas para esta jugada', 400);
      const id = newPrefixedId('evt');
      await q(`INSERT INTO game_events(id,game_id,team_id,player_id,event_type,points,quarter,yards,recorded_by)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [id,game.id,teamId,playerId || null,eventType,play.points,quarter ?? null,yards ?? null,req.user!.id]);
      change = { id, teamId, playerId, eventType, points: play.points, quarter, yards };
    } else if (action === 'VOID') {
      if (typeof body.eventId !== 'string') throw new AppError('Selecciona la jugada a anular', 400);
      const event = (await q('SELECT * FROM game_events WHERE id=$1 AND game_id=$2', [body.eventId,game.id])).rows[0];
      if (!event) throw new AppError('Jugada no encontrada', 404);
      if (event.voided_at) throw new AppError('La jugada ya está anulada', 409);
      await q('UPDATE game_events SET voided_at=NOW(),voided_by=$1 WHERE id=$2', [req.user!.id,event.id]);
      change = event;
    } else if (action === 'COMPLETE') {
      const points = (await q(`SELECT team_id, SUM(points)::int AS points FROM game_events
        WHERE game_id=$1 AND voided_at IS NULL GROUP BY team_id`, [game.id])).rows;
      const sum = (id: string) => points.find(p => p.team_id === id)?.points ?? 0;
      if (sum(game.home_team_id) !== game.home_score || sum(game.away_team_id) !== game.away_score) {
        throw new AppError('Las anotaciones capturadas deben coincidir con el marcador histórico antes de completar', 409);
      }
      for (const id of [body.mvpOffensivePlayerId, body.mvpDefensivePlayerId]) if (id != null) await player(id);
      await q(`UPDATE games SET mvp_offensive_player_id=$1,mvp_defensive_player_id=$2 WHERE id=$3`,
        [body.mvpOffensivePlayerId ?? null,body.mvpDefensivePlayerId ?? null,game.id]);
      change = { mvpOffensivePlayerId: body.mvpOffensivePlayerId ?? null, mvpDefensivePlayerId: body.mvpDefensivePlayerId ?? null };
    }
    const status = action === 'COMPLETE' ? 'COMPLETE' : 'PENDING';
    await q('UPDATE games SET statistics_status=$1,updated_at=NOW() WHERE id=$2', [status,game.id]);
    await audit(req, { action: `HISTORICAL_STATISTICS_${action}`, entityType: 'game', entityId: game.id,
      oldValue: { statisticsStatus: game.statistics_status, mvpOffensivePlayerId: game.mvp_offensive_player_id, mvpDefensivePlayerId: game.mvp_defensive_player_id },
      newValue: { statisticsStatus: status, reason: reason.trim(), change } }, q);
    return { statistics_status: status, home_score: game.home_score, away_score: game.away_score };
  });
  res.json({ success: true, data });
});
