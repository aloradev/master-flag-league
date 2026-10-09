import type { Response } from 'express';
import { query, withTransaction } from '../config/database.js';
import { AppError, asyncHandler } from '../middleware/errorHandler.js';
import type { AuthRequest } from '../middleware/auth.js';
import { newPrefixedId } from '../utils/id.js';
import { audit } from '../services/audit.service.js';
import { calcularPosiciones } from '../services/competition.service.js';
import { seedSlots, advanceSlots } from '../lib/playoffs.js';

export const list = asyncHandler(async (req: AuthRequest, res: Response) => {
  const r = await query(`SELECT p.*, c.name AS category_name, t.name AS champion_name,
    COALESCE((SELECT json_agg(json_build_object('id', g.id, 'stage', pg.stage, 'slot', pg.slot,
      'home', h.name, 'away', a.name, 'home_score', g.home_score, 'away_score', g.away_score,
      'status', g.status, 'round_id', g.round_id, 'date', ro.scheduled_date,
      'offensive_mvp', po.first_name || ' ' || po.last_name_paternal,
      'defensive_mvp', pd.first_name || ' ' || pd.last_name_paternal) ORDER BY pg.stage, pg.slot)
      FROM playoff_games pg JOIN games g ON g.id = pg.game_id JOIN rounds ro ON ro.id = g.round_id
      JOIN teams h ON h.id = g.home_team_id JOIN teams a ON a.id = g.away_team_id
      LEFT JOIN players po ON po.id = g.mvp_offensive_player_id LEFT JOIN players pd ON pd.id = g.mvp_defensive_player_id
      WHERE pg.playoff_id = p.id AND ($3::boolean OR ro.status <> 'DRAFT')), '[]') AS games
    FROM playoffs p JOIN seasons s ON s.id = p.season_id JOIN categories c ON c.id = p.category_id
    LEFT JOIN teams t ON t.id = p.champion_id
    WHERE p.season_id = $1 AND ($2::text IS NULL OR s.league_id = $2) ORDER BY c.name`, [req.query.seasonId, req.user?.leagueId ?? null, ['SUPER_ADMIN', 'SPORTS_ADMIN'].includes(req.user!.role)]);
  res.json({ success: true, data: r.rows });
});

export const create = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { seasonId, categoryId, count } = req.body ?? {};
  if (typeof seasonId !== 'string' || typeof categoryId !== 'string' || !seasonId || !categoryId) throw new AppError('Selecciona temporada y categoría', 400);
  if (![3, 4, 6, 8, 10, 12].includes(count)) throw new AppError('Formato inválido', 400);
  const standings = await calcularPosiciones(seasonId, categoryId);
  if (standings.some(t => t.played > 0 && t.tiebreak_pending)) throw new AppError('Hay posiciones empatadas pendientes de sorteo. Resuelve el desempate antes de generar playoffs.', 409);
  const seeds = standings.filter((t) => t.played > 0).slice(0, count).map((t) => ({ id: t.team_id, name: t.team_name }));
  if (seeds.length !== count) throw new AppError('No hay suficientes equipos con resultados en esta categoría', 400);
  const id = newPrefixedId('po');
  await withTransaction(async (q) => {
    const season = await q('SELECT id FROM seasons WHERE id = $1 AND league_id = $2 FOR UPDATE', [seasonId, req.user!.leagueId]);
    if (!season.rows.length) throw new AppError('Temporada no encontrada', 404);
    const cat = await q('SELECT id FROM categories WHERE id = $1 AND season_id = $2', [categoryId, seasonId]);
    if (!cat.rows.length) throw new AppError('Categoría inválida', 400);
    if ((await q('SELECT id FROM playoffs WHERE season_id = $1 AND category_id = $2', [seasonId, categoryId])).rows.length) throw new AppError('Ya existe un playoff en esta categoría', 409);
    await q('INSERT INTO playoffs(id, season_id, category_id, seeds, slots) VALUES($1,$2,$3,$4,$5)', [id, seasonId, categoryId, JSON.stringify(seeds), JSON.stringify(seedSlots(seeds.map((t) => t.id)))]);
  });
  await audit(req, { action: 'CREATE_PLAYOFF', entityType: 'playoff', entityId: id, newValue: { seeds } });
  res.status(201).json({ success: true, data: { id } });
});

/** Programa la primera fase o avanza con ganadores reales; repetir no duplica fases. */
export const advance = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { date, time } = req.body ?? {};
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time ?? '')) throw new AppError('Indica fecha y hora válidas', 400);
  const result = await withTransaction(async (q) => {
    const r = await q(`SELECT p.* FROM playoffs p JOIN seasons s ON s.id = p.season_id WHERE p.id = $1 AND s.league_id = $2 FOR UPDATE OF p`, [req.params.id, req.user!.leagueId]);
    const p = r.rows[0];
    if (!p) throw new AppError('Playoff no encontrado', 404);
    if (p.champion_id) throw new AppError('El playoff ya terminó', 409);
    // La versión enviada evita avanzar dos veces con doble clic o dos administradores.
    if (req.body.stage !== p.stage) throw new AppError('La fase cambió. Actualiza la pantalla.', 409);
    let slots = p.slots as (string | null)[];
    if (p.stage > 0) {
      const games = await q(`SELECT g.*, pg.slot FROM playoff_games pg JOIN games g ON g.id = pg.game_id WHERE pg.playoff_id = $1 AND pg.stage = $2 FOR UPDATE OF g`, [p.id, p.stage]);
      try { slots = advanceSlots(slots, games.rows); } catch (e) { throw new AppError((e as Error).message, 409); }
      if (slots.length === 1) {
        await q('UPDATE playoffs SET champion_id = $2, completed_at = NOW() WHERE id = $1', [p.id, slots[0]]);
        return { championId: slots[0] };
      }
    }
    await q('SELECT id FROM seasons WHERE id = $1 FOR UPDATE', [p.season_id]);
    const roundId = newPrefixedId('rnd');
    const number = (await q("SELECT COALESCE(MAX(number),0)+1 AS n FROM rounds WHERE season_id = $1 AND round_type = 'OFFICIAL'", [p.season_id])).rows[0].n;
    const name = slots.length === 2 ? 'Final' : slots.length === 4 ? 'Semifinales' : `Playoffs - ronda de ${slots.length}`;
    await q(`INSERT INTO rounds(id, season_id, number, name, scheduled_date, generated_by, playoff_id) VALUES($1,$2,$3,$4,$5,$6,$7)`, [roundId, p.season_id, number, name, date, req.user!.id, p.id]);
    for (let i = 0; i < slots.length; i += 2) {
      if (!slots[i] || !slots[i + 1]) continue;
      const gameId = newPrefixedId('gam');
      await q(`INSERT INTO games(id, season_id, round_id, category_id, home_team_id, away_team_id, scheduled_time) VALUES($1,$2,$3,$4,$5,$6,$7)`, [gameId, p.season_id, roundId, p.category_id, slots[i], slots[i + 1], time]);
      await q('INSERT INTO playoff_games(playoff_id,game_id,stage,slot) VALUES($1,$2,$3,$4)', [p.id, gameId, p.stage + 1, i / 2]);
    }
    await q('UPDATE playoffs SET stage = stage + 1, slots = $2 WHERE id = $1', [p.id, JSON.stringify(slots)]);
    return { roundId };
  });
  await audit(req, { action: 'ADVANCE_PLAYOFF', entityType: 'playoff', entityId: req.params.id, newValue: result });
  res.json({ success: true, data: result });
});
