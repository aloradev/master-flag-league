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
import { deleteFile } from '../services/storage.service.js';

/**
 * Columnas del jugador que la API expone.
 *
 * Explícitas por el mismo motivo que en equipos: `extra_fields` guarda lo
 * que cada liga configure y una columna nueva no debe publicarse sola.
 */
const PLAYER_COLUMNS = `
  p.id, p.team_id, p.season_id, p.category_id,
  p.first_name, p.last_name_paternal, p.last_name_maternal,
  p.date_of_birth, p.jersey_number, p.position,
  p.photo_url, p.avatar_url, p.phone, p.email,
  p.status, p.is_eligible, p.eligibility_reason,
  p.registered_by_user_id, p.reviewed_by_user_id, p.reviewed_at,
  p.created_at, p.updated_at
`;

/** Estados en los que el registro todavía no está resuelto (req. 4). */
const MANAGER_EDITABLE_STATUSES = ['PENDING', 'CORRECTIONS_REQUIRED'];

/**
 * QUIÉN PUEDE CAMBIAR QUÉ
 *
 * La primera versión bloqueaba la edición COMPLETA de un jugador ya
 * revisado, y eso trataba igual dos cosas distintas. Cambiarle el
 * teléfono a un jugador aprobado no afecta a nada de lo que se
 * certificó; cambiarle la fecha de nacimiento sí.
 *
 * CERTIFICADOS son los datos que la identificación respalda. La
 * aprobación dice "vi un documento que decía esto", así que si cambian
 * después de aprobar, la aprobación deja de significar algo. Solo
 * administración los toca una vez revisado el registro.
 *
 * El número de camiseta va en el mismo grupo por otra razón: no está en
 * la identificación, pero sí en el roster oficial que se imprime y que
 * los árbitros tienen en la mano. Un cambio silencioso ahí deja al
 * árbitro con una lista que no coincide con la cancha.
 */
const CAMPOS_CERTIFICADOS = [
  'firstName',
  'lastNamePaternal',
  'lastNameMaternal',
  'dateOfBirth',
  'jerseyNumber',
] as const;

/** Datos de contacto y deportivos: el encargado los mantiene siempre. */
const CAMPOS_LIBRES = ['position', 'phone', 'email'] as const;

const ETIQUETA_CAMPO: Record<string, string> = {
  firstName: 'nombre',
  lastNamePaternal: 'apellido paterno',
  lastNameMaternal: 'apellido materno',
  dateOfBirth: 'fecha de nacimiento',
  jerseyNumber: 'número de camiseta',
  position: 'posición',
  phone: 'teléfono',
  email: 'correo',
};

/** Columna de la base que corresponde a cada campo de la petición. */
const COLUMNA: Record<string, string> = {
  firstName: 'first_name',
  lastNamePaternal: 'last_name_paternal',
  lastNameMaternal: 'last_name_maternal',
  dateOfBirth: 'date_of_birth',
  jerseyNumber: 'jersey_number',
  position: 'position',
  phone: 'phone',
  email: 'email',
};

/**
 * Compara lo que llega con lo que hay, para saber qué cambia DE VERDAD.
 *
 * Importa porque el formulario manda todos los campos en cada guardado.
 * Si se rechazara por "traer" un campo restringido en lugar de por
 * cambiarlo, el encargado no podría corregir un teléfono sin que la
 * petición completa fuera rechazada.
 */
const cambiaDeVerdad = (campo: string, valor: unknown, fila: Record<string, unknown>): boolean => {
  if (valor === undefined || valor === null) return false;
  const actual = fila[COLUMNA[campo]];
  if (campo === 'dateOfBirth') {
    const antes = actual ? new Date(actual as string).toISOString().slice(0, 10) : null;
    const ahora = String(valor).slice(0, 10);
    return antes !== ahora;
  }
  if (campo === 'jerseyNumber') return Number(valor) !== Number(actual ?? NaN);
  return String(valor) !== String(actual ?? '');
};

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

  // Las bajas no aparecen en ninguna lista: para eso se dieron de baja.
  conditions.push('p.removed_at IS NULL');

  const where = `WHERE ${conditions.join(' AND ')}`;

  const result = await query(
    `SELECT p.id, p.first_name, p.last_name_paternal, p.last_name_maternal,
            p.jersey_number, p.position, p.photo_url, p.avatar_url, p.status,
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
    `SELECT ${PLAYER_COLUMNS}, t.name AS team_name, c.name AS category_name,
            s.registration_deadline
     FROM players p
     JOIN teams t      ON t.id = p.team_id
     JOIN categories c ON c.id = p.category_id
     JOIN seasons s    ON s.id = p.season_id
     WHERE p.id = $1 AND p.removed_at IS NULL`,
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
      /**
       * Qué campos puede tocar QUIEN CONSULTA. Se manda desde aquí y no
       * se deduce en la pantalla para que la regla viva en un solo
       * lugar: si mañana cambia, no hay que acordarse de cambiarla en
       * dos sitios y que uno se quede atrás.
       */
      editable_fields:
        isAdmin(req) || MANAGER_EDITABLE_STATUSES.includes(player.status)
          ? [...CAMPOS_CERTIFICADOS, ...CAMPOS_LIBRES]
          : [...CAMPOS_LIBRES],
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
      'SELECT id FROM players WHERE team_id = $1 AND jersey_number = $2 AND removed_at IS NULL',
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

  const existing = await query('SELECT * FROM players WHERE id = $1 AND removed_at IS NULL', [
    id,
  ]);
  const before = existing.rows[0];
  if (!before) throw new AppError('Jugador no encontrado', 404);
  if (!canAccessTeam(req, before.team_id)) {
    throw new AppError('No tienes acceso a este jugador', 403);
  }

  const body = (req.body ?? {}) as Record<string, unknown>;
  const {
    firstName,
    lastNamePaternal,
    lastNameMaternal,
    dateOfBirth,
    jerseyNumber,
    position,
    phone,
    email,
  } = body;

  /**
   * Req. 4: el encargado mantiene contacto y posición siempre, pero los
   * datos certificados solo mientras el registro no esté resuelto.
   *
   * Se comprueba qué CAMBIA, no qué llega: el formulario manda todos los
   * campos en cada guardado, así que rechazar por traerlos impediría
   * corregir un teléfono.
   */
  const restringidosQueCambian = CAMPOS_CERTIFICADOS.filter((c) =>
    cambiaDeVerdad(c, body[c], before)
  );

  if (
    !isAdmin(req) &&
    restringidosQueCambian.length > 0 &&
    !MANAGER_EDITABLE_STATUSES.includes(before.status)
  ) {
    const lista = restringidosQueCambian.map((c) => ETIQUETA_CAMPO[c]).join(', ');
    throw new AppError(
      `Este jugador ya fue revisado, así que ${lista} solo ${
        restringidosQueCambian.length === 1 ? 'lo cambia' : 'los cambia'
      } administración. ` +
        `Teléfono, correo y posición sí los puedes actualizar tú.`,
      403
    );
  }

  if (jerseyNumber != null && jerseyNumber !== before.jersey_number) {
    const taken = await query(
      `SELECT id FROM players
       WHERE team_id = $1 AND jersey_number = $2 AND id <> $3 AND removed_at IS NULL`,
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

  /**
   * Cambiar la fecha de nacimiento de un jugador APROBADO lo devuelve a
   * revisión.
   *
   * Es el único campo que hace esto, y es deliberado. La aprobación
   * significa "vi una identificación que decía esta fecha"; si la fecha
   * cambia después, la aprobación ya no respalda lo que está en el
   * expediente. Y en una liga con categorías esa fecha es la que decide
   * en cuál puede jugar: dejarla editable sin volver a revisar sería
   * dejar abierta la puerta a aprobar con una fecha y jugar con otra.
   *
   * Los nombres NO devuelven a revisión: corregir un acento o un
   * apellido mal escrito es lo más común que va a pasar, y sacar a un
   * jugador de la cancha por eso sería peor que el problema. Queda en la
   * auditoría con el antes y el después.
   */
  const nacimientoCambio = cambiaDeVerdad('dateOfBirth', dateOfBirth, before);
  const vuelveARevision = nacimientoCambio && before.status === 'APPROVED';

  if (vuelveARevision) {
    await query(
      `UPDATE players SET status = 'PENDING', reviewed_by_user_id = NULL,
              reviewed_at = NULL, updated_at = NOW()
       WHERE id = $1`,
      [id]
    );
  }

  // La elegibilidad se recalcula siempre: si el estado cambió, tiene que
  // reflejarlo, y si no cambió, recalcular no cuesta nada y evita que se
  // desincronice por un camino que nadie previó.
  const eligibility = await refreshEligibility(id);

  await audit(req, {
    action: vuelveARevision ? 'UPDATE_PLAYER_BACK_TO_REVIEW' : 'UPDATE_PLAYER',
    entityType: 'player',
    entityId: id,
    oldValue: before,
    newValue: { ...body, status: vuelveARevision ? 'PENDING' : before.status },
  });

  const after = await query(`SELECT ${PLAYER_COLUMNS} FROM players p WHERE p.id = $1`, [id]);

  res.json({
    success: true,
    message: vuelveARevision
      ? 'Jugador actualizado. Al cambiar la fecha de nacimiento volvió a revisión: la aprobación anterior ya no respalda el expediente.'
      : 'Jugador actualizado',
    data: {
      ...after.rows[0],
      full_name: fullName(after.rows[0]),
      eligibility,
      back_to_review: vuelveARevision,
      can_edit: isAdmin(req) || MANAGER_EDITABLE_STATUSES.includes(after.rows[0].status),
    },
  });
});

/**
 * GET /api/v1/public/players/:id — perfil público (req. 13).
 * Nunca expone documentos, teléfono, email ni fecha de nacimiento completa.
 */
export const getPublicPlayerProfile = asyncHandler(async (req: AuthRequest, res: Response) => {
  const result = await query(
    `SELECT p.id, p.first_name, p.last_name_paternal, p.last_name_maternal,
            p.jersey_number, p.position, p.avatar_url,
            EXTRACT(YEAR FROM p.date_of_birth)::int AS birth_year,
            t.name AS team_name, t.logo_url AS team_logo, t.color_primary AS team_color,
            c.name AS category_name, s.name AS season_name
     FROM players p
     JOIN teams t      ON t.id = p.team_id
     JOIN categories c ON c.id = p.category_id
     JOIN seasons s    ON s.id = p.season_id
     WHERE p.id = $1 AND p.status = 'APPROVED' AND p.removed_at IS NULL`,
    [req.params.id]
  );

  const player = result.rows[0];
  if (!player) throw new AppError('Jugador no encontrado', 404);

  res.json({ success: true, data: { ...player, full_name: fullName(player) } });
});

/**
 * DELETE /api/v1/players/:id — quitar a un jugador del equipo.
 *
 * Reportado usando la aplicación: alguien deja el equipo a media
 * temporada y no había forma de sacarlo del roster.
 *
 * Hay dos casos distintos y el sistema los distingue solo, en lugar de
 * preguntarle al usuario algo que puede averiguar:
 *
 *  · **Nunca jugó** — un alta equivocada, un duplicado, alguien que se
 *    inscribió y no llegó. Se borra de verdad, con sus documentos y sus
 *    archivos: no hay historia que conservar y sí datos personales que
 *    no tiene sentido guardar.
 *
 *  · **Ya jugó** — se marca la baja. Borrarlo dejaría sus touchdowns sin
 *    autor en `game_events` y los marcadores de partidos ya jugados
 *    cambiarían hacia atrás. Desaparece de plantillas, listas y conteos;
 *    el historial queda intacto.
 *
 * En los dos casos el dorsal queda libre para el siguiente jugador.
 */
export const removePlayer = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { reason } = (req.body ?? {}) as { reason?: string };

  const existing = await query(
    `SELECT id, team_id, first_name, last_name_paternal, jersey_number, status
     FROM players WHERE id = $1 AND removed_at IS NULL`,
    [id]
  );
  const player = existing.rows[0];
  if (!player) throw new AppError('Jugador no encontrado', 404);
  if (!canAccessTeam(req, player.team_id)) {
    throw new AppError('No tienes acceso a este jugador', 403);
  }

  // El motivo es obligatorio por lo mismo que en un rechazo: sin él, el
  // registro de auditoría no sirve para reconstruir qué pasó.
  const motivo = (reason ?? '').trim();
  if (motivo.length < 3) {
    throw new AppError('Indica el motivo de la baja', 400);
  }

  const historia = await query<{ jugadas: string; mvp: string }>(
    `SELECT
       (SELECT COUNT(*) FROM game_events WHERE player_id = $1)                  AS jugadas,
       (SELECT COUNT(*) FROM games
         WHERE mvp_offensive_player_id = $1 OR mvp_defensive_player_id = $1)    AS mvp`,
    [id]
  );
  const jugo =
    Number(historia.rows[0]?.jugadas ?? 0) > 0 || Number(historia.rows[0]?.mvp ?? 0) > 0;

  const nombre = `${player.first_name} ${player.last_name_paternal}`;

  if (jugo) {
    await query(
      `UPDATE players
       SET removed_at = NOW(), removed_by_user_id = $2, removal_reason = $3,
           is_eligible = FALSE,
           eligibility_reason = 'Baja del equipo',
           updated_at = NOW()
       WHERE id = $1`,
      [id, req.user?.id ?? null, motivo]
    );

    await audit(req, {
      action: 'REMOVE_PLAYER',
      entityType: 'player',
      entityId: id,
      oldValue: { nombre, jersey: player.jersey_number, status: player.status },
      newValue: { baja: true, motivo, conservado: 'tiene partidos jugados' },
    });

    return res.json({
      success: true,
      data: { id, modo: 'baja' },
      message: `${nombre} queda dado de baja. Su historial de partidos se conserva.`,
    });
  }

  /**
   * Sin historia: borrado real. Los archivos se quitan primero, porque
   * después de borrar la fila ya no se sabe dónde estaban —y son
   * identificaciones oficiales, no miniaturas.
   */
  const docs = await query<{ storage_key: string; mime_type: string }>(
    'SELECT storage_key, mime_type FROM player_documents WHERE player_id = $1',
    [id]
  );
  for (const doc of docs.rows) {
    if (doc.storage_key) await deleteFile(doc.storage_key, 'private', doc.mime_type);
  }

  // player_documents y player_approvals caen por ON DELETE CASCADE.
  await query('DELETE FROM players WHERE id = $1', [id]);

  await audit(req, {
    action: 'DELETE_PLAYER',
    entityType: 'player',
    entityId: id,
    oldValue: { nombre, jersey: player.jersey_number, status: player.status },
    newValue: { borrado: true, motivo, documentos: docs.rows.length },
  });

  res.json({
    success: true,
    data: { id, modo: 'borrado' },
    message: `${nombre} fue eliminado junto con sus documentos. Nunca jugó un partido.`,
  });
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
     FROM players WHERE team_id = $1 AND removed_at IS NULL
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
