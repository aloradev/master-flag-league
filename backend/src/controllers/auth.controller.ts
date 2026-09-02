import type { Response } from 'express';
import { query } from '../config/database.js';
import { comparePassword, hashPassword, validatePassword } from '../utils/password.js';
import { generateTokens, verifyToken } from '../utils/jwt.js';
import { AppError, asyncHandler } from '../middleware/errorHandler.js';
import { audit } from '../services/audit.service.js';
import type { AuthRequest } from '../middleware/auth.js';

interface UserRow {
  id: string;
  email: string;
  name: string;
  password_hash: string;
  active: boolean;
  league_id: string | null;
  role_name: string;
  permissions: Record<string, string[]>;
  must_change_password: boolean;
}

const findUserByEmail = async (email: string) => {
  const result = await query<UserRow>(
    `SELECT u.id, u.email, u.name, u.password_hash, u.active, u.league_id,
            u.must_change_password, r.name AS role_name, r.permissions
     FROM users u
     JOIN roles r ON r.id = u.role_id
     WHERE LOWER(u.email) = LOWER($1)`,
    [email]
  );
  return result.rows[0] ?? null;
};

/** POST /api/v1/auth/login */
export const login = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { email, password } = req.body ?? {};

  if (!email || !password) {
    throw new AppError('Email y contraseña son obligatorios', 400);
  }

  const user = await findUserByEmail(email);

  // Mensaje idéntico para usuario inexistente y contraseña incorrecta:
  // no revela qué correos están registrados.
  const invalid = new AppError('Credenciales incorrectas', 401);
  if (!user) throw invalid;

  const passwordOk = await comparePassword(password, user.password_hash);
  if (!passwordOk) throw invalid;

  if (!user.active) {
    throw new AppError('Esta cuenta está desactivada. Contacta a administración.', 403);
  }

  const tokens = generateTokens({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role_name,
    leagueId: user.league_id,
  });

  await query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]);

  res.json({
    success: true,
    data: {
      ...tokens,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role_name,
        permissions: user.permissions,
        leagueId: user.league_id,
        mustChangePassword: user.must_change_password,
      },
    },
  });
});

/** GET /api/v1/auth/me */
export const me = asyncHandler(async (req: AuthRequest, res: Response) => {
  const result = await query(
    `SELECT u.id, u.email, u.name, u.phone, u.league_id, u.must_change_password,
            r.name AS role, r.label AS role_label, r.permissions
     FROM users u JOIN roles r ON r.id = u.role_id
     WHERE u.id = $1 AND u.active = TRUE`,
    [req.user!.id]
  );

  const user = result.rows[0];
  if (!user) throw new AppError('Usuario no encontrado o inactivo', 404);

  // Un manager necesita saber qué equipos administra para pintar su portal.
  const teams = await query(
    `SELECT t.id, t.name, t.logo_url, t.color_primary,
            c.name AS category_name, tu.role AS manager_role
     FROM team_users tu
     JOIN teams t ON t.id = tu.team_id
     JOIN categories c ON c.id = t.category_id
     WHERE tu.user_id = $1`,
    [req.user!.id]
  );

  res.json({ success: true, data: { ...user, teams: teams.rows } });
});

/** POST /api/v1/auth/refresh */
export const refresh = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { refreshToken } = req.body ?? {};
  if (!refreshToken) throw new AppError('refreshToken es obligatorio', 400);

  const payload = verifyToken(refreshToken);
  if (!payload) throw new AppError('Token de refresco inválido o expirado', 401);

  const result = await query<{ active: boolean; role_name: string }>(
    `SELECT u.active, r.name AS role_name FROM users u
     JOIN roles r ON r.id = u.role_id WHERE u.id = $1`,
    [payload.id]
  );

  const current = result.rows[0];
  if (!current?.active) throw new AppError('Cuenta desactivada', 403);

  res.json({
    success: true,
    data: generateTokens({
      id: payload.id,
      email: payload.email,
      name: payload.name,
      // El rol se relee de la base: si cambió, el token nuevo ya lo refleja.
      role: current.role_name,
      leagueId: payload.leagueId,
    }),
  });
});

/** POST /api/v1/auth/change-password */
export const changePassword = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { currentPassword, newPassword } = req.body ?? {};
  if (!currentPassword || !newPassword) {
    throw new AppError('Contraseña actual y nueva son obligatorias', 400);
  }

  const check = validatePassword(newPassword);
  if (!check.valid) {
    throw new AppError('La nueva contraseña no cumple los requisitos', 400, check.errors);
  }

  const result = await query<{ password_hash: string }>(
    'SELECT password_hash FROM users WHERE id = $1',
    [req.user!.id]
  );
  const user = result.rows[0];
  if (!user) throw new AppError('Usuario no encontrado', 404);

  const ok = await comparePassword(currentPassword, user.password_hash);
  if (!ok) throw new AppError('La contraseña actual es incorrecta', 401);

  await query(
    `UPDATE users SET password_hash = $1, must_change_password = FALSE, updated_at = NOW()
     WHERE id = $2`,
    [await hashPassword(newPassword), req.user!.id]
  );

  await audit(req, { action: 'CHANGE_PASSWORD', entityType: 'user', entityId: req.user!.id });

  res.json({ success: true, message: 'Contraseña actualizada' });
});
