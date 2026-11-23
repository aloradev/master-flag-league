import { eventRound, checkSlot, scheduleFixture } from '../services/event-schedule.service.js';
import type { Response } from 'express';
import { query, withTransaction } from '../config/database.js';
import { AppError, asyncHandler } from '../middleware/errorHandler.js';
import type { AuthRequest } from '../middleware/auth.js';
import { newPrefixedId } from '../utils/id.js';
import { audit } from '../services/audit.service.js';
import { calcularPosiciones, validarClubesJornada } from '../services/competition.service.js';
import { seedSlots, advanceSlots } from '../lib/playoffs.js';

export const list = asyncHandler(async (req: AuthRequest, res: Response) => {
  const r = await query(`SELECT p.*, c.name AS category_name, t.name AS champion_name,
    COALESCE((SELECT json_agg(json_build_object('id', g.id, 'stage', pg.stage, 'slot', pg.slot,
      'home', h.name, 'away', a.name, 'home_score', g.home_score, 'away_score', g.away_score,
      'status', g.status, 'round_id', g.round_id, 'date', ro.scheduled_date, 'round_status', ro.status, 'time', g.scheduled_time,
      'offensive_mvp', po.first_name || ' ' || po.last_name_paternal,
      'defensive_mvp', pd.first_name || ' ' || pd.last_name_paternal) ORDER BY pg.stage, pg.slot)
      FROM playoff_games pg JOIN games g ON g.id = pg.game_id JOIN rounds ro ON ro.id = g.round_id
      JOIN teams h ON h.id = g.home_team_id JOIN teams a ON a.id = g.away_team_id
      LEFT JOIN players po ON po.id = g.mvp_offensive_player_id LEFT JOIN players pd ON pd.id = g.mvp_defensive_player_id
      WHERE pg.playoff_id = p.id AND ($3::boolean OR (ro.status <> 'DRAFT' AND g.status <> 'CANCELLED'))), '[]') AS games
    FROM playoffs p JOIN seasons s ON s.id = p.season_id JOIN categories c ON c.id = p.category_id
    LEFT JOIN teams t ON t.id = p.champion_id
    WHERE p.discarded_at IS NULL AND p.season_id = $1 AND ($2::text IS NULL OR s.league_id = $2) ORDER BY c.name`, [req.query.seasonId, req.user?.leagueId ?? null, ['SUPER_ADMIN', 'SPORTS_ADMIN'].includes(req.user!.role)]);
  res.json({ success: true, data: r.rows });
});

export const create = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { seasonId, categoryId, count } = req.body ?? {};
  if (typeof seasonId !== 'string' || typeof categoryId !== 'string' || !seasonId || !categoryId) throw new AppError('Selecciona temporada y categoría', 400);
  if (![3, 4, 6, 8, 10, 12].includes(count)) throw new AppError('Formato inválido', 400);
  const standings = (await calcularPosiciones(seasonId, categoryId)).filter(t => !t.excluded_from_standings);
  if (standings.some(t => t.played > 0 && t.tiebreak_pending)) throw new AppError('Hay un empate deportivo. Define la siembra antes de generar playoffs; el orden alfabético no resuelve el empate.', 409);
  const seeds = standings.filter((t) => t.played > 0).slice(0, count).map((t) => ({ id: t.team_id, name: t.team_name }));
  if (seeds.length !== count) throw new AppError('No hay suficientes equipos con resultados en esta categoría', 400);
  const id = newPrefixedId('po');
  await withTransaction(async (q) => {
    const season = await q('SELECT id FROM seasons WHERE id = $1 AND league_id = $2 FOR UPDATE', [seasonId, req.user!.leagueId]);
    if (!season.rows.length) throw new AppError('Temporada no encontrada', 404);
    const cat = await q('SELECT id FROM categories WHERE id = $1 AND season_id = $2', [categoryId, seasonId]);
    if (!cat.rows.length) throw new AppError('Categoría inválida', 400);
    if ((await q('SELECT id FROM playoffs WHERE season_id = $1 AND category_id = $2 AND discarded_at IS NULL', [seasonId, categoryId])).rows.length) throw new AppError('Ya existe un playoff en esta categoría', 409);
    await q('INSERT INTO playoffs(id, season_id, category_id, seeds, slots) VALUES($1,$2,$3,$4,$5)', [id, seasonId, categoryId, JSON.stringify(seeds), JSON.stringify(seedSlots(seeds.map((t) => t.id)))]);
  });
  await audit(req, { action: 'CREATE_PLAYOFF', entityType: 'playoff', entityId: id, newValue: { seeds } });
  res.status(201).json({ success: true, data: { id } });
});

/** Programa la primera fase o avanza con ganadores reales; repetir no duplica fases. */
type StageSchedule = {date:string;time:string;stage:number;roundId?:string;matches?:Record<number,{time:string;fieldId?:string}>};
async function scheduleStage(q:typeof query,req:AuthRequest,id:string,input:StageSchedule,seasonId?:string) {
  const { date, time } = input;
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time ?? '')) throw new AppError('Indica fecha y hora válidas', 400);
    const r = await q(`SELECT p.* FROM playoffs p JOIN seasons s ON s.id = p.season_id WHERE p.id = $1 AND s.league_id = $2 FOR UPDATE OF p`, [id, req.user!.leagueId]);
    const p = r.rows[0];
    if (!p) throw new AppError('Playoff no encontrado', 404);
    if (seasonId && p.season_id!==seasonId) throw new AppError('Selecciona una sola temporada.',400);
    if (p.discarded_at) throw new AppError('Playoff descartado',409);
    if (p.champion_id) throw new AppError('El playoff ya terminó', 409);
    // La versión enviada evita avanzar dos veces con doble clic o dos administradores.
    if (input.stage !== p.stage) throw new AppError('La fase cambió. Actualiza la pantalla.', 409);
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
    const round = await eventRound(q,p.season_id,date,req.user!.id,input.roundId);
    const roundId = round.id;
    for (let i = 0; i < slots.length; i += 2) {
      if (!slots[i] || !slots[i + 1]) continue;
      const option = input.matches?.[i / 2];
      const start = option?.time ?? time;
      const field = option?.fieldId || null;
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(start)) throw new AppError('Hora incorrecta',400);
      if (round.status !== 'DRAFT' && !field) throw new AppError('Asigna cancha para agregar a una jornada publicada.',400);
      await checkSlot(q,p.season_id,date,start,slots[i]!,slots[i+1]!,field);
      const gameId = newPrefixedId('gam');
      await q(`INSERT INTO games(id, season_id, round_id, category_id, home_team_id, away_team_id, scheduled_time, field_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`, [gameId, p.season_id, roundId, p.category_id, slots[i], slots[i + 1], start, field]);
      await q('INSERT INTO playoff_games(playoff_id,game_id,stage,slot) VALUES($1,$2,$3,$4)', [p.id, gameId, p.stage + 1, i / 2]);
    }
    await validarClubesJornada(roundId,date,q);
    await q('UPDATE playoffs SET stage = stage + 1, slots = $2 WHERE id = $1', [p.id, JSON.stringify(slots)]);
    return { roundId };

}

export const advance = asyncHandler(async (req:AuthRequest,res:Response)=>{
  const result=await withTransaction(async q=>{
    const saved=await scheduleStage(q,req,String(req.params.id),req.body);
    await audit(req,{action:'ADVANCE_PLAYOFF',entityType:'playoff',entityId:req.params.id,newValue:saved},q);
    return saved;
  });
  res.json({success:true,data:result});
});

export const scheduleBatch = asyncHandler(async (req:AuthRequest,res:Response)=>{
  const {seasonId,date,roundId,stages,fixtures=[]}=req.body ?? {};
  if (!Array.isArray(stages) || !Array.isArray(fixtures) || (!stages.length && !fixtures.length) || stages.some(s=>!s || typeof s.id!=='string') || new Set(stages.map(s=>s.id)).size!==stages.length) throw new AppError('Selecciona las categorías de la jornada.',400);
  const result=await withTransaction(async q=>{
    const ids=stages.map(s=>s.id);
    await q('SELECT id FROM playoffs WHERE id=ANY($1::text[]) ORDER BY id FOR UPDATE',[ids]);
    const season=await q('SELECT id FROM seasons WHERE id=$1 AND league_id=$2 FOR UPDATE',[seasonId,req.user!.leagueId]);
    if (!season.rows.length) throw new AppError('Temporada no encontrada',404);
    let target=roundId;
    for (const stage of stages) {
      const saved=await scheduleStage(q,req,stage.id,{...stage,date,roundId:target},seasonId);
      target=saved.roundId ?? target;
      await audit(req,{action:'ADVANCE_PLAYOFF',entityType:'playoff',entityId:stage.id,newValue:saved},q);
    }
    if (fixtures.length) {
      target=(await eventRound(q,seasonId,date,req.user!.id,target)).id;
      for (const match of fixtures) {
        if (!match) throw new AppError('Amistoso inválido',400);
        const id=await scheduleFixture(q,seasonId,date,target,match);
        await audit(req,{action:match.kind==='FRIENDLY'?'CREATE_FRIENDLY':'CREATE_REGULAR_GAME',entityType:'game',entityId:id,newValue:{roundId:target,date}},q);
      }
    }
    return {roundId:target};
  });
  res.json({success:true,data:result});
});

export const discard = asyncHandler(async (req: AuthRequest,res: Response) => {
  const {reason, gameId, confirmHistory} = req.body ?? {};
  if (typeof reason !== 'string' || reason.trim().length < 3) throw new AppError('Indica el motivo del descarte.',400);
  await withTransaction(async q => {
    const playoff = (await q(`SELECT p.* FROM playoffs p JOIN seasons s ON s.id=p.season_id
      WHERE p.id=$1 AND s.league_id=$2 FOR UPDATE OF p`,[req.params.id,req.user!.leagueId])).rows[0];
    if (!playoff) throw new AppError('Playoff no encontrado',404);
    if (playoff.discarded_at) return;
    // Serialize discards from different brackets sharing a date and scheduling into that round.
    const rounds = await q(`SELECT r.id FROM rounds r WHERE EXISTS (
      SELECT 1 FROM games g JOIN playoff_games pg ON pg.game_id=g.id
      WHERE g.round_id=r.id AND pg.playoff_id=$1 AND ($2::text IS NULL OR g.id=$2))
      ORDER BY r.id FOR UPDATE`,[playoff.id,gameId ?? null]);
    const games = (await q(`SELECT g.*, pg.stage, EXISTS(SELECT 1 FROM game_events e WHERE e.game_id=g.id)
      OR EXISTS(SELECT 1 FROM game_stat_batches b WHERE b.game_id=g.id)
      OR EXISTS(SELECT 1 FROM game_reports r WHERE r.game_id=g.id AND r.revision>0) AS has_history
      FROM playoff_games pg JOIN games g ON g.id=pg.game_id WHERE pg.playoff_id=$1
      AND ($2::text IS NULL OR g.id=$2) FOR UPDATE OF g`,[playoff.id,gameId ?? null])).rows;
    if (gameId && !games.length) throw new AppError('Partido no encontrado',404);
    if (gameId && (games[0].stage !== playoff.stage || playoff.champion_id)) throw new AppError('Otra fase depende de este resultado. Revisa la llave completa.',409);
    const historical = games.some(g=>g.playoff_void_with_history || g.score_source === 'MANUAL' || g.has_history || g.started_at || g.ended_at || g.home_score || g.away_score || g.mvp_offensive_player_id || g.mvp_defensive_player_id || ['FINISHED','LIVE','WALKOVER'].includes(g.status));
    if (historical && !(confirmHistory === true && req.user!.role === 'SUPER_ADMIN'))
      throw new AppError('Hay resultados o estadísticas. Se requiere confirmación histórica del superadministrador.',409);
    await q("UPDATE games SET status='CANCELLED', playoff_void_with_history=playoff_void_with_history OR $2, updated_at=NOW() WHERE id=ANY($1::text[]) AND status<>'CANCELLED'",[games.map(g=>g.id),historical]);
    await q('SELECT archive_empty_playoff_rounds($1::text[])',[rounds.rows.map(r=>r.id)]);
    if (!gameId) await q('UPDATE playoffs SET discarded_at=NOW() WHERE id=$1',[playoff.id]);
    await audit(req,{action:'DISCARD_PLAYOFF',entityType:'playoff',entityId:playoff.id,
      oldValue:games.map(g=>({id:g.id,status:g.status})),newValue:{gameId,reason,historical}},q);
  });
  res.json({success:true,data:{discarded:true}});
});

export const reschedule = asyncHandler(async (req:AuthRequest,res:Response)=>{
  const {date,time,fieldId,roundId} = req.body ?? {};
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time) || !fieldId) throw new AppError('Selecciona fecha, hora y cancha.',400);
  await withTransaction(async q=>{
    const game=(await q(`SELECT g.*, pg.stage AS game_stage,p.stage,p.champion_id FROM playoff_games pg JOIN playoffs p ON p.id=pg.playoff_id
      JOIN seasons s ON s.id=p.season_id JOIN games g ON g.id=pg.game_id WHERE pg.playoff_id=$1 AND pg.game_id=$2
      AND s.league_id=$3 AND p.discarded_at IS NULL FOR UPDATE OF p`,[req.params.id,req.params.gameId,req.user!.leagueId])).rows[0];
    if (!game) throw new AppError('Partido no encontrado',404);
    if (game.playoff_void_with_history || game.score_source === 'MANUAL' || game.stage!==game.game_stage || game.champion_id || !['CANCELLED','SCHEDULED'].includes(game.status) || game.started_at || game.ended_at || game.home_score || game.away_score || game.mvp_offensive_player_id || game.mvp_defensive_player_id)
      throw new AppError('Hay un resultado o una fase dependiente.',409);
    if ((await q('SELECT 1 FROM game_events WHERE game_id=$1 UNION ALL SELECT 1 FROM game_stat_batches WHERE game_id=$1 UNION ALL SELECT 1 FROM game_reports WHERE game_id=$1 AND revision>0 LIMIT 1',[game.id])).rows.length) throw new AppError('El partido tiene historial registrado.',409);
    await q('SELECT id FROM seasons WHERE id=$1 FOR UPDATE',[game.season_id]);
    const target=await eventRound(q,game.season_id,date,req.user!.id,roundId);
    await checkSlot(q,game.season_id,date,time,game.home_team_id,game.away_team_id,fieldId,game.id);
    await q("UPDATE games SET round_id=$2,scheduled_time=$3,field_id=$4,status='SCHEDULED',updated_at=NOW() WHERE id=$1",[game.id,target.id,time,fieldId]);
    await validarClubesJornada(target.id,date,q,game.id);
    await audit(req,{action:'RESCHEDULE_PLAYOFF_GAME',entityType:'game',entityId:game.id,oldValue:{roundId:game.round_id},newValue:{roundId:target.id,date,time,fieldId}},q);
  });
  res.json({success:true,data:{saved:true}});
});
