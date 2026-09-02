import { Router } from 'express';

import * as auth from '../controllers/auth.controller.js';
import * as users from '../controllers/users.controller.js';
import * as seasons from '../controllers/seasons.controller.js';
import * as teams from '../controllers/teams.controller.js';
import * as players from '../controllers/players.controller.js';
import * as documents from '../controllers/documents.controller.js';
import * as validation from '../controllers/validation.controller.js';
import * as audit from '../controllers/audit.controller.js';

import {
  requireAuth,
  requireAdmin,
  requireRole,
  loadManagedTeams,
  ROLES,
} from '../middleware/auth.js';

const router = Router();

// ══════════════════════════ PÚBLICO (sin sesión) ══════════════════════════
router.post('/auth/login', auth.login);
router.post('/auth/refresh', auth.refresh);
router.get('/public/players/:id', players.getPublicPlayerProfile);

// A partir de aquí, todo exige sesión.
router.use(requireAuth);

// ════════════════════════════════ SESIÓN ══════════════════════════════════
router.get('/auth/me', auth.me);
router.post('/auth/change-password', auth.changePassword);

// ═══════════════════════ CATÁLOGOS (lectura general) ══════════════════════
router.get('/seasons', seasons.listSeasons);
router.get('/seasons/active', seasons.getActiveSeason);
router.get('/seasons/:seasonId/categories', seasons.listCategories);
router.get('/seasons/:seasonId/fields', seasons.listFields);
router.get('/seasons/:seasonId/settings', seasons.getSettings);

// ═════════════════ EQUIPOS (admin: todos · manager: los suyos) ════════════
router.get('/teams', loadManagedTeams, teams.listTeams);
router.get('/teams/:id', loadManagedTeams, teams.getTeam);
router.put('/teams/:id', loadManagedTeams, teams.updateTeam);
// El logo lo puede subir administración o el propio encargado del equipo.
router.post(
  '/teams/:id/logo',
  loadManagedTeams,
  teams.logoUploadMiddleware,
  teams.uploadTeamLogo
);

// Vista del árbitro: solo semáforo de elegibilidad, sin documentos (req. 9).
router.get(
  '/teams/:teamId/eligibility',
  requireRole(ROLES.SUPER_ADMIN, ROLES.SPORTS_ADMIN, ROLES.REFEREE, ROLES.TEAM_MANAGER),
  players.getTeamEligibility
);

// ════════════════════════════════ JUGADORES ═══════════════════════════════
router.get('/players', loadManagedTeams, players.listPlayers);
router.post('/players', loadManagedTeams, players.createPlayer);
router.get('/players/:id', loadManagedTeams, players.getPlayer);
router.put('/players/:id', loadManagedTeams, players.updatePlayer);

// ═══════════════════════════════ DOCUMENTOS ═══════════════════════════════
router.post(
  '/players/:id/documents',
  loadManagedTeams,
  documents.uploadMiddleware,
  documents.uploadDocument
);
router.get('/players/:id/documents/history', loadManagedTeams, documents.getDocumentHistory);
// Única puerta de acceso al archivo: valida sesión y alcance (req. 12).
router.get('/documents/:id/file', loadManagedTeams, documents.serveDocument);

// ══════════════════════════════ ADMINISTRACIÓN ════════════════════════════
router.get('/admin/validation/queue', requireAdmin, validation.getValidationQueue);
router.get('/admin/validation/stats', requireAdmin, validation.getValidationStats);
router.post('/admin/players/:id/review', requireAdmin, validation.reviewPlayer);

router.get('/admin/users', requireAdmin, users.listUsers);
router.post('/admin/users', requireAdmin, users.createUser);
router.put('/admin/users/:id', requireAdmin, users.updateUser);
router.post('/admin/users/:id/reset-password', requireAdmin, users.resetPassword);
router.get('/admin/roles', requireAdmin, users.listRoles);

router.post('/admin/seasons', requireRole(ROLES.SUPER_ADMIN), seasons.createSeason);
router.put('/admin/seasons/:id', requireRole(ROLES.SUPER_ADMIN), seasons.updateSeason);
router.post('/admin/seasons/:seasonId/categories', requireAdmin, seasons.createCategory);
router.post('/admin/seasons/:seasonId/fields', requireAdmin, seasons.createField);
router.put('/admin/categories/:id', requireAdmin, seasons.updateCategory);
router.put('/admin/fields/:id', requireAdmin, seasons.updateField);
router.put(
  '/admin/seasons/:seasonId/settings/:key',
  requireRole(ROLES.SUPER_ADMIN),
  seasons.updateSetting
);

router.post('/admin/teams', requireAdmin, teams.createTeam);
router.post('/admin/teams/:id/managers', requireAdmin, teams.assignManager);
router.delete('/admin/teams/:id/managers/:userId', requireAdmin, teams.removeManager);

// Auditoría: solo Super Admin (req. 42).
router.get('/admin/audit', requireRole(ROLES.SUPER_ADMIN), audit.listAuditLogs);

export default router;
