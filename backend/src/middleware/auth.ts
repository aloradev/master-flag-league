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
export const requireAuth = (req: AuthRequest, res: Response, next: NextFunction) => {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ success: false, error: 'Token no proporcionado' });
  }

  const payload = verifyToken(token);
  if (!payload) {
    return res.status(401).json({ success: false, error: 'Token inválido o expirado' });
  }

  req.user = {
    id: payload.id,
    email: payload.email,
    name: payload.name,
    role: payload.role,
    leagueId: payload.leagueId ?? null,
    scrimmageGameId: payload.scrimmageGameId,
  };
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
