import type { Response } from 'express';
import { query } from '../config/database.js';
import { AppError, asyncHandler } from '../middleware/errorHandler.js';
import { audit } from '../services/audit.service.js';
import { newPrefixedId } from '../utils/id.js';
import { canAccessTeam, ADMIN_ROLES, type AuthRequest } from '../middleware/auth.js';
import {
  refreshEligibility,
  computeEligibility,
  getRequiredDocuments,
  documentLabel,
} from '../services/eligibility.service.js';

/** Estados en los que el manager todavía puede editar (req. 4). */
const MANAGER_EDITABLE_STATUSES = ['PENDING', 'CORRECTIONS_REQUIRED'];

const isAdmin = (req: AuthRequest) => ADMIN_ROLES.includes(req.user!.role as any);

const fullName = (p: any) =>
  [p.first_name, p.last_name_paternal, p.last_name_maternal].filter(Boolean).join(' ');

/**
 * GET /api/v1/players
 * Admin ve todos; manager solo los de sus equipos.
 */
export const listPlayers = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { teamId, seasonId, categoryId, status, eligible, search } = req.query as Record<
    string,
    string | undefined
  >;

  const conditions: string[] = [];
  const params: any[] = [];

  if (teamId) {
    params.push(teamId);
    conditions.push(`p.team_id = $${params.length}`);
  }
  if (seasonId) {
    params.push(seasonId);
    conditions.push(`p.season_id = $${params.length}`);
  }
  if (categoryId) {
    params.push(categoryId);
    conditions.push(`p.category_id = $${params.length}`);
  }
  if (status) {
    params.push(status);
    conditions.push(`p.status = $${params.length}`);
  }
  if (eligible === 'true' || eligible === 'false') {
    params.push(eligible === 'true');
    conditions.push(`p.is_eligible = $${params.length}`);
  }
  if (search) {
    params.push(`%${search}%`);
    conditions.push(
      `(p.first_name ILIKE $${params.length} OR p.last_name_paternal ILIKE $${params.length})`
    );
  }
  if (req.managedTeamIds) {
    if (req.managedTeamIds.length === 0) return res.json({ success: true, data: [] });
    params.push(req.managedTeamIds);
    conditions.push(`p.team_id = ANY($${params.length})`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const result = await query(
    `SELECT p.id, p.first_name, p.last_name_paternal, p.last_name_maternal,
            p.jersey_number, p.position, p.photo_url, p.status,
            p.is_eligible, p.eligibility_reason, p.created_at,
            t.id AS team_id, t.name AS team_name, t.color_primary AS team_color,
            c.name AS category_name,
            (SELECT COUNT(DISTINCT document_type) FROM player_documents d
             WHERE d.player_id = p.id AND d.is_current) AS documents_count
     FROM players p
     JOIN teams t      ON t.id = p.team_id
     JOIN categories c ON c.id = p.category_id
     ${where}
     ORDER BY t.name, p.jersey_number NULLS LAST`,
    params
  );

  res.json({ success: true, data: result.rows });
});

/** GET /api/v1/players/:id — vista completa para manager y administración */
export const getPlayer = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  const result = await query(
    `SELECT p.*, t.name AS team_name, t.id AS team_id, c.name AS category_name,
            s.registration_deadline
     FROM players p
     JOIN teams t      ON t.id = p.team_id
     JOIN categories c ON c.id = p.category_id
     JOIN seasons s    ON s.id = p.season_id
     WHERE p.id = $1`,
    [id]
  );

  const player = result.rows[0];
  if (!player) throw new AppError('Jugador no encontrado', 404);
  if (!canAccessTeam(req, player.team_id)) {
    throw new AppError('No tienes acceso a este jugador', 403);
  }

  const [documents, history, eligibility] = await Promise.all([
    query(
      `SELECT id, document_type, file_url, mime_type, file_size, version,
              status, review_notes, uploaded_at
       FROM player_documents
       WHERE player_id = $1 AND is_current = TRUE
       ORDER BY document_type`,
      [id]
    ),
    query(
      `SELECT a.action, a.previous_status, a.new_status, a.reason, a.created_at,
              u.name AS reviewed_by
       FROM player_approvals a
       LEFT JOIN users u ON u.id = a.reviewed_by_user_id
       WHERE a.player_id = $1 ORDER BY a.created_at DESC`,
      [id]
    ),
    computeEligibility(id),
  ]);

  const required = await getRequiredDocuments(player.season_id);

  // Checklist explícito por documento (req. 7): ✅ / ❌ por tipo.
  const checklist = required.map((type) => {
    const doc = documents.rows.find((d: any) => d.document_type === type);
    return {
      type,
      label: documentLabel(type),
      uploaded: Boolean(doc),
      document: doc ?? null,
    };
  });

  res.json({
    success: true,
    data: {
      ...player,
      full_name: fullName(player),
      documents: documents.rows,
      documents_checklist: checklist,
      eligibility,
      approval_history: history.rows,
      can_edit: isAdmin(req) || MANAGER_EDITABLE_STATUSES.includes(player.status),
    },
  });
});

/**
 * POST /api/v1/players — el manager registra un jugador (req. 48).
 * Queda en PENDING; la elegibilidad se calcula, nunca se captura.
 */
export const createPlayer = asyncHandler(async (req: AuthRequest, res: Response) => {
  const {
    teamId,
    firstName,
    lastNamePaternal,
    lastNameMaternal,
    dateOfBirth,
    jerseyNumber,
    position,
    phone,
    email,
    extraFields,
  } = req.body ?? {};

  if (!teamId || !firstName || !lastNamePaternal || !dateOfBirth) {
    throw new AppError(
      'teamId, firstName, lastNamePaternal y dateOfBirth son obligatorios',
      400
    );
  }
  if (!canAccessTeam(req, teamId)) {
    throw new AppError('No tienes acceso a este equipo', 403);
  }

  const teamResult = await query<{
    season_id: string;
    category_id: string;
    status: string;
    registration_deadline: string | null;
  }>(
    `SELECT t.season_id, t.category_id, t.status, s.registration_deadline
     FROM teams t JOIN seasons s ON s.id = t.season_id WHERE t.id = $1`,
    [teamId]
  );

  const team = teamResult.rows[0];
  if (!team) throw new AppError('Equipo no encontrado', 404);
  if (team.status !== 'ACTIVE') {
    throw new AppError('El equipo no está activo', 400);
  }

  // Req. 10: después de la fecha límite solo administración puede dar de alta.
  if (team.registration_deadline && !isAdmin(req)) {
    const deadline = new Date(team.registration_deadline);
    const today = new Date(new Date().toDateString());
    if (today > deadline) {
      throw new AppError(
        'El periodo de registro está cerrado. Solicita autorización a administración.',
        403
      );
    }
  }

  if (jerseyNumber != null) {
    const taken = await query(
      'SELECT id FROM players WHERE team_id = $1 AND jersey_number = $2',
      [teamId, jerseyNumber]
    );
    if (taken.rows[0]) {
      throw new AppError(`El número ${jerseyNumber} ya está asignado en este equipo`, 409);
    }
  }

  const id = newPrefixedId('ply');
  await query(
    `INSERT INTO players
      (id, team_id, season_id, category_id, first_name, last_name_paternal,
       last_name_maternal, date_of_birth, jersey_number, position, phone, email,
       extra_fields, status, is_eligible, registered_by_user_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'PENDING',FALSE,$14)`,
    [
      id,
      teamId,
      team.season_id,
      team.category_id,
      firstName,
      lastNamePaternal,
      lastNameMaternal ?? null,
      dateOfBirth,
      jerseyNumber ?? null,
      position ?? null,
      phone ?? null,
      email ?? null,
      JSON.stringify(extraFields ?? {}),
      req.user!.id,
    ]
  );

  const eligibility = await refreshEligibility(id);

  await audit(req, {
    action: 'CREATE_PLAYER',
    entityType: 'player',
    entityId: id,
    newValue: { teamId, firstName, lastNamePaternal, jerseyNumber },
  });

  res.status(201).json({
    success: true,
    data: { id, status: 'PENDING', eligibility },
    message: 'Jugador registrado. Sube la documentación para enviarlo a revisión.',
  });
});

/** PUT /api/v1/players/:id */
export const updatePlayer = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  const existing = await query('SELECT * FROM players WHERE id = $1', [id]);
  const before = existing.rows[0];
  if (!before) throw new AppError('Jugador no encontrado', 404);
  if (!canAccessTeam(req, before.team_id)) {
    throw new AppError('No tienes acceso a este jugador', 403);
  }

  // Req. 4: el manager edita solo mientras el registro no esté resuelto.
  if (!isAdmin(req) && !MANAGER_EDITABLE_STATUSES.includes(before.status)) {
    throw new AppError(
      'Este jugador ya fue revisado. Solicita el cambio a administración.',
      403
    );
  }

  const {
    firstName,
    lastNamePaternal,
    lastNameMaternal,
    dateOfBirth,
    jerseyNumber,
    position,
    phone,
    email,
  } = req.body ?? {};

  if (jerseyNumber != null && jerseyNumber !== before.jersey_number) {
    const taken = await query(
      'SELECT id FROM players WHERE team_id = $1 AND jersey_number = $2 AND id <> $3',
      [before.team_id, jerseyNumber, id]
    );
    if (taken.rows[0]) {
      throw new AppError(`El número ${jerseyNumber} ya está asignado en este equipo`, 409);
    }
  }

  await query(
    `UPDATE players SET
       first_name = COALESCE($1, first_name),
       last_name_paternal = COALESCE($2, last_name_paternal),
       last_name_maternal = COALESCE($3, last_name_maternal),
       date_of_birth = COALESCE($4, date_of_birth),
       jersey_number = COALESCE($5, jersey_number),
       position = COALESCE($6, position),
       phone = COALESCE($7, phone),
       email = COALESCE($8, email),
       updated_at = NOW()
     WHERE id = $9`,
    [
      firstName ?? null,
      lastNamePaternal ?? null,
      lastNameMaternal ?? null,
      dateOfBirth ?? null,
      jerseyNumber ?? null,
      position ?? null,
      phone ?? null,
      email ?? null,
      id,
    ]
  );

  await audit(req, {
    action: 'UPDATE_PLAYER',
    entityType: 'player',
    entityId: id,
    oldValue: before,
    newValue: req.body,
  });

  res.json({ success: true, message: 'Jugador actualizado' });
});

/**
 * GET /api/v1/public/players/:id — perfil público (req. 13).
 * Nunca expone documentos, teléfono, email ni fecha de nacimiento completa.
 */
export const getPublicPlayerProfile = asyncHandler(async (req: AuthRequest, res: Response) => {
  const result = await query(
    `SELECT p.id, p.first_name, p.last_name_paternal, p.last_name_maternal,
            p.jersey_number, p.position, p.photo_url,
            EXTRACT(YEAR FROM p.date_of_birth)::int AS birth_year,
            t.name AS team_name, t.logo_url AS team_logo, t.color_primary AS team_color,
            c.name AS category_name, s.name AS season_name
     FROM players p
     JOIN teams t      ON t.id = p.team_id
     JOIN categories c ON c.id = p.category_id
     JOIN seasons s    ON s.id = p.season_id
     WHERE p.id = $1 AND p.status = 'APPROVED'`,
    [req.params.id]
  );

  const player = result.rows[0];
  if (!player) throw new AppError('Jugador no encontrado', 404);

  res.json({ success: true, data: { ...player, full_name: fullName(player) } });
});

/**
 * GET /api/v1/teams/:teamId/eligibility — vista del árbitro (req. 9).
 * Solo nombre, número y semáforo. Sin documentos.
 */
export const getTeamEligibility = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { teamId } = req.params;

  const team = await query('SELECT id, name, color_primary FROM teams WHERE id = $1', [teamId]);
  if (!team.rows[0]) throw new AppError('Equipo no encontrado', 404);

  const result = await query(
    `SELECT id, first_name, last_name_paternal, jersey_number, position,
            is_eligible, eligibility_reason
     FROM players WHERE team_id = $1
     ORDER BY jersey_number NULLS LAST`,
    [teamId]
  );

  const players = result.rows.map((p: any) => ({
    id: p.id,
    jersey_number: p.jersey_number,
    name: `${p.first_name} ${p.last_name_paternal}`,
    position: p.position,
    is_eligible: p.is_eligible,
    // El árbitro ve el motivo solo si NO es elegible, y sin detalle sensible.
    note: p.is_eligible ? null : 'No completó su registro',
  }));

  res.json({
    success: true,
    data: {
      team: team.rows[0],
      eligible_count: players.filter((p) => p.is_eligible).length,
      total: players.length,
      players,
    },
  });
});
