import type { Response } from 'express';
import { query } from '../config/database.js';
import { AppError, asyncHandler } from '../middleware/errorHandler.js';
import { audit } from '../services/audit.service.js';
import { newPrefixedId } from '../utils/id.js';
import { slugify } from '../utils/slug.js';
import type { AuthRequest } from '../middleware/auth.js';
import { refreshSeasonEligibility } from '../services/eligibility.service.js';
import { seasonFinalEstimate } from '../services/calendar.service.js';
import { registrationOpen as isRegistrationOpen } from '../utils/registration.js';


// ─────────────────────────────── TEMPORADAS ───────────────────────────────

/** GET /api/v1/seasons */
export const listSeasons = asyncHandler(async (req: AuthRequest, res: Response) => {
  const result = await query(
    `SELECT s.*,
            (SELECT COUNT(*) FROM teams   WHERE season_id = s.id AND team_type = 'OFFICIAL') AS teams_count,
            (SELECT COUNT(*) FROM players
              WHERE season_id = s.id AND removed_at IS NULL) AS players_count
     FROM seasons s
     WHERE ($1::text IS NULL OR s.league_id = $1)
     ORDER BY s.year DESC, s.start_date DESC`,
    [req.user?.leagueId ?? null]
  );
  res.json({ success: true, data: result.rows });
});

/** GET /api/v1/seasons/active — temporada vigente con su configuración */
export const getActiveSeason = asyncHandler(async (req: AuthRequest, res: Response) => {
  const result = await query(
    `SELECT * FROM seasons
     WHERE status = 'ACTIVE' AND ($1::text IS NULL OR league_id = $1)
     ORDER BY start_date DESC LIMIT 1`,
    [req.user?.leagueId ?? null]
  );

  const season = result.rows[0];
  if (!season) throw new AppError('No hay temporada activa', 404);

  const [categories, fields] = await Promise.all([
    query('SELECT * FROM categories WHERE season_id = $1 ORDER BY sort_order, name', [season.id]),
    query('SELECT * FROM fields WHERE season_id = $1 ORDER BY name', [season.id]),
  ]);

  const registrationOpen = isRegistrationOpen(season.registration_deadline);
  const calendar = await seasonFinalEstimate(season.id);

  res.json({
    success: true,
    data: {
      ...season,
      estimated_regular_end_date: calendar.regular_end,
      calendar_estimate: calendar,
      registration_open: registrationOpen,
      categories: categories.rows,
      fields: fields.rows,
    },
  });
});

/** POST /api/v1/admin/seasons */
export const createSeason = asyncHandler(async (req: AuthRequest, res: Response) => {
  const {
    name,
    year,
    startDate,
    endDate,
    registrationDeadline,
    defaultStartTime,
    requireApprovalToPlay,
  } = req.body ?? {};

  if (!name || !year || !startDate) {
    throw new AppError('name, year y startDate son obligatorios', 400);
  }

  const id = newPrefixedId('season');
  await query(
    `INSERT INTO seasons
      (id, league_id, name, year, start_date, end_date, registration_deadline,
       default_start_time, require_approval_to_play)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [
      id,
      req.user!.leagueId,
      name,
      year,
      startDate,
      endDate ?? null,
      registrationDeadline ?? null,
      defaultStartTime ?? '19:00',
      requireApprovalToPlay ?? true,
    ]
  );

  await audit(req, { action: 'CREATE_SEASON', entityType: 'season', entityId: id, newValue: req.body });
  res.status(201).json({ success: true, data: { id, name, year } });
});

/** PUT /api/v1/admin/seasons/:id */
export const updateSeason = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const before = await query('SELECT * FROM seasons WHERE id = $1 AND league_id = $2', [id, req.user!.leagueId]);
  if (!before.rows[0]) throw new AppError('Temporada no encontrada', 404);

  const { name, startDate, endDate, registrationDeadline, defaultStartTime, requireApprovalToPlay, status } =
    req.body ?? {};

  for (const date of [startDate, endDate, registrationDeadline]) {
    if (date != null && (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date)) throw new AppError('Fecha inválida', 400);
  }
  const effectiveStart = startDate ?? new Date(before.rows[0].start_date).toISOString().slice(0, 10);
  const effectiveEnd = Object.prototype.hasOwnProperty.call(req.body, 'endDate') ? endDate : before.rows[0].end_date;
  if (effectiveEnd && new Date(effectiveEnd) < new Date(effectiveStart)) throw new AppError('El límite de temporada no puede ser anterior al inicio', 400);

  await query(
    `UPDATE seasons SET
       name = COALESCE($1, name),
       start_date = COALESCE($9::date, start_date),
       end_date = CASE WHEN $8::boolean THEN $2::date ELSE end_date END,
       registration_deadline = COALESCE($3, registration_deadline),
       default_start_time = COALESCE($4, default_start_time),
       require_approval_to_play = COALESCE($5, require_approval_to_play),
       status = COALESCE($6, status)
     WHERE id = $7`,
    [
      name ?? null,
      endDate ?? null,
      registrationDeadline ?? null,
      defaultStartTime ?? null,
      requireApprovalToPlay ?? null,
      status ?? null,
      id,
      Object.prototype.hasOwnProperty.call(req.body ?? {}, 'endDate'),
      startDate ?? null,
    ]
  );

  await audit(req, {
    action: 'UPDATE_SEASON',
    entityType: 'season',
    entityId: id,
    oldValue: before.rows[0],
    newValue: req.body,
  });
  res.json({ success: true, message: 'Temporada actualizada' });
});

// ─────────────────────────────── CATEGORÍAS ───────────────────────────────

/** GET /api/v1/seasons/:seasonId/categories */
export const listCategories = asyncHandler(async (req: AuthRequest, res: Response) => {
  const result = await query(
    `SELECT c.*, (SELECT COUNT(*) FROM teams WHERE category_id = c.id AND team_type = 'OFFICIAL') AS teams_count
     FROM categories c WHERE c.season_id = $1 ORDER BY c.sort_order, c.name`,
    [req.params.seasonId]
  );
  res.json({ success: true, data: result.rows });
});

/** POST /api/v1/admin/seasons/:seasonId/categories */
export const createCategory = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { seasonId } = req.params;
  const { name, color, sortOrder } = req.body ?? {};
  if (!name) throw new AppError('name es obligatorio', 400);

  const id = newPrefixedId('cat');
  await query(
    `INSERT INTO categories (id, season_id, name, slug, color, sort_order)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [id, seasonId, name, slugify(name), color ?? '#667eea', sortOrder ?? 0]
  );

  await audit(req, { action: 'CREATE_CATEGORY', entityType: 'category', entityId: id, newValue: req.body });
  res.status(201).json({ success: true, data: { id, name } });
});

// ───────────────────────────────── CAMPOS ─────────────────────────────────

/** GET /api/v1/seasons/:seasonId/fields */
export const listFields = asyncHandler(async (req: AuthRequest, res: Response) => {
  const result = await query(
    'SELECT * FROM fields WHERE season_id = $1 ORDER BY name',
    [req.params.seasonId]
  );
  res.json({ success: true, data: result.rows });
});

/** POST /api/v1/admin/seasons/:seasonId/fields */
export const createField = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { seasonId } = req.params;
  const { name, location, capacity } = req.body ?? {};
  if (!name) throw new AppError('name es obligatorio', 400);

  const id = newPrefixedId('field');
  await query(
    'INSERT INTO fields (id, season_id, name, location, capacity) VALUES ($1,$2,$3,$4,$5)',
    [id, seasonId, name, location ?? null, capacity ?? null]
  );

  await audit(req, { action: 'CREATE_FIELD', entityType: 'field', entityId: id, newValue: req.body });
  res.status(201).json({ success: true, data: { id, name } });
});

/** PUT /api/v1/admin/categories/:id */
export const updateCategory = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const before = await query('SELECT * FROM categories WHERE id = $1', [id]);
  if (!before.rows[0]) throw new AppError('Categoría no encontrada', 404);

  const { name, color, sortOrder } = req.body ?? {};

  await query(
    `UPDATE categories SET
       name = COALESCE($1, name),
       slug = COALESCE($2, slug),
       color = COALESCE($3, color),
       sort_order = COALESCE($4, sort_order)
     WHERE id = $5`,
    [name ?? null, name ? slugify(name) : null, color ?? null, sortOrder ?? null, id]
  );

  await audit(req, {
    action: 'UPDATE_CATEGORY',
    entityType: 'category',
    entityId: id,
    oldValue: before.rows[0],
    newValue: req.body,
  });
  res.json({ success: true, message: 'Categoría actualizada' });
});

/** DELETE /api/v1/admin/categories/:id — solo categorías todavía vacías. */
export const deleteCategory = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const category = await query('SELECT id, season_id, name FROM categories WHERE id = $1', [id]);
  if (!category.rows[0]) throw new AppError('Categoría no encontrada', 404);
  const used = await query(`SELECT
    (SELECT COUNT(*) FROM teams WHERE category_id = $1 AND team_type = 'OFFICIAL')::int AS teams,
    (SELECT COUNT(*) FROM games WHERE category_id = $1 AND COALESCE(game_type, 'OFFICIAL') = 'OFFICIAL')::int AS games`, [id]);
  if (used.rows[0].teams > 0 || used.rows[0].games > 0) {
    throw new AppError('No se puede eliminar: la categoría tiene equipos o partidos. Suspéndela o elimina primero los datos dependientes.', 409);
  }
  await query('DELETE FROM categories WHERE id = $1', [id]);
  await audit(req, { action: 'DELETE_CATEGORY', entityType: 'category', entityId: id, oldValue: category.rows[0] });
  res.json({ success: true, data: { id } });
});

/** PUT /api/v1/admin/fields/:id */
export const updateField = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const before = await query('SELECT * FROM fields WHERE id = $1', [id]);
  if (!before.rows[0]) throw new AppError('Campo no encontrado', 404);

  const { name, location, capacity, status } = req.body ?? {};

  await query(
    `UPDATE fields SET
       name = COALESCE($1, name),
       location = COALESCE($2, location),
       capacity = COALESCE($3, capacity),
       status = COALESCE($4, status)
     WHERE id = $5`,
    [name ?? null, location ?? null, capacity ?? null, status ?? null, id]
  );

  await audit(req, {
    action: 'UPDATE_FIELD',
    entityType: 'field',
    entityId: id,
    oldValue: before.rows[0],
    newValue: req.body,
  });
  res.json({ success: true, message: 'Campo actualizado' });
});

// ────────────────────────── CONFIGURACIÓN ──────────────────────────

/** GET /api/v1/seasons/:seasonId/settings */
export const getSettings = asyncHandler(async (req: AuthRequest, res: Response) => {
  const result = await query<{ key: string; value: unknown }>(
    'SELECT key, value FROM settings WHERE season_id = $1',
    [req.params.seasonId]
  );

  const settings = Object.fromEntries(result.rows.map((row) => [row.key, row.value]));
  res.json({ success: true, data: settings });
});

/**
 * PUT /api/v1/admin/seasons/:seasonId/settings/:key
 * Req. 5 y 6: documentos requeridos, formatos y tamaño máximo configurables
 * sin tocar código.
 */
export const updateSetting = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { seasonId, key } = req.params;
  const value = req.body?.value;

  if (value === undefined) throw new AppError('El cuerpo debe incluir "value"', 400);
  if (key === 'game_times') {
    const validSlots = (slots: unknown) => Array.isArray(slots) && slots.length <= 48 && slots.every(t => typeof t === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(t)) && new Set(slots).size === slots.length;
    if (!validSlots(value?.slots) || !value.slots.length || !value.field_slots || typeof value.field_slots !== 'object' || Array.isArray(value.field_slots)) throw new AppError('Indica horarios válidos y distintos por campo', 400);
    const fields = await query('SELECT id FROM fields WHERE season_id=$1', [seasonId]);
    for (const [id, slots] of Object.entries(value.field_slots)) {
      if (!fields.rows.some(f => f.id === id) || !validSlots(slots) || !(slots as string[]).every(t => value.slots.includes(t))) throw new AppError('Campo u horarios inválidos para esta temporada', 400);
    }
  }
  if (key === 'competition' && value?.playoff_count !== undefined && ![3,4,6,8,10,12].includes(value.playoff_count)) throw new AppError('Cantidad de clasificados inválida', 400);
  if (key === 'competition' && (!Number.isInteger(value?.rounds_planned) || value.rounds_planned < 1 || value.rounds_planned > 104)) {
    throw new AppError('Indica entre 1 y 104 jornadas previstas', 400);
  }

  // Un cambio mal hecho aquí puede volver inelegible a toda la liga,
  // así que se valida la forma de la configuración de documentos.
  if (key === 'documents') {
    const required = (value as any)?.required;
    const allowed = (value as any)?.allowed_mime;
    const maxSize = (value as any)?.max_size_mb;

    if (!Array.isArray(required) || required.length === 0) {
      throw new AppError('"required" debe listar al menos un tipo de documento', 400);
    }
    const validTypes = ['PHOTO', 'ID_FRONT', 'ID_BACK'];
    const invalid = required.filter((type: string) => !validTypes.includes(type));
    if (invalid.length > 0) {
      throw new AppError(`Tipos inválidos: ${invalid.join(', ')}`, 400);
    }
    if (!Array.isArray(allowed) || allowed.length === 0) {
      throw new AppError('"allowed_mime" debe listar al menos un formato', 400);
    }
    if (typeof maxSize !== 'number' || maxSize <= 0 || maxSize > 25) {
      throw new AppError('"max_size_mb" debe ser un número entre 1 y 25', 400);
    }
  }

  const existing = await query('SELECT id, value FROM settings WHERE season_id = $1 AND key = $2', [
    seasonId,
    key,
  ]);

  if (existing.rows[0]) {
    await query('UPDATE settings SET value = $1, updated_at = NOW() WHERE id = $2', [
      JSON.stringify(value),
      existing.rows[0].id,
    ]);
  } else {
    const season = await query<{ league_id: string }>(
      'SELECT league_id FROM seasons WHERE id = $1',
      [seasonId]
    );
    if (!season.rows[0]) throw new AppError('Temporada no encontrada', 404);

    await query(
      'INSERT INTO settings (id, league_id, season_id, key, value) VALUES ($1,$2,$3,$4,$5)',
      [newPrefixedId('set'), season.rows[0].league_id, seasonId, key, JSON.stringify(value)]
    );
  }

  await audit(req, {
    action: 'UPDATE_SETTING',
    entityType: 'setting',
    entityId: `${seasonId}:${key}`,
    oldValue: existing.rows[0]?.value ?? null,
    newValue: value,
  });

  // Cambiar los documentos exigidos altera quién es elegible: se recalcula
  // en el momento, en lugar de dejar valores obsoletos en la base.
  let recalculated: { evaluated: number; changed: number } | undefined;
  if (key === 'documents') {
    recalculated = await refreshSeasonEligibility(seasonId);
  }

  res.json({
    success: true,
    message: 'Configuración actualizada',
    ...(recalculated ? { data: { recalculated } } : {}),
  });
});
