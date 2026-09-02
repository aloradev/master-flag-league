import type { Response } from 'express';
import { query } from '../config/database.js';
import { hashPassword, validatePassword, generateTempPassword } from '../utils/password.js';
import { AppError, asyncHandler } from '../middleware/errorHandler.js';
import { audit } from '../services/audit.service.js';
import { newPrefixedId } from '../utils/id.js';
import { ROLES, type AuthRequest } from '../middleware/auth.js';

const ASSIGNABLE_ROLES = Object.values(ROLES);

/** GET /api/v1/admin/users */
export const listUsers = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { role, active, search } = req.query as Record<string, string | undefined>;

  const conditions: string[] = [];
  const params: any[] = [];

  if (role) {
    params.push(role);
    conditions.push(`r.name = $${params.length}`);
  }
  if (active === 'true' || active === 'false') {
    params.push(active === 'true');
    conditions.push(`u.active = $${params.length}`);
  }
  if (search) {
    params.push(`%${search}%`);
    conditions.push(`(u.name ILIKE $${params.length} OR u.email ILIKE $${params.length})`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const result = await query(
    `SELECT u.id, u.email, u.name, u.phone, u.active, u.last_login_at, u.created_at,
            r.name AS role, r.label AS role_label,
            COALESCE(
              (SELECT json_agg(json_build_object('id', t.id, 'name', t.name))
               FROM team_users tu JOIN teams t ON t.id = tu.team_id
               WHERE tu.user_id = u.id),
              '[]'::json
            ) AS teams
     FROM users u JOIN roles r ON r.id = u.role_id
     ${where}
     ORDER BY u.created_at DESC`,
    params
  );

  res.json({ success: true, data: result.rows });
});

/** POST /api/v1/admin/users */
export const createUser = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { email, name, role, phone, password } = req.body ?? {};

  if (!email || !name || !role) {
    throw new AppError('email, name y role son obligatorios', 400);
  }
  if (!ASSIGNABLE_ROLES.includes(role)) {
    throw new AppError(`Rol inválido. Válidos: ${ASSIGNABLE_ROLES.join(', ')}`, 400);
  }
  // Solo un SUPER_ADMIN puede crear otro SUPER_ADMIN.
  if (role === ROLES.SUPER_ADMIN && req.user!.role !== ROLES.SUPER_ADMIN) {
    throw new AppError('Solo un Super Administrador puede crear otro', 403);
  }

  const duplicate = await query('SELECT id FROM users WHERE LOWER(email) = LOWER($1)', [email]);
  if (duplicate.rows.length > 0) {
    throw new AppError('Ya existe un usuario con ese email', 409);
  }

  // Sin contraseña explícita se genera una temporal y se fuerza el cambio.
  const isTemp = !password;
  const finalPassword = password || generateTempPassword();

  if (!isTemp) {
    const check = validatePassword(finalPassword);
    if (!check.valid) throw new AppError('Contraseña insegura', 400, check.errors);
  }

  const roleRow = await query<{ id: string }>('SELECT id FROM roles WHERE name = $1', [role]);
  if (!roleRow.rows[0]) throw new AppError('Rol no encontrado', 400);

  const id = newPrefixedId('usr');
  await query(
    `INSERT INTO users (id, league_id, email, password_hash, name, phone, role_id, must_change_password)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [
      id,
      req.user!.leagueId,
      email.toLowerCase(),
      await hashPassword(finalPassword),
      name,
      phone ?? null,
      roleRow.rows[0].id,
      isTemp,
    ]
  );

  await audit(req, {
    action: 'CREATE_USER',
    entityType: 'user',
    entityId: id,
    newValue: { email, name, role },
  });

  res.status(201).json({
    success: true,
    data: {
      id,
      email,
      name,
      role,
      // La contraseña temporal se devuelve una sola vez para entregarla al usuario.
      ...(isTemp ? { temporaryPassword: finalPassword } : {}),
    },
  });
});

/** PUT /api/v1/admin/users/:id */
export const updateUser = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { name, phone, role, active } = req.body ?? {};

  const existing = await query(
    `SELECT u.id, u.name, u.phone, u.active, r.name AS role
     FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = $1`,
    [id]
  );
  const before = existing.rows[0];
  if (!before) throw new AppError('Usuario no encontrado', 404);

  if (role && role !== before.role) {
    if (req.user!.role !== ROLES.SUPER_ADMIN) {
      throw new AppError('Solo un Super Administrador puede cambiar roles', 403);
    }
    if (!ASSIGNABLE_ROLES.includes(role)) throw new AppError('Rol inválido', 400);
  }
  // Evita que un administrador se desactive a sí mismo y pierda el acceso.
  if (active === false && id === req.user!.id) {
    throw new AppError('No puedes desactivar tu propia cuenta', 400);
  }

  const roleId = role
    ? (await query<{ id: string }>('SELECT id FROM roles WHERE name = $1', [role])).rows[0]?.id
    : undefined;

  await query(
    `UPDATE users SET
       name    = COALESCE($1, name),
       phone   = COALESCE($2, phone),
       role_id = COALESCE($3, role_id),
       active  = COALESCE($4, active),
       updated_at = NOW()
     WHERE id = $5`,
    [name ?? null, phone ?? null, roleId ?? null, active ?? null, id]
  );

  await audit(req, {
    action: 'UPDATE_USER',
    entityType: 'user',
    entityId: id,
    oldValue: before,
    newValue: { name, phone, role, active },
  });

  res.json({ success: true, message: 'Usuario actualizado' });
});

/** POST /api/v1/admin/users/:id/reset-password */
export const resetPassword = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  const existing = await query('SELECT email FROM users WHERE id = $1', [id]);
  if (!existing.rows[0]) throw new AppError('Usuario no encontrado', 404);

  const temporaryPassword = generateTempPassword();
  await query(
    `UPDATE users SET password_hash = $1, must_change_password = TRUE, updated_at = NOW()
     WHERE id = $2`,
    [await hashPassword(temporaryPassword), id]
  );

  await audit(req, { action: 'RESET_PASSWORD', entityType: 'user', entityId: id });

  res.json({ success: true, data: { temporaryPassword } });
});

/** GET /api/v1/admin/roles */
export const listRoles = asyncHandler(async (_req: AuthRequest, res: Response) => {
  const result = await query('SELECT id, name, label, permissions FROM roles ORDER BY name');
  res.json({ success: true, data: result.rows });
});
