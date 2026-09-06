import type { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../utils/jwt.js';
import { query } from '../config/database.js';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: string;
  leagueId: string | null;
  scrimmageGameId?: string;
  sessionVersion?: number;
}

// Request<Record<string,string>> fija los params como cadenas: en Express 5
// el tipo por omisión los declara como string | string[].
export interface AuthRequest extends Request<Record<string, string>> {
  user?: AuthUser;
  /** Equipos asignados al usuario cuando la petición pide alcance de manager. */
  managedTeamIds?: string[];
}

export const ROLES = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  SPORTS_ADMIN: 'SPORTS_ADMIN',
  FINANCE_ADMIN: 'FINANCE_ADMIN',
  TEAM_MANAGER: 'TEAM_MANAGER',
  REFEREE: 'REFEREE',
  PUBLIC_USER: 'PUBLIC_USER',
} as const;

export const ADMIN_ROLES = [ROLES.SUPER_ADMIN, ROLES.SPORTS_ADMIN];

/** Exige un token válido. */
export const requireAuth = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ success: false, error: 'Token no proporcionado' });
  }

  const payload = verifyToken(token);
  if (!payload || payload.type !== 'access' || !payload.id ||
      Boolean(payload.scrimmageGameId) !== (payload.scope === 'SCRIMMAGE_REFEREE')) {
    return res.status(401).json({ success: false, error: 'Token inválido o expirado' });
  }

  try {
    const result = await query(`SELECT u.active, u.session_version, r.name AS role
      FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = $1`, [payload.id]);
    const account = result.rows[0];
    if (!account?.active || payload.sessionVersion !== account.session_version ||
        (!payload.scrimmageGameId && payload.role !== account.role)) {
      return res.status(401).json({ success: false, error: 'Sesión revocada. Solicita un nuevo acceso.' });
    }
  } catch (error) { return next(error); }
  req.user = {
    sessionVersion: payload.sessionVersion,
    id: payload.id,
    email: payload.email,
    name: payload.name,
    role: payload.role,
    leagueId: payload.leagueId ?? null,
    scrimmageGameId: payload.scrimmageGameId,
  };
  next();
};

/** Un enlace temporal de scrimmage solo puede tocar su partido. */
export const restrictScrimmageToken = async (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.user?.scrimmageGameId) return next();
  const path = req.path;
  const allowed = path === '/auth/me' ||
    /^\/games\/[^/]+(\/live)?$/.test(path) ||
    /^\/games\/[^/]+\/start$/.test(path) ||
    /^\/games\/[^/]+\/finish$/.test(path) ||
    /^\/games\/[^/]+\/events(\/[^/]+\/void)?$/.test(path);
  if (!allowed) return res.status(403).json({ success: false, error: 'El enlace temporal solo permite operar su scrimmage' });
  if (path !== '/auth/me' && path.split('/')[2] !== req.user.scrimmageGameId) {
    return res.status(403).json({ success: false, error: 'Este enlace pertenece a otro scrimmage' });
  }
  try {
    const game = await query("SELECT id FROM games WHERE id = $1 AND game_type = 'SCRIMMAGE' AND status <> 'CANCELLED'", [req.user.scrimmageGameId]);
    if (!game.rows.length) return res.status(404).json({ success: false, error: 'El scrimmage ya no está disponible' });
  } catch (error) {
    return next(error);
  }
  next();
};

/** Restringe a una lista de roles. */
export const requireRole =
  (...roles: string[]) =>
  (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'No autenticado' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ success: false, error: 'Permisos insuficientes' });
    }
    next();
  };

/** SUPER_ADMIN o SPORTS_ADMIN. */
export const requireAdmin = requireRole(...ADMIN_ROLES);

/**
 * Req. 45: carga los equipos del manager y los deja en req.managedTeamIds.
 * Los administradores pasan sin restricción, salvo cuando piden
 * `?managed=true`: esa vista representa su responsabilidad como encargado,
 * no su permiso administrativo sobre toda la liga.
 */
export const loadManagedTeams = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  if (!req.user) {
    return res.status(401).json({ success: false, error: 'No autenticado' });
  }

  const onlyAssigned = req.query.managed === 'true';

  if (ADMIN_ROLES.includes(req.user.role as any) && !onlyAssigned) {
    req.managedTeamIds = undefined; // sin restricción
    return next();
  }

  try {
    const result = await query<{ team_id: string }>(
      'SELECT team_id FROM team_users WHERE user_id = $1',
      [req.user.id]
    );
    req.managedTeamIds = result.rows.map((r) => r.team_id);
    next();
  } catch (err) {
    next(err);
  }
};

/** Verifica que el usuario pueda operar sobre un equipo concreto. */
export const canAccessTeam = (req: AuthRequest, teamId: string): boolean => {
  if (!req.user) return false;
  if (ADMIN_ROLES.includes(req.user.role as any)) return true;
  return (req.managedTeamIds ?? []).includes(teamId);
};
