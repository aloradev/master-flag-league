import type { Request, Response } from 'express';
import { query } from '../config/database.js';
import { AppError, asyncHandler } from '../middleware/errorHandler.js';
import type { AuthRequest } from '../middleware/auth.js';
import { newPrefixedId } from '../utils/id.js';

export const submit = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body ?? {};
  if (body.website) return res.status(201).json({ success: true });
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
  const category = typeof body.category === 'string' ? body.category.trim() : '';
  const availability = typeof body.availability === 'string' ? body.availability.trim() : '';
  if (name.length < 2 || name.length > 120 || email.length > 255 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    || phone.length > 30 || phone && !/^[+()\d\s-]{7,30}$/.test(phone) || !category || category.length > 80
    || availability.length > 300 || !['NEW','CASUAL','EXPERIENCED'].includes(body.experience)
    || body.consent !== true || typeof body.requestId !== 'string'
    || !/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(body.requestId)) {
    throw new AppError('Revisa tus datos y autoriza que la liga te contacte.', 400);
  }
  const league = await query(`SELECT id FROM leagues WHERE slug=$1 AND status='ACTIVE'`, [process.env.PUBLIC_LEAGUE_SLUG || 'cancun']);
  if (!league.rows[0]) throw new AppError('La liga no está recibiendo solicitudes en este momento.', 503);
  const leagueId = league.rows[0].id;
  // A retry after a lost response must not create another prospect.
  const existing = await query('SELECT id FROM player_interests WHERE request_id=$1', [body.requestId]);
  if (existing.rows.length) return res.status(201).json({ success: true });
  const recent = await query(`SELECT COUNT(*)::int AS total FROM player_interests WHERE league_id=$1 AND email=$2 AND created_at>NOW()-INTERVAL '1 day'`, [leagueId, email]);
  if (recent.rows[0].total >= 3) throw new AppError('Ya recibimos solicitudes con este correo. Intenta nuevamente mañana.', 429);
  await query(`INSERT INTO player_interests(id,request_id,league_id,name,email,phone,category,experience,availability)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(request_id) DO NOTHING`,
    [newPrefixedId('interest'), body.requestId, leagueId, name, email, phone || null, category, body.experience, availability]);
  res.status(201).json({ success: true });
});

export const list = asyncHandler(async (req: AuthRequest, res: Response) => {
  const result = await query(`SELECT id,name,email,phone,category,experience,availability,status,created_at
    FROM player_interests WHERE league_id=$1 ORDER BY created_at DESC LIMIT 300`, [req.user!.leagueId]);
  res.json({ success: true, data: result.rows });
});

export const update = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!['NEW','CONTACTED','CLOSED'].includes(req.body?.status)) throw new AppError('Estado inválido', 400);
  const result = await query(`UPDATE player_interests SET status=$1,updated_at=NOW() WHERE id=$2 AND league_id=$3 RETURNING id,status`, [req.body.status, req.params.id, req.user!.leagueId]);
  if (!result.rows[0]) throw new AppError('Solicitud no encontrada', 404);
  res.json({ success: true, data: result.rows[0] });
});
