import { validarFechaJornada, validarClubesJornada, validarCupoJornadas, validarVueltas, validarIncorporacionesJornada } from './competition.service.js';
import { query } from '../config/database.js';
import { AppError } from '../middleware/errorHandler.js';
import { newPrefixedId } from '../utils/id.js';

/** Caller holds the season lock. Drafts are shared by local competition date. */
export async function eventRound(q: typeof query, seasonId: string, date: string, userId: string, selection?: string, forPlayoff = false) {
  await validarFechaJornada(seasonId,date,q);
  const existing = await q(`SELECT id, status FROM rounds WHERE season_id=$1 AND scheduled_date=$2
    AND status IN ('DRAFT','PUBLISHED') AND round_type='OFFICIAL'
    AND ($3::text IS NULL OR id=$3)
    ORDER BY competition_event DESC, number LIMIT 1 FOR UPDATE`, [seasonId, date, selection ?? null]);
  if (existing.rows.length) {
    const round = existing.rows[0];
    // Shared competition dates follow the same two-game rule as new event rounds.
    await q('UPDATE rounds SET allow_team_repeats=true WHERE id=$1 AND NOT allow_team_repeats', [round.id]);
    return round;
  }
  if (selection && selection !== 'new') throw new AppError('Elige una jornada abierta de la fecha seleccionada.', 409);
  const id = newPrefixedId('rnd');
  await q(`INSERT INTO rounds(id,season_id,number,name,scheduled_date,generated_by,competition_event,allow_team_repeats)
    SELECT $1,$2::varchar,COALESCE(MAX(number),0)+1,'Jornada de competición',$3,$4,true,true
    FROM rounds WHERE season_id=$2 AND round_type='OFFICIAL'`, [id,seasonId,date,userId]);
  return { id, status: 'DRAFT' };
}

export async function checkSlot(q: typeof query, seasonId: string, date: string, time: string, home: string, away: string, field?: string | null, exclude?: string) {
  if (field && !(await q('SELECT id FROM fields WHERE id=$1 AND season_id=$2 AND status=\'ACTIVE\'',[field,seasonId])).rows.length)
    throw new AppError('La cancha no pertenece a la temporada.',400);
  const conflict = await q(`SELECT g.id FROM games g JOIN rounds r ON r.id=g.round_id
    WHERE g.season_id=$1 AND r.scheduled_date=$2 AND g.scheduled_time=$3 AND g.id IS DISTINCT FROM $7
    AND r.status<>'CANCELLED' AND g.status NOT IN ('CANCELLED','POSTPONED')
    AND (g.field_id=$6 OR g.home_team_id IN ($4,$5) OR g.away_team_id IN ($4,$5)) LIMIT 1`,
    [seasonId,date,time,home,away,field || null,exclude ?? null]);
  if (conflict.rows.length) throw new AppError('La cancha o uno de los equipos ya tiene partido a esa hora.',409);
}

export type FixtureSchedule = {kind:'REGULAR'|'FRIENDLY';categoryId:string;homeTeamId:string;awayTeamId:string;time:string;fieldId:string};
export async function scheduleFixture(q:typeof query, seasonId:string, date:string, roundId:string, match:FixtureSchedule) {
  const {categoryId,homeTeamId,awayTeamId,fieldId,time}=match;
  if (!fieldId || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time) || homeTeamId===awayTeamId)
    throw new AppError('Selecciona dos equipos distintos, hora y cancha.',400);
  if (!['REGULAR','FRIENDLY'].includes(match.kind)) throw new AppError('Tipo de partido inválido.',400);
  const friendly=match.kind==='FRIENDLY';
  const teams=await q(`SELECT id FROM teams WHERE season_id=$1 AND category_id=$2 AND id IN ($3,$4)
    AND status='ACTIVE' AND team_type='OFFICIAL'`,[seasonId,categoryId,homeTeamId,awayTeamId]);
  if (teams.rows.length!==2) throw new AppError('Selecciona dos equipos activos de la categoría.',400);
  await checkSlot(q,seasonId,date,time,homeTeamId,awayTeamId,fieldId);
  if (!friendly) {
    await validarVueltas(seasonId,[match],q);
    const round=await q('SELECT competition_event FROM rounds WHERE id=$1',[roundId]);
    if (round.rows[0].competition_event) {
      await validarCupoJornadas(seasonId,q);
      await q('UPDATE rounds SET competition_event=false WHERE id=$1',[roundId]);
    }
    const resting=await q('SELECT 1 FROM round_byes WHERE round_id=$1 AND team_id IN ($2,$3)',[roundId,homeTeamId,awayTeamId]);
    if (resting.rows.length) throw new AppError('Un equipo tiene descanso asignado en esta jornada.',409);
  }
  const gameId=newPrefixedId('gam');
  await q(`INSERT INTO games(id,season_id,round_id,category_id,home_team_id,away_team_id,scheduled_time,field_id,game_type,league_friendly)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,[gameId,seasonId,roundId,categoryId,homeTeamId,awayTeamId,time,fieldId,friendly?'SCRIMMAGE':'OFFICIAL',friendly]);
  await validarIncorporacionesJornada(roundId,date,q);
  await validarClubesJornada(roundId,date,q,gameId);
  return gameId;
}
