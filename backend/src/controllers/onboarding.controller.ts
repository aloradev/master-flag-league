import type { Response } from 'express';
import { query, withTransaction } from '../config/database.js';
import { type AuthRequest, ROLES } from '../middleware/auth.js';
import { AppError, asyncHandler } from '../middleware/errorHandler.js';
import { hashPassword, validatePassword } from '../utils/password.js';
import { newPrefixedId } from '../utils/id.js';
import { demasiadosIntentos } from '../services/freno.service.js';
import { audit } from '../services/audit.service.js';

const text = (value: unknown, max: number) => typeof value === 'string' && value.trim().length <= max ? value.trim() : '';

export const options = asyncHandler(async (_req: AuthRequest, res: Response) => {
  const result = await query(`SELECT s.id, s.name, s.league_id, l.name AS league_name,
    c.id AS category_id, c.name AS category_name FROM seasons s
    JOIN leagues l ON l.id=s.league_id JOIN categories c ON c.season_id=s.id
    WHERE s.status='ACTIVE' AND l.status='ACTIVE'
    AND (s.registration_deadline IS NULL OR s.registration_deadline >= (NOW() AT TIME ZONE l.timezone)::date)
    ORDER BY s.year DESC, s.name, c.sort_order, c.name`);
  res.json({ success: true, data: result.rows });
});

export const register = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (demasiadosIntentos(`register:${req.ip}`, 20)) throw new AppError('Espera unos minutos antes de volver a intentar.', 429);
  const name = text(req.body?.name, 255);
  const email = text(req.body?.email, 255).toLowerCase();
  const leagueId = text(req.body?.leagueId, 36);
  const password = req.body?.password;
  if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || typeof password !== 'string'
    || Buffer.byteLength(password) > 72 || !validatePassword(password).valid) {
    throw new AppError('Indica nombre, correo válido y contraseña de 8 caracteres con letra y número (máximo 72 bytes).', 400);
  }
  const passwordHash = await hashPassword(password);
  await withTransaction(async q => {
    // Serializa altas con el mismo correo sin alterar los usuarios existentes.
    await q('SELECT pg_advisory_xact_lock(hashtext($1))', [`registration:${email}`]);
    if (!(await q("SELECT id FROM leagues WHERE id=$1 AND status='ACTIVE'", [leagueId])).rows.length) throw new AppError('Liga no disponible', 400);
    if ((await q('SELECT id FROM users WHERE LOWER(TRIM(email))=$1', [email])).rows.length) throw new AppError('Ya existe una cuenta con ese correo. Ingresa o recupera tu contraseña.', 409);
    await q(`INSERT INTO users (id,league_id,email,password_hash,name,role_id)
      VALUES ($1,$2,$3,$4,$5,'role_team_manager')`, [newPrefixedId('usr'),leagueId,email,passwordHash,name]);
  });
  res.status(201).json({ success: true, data: { registered: true } });
});

export const enroll = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (req.user?.role !== ROLES.TEAM_MANAGER) throw new AppError('Solo encargados de equipo', 403);
  const name = text(req.body?.name, 255).replace(/\s+/g, ' ');
  const seasonId = text(req.body?.seasonId, 36);
  const categoryId = text(req.body?.categoryId, 36);
  if (!name || !seasonId || !categoryId) throw new AppError('Indica nombre, temporada y categoría.', 400);
  const data = await withTransaction(async q => {
    const season = (await q(`SELECT s.id FROM seasons s JOIN leagues l ON l.id=s.league_id
      WHERE s.id=$1 AND s.league_id=$2 AND s.status='ACTIVE' AND l.status='ACTIVE'
      AND (s.registration_deadline IS NULL OR s.registration_deadline >= (NOW() AT TIME ZONE l.timezone)::date)
      FOR UPDATE OF s`, [seasonId, req.user!.leagueId])).rows[0];
    if (!season) throw new AppError('Las inscripciones de esta temporada no están abiertas.', 409);
    if (!(await q('SELECT id FROM categories WHERE id=$1 AND season_id=$2', [categoryId,seasonId])).rows.length) throw new AppError('Categoría inválida', 400);
    const existing = (await q(`SELECT id FROM teams WHERE season_id=$1 AND category_id=$2
      AND LOWER(regexp_replace(TRIM(name), '\\s+', ' ', 'g'))=LOWER($3)`, [seasonId,categoryId,name])).rows[0];
    if (existing) {
      if ((await q('SELECT id FROM team_users WHERE team_id=$1 AND user_id=$2', [existing.id,req.user!.id])).rows.length) return { id: existing.id };
      throw new AppError('Este equipo ya existe. Solicita a la liga que vincule tu cuenta al equipo existente.', 409);
    }
    const id = newPrefixedId('team');
    await q(`INSERT INTO teams (id,season_id,category_id,name,short_name) VALUES ($1,$2,$3,$4,$5)`, [id,seasonId,categoryId,name,name.slice(0,3).toUpperCase()]);
    await q('INSERT INTO team_users (id,team_id,user_id) VALUES ($1,$2,$3)', [newPrefixedId('tu'),id,req.user!.id]);
    await audit(req, { action:'SELF_ENROLL_TEAM',entityType:'team',entityId:id,newValue:{name,seasonId,categoryId} }, q);
    return { id };
  });
  res.status(201).json({ success: true, data });
});

export const checkTeamName = asyncHandler(async (req: AuthRequest, res: Response) => {
  const name = text(req.query?.name, 255).replace(/\s+/g, ' ');
  const seasonId = text(req.query?.seasonId, 36);
  const categoryId = text(req.query?.categoryId, 36);
  if (!name || !seasonId || !categoryId) return res.json({ success: true, data: { exists: false } });
  const result = await query(`SELECT t.id, EXISTS(SELECT 1 FROM team_users tu WHERE tu.team_id=t.id AND tu.user_id=$4) AS mine
    FROM teams t JOIN seasons s ON s.id=t.season_id
    WHERE t.season_id=$1 AND t.category_id=$2 AND s.league_id=$5
      AND t.team_type='OFFICIAL' AND LOWER(regexp_replace(TRIM(t.name), '\\s+', ' ', 'g'))=LOWER($3) LIMIT 1`, [seasonId, categoryId, name, req.user!.id, req.user!.leagueId]);
  const row = result.rows[0];
  res.json({ success: true, data: { exists: Boolean(row), mine: Boolean(row?.mine), id: row?.id ?? null } });
});
