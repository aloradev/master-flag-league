import type { Response } from 'express';
import { query } from '../config/database.js';
import { AppError, asyncHandler } from '../middleware/errorHandler.js';
import { audit } from '../services/audit.service.js';
import { newPrefixedId } from '../utils/id.js';
import { canAccessTeam, ROLES, type AuthRequest } from '../middleware/auth.js';
import multer from 'multer';
import { putPublicFile, deleteFile } from '../services/storage.service.js';
import { makeLogo, isProcessableImage } from '../services/image.service.js';

/**
 * Columnas del equipo que la API expone.
 *
 * Se enumeran en lugar de usar `SELECT t.*` porque el comodín publica
 * sola cualquier columna nueva: `logo_storage_key` —un identificador
 * interno del almacenamiento— llegó a las respuestas sin que nadie lo
 * decidiera. Con la lista explícita, agregar una columna privada a la
 * tabla no la filtra.
 */
const TEAM_COLUMNS = `
  t.id, t.season_id, t.category_id, t.name, t.short_name,
  t.logo_url, t.image_url, t.color_primary, t.color_secondary,
  t.status, t.created_at, t.updated_at
`;

/** Máximo de encargados por equipo (req. 4). Configurable a futuro. */
const MAX_MANAGERS_PER_TEAM = 2;

/**
 * GET /api/v1/teams
 * Admin ve todos los equipos; un manager solo los suyos (req. 45).
 */
export const listTeams = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { seasonId, categoryId, status } = req.query as Record<string, string | undefined>;

  const conditions: string[] = [];
  const params: any[] = [];

  if (seasonId) {
    params.push(seasonId);
    conditions.push(`t.season_id = $${params.length}`);
  }
  if (categoryId) {
    params.push(categoryId);
    conditions.push(`t.category_id = $${params.length}`);
  }
  if (status) {
    params.push(status);
    conditions.push(`t.status = $${params.length}`);
  }
  // Alcance por equipo para managers.
  if (req.managedTeamIds) {
    if (req.managedTeamIds.length === 0) {
      return res.json({ success: true, data: [] });
    }
    params.push(req.managedTeamIds);
    conditions.push(`t.id = ANY($${params.length})`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const result = await query(
    `SELECT ${TEAM_COLUMNS}, c.name AS category_name, c.color AS category_color, s.name AS season_name,
            (SELECT COUNT(*) FROM players p WHERE p.team_id = t.id) AS players_total,
            (SELECT COUNT(*) FROM players p WHERE p.team_id = t.id AND p.is_eligible) AS players_eligible,
            (SELECT COUNT(*) FROM players p WHERE p.team_id = t.id AND p.status = 'PENDING') AS players_pending,
            COALESCE(
              (SELECT json_agg(json_build_object('id', u.id, 'name', u.name, 'email', u.email))
               FROM team_users tu JOIN users u ON u.id = tu.user_id WHERE tu.team_id = t.id),
              '[]'::json
            ) AS managers
     FROM teams t
     JOIN categories c ON c.id = t.category_id
     JOIN seasons s    ON s.id = t.season_id
     ${where}
     ORDER BY c.sort_order, t.name`,
    params
  );

  res.json({ success: true, data: result.rows });
});

/** GET /api/v1/teams/:id — detalle con plantilla y estado de registro */
export const getTeam = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  if (!canAccessTeam(req, id)) {
    throw new AppError('No tienes acceso a este equipo', 403);
  }

  const teamResult = await query(
    `SELECT ${TEAM_COLUMNS}, c.name AS category_name, c.color AS category_color,
            s.name AS season_name, s.registration_deadline, s.require_approval_to_play
     FROM teams t
     JOIN categories c ON c.id = t.category_id
     JOIN seasons s    ON s.id = t.season_id
     WHERE t.id = $1`,
    [id]
  );

  const team = teamResult.rows[0];
  if (!team) throw new AppError('Equipo no encontrado', 404);

  const [managers, roster] = await Promise.all([
    query(
      `SELECT u.id, u.name, u.email, u.phone, tu.role
       FROM team_users tu JOIN users u ON u.id = tu.user_id
       WHERE tu.team_id = $1 ORDER BY tu.joined_at`,
      [id]
    ),
    query(
      `SELECT id, first_name, last_name_paternal, last_name_maternal, jersey_number,
              position, photo_url, avatar_url, status, is_eligible, eligibility_reason
       FROM players WHERE team_id = $1
       ORDER BY jersey_number NULLS LAST, last_name_paternal`,
      [id]
    ),
  ]);

  // Req. 29: resumen de estado de registro, calculado no capturado.
  const players = roster.rows;
  const summary = {
    total: players.length,
    eligible: players.filter((p: any) => p.is_eligible).length,
    pending: players.filter((p: any) => p.status === 'PENDING').length,
    corrections: players.filter((p: any) => p.status === 'CORRECTIONS_REQUIRED').length,
    rejected: players.filter((p: any) => p.status === 'REJECTED').length,
  };

  res.json({
    success: true,
    data: { ...team, managers: managers.rows, roster: players, registration_summary: summary },
  });
});

/** POST /api/v1/admin/teams */
export const createTeam = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { seasonId, categoryId, name, shortName, colorPrimary, colorSecondary, logoUrl } =
    req.body ?? {};

  if (!seasonId || !categoryId || !name) {
    throw new AppError('seasonId, categoryId y name son obligatorios', 400);
  }

  // La categoría debe pertenecer a la temporada indicada.
  const category = await query('SELECT id FROM categories WHERE id = $1 AND season_id = $2', [
    categoryId,
    seasonId,
  ]);
  if (!category.rows[0]) {
    throw new AppError('La categoría no pertenece a esa temporada', 400);
  }

  const id = newPrefixedId('team');
  await query(
    `INSERT INTO teams (id, season_id, category_id, name, short_name,
                        color_primary, color_secondary, logo_url)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [
      id,
      seasonId,
      categoryId,
      name,
      shortName ?? name.slice(0, 3).toUpperCase(),
      colorPrimary ?? '#1f2937',
      colorSecondary ?? '#f9fafb',
      logoUrl ?? null,
    ]
  );

  await audit(req, { action: 'CREATE_TEAM', entityType: 'team', entityId: id, newValue: req.body });
  res.status(201).json({ success: true, data: { id, name } });
});

/** PUT /api/v1/teams/:id — admin o manager del equipo */
export const updateTeam = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  if (!canAccessTeam(req, id)) {
    throw new AppError('No tienes acceso a este equipo', 403);
  }

  const before = await query('SELECT * FROM teams WHERE id = $1', [id]);
  if (!before.rows[0]) throw new AppError('Equipo no encontrado', 404);

  const { name, shortName, colorPrimary, colorSecondary, logoUrl, imageUrl, status } = req.body ?? {};

  // Solo administración cambia el estado del equipo (activo/suspendido).
  const isAdmin = req.user!.role === ROLES.SUPER_ADMIN || req.user!.role === ROLES.SPORTS_ADMIN;
  if (status && !isAdmin) {
    throw new AppError('Solo administración puede cambiar el estado del equipo', 403);
  }

  await query(
    `UPDATE teams SET
       name = COALESCE($1, name),
       short_name = COALESCE($2, short_name),
       color_primary = COALESCE($3, color_primary),
       color_secondary = COALESCE($4, color_secondary),
       logo_url = COALESCE($5, logo_url),
       image_url = COALESCE($6, image_url),
       status = COALESCE($7, status),
       updated_at = NOW()
     WHERE id = $8`,
    [
      name ?? null,
      shortName ?? null,
      colorPrimary ?? null,
      colorSecondary ?? null,
      logoUrl ?? null,
      imageUrl ?? null,
      status ?? null,
      id,
    ]
  );

  await audit(req, {
    action: 'UPDATE_TEAM',
    entityType: 'team',
    entityId: id,
    oldValue: before.rows[0],
    newValue: req.body,
  });
  res.json({ success: true, message: 'Equipo actualizado' });
});

/** POST /api/v1/admin/teams/:id/managers — asigna un encargado */
export const assignManager = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { userId } = req.body ?? {};
  if (!userId) throw new AppError('userId es obligatorio', 400);

  const team = await query('SELECT id, name FROM teams WHERE id = $1', [id]);
  if (!team.rows[0]) throw new AppError('Equipo no encontrado', 404);

  const user = await query<{ id: string; role_name: string }>(
    `SELECT u.id, r.name AS role_name FROM users u JOIN roles r ON r.id = u.role_id
     WHERE u.id = $1`,
    [userId]
  );
  if (!user.rows[0]) throw new AppError('Usuario no encontrado', 404);
  if (user.rows[0].role_name !== ROLES.TEAM_MANAGER) {
    throw new AppError('El usuario debe tener el rol Manager de Equipo', 400);
  }

  const current = await query('SELECT COUNT(*)::int AS total FROM team_users WHERE team_id = $1', [id]);
  if (current.rows[0].total >= MAX_MANAGERS_PER_TEAM) {
    throw new AppError(`El equipo ya tiene ${MAX_MANAGERS_PER_TEAM} encargados`, 409);
  }

  await query(
    'INSERT INTO team_users (id, team_id, user_id, role) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING',
    [newPrefixedId('tu'), id, userId, 'MANAGER']
  );

  await audit(req, {
    action: 'ASSIGN_MANAGER',
    entityType: 'team',
    entityId: id,
    newValue: { userId },
  });
  res.status(201).json({ success: true, message: 'Encargado asignado' });
});

/** DELETE /api/v1/admin/teams/:id/managers/:userId */
export const removeManager = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id, userId } = req.params;

  const result = await query('DELETE FROM team_users WHERE team_id = $1 AND user_id = $2', [
    id,
    userId,
  ]);
  if (result.rowCount === 0) throw new AppError('Ese usuario no es encargado del equipo', 404);

  await audit(req, {
    action: 'REMOVE_MANAGER',
    entityType: 'team',
    entityId: id,
    oldValue: { userId },
  });
  res.json({ success: true, message: 'Encargado removido' });
});

/** Multer en memoria para el logo: se valida y redimensiona antes de guardar. */
export const logoUploadMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
}).single('file');

/**
 * POST /api/v1/teams/:id/logo
 *
 * El logo es público por naturaleza: aparece en la tabla, en el calendario
 * y en las tarjetas para redes. Se guarda como derivado de 512 px en WebP
 * conservando la transparencia, sin recortar a cuadrado —un escudo
 * recortado pierde las puntas.
 */
export const uploadTeamLogo = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const file = (req as any).file as
    | { buffer: Buffer; mimetype: string; size: number }
    | undefined;

  if (!file) throw new AppError('No se recibió ningún archivo', 400);
  if (!canAccessTeam(req, id)) {
    throw new AppError('No tienes acceso a este equipo', 403);
  }

  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.mimetype)) {
    throw new AppError('El logo debe ser PNG, JPG o WebP', 400);
  }
  if (!(await isProcessableImage(file.buffer))) {
    throw new AppError('El archivo no es una imagen válida o está dañado', 400);
  }

  const existing = await query<{ logo_storage_key: string | null }>(
    'SELECT logo_storage_key FROM teams WHERE id = $1',
    [id]
  );
  if (!existing.rows[0]) throw new AppError('Equipo no encontrado', 404);

  const logo = await makeLogo(file.buffer);
  const published = await putPublicFile(logo.buffer, logo.mimeType, 'logos');

  await query(
    'UPDATE teams SET logo_url = $1, logo_storage_key = $2, updated_at = NOW() WHERE id = $3',
    [published.url, published.storageKey, id]
  );

  // El logo anterior queda huérfano: se borra para no acumular basura
  // en el almacenamiento gratuito, que tiene 25 GB.
  const previousKey = existing.rows[0].logo_storage_key;
  if (previousKey && previousKey !== published.storageKey) {
    void deleteFile(previousKey, 'public');
  }

  await audit(req, {
    action: 'UPLOAD_TEAM_LOGO',
    entityType: 'team',
    entityId: id,
    newValue: { url: published.url, size: published.size },
  });

  res.status(201).json({
    success: true,
    data: { logoUrl: published.url, width: logo.width, height: logo.height },
  });
});
