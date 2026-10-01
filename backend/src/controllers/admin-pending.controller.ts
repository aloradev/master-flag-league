import type { Response } from 'express';
import { query } from '../config/database.js';
import { ADMIN_ROLES, type AuthRequest } from '../middleware/auth.js';
import { AppError, asyncHandler } from '../middleware/errorHandler.js';

export const adminPending = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!ADMIN_ROLES.includes(req.user?.role as never)) throw new AppError('Solo administración deportiva puede consultar los pendientes',403);
  const seasonId = String(req.query.seasonId ?? '');
  const season = await query('SELECT id FROM seasons WHERE id=$1 AND league_id=$2',[seasonId,req.user!.leagueId]);
  if (!season.rows.length) throw new AppError('Temporada no encontrada',404);
  const [games,players,teams] = await Promise.all([
    query(`SELECT g.id,g.round_id,r.number AS round_number,c.name AS category_name,
      to_char(r.scheduled_date,'YYYY-MM-DD') AS date, h.name AS home_name,a.name AS away_name,
      (g.status IN ('SCHEDULED','LIVE') AND r.scheduled_date < (NOW() AT TIME ZONE 'America/Cancun')::date) AS needs_result,
      (g.status='FINISHED' AND g.statistics_status='PENDING') AS needs_statistics,
      (g.status='POSTPONED') AS postponed,
      (g.status IN ('SCHEDULED','LIVE') AND NOT EXISTS (
        SELECT 1 FROM game_referees gr JOIN referees rf ON rf.id=gr.referee_id
        JOIN users u ON u.id=rf.user_id JOIN roles role ON role.id=u.role_id
        WHERE gr.game_id=g.id AND gr.role='PRINCIPAL' AND rf.status='ACTIVE' AND u.active
          AND role.name IN ('REFEREE','SUPER_ADMIN','SPORTS_ADMIN')
      )) AS needs_referee
      FROM games g JOIN rounds r ON r.id=g.round_id JOIN categories c ON c.id=g.category_id
      JOIN teams h ON h.id=g.home_team_id JOIN teams a ON a.id=g.away_team_id
      WHERE g.season_id=$1 AND g.game_type='OFFICIAL' AND r.round_type='OFFICIAL'
        AND r.status IN ('PUBLISHED','IN_PROGRESS','FINISHED') AND g.status<>'CANCELLED'
      ORDER BY r.scheduled_date,r.number,g.scheduled_time,g.id`,[seasonId]),
    query(`SELECT p.id,CONCAT_WS(' ',p.first_name,p.last_name_paternal,p.last_name_maternal) AS name,
      p.team_id,t.name AS team_name,c.name AS category_name,p.status,p.eligibility_reason AS reason
      FROM players p JOIN teams t ON t.id=p.team_id JOIN categories c ON c.id=p.category_id
      WHERE p.season_id=$1 AND p.removed_at IS NULL AND t.team_type='OFFICIAL'
        AND p.status IN ('PENDING','CORRECTIONS_REQUIRED','REJECTED')
      ORDER BY p.created_at,p.id`,[seasonId]),
    query(`SELECT t.id,t.name,c.name AS category_name,
      (SELECT count(*)::int FROM players p WHERE p.team_id=t.id AND p.removed_at IS NULL) AS total,
      (SELECT count(*)::int FROM players p WHERE p.team_id=t.id AND p.removed_at IS NULL AND p.is_eligible) AS eligible
      FROM teams t JOIN categories c ON c.id=t.category_id
      WHERE t.season_id=$1 AND t.team_type='OFFICIAL' AND t.status='ACTIVE'
      AND (NOT EXISTS(SELECT 1 FROM players p WHERE p.team_id=t.id AND p.removed_at IS NULL)
        OR EXISTS(SELECT 1 FROM players p WHERE p.team_id=t.id AND p.removed_at IS NULL AND NOT p.is_eligible))
      ORDER BY c.sort_order,t.name`,[seasonId]),
  ]);
  const items = games.rows.flatMap(g => {
    const kinds = [g.needs_result && 'RESULT', g.needs_statistics && 'STATISTICS',
      g.needs_referee && 'REFEREE',g.postponed && 'POSTPONED'].filter(Boolean) as string[];
    return kinds.length ? [{id:g.id,type:'game',kinds,title:`${g.home_name} vs ${g.away_name}`,
      detail:`Jornada ${g.round_number} · ${g.category_name}`,date:g.date,
      round_id:g.round_id,team_id:null as string|null,reason:null as string|null}] : [];
  });
  for (const p of players.rows) items.push({id:p.id,type:'player',kinds:['REGISTRATION'],title:p.name,
    detail:`${p.team_name} · ${p.category_name}`,date:null,round_id:null,team_id:p.team_id,
    reason:p.reason || (p.status==='CORRECTIONS_REQUIRED' ? 'Requiere correcciones' : 'Registro por revisar o completar')});
  for (const t of teams.rows) items.push({id:t.id,type:'team',kinds:['TEAM'],title:t.name,
    detail:t.category_name,date:null,round_id:null,team_id:t.id,
    reason:t.total ? `${t.eligible} de ${t.total} jugadores habilitados` : 'Equipo sin plantilla: falta registrar jugadores'});
  const counts = Object.fromEntries(['RESULT','STATISTICS','REFEREE','POSTPONED','REGISTRATION','TEAM'].map(kind=>[kind,items.filter(i=>i.kinds.includes(kind)).length]));
  res.json({success:true,data:{items,counts,updated_at:new Date().toISOString()}});
});
