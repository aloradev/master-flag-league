import { createHash } from 'node:crypto';
import { query } from '../config/database.js';
import type { AuthRequest } from '../middleware/auth.js';
import { AppError } from '../middleware/errorHandler.js';
import { audit } from './audit.service.js';
import { esJugadaValida, JUGADAS } from './competition.service.js';
import { newPrefixedId } from '../utils/id.js';

type TotalRow = { teamId:string; playerId:string|null; eventType:string; count:number; totalYards:number|null };
type Game = { id:string; season_id:string; statistics_status:string; home_team_id:string; away_team_id:string; home_score:number; away_score:number; require_approval_to_play:boolean };
type Event = { id:string; team_id:string; player_id:string|null; event_type:string; quantity:number; yards:number|null; points:number };
const rowKey = (team:string,player:string|null,type:string) => JSON.stringify([team,player,type]);

/** El llamador ya comprobó rol, liga y estado del partido y mantiene su bloqueo. */
export async function saveHistoricalTotals(req: AuthRequest, game: Game, q: typeof query) {
  const { batchId, rows: input, expectedEventIds, version } = req.body;
  const reason = req.body.reason.trim();
  if (version !== 2) throw new AppError('Actualiza la página y usa el formulario de totales del acta',400);
  if (typeof batchId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(batchId)) throw new AppError('Identificador de captura inválido',400);
  if (!Array.isArray(input) || input.length<1 || input.length>200) throw new AppError('Indica entre 1 y 200 filas',400);
  if (!Array.isArray(expectedEventIds) || expectedEventIds.length>100000 || expectedEventIds.some(id=>typeof id!=='string') || new Set(expectedEventIds).size!==expectedEventIds.length) throw new AppError('Actualiza la captura antes de guardar',400);
  const seen = new Set<string>();
  const rows: TotalRow[] = input.map((raw: unknown) => {
    if (!raw || typeof raw!=='object' || Array.isArray(raw)) throw new AppError('Fila de captura inválida',400);
    const r=raw as Record<string,unknown>;
    if (typeof r.teamId!=='string' || ![game.home_team_id,game.away_team_id].includes(r.teamId) || typeof r.eventType!=='string' || !esJugadaValida(r.eventType)) throw new AppError('Equipo o estadística inválidos',400);
    if (typeof r.count!=='number' || !Number.isInteger(r.count) || r.count<0 || r.count>100) throw new AppError('Cada total debe ser un entero entre 0 y 100',400);
    const playerId=r.playerId ?? null;
    if ((playerId!==null && (typeof playerId!=='string' || !playerId)) || (JUGADAS[r.eventType].needsPlayer && !playerId)) throw new AppError('Selecciona el jugador de cada estadística',400);
    const totalYards=r.totalYards ?? null;
    if (totalYards!==null && (typeof totalYards!=='number' || !Number.isInteger(totalYards) || Math.abs(totalYards)>100*r.count || !['PASS_COMPLETE','RECEPTION','RUSH'].includes(r.eventType))) throw new AppError('Las yardas deben ser el total acumulado de pases, recepciones o acarreos (hasta 100 por acción)',400);
    const row={teamId:r.teamId,playerId:playerId as string|null,eventType:r.eventType,count:r.count,totalYards:totalYards as number|null};
    const key=rowKey(row.teamId,row.playerId,row.eventType);
    if (seen.has(key)) throw new AppError('Hay filas repetidas para el mismo jugador y estadística',400);
    seen.add(key);return row;
  }).sort((a,b)=>rowKey(a.teamId,a.playerId,a.eventType).localeCompare(rowKey(b.teamId,b.playerId,b.eventType)));
  const hash=createHash('sha256').update(JSON.stringify({rows,reason,expectedEventIds:[...expectedEventIds].sort()})).digest('hex');
  const receipt=(await q('SELECT * FROM game_stat_batches WHERE id=$1',[batchId])).rows[0];
  if (receipt) {
    if (receipt.game_id!==game.id || receipt.user_id!==req.user!.id || receipt.request_hash!==hash) throw new AppError('Ese intento corresponde a otra captura. Actualiza y revisa los datos.',409);
    return {...receipt.result,replayed:true};
  }
  if (game.statistics_status!=='PENDING') throw new AppError('Reabre las estadísticas antes de modificarlas',409);
  const events=(await q<Event>('SELECT id,team_id,player_id,event_type,quantity,yards,points FROM game_events WHERE game_id=$1 AND voided_at IS NULL',[game.id])).rows;
  if (JSON.stringify(events.map(e=>e.id).sort())!==JSON.stringify([...expectedEventIds].sort())) throw new AppError('La captura cambió desde que la abriste. Actualiza y revisa los totales antes de guardar.',409);
  const changes: { row:TotalRow; previous:Event[] }[]=[];
  const projected=new Map<string,number>([game.home_team_id,game.away_team_id].map(id=>[id,events.filter(e=>e.team_id===id).reduce((n,e)=>n+e.points,0)]));
  for (const row of rows) {
    if (row.playerId) {
      const p=(await q('SELECT team_id,is_eligible FROM players WHERE id=$1 AND season_id=$2 AND removed_at IS NULL',[row.playerId,game.season_id])).rows[0];
      if (!p || p.team_id!==row.teamId) throw new AppError('Un jugador no pertenece al equipo señalado',400);
      if (game.require_approval_to_play && !p.is_eligible) throw new AppError('Un jugador aún no es elegible; completa su registro',409);
    }
    const previous=events.filter(e=>rowKey(e.team_id,e.player_id,e.event_type)===rowKey(row.teamId,row.playerId,row.eventType));
    const oldPoints=previous.reduce((n,e)=>n+e.points,0);
    const newPoints=JUGADAS[row.eventType].points*row.count;
    projected.set(row.teamId,projected.get(row.teamId)!-oldPoints+newPoints);
    const oldCount=previous.reduce((n,e)=>n+e.quantity,0);
    const oldYards=previous.some(e=>e.yards!==null) ? previous.reduce((n,e)=>n+(e.yards??0),0) : null;
    if (oldCount!==row.count || oldYards!==row.totalYards || oldPoints!==newPoints) changes.push({row,previous});
  }
  if (projected.get(game.home_team_id)!>game.home_score || projected.get(game.away_team_id)!>game.away_score) throw new AppError('El total de anotaciones, incluyendo lo ya capturado, supera el marcador oficial',409);
  for (const {row,previous} of changes) {
    if (previous.length) await q('UPDATE game_events SET voided_at=NOW(),voided_by=$1 WHERE id=ANY($2::text[])',[req.user!.id,previous.map(e=>e.id)]);
    if (row.count) await q(`INSERT INTO game_events(id,game_id,team_id,player_id,event_type,points,quantity,yards,capture_source,recorded_by)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,'TOTALS',$9)`,[newPrefixedId('evt'),game.id,row.teamId,row.playerId,row.eventType,JUGADAS[row.eventType].points*row.count,row.count,row.totalYards,req.user!.id]);
  }
  await q('UPDATE games SET updated_at=NOW() WHERE id=$1',[game.id]);
  const result={statistics_status:'PENDING',home_score:game.home_score,away_score:game.away_score,changed_rows:changes.length};
  await audit(req,{action:'HISTORICAL_STATISTICS_BULK',entityType:'game',entityId:game.id,
    oldValue:{events:changes.flatMap(c=>c.previous)},newValue:{batchId,reason,rows,result}},q);
  await q('INSERT INTO game_stat_batches(id,game_id,user_id,request_hash,result) VALUES($1,$2,$3,$4,$5)',[batchId,game.id,req.user!.id,hash,JSON.stringify(result)]);
  return result;
}
