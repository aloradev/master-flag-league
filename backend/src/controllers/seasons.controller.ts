import type { Response } from 'express';
import { query } from '../config/database.js';
import { AppError, asyncHandler } from '../middleware/errorHandler.js';
import { audit } from '../services/audit.service.js';
import { newPrefixedId } from '../utils/id.js';
import { slugify } from '../utils/slug.js';
import type { AuthRequest } from '../middleware/auth.js';


// ─────────────────────────────── TEMPORADAS ───────────────────────────────

/** GET /api/v1/seasons */
export const listSeasons = asyncHandler(async (req: AuthRequest, res: Response) => {
  const result = await query(
    `SELECT s.*,
            (SELECT COUNT(*) FROM teams   WHERE season_id = s.id) AS teams_count,
            (SELECT COUNT(*) FROM players WHERE season_id = s.id) AS players_count
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

  const registrationOpen =
    !season.registration_deadline ||
    new Date(season.registration_deadline) >= new Date(new Date().toDateString());

  res.json({
    success: true,
    data: {
      ...season,
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
  const before = await query('SELECT * FROM seasons WHERE id = $1', [id]);
  if (!before.rows[0]) throw new AppError('Temporada no encontrada', 404);

  const { name, endDate, registrationDeadline, defaultStartTime, requireApprovalToPlay, status } =
    req.body ?? {};

  await query(
    `UPDATE seasons SET
       name = COALESCE($1, name),
       end_date = COALESCE($2, end_date),
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
    `SELECT c.*, (SELECT COUNT(*) FROM teams WHERE category_id = c.id) AS teams_count
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
