import type { Response } from 'express';
import { query } from '../config/database.js';
import { canAccessTeam, type AuthRequest } from '../middleware/auth.js';
import { AppError, asyncHandler } from '../middleware/errorHandler.js';
import { getRequiredDocuments } from '../services/eligibility.service.js';

/** Progreso derivado de registros guardados; no crea otro estado de inscripción. */
export const registrationStatus = asyncHandler(async (req: AuthRequest, res: Response) => {
  const id = req.params.id;
  if (!canAccessTeam(req, id)) throw new AppError('No tienes acceso a este equipo', 403);
  const team = (await query(`SELECT t.id,t.season_id FROM teams t JOIN seasons s ON s.id=t.season_id
    WHERE t.id=$1 AND s.league_id=$2 AND t.team_type='OFFICIAL'`, [id, req.user!.leagueId])).rows[0];
  if (!team) throw new AppError('Equipo no encontrado', 404);
  const required = await getRequiredDocuments(team.season_id);
  const players = (await query(`SELECT p.id,concat_ws(' ',p.first_name,p.last_name_paternal,p.last_name_maternal) AS name,
    p.status,p.is_eligible,p.eligibility_reason,
    ARRAY(SELECT d.document_type FROM player_documents d WHERE d.player_id=p.id AND d.is_current) AS documents
    FROM players p WHERE p.team_id=$1 AND p.removed_at IS NULL ORDER BY p.created_at,p.id`, [id])).rows.map(p => ({
      id: p.id, name: p.name, status: p.status, is_eligible: p.is_eligible, reason: p.eligibility_reason,
      missing: required.filter(type => !p.documents.includes(type)),
    }));
  res.json({ success: true, data: { required, players, total: players.length,
    documented: players.filter(p => p.missing.length === 0).length,
    eligible: players.filter(p => p.is_eligible).length,
    pending: players.filter(p => p.status === 'PENDING' && p.missing.length === 0).length,
  } });
});
