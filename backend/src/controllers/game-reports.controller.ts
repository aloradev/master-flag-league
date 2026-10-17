import { createHash, randomBytes } from 'node:crypto';
import { query } from '../config/database.js';
import { AppError, asyncHandler } from '../middleware/errorHandler.js';
import type { AuthRequest } from '../middleware/auth.js';
import { audit } from '../services/audit.service.js';
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const gameSql = `SELECT g.id, h.name AS home_team_name, a.name AS away_team_name
 FROM games g JOIN teams h ON h.id=g.home_team_id JOIN teams a ON a.id=g.away_team_id WHERE g.id=$1`;

export const adminRead = asyncHandler(async (req, res) => {
 const result = await query('SELECT data, revision, expires_at, updated_at FROM game_reports WHERE game_id=$1', [req.params.id]);
 res.json({ success: true, data: result.rows[0] ?? null });
});
export const createLink = asyncHandler(async (req: AuthRequest, res) => {
 const game = await query(gameSql, [req.params.id]);
 if (!game.rows.length) throw new AppError('Partido no encontrado', 404);
 const token = randomBytes(32).toString('hex');
 const result = await query(`INSERT INTO game_reports(game_id,token_hash,expires_at) VALUES($1,$2,NOW()+INTERVAL '7 days')
 ON CONFLICT(game_id) DO UPDATE SET token_hash=$2, expires_at=NOW()+INTERVAL '7 days' RETURNING expires_at`, [req.params.id,hash(token)]);
 await audit(req, { action: 'CREATE_REPORT_LINK', entityType: 'game', entityId: String(req.params.id) });
 res.json({ success: true, data: { token, expires_at: result.rows[0].expires_at } });
});
export const revoke = asyncHandler(async (req: AuthRequest, res) => {
 await query('UPDATE game_reports SET token_hash=NULL, expires_at=NULL WHERE game_id=$1', [req.params.id]);
 await audit(req, { action: 'REVOKE_REPORT_LINK', entityType: 'game', entityId: String(req.params.id) });
 res.json({ success: true });
});
export const read = asyncHandler(async (req, res) => {
 const token = req.get('authorization')?.replace(/^Bearer /, '') ?? '';
 const result = await query(`SELECT data,revision,expires_at FROM game_reports WHERE game_id=$1 AND token_hash=$2 AND expires_at>NOW()`, [req.params.id,hash(token)]);
 if (!result.rows.length) throw new AppError('El enlace venció o fue revocado. Solicita otro a administración.', 401);
 const game = await query(gameSql, [req.params.id]);
 res.setHeader('Cache-Control','no-store');
 res.json({ success: true, data: { ...result.rows[0], game: game.rows[0] } });
});
export const save = asyncHandler(async (req, res) => {
 const { data, revision } = req.body ?? {};
 if (!data || typeof data !== 'object' || Array.isArray(data) || !Number.isInteger(revision)
  || typeof data.author !== 'string' || !data.author.trim() || data.author.length>150
  || typeof data.notes !== 'string' || data.notes.length>10000
  || ![data.homeScore,data.awayScore].every(v => Number.isInteger(v) && v>=0 && v<=999)
  || !Array.isArray(data.players) || data.players.length>200) throw new AppError('Revisa responsable, marcador y acta.',400);
 for (const p of data.players) {
  if (!p || !['home','away'].includes(p.team) || typeof p.name!=='string' || !p.name.trim() || p.name.length>150
   || typeof p.jersey!=='string' || p.jersey.length>10
   || !['td','passes','receptions','interceptions','sacks'].every(k => Number.isInteger(p[k]) && p[k]>=0 && p[k]<=999)) throw new AppError('Revisa los nombres y estadísticas de los jugadores.',400);
 }
 const token = req.get('authorization')?.replace(/^Bearer /, '') ?? '';
 const result = await query(`UPDATE game_reports SET data=$3::jsonb,revision=revision+1,updated_at=NOW()
 WHERE game_id=$1 AND token_hash=$2 AND expires_at>NOW() AND revision=$4 RETURNING revision,updated_at`, [req.params.id,hash(token),JSON.stringify(data),revision]);
 if (!result.rows.length) {
  const valid = await query('SELECT 1 FROM game_reports WHERE game_id=$1 AND token_hash=$2 AND expires_at>NOW()', [req.params.id,hash(token)]);
  throw new AppError(valid.rows.length ? 'Otra persona actualizó el acta. Recarga antes de guardar.' : 'El enlace venció o fue revocado.',valid.rows.length ? 409 : 401);
 }
 res.json({success:true,data:result.rows[0]});
});
