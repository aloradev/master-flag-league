import { query, withTransaction } from '../config/database.js';
import { AppError } from '../middleware/errorHandler.js';

/** Orden común: playoff, jornada, partido. Comparte el bloqueo de avance de fase. */
export const withLockedGame = <T>(id: string, work: (q: typeof query) => Promise<T>): Promise<T> =>
  withTransaction(async (q) => {
    await q(`SELECT p.id FROM playoffs p JOIN playoff_games pg ON pg.playoff_id = p.id
      WHERE pg.game_id = $1 FOR UPDATE OF p`, [id]);
    await q(`SELECT r.id FROM rounds r JOIN games g ON g.round_id = r.id
      WHERE g.id = $1 FOR UPDATE OF r`, [id]);
    const game = await q('SELECT id FROM games WHERE id = $1 FOR UPDATE', [id]);
    if (!game.rows.length) throw new AppError('Partido no encontrado', 404);
    return work(q);
  });
