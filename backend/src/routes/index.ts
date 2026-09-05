import { Router } from 'express';

import * as auth from '../controllers/auth.controller.js';
import * as users from '../controllers/users.controller.js';
import * as seasons from '../controllers/seasons.controller.js';
import * as teams from '../controllers/teams.controller.js';
import * as players from '../controllers/players.controller.js';
import * as publico from '../controllers/public.controller.js';
import * as documents from '../controllers/documents.controller.js';
import * as validation from '../controllers/validation.controller.js';
import * as audit from '../controllers/audit.controller.js';
import * as rounds from '../controllers/rounds.controller.js';
import * as games from '../controllers/games.controller.js';
import * as finance from '../controllers/finance.controller.js';
import * as diagnostics from '../controllers/diagnostics.controller.js';
import * as operations from '../controllers/operations.controller.js';
import * as playoffs from '../controllers/playoffs.controller.js';
import * as statistics from '../controllers/statistics.controller.js';

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

// ── Restablecer contraseña ──
// Públicas por definición: quien no puede entrar tampoco puede
// autenticarse para pedir ayuda. La respuesta de forgot-password es
// idéntica exista o no el correo, para no revelar quién está registrado.
router.post('/auth/forgot-password', auth.forgotPassword);
router.get('/auth/reset-password/:token', auth.checkResetToken);
router.post('/auth/reset-password', auth.resetPassword);
router.get('/public/players/:id', players.getPublicPlayerProfile);

// ── Jornada y tabla sin sesión ──
// Es lo que se pega en el grupo de WhatsApp que los encargados ya tienen,
// en lugar de pagar la API de Meta. Sin id, /public/round elige la
// jornada vigente sola: el enlace se comparte una vez y sirve la
// temporada entera.
router.get('/public/round', publico.getPublicRound);
router.get('/public/round/:id', publico.getPublicRound);
router.get('/public/rounds', publico.listPublicRounds);
router.get('/public/standings', publico.getPublicStandings);
router.get('/public/statistics/players', statistics.publicPlayerStats);

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
router.get('/statistics/players', statistics.playerStats);

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
// Baja o borrado del jugador: lo decide el servidor según haya jugado o
// no. Con `loadManagedTeams`, un manager solo alcanza a los suyos.
router.delete('/players/:id', loadManagedTeams, players.removePlayer);

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
router.post('/admin/users/:id/reset-link', requireAdmin, users.createResetLink);
router.get('/admin/roles', requireAdmin, users.listRoles);

router.post('/admin/seasons', requireRole(ROLES.SUPER_ADMIN), seasons.createSeason);
router.put('/admin/seasons/:id', requireRole(ROLES.SUPER_ADMIN), seasons.updateSeason);
router.post('/admin/seasons/:seasonId/categories', requireAdmin, seasons.createCategory);
router.post('/admin/seasons/:seasonId/fields', requireAdmin, seasons.createField);
router.put('/admin/categories/:id', requireAdmin, seasons.updateCategory);
router.delete('/admin/categories/:id', requireAdmin, seasons.deleteCategory);
router.put('/admin/fields/:id', requireAdmin, seasons.updateField);
router.put(
  '/admin/seasons/:seasonId/settings/:key',
  requireRole(ROLES.SUPER_ADMIN),
  seasons.updateSetting
);

router.post('/admin/teams', requireAdmin, teams.createTeam);
router.delete('/admin/teams/:id', requireAdmin, teams.deleteTeam);
router.post('/admin/teams/:id/managers', requireAdmin, teams.assignManager);
router.delete('/admin/teams/:id/managers/:userId', requireAdmin, teams.removeManager);

// ═══════════════════════════ COMPETENCIA (FASE 2) ═════════════════════════
// Lectura abierta a cualquier sesión: el calendario y la tabla son de la
// liga. Las jornadas en borrador las filtra el controlador por rol.
router.get('/rounds', rounds.listRounds);
router.get('/rounds/:id', rounds.getRound);
router.get('/standings', rounds.getStandings);
router.get('/playoffs', playoffs.list);
router.post('/admin/playoffs', requireAdmin, playoffs.create);
router.post('/admin/playoffs/:id/advance', requireAdmin, playoffs.advance);
router.get('/seasons/:seasonId/slots', rounds.getSeasonSlots);
router.get('/plays', games.listPlays);
router.get('/referees', games.listReferees);

router.get('/games', games.listGames);
// Antes de '/games/:id', o Express tomaría "mine" como un id.
router.get('/games/mine', games.listMyGames);
router.get('/games/:id', games.getGame);
router.get('/games/:id/live', games.getGameLive);

// ─── Modo Árbitro: el propio controlador comprueba que el árbitro esté
// asignado a ESE partido, porque el rol solo dice que es árbitro.
router.post('/games/:id/start', games.startGame);
router.post('/games/:id/events', games.addEvent);
router.post('/games/:id/events/:eventId/void', games.voidEvent);
router.post('/games/:id/finish', games.finishGame);

// ─── Administración de la competencia
router.post('/admin/rounds/propose', requireAdmin, rounds.proposeRound);
router.post('/admin/rounds', requireAdmin, rounds.createRound);
router.put('/admin/rounds/:id', requireAdmin, rounds.updateRound);
router.post('/admin/rounds/:id/publish', requireAdmin, rounds.publishRound);
router.post('/admin/rounds/:id/cancel', requireAdmin, rounds.cancelRound);
router.delete('/admin/rounds/:id', requireAdmin, rounds.deleteRound);

router.put('/admin/games/:id', requireAdmin, games.updateGame);
router.post('/admin/games/:id/referees', requireAdmin, games.assignReferees);
router.post('/admin/games/:id/walkover', requireAdmin, games.declareWalkover);
router.post('/admin/referees', requireAdmin, games.createReferee);

// ═══════════════════════════ FINANZAS (FASE 4) ════════════════════════════
// `loadManagedTeams` en TODAS: el controlador filtra por los equipos que
// el usuario administra en lugar de confiar en el teamId de la URL, que
// lo escribe quien quiera. Administración pasa sin restricción.
router.get('/finance/catalog', loadManagedTeams, finance.getCatalog);
router.get('/finance/fees', loadManagedTeams, finance.listFees);
router.get('/finance/payments', loadManagedTeams, finance.listPayments);
router.get('/finance/accounts', loadManagedTeams, finance.getAccounts);
router.get('/finance/teams/:teamId/statement', loadManagedTeams, finance.getTeamStatement);
router.get('/finance/expenses', loadManagedTeams, finance.listExpenses);
router.get('/finance/balance', loadManagedTeams, finance.getBalance);

// Mover dinero: solo Super Admin y Administrador Financiero. La
// comprobación vive además dentro de cada controlador, porque una ruta
// nueva puede olvidarse de poner el middleware.
const soloFinanzas = requireRole(ROLES.SUPER_ADMIN, ROLES.FINANCE_ADMIN);
router.put('/finance/settings', soloFinanzas, finance.updateFinanceSettings);
router.post('/finance/fees', soloFinanzas, finance.createFee);
router.post('/finance/fees/:id/cancel', soloFinanzas, finance.cancelFee);
// El borrado en bloque es POST y el individual DELETE, así que no se
// pisan aunque compartan el prefijo: no hay ningún POST '/finance/fees/:id'
// que pudiera capturar "delete-unpaid".
router.post('/finance/fees/delete-unpaid', soloFinanzas, finance.deleteUnpaidFees);
router.delete('/finance/fees/:id', soloFinanzas, finance.deleteFee);
router.post('/finance/fees/generate-inscription', soloFinanzas, finance.generateInscriptionFees);
router.post('/finance/fees/generate-round/:roundId', soloFinanzas, finance.generateRoundFees);
router.post('/finance/payments', soloFinanzas, finance.createPayment);
router.post('/finance/payments/:id/void', soloFinanzas, finance.voidPayment);
router.post('/finance/expenses', soloFinanzas, finance.createExpense);
router.post('/finance/expenses/:id/void', soloFinanzas, finance.voidExpense);

/**
 * Diagnóstico del almacenamiento de imágenes. Solo administración: dice
 * qué credenciales llegaron —enmascaradas— y si Cloudinary las acepta.
 */
router.get('/admin/diagnostics/storage', requireAdmin, diagnostics.storageDiagnostics);
router.get('/admin/operations', requireRole(ROLES.SUPER_ADMIN), operations.status);
router.post('/admin/operations/process-emails', requireRole(ROLES.SUPER_ADMIN), operations.processPending);
router.post('/admin/operations/process-birthdays', requireRole(ROLES.SUPER_ADMIN), operations.processBirthdays);

// Auditoría: solo Super Admin (req. 42).
router.get('/admin/audit', requireRole(ROLES.SUPER_ADMIN), audit.listAuditLogs);

export default router;
