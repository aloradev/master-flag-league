import type { Response } from 'express';
import { query, withTransaction } from '../config/database.js';
import { type AuthRequest, ADMIN_ROLES } from '../middleware/auth.js';
import { AppError, asyncHandler } from '../middleware/errorHandler.js';
import { audit } from '../services/audit.service.js';

const requireAdmin = (req: AuthRequest) => {
  if (!ADMIN_ROLES.includes(req.user?.role as never)) throw new AppError('Solo administración deportiva puede consultar o cambiar el seguimiento', 403);
};

export const teamProgress = asyncHandler(async (req: AuthRequest, res: Response) => {
  requireAdmin(req);
  const seasonId = String(req.query.seasonId ?? '');
  const season = (await query(`SELECT id FROM seasons WHERE id=$1 AND league_id=$2`, [seasonId,req.user!.leagueId])).rows[0];
  if (!season) throw new AppError('Temporada no encontrada',404);
  const [teams, rounds, games, byes] = await Promise.all([
    query(`SELECT t.id,t.name,t.status,c.name AS category_name,t.category_id,
      to_char(t.competition_start_date,'YYYY-MM-DD') AS competition_start_date
      FROM teams t JOIN categories c ON c.id=t.category_id
      WHERE t.season_id=$1 AND t.team_type='OFFICIAL' ORDER BY c.sort_order,t.name`,[seasonId]),
    query(`SELECT id,number,status,to_char(scheduled_date,'YYYY-MM-DD') AS date,
      scheduled_date < (NOW() AT TIME ZONE 'America/Cancun')::date AS elapsed
      FROM rounds WHERE season_id=$1 AND round_type='OFFICIAL' AND playoff_id IS NULL
      AND status IN ('PUBLISHED','IN_PROGRESS','FINISHED') ORDER BY scheduled_date,number`,[seasonId]),
    query(`SELECT g.id,g.round_id,g.home_team_id,g.away_team_id,g.status,
      h.name AS home_name,a.name AS away_name FROM games g
      JOIN teams h ON h.id=g.home_team_id JOIN teams a ON a.id=g.away_team_id
      WHERE g.season_id=$1 AND g.game_type='OFFICIAL'`,[seasonId]),
    query(`SELECT b.round_id,b.team_id,b.reason FROM round_byes b
      JOIN rounds r ON r.id=b.round_id WHERE r.season_id=$1`,[seasonId]),
  ]);
  const closedRounds = new Set(rounds.rows.filter(r=>r.status==='FINISHED').map(r=>r.id));
  const data = teams.rows.map(team => {
    const timeline = rounds.rows.map(round => {
      const matches = games.rows.filter(g=>g.round_id===round.id && [g.home_team_id,g.away_team_id].includes(team.id));
      const game = matches.find(g=>g.status!=='CANCELLED') ?? matches[0];
      const bye = byes.rows.find(b=>b.round_id===round.id && b.team_id===team.id);
      let state: string;
      if (game) {
        state = game.status === 'FINISHED' ? 'PLAYED' : game.status === 'WALKOVER' ? 'WALKOVER'
          : game.status === 'POSTPONED' ? 'POSTPONED' : game.status === 'LIVE' ? 'LIVE'
          : game.status === 'CANCELLED' ? 'CANCELLED' : round.elapsed ? 'AWAITING_RESULT' : 'SCHEDULED';
      } else if (bye) state='BYE';
      else if (team.competition_start_date && round.date < team.competition_start_date) state='BEFORE_ENTRY';
      else state=round.elapsed ? 'UNASSIGNED_ELAPSED' : 'UNASSIGNED';
      return { round_id:round.id, number:round.number, date:round.date, state,
        game_id:game?.id ?? null, opponent:game ? (game.home_team_id===team.id ? game.away_name : game.home_name) : null,
        bye_reason:bye?.reason ?? null };
    });
    const counts = Object.fromEntries(['PLAYED','WALKOVER','POSTPONED','LIVE','CANCELLED','AWAITING_RESULT','SCHEDULED','BYE','BEFORE_ENTRY','UNASSIGNED_ELAPSED','UNASSIGNED'].map(state=>[state,timeline.filter(r=>r.state===state).length]));
    counts.BYE_CLOSED=byes.rows.filter(b=>b.team_id===team.id && closedRounds.has(b.round_id)).length;
    return {...team,counts,timeline};
  });
  res.json({success:true,data});
});

export const updateCompetitionEntry = asyncHandler(async (req: AuthRequest,res: Response) => {
  requireAdmin(req);
  const { date,reason }=req.body ?? {};
  if (date !== null && (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)
    || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0,10)!==date)) throw new AppError('Indica una fecha válida o null para dejarla sin confirmar',400);
  if (typeof reason !== 'string' || !reason.trim() || reason.length>1000) throw new AppError('Indica el motivo del cambio (máximo 1000 caracteres)',400);
  const data=await withTransaction(async q=>{
    await q(`SELECT s.id FROM seasons s JOIN teams t ON t.season_id=s.id WHERE t.id=$1 AND s.league_id=$2 FOR UPDATE OF s`,[req.params.id,req.user!.leagueId]);
    const team=(await q(`SELECT t.id,to_char(t.competition_start_date,'YYYY-MM-DD') AS competition_start_date,
      to_char(s.start_date,'YYYY-MM-DD') AS season_start,to_char(s.end_date,'YYYY-MM-DD') AS season_end
      FROM teams t JOIN seasons s ON s.id=t.season_id
      WHERE t.id=$1 AND t.team_type='OFFICIAL' AND s.league_id=$2 FOR UPDATE OF t`,[req.params.id,req.user!.leagueId])).rows[0];
    if (!team) throw new AppError('Equipo no encontrado',404);
    if (date && (date<team.season_start || (team.season_end && date>team.season_end))) throw new AppError('La incorporación debe estar dentro de las fechas de la temporada',400);
    if (date && (await q(`SELECT 1 FROM rounds r WHERE r.scheduled_date<$2::date
      AND r.round_type='OFFICIAL' AND r.playoff_id IS NULL AND r.status IN ('DRAFT','PUBLISHED','IN_PROGRESS','FINISHED')
      AND (EXISTS (SELECT 1 FROM games g WHERE g.round_id=r.id AND g.game_type='OFFICIAL'
        AND g.status<>'CANCELLED' AND (g.home_team_id=$1 OR g.away_team_id=$1))
        OR EXISTS (SELECT 1 FROM round_byes b WHERE b.round_id=r.id AND b.team_id=$1)) LIMIT 1`,[team.id,date])).rows.length) {
      throw new AppError('El equipo ya tiene un partido o descanso guardado anterior a esa fecha',409);
    }
    await q('UPDATE teams SET competition_start_date=$1::date,updated_at=NOW() WHERE id=$2',[date,team.id]);
    await audit(req,{action:'UPDATE_COMPETITION_ENTRY',entityType:'team',entityId:team.id,
      oldValue:{date:team.competition_start_date},newValue:{date,reason:reason.trim()}},q);
    return {id:team.id,competition_start_date:date};
  });
  res.json({success:true,data});
});
