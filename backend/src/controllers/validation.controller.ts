import type { Response } from 'express';
import { query, withTransaction } from '../config/database.js';
import { AppError, asyncHandler } from '../middleware/errorHandler.js';
import { audit } from '../services/audit.service.js';
import { newPrefixedId } from '../utils/id.js';
import type { AuthRequest } from '../middleware/auth.js';
import { refreshEligibility, getRequiredDocuments, documentLabel } from '../services/eligibility.service.js';
import { notifyPlayerStatusChange } from '../services/notification.service.js';

/**
 * REQ. 8 — VALIDACIÓN ADMINISTRATIVA
 *
 * Solo administración resuelve un registro; un manager nunca aprueba a sus
 * propios jugadores (se garantiza por el rol exigido en las rutas).
 */

type Action = 'APPROVE' | 'REJECT' | 'REQUEST_CORRECTION' | 'BLOCK';

const STATUS_BY_ACTION: Record<Action, string> = {
  APPROVE: 'APPROVED',
  REJECT: 'REJECTED',
  REQUEST_CORRECTION: 'CORRECTIONS_REQUIRED',
  BLOCK: 'BLOCKED',
};

/**
 * GET /api/v1/admin/validation/queue
 * Cola de revisión ordenada por antigüedad, con lo necesario para decidir
 * sin abrir cada registro.
 */
export const getValidationQueue = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { seasonId, teamId, status } = req.query as Record<string, string | undefined>;

  const conditions = ["p.status IN ('PENDING', 'CORRECTIONS_REQUIRED')"];
  const params: any[] = [];

  if (status) {
    conditions.length = 0;
    params.push(status);
    conditions.push(`p.status = $${params.length}`);
  }
  if (seasonId) {
    params.push(seasonId);
    conditions.push(`p.season_id = $${params.length}`);
  }
  if (teamId) {
    params.push(teamId);
    conditions.push(`p.team_id = $${params.length}`);
  }

  const result = await query(
    `SELECT p.id, p.first_name, p.last_name_paternal, p.last_name_maternal,
            p.jersey_number, p.position, p.photo_url, p.status, p.date_of_birth,
            p.is_eligible, p.eligibility_reason, p.created_at, p.season_id,
            t.id AS team_id, t.name AS team_name, t.color_primary AS team_color,
            c.name AS category_name,
            COALESCE(
              (SELECT json_agg(json_build_object(
                 'id', d.id, 'type', d.document_type, 'version', d.version,
                 'url', d.file_url, 'mime_type', d.mime_type
               ))
               FROM player_documents d
               WHERE d.player_id = p.id AND d.is_current = TRUE),
              '[]'::json
            ) AS documents,
            (SELECT a.reason FROM player_approvals a
             WHERE a.player_id = p.id ORDER BY a.created_at DESC LIMIT 1) AS last_reason
     FROM players p
     JOIN teams t      ON t.id = p.team_id
     JOIN categories c ON c.id = p.category_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY p.created_at ASC`,
    params
  );

  // Marca qué falta en cada registro: el admin ve de un vistazo si puede resolver.
  const enriched = await Promise.all(
    result.rows.map(async (player: any) => {
      const required = await getRequiredDocuments(player.season_id);
      const present = (player.documents ?? []).map((d: any) => d.type);
      const missing = required.filter((t: string) => !present.includes(t));
      return {
        ...player,
        full_name: [player.first_name, player.last_name_paternal, player.last_name_maternal]
          .filter(Boolean)
          .join(' '),
        missing_documents: missing.map((t: string) => ({ type: t, label: documentLabel(t) })),
        // Sin documentación completa no hay nada que aprobar.
        ready_to_review: missing.length === 0,
      };
    })
  );

  res.json({
    success: true,
    data: {
      total: enriched.length,
      ready_to_review: enriched.filter((p) => p.ready_to_review).length,
      awaiting_documents: enriched.filter((p) => !p.ready_to_review).length,
      players: enriched,
    },
  });
});

/**
 * POST /api/v1/admin/players/:id/review
 * Body: { action, reason? }
 */
export const reviewPlayer = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const action = String(req.body?.action ?? '').toUpperCase() as Action;
  const reason: string | undefined = req.body?.reason?.trim() || undefined;

  if (!STATUS_BY_ACTION[action]) {
    throw new AppError(
      `action debe ser: ${Object.keys(STATUS_BY_ACTION).join(', ')}`,
      400
    );
  }

  // Rechazar o pedir corrección sin explicar deja al manager sin saber qué hacer.
  if ((action === 'REJECT' || action === 'REQUEST_CORRECTION') && !reason) {
    throw new AppError(
      'Debes indicar el motivo para que el manager sepa qué corregir',
      400
    );
  }

  const playerResult = await query<{
    status: string;
    season_id: string;
    team_id: string;
    first_name: string;
    last_name_paternal: string;
  }>(
    `SELECT status, season_id, team_id, first_name, last_name_paternal
     FROM players WHERE id = $1`,
    [id]
  );

  const player = playerResult.rows[0];
  if (!player) throw new AppError('Jugador no encontrado', 404);

  const newStatus = STATUS_BY_ACTION[action];

  // No se aprueba un registro incompleto: la elegibilidad quedaría en falso
  // y el manager creería que su jugador ya puede jugar.
  if (action === 'APPROVE') {
    const required = await getRequiredDocuments(player.season_id);
    const docs = await query<{ document_type: string }>(
      `SELECT DISTINCT document_type FROM player_documents
       WHERE player_id = $1 AND is_current = TRUE`,
      [id]
    );
    const present = docs.rows.map((d) => d.document_type);
    const missing = required.filter((t) => !present.includes(t));

    if (missing.length > 0) {
      throw new AppError(
        `No se puede aprobar: falta ${missing.map(documentLabel).join(', ')}`,
        400,
        { missingDocuments: missing }
      );
    }
  }

  await withTransaction(async (q) => {
    await q(
      `UPDATE players SET status = $1, reviewed_by_user_id = $2, reviewed_at = NOW(),
              updated_at = NOW() WHERE id = $3`,
      [newStatus, req.user!.id, id]
    );

    await q(
      `INSERT INTO player_approvals
        (id, player_id, action, previous_status, new_status, reason, reviewed_by_user_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [newPrefixedId('appr'), id, action, player.status, newStatus, reason ?? null, req.user!.id]
    );

    // Al pedir corrección, los documentos vigentes quedan marcados para rehacerse.
    if (action === 'REQUEST_CORRECTION' || action === 'REJECT') {
      await q(
        `UPDATE player_documents SET status = 'CORRECTIONS_REQUIRED', review_notes = $1
         WHERE player_id = $2 AND is_current = TRUE`,
        [reason ?? null, id]
      );
    }
    if (action === 'APPROVE') {
      await q(
        `UPDATE player_documents SET status = 'APPROVED'
         WHERE player_id = $1 AND is_current = TRUE`,
        [id]
      );
    }
  });

  const eligibility = await refreshEligibility(id);

  await audit(req, {
    action: `REVIEW_PLAYER_${action}`,
    entityType: 'player',
    entityId: id,
    oldValue: { status: player.status },
    newValue: { status: newStatus, reason },
  });

  // Notificación al manager (req. 31). No bloquea la respuesta.
  void notifyPlayerStatusChange({
    playerId: id,
    playerName: `${player.first_name} ${player.last_name_paternal}`,
    teamId: player.team_id,
    action,
    newStatus,
    reason,
  });

  res.json({
    success: true,
    data: { status: newStatus, eligibility },
    message: {
      APPROVE: 'Jugador aprobado y habilitado para jugar',
      REJECT: 'Registro rechazado. Se notificó al manager.',
      REQUEST_CORRECTION: 'Se solicitó corrección al manager.',
      BLOCK: 'Jugador bloqueado',
    }[action],
  });
});

/** GET /api/v1/admin/validation/stats — tarjetas del dashboard */
export const getValidationStats = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { seasonId } = req.query as Record<string, string | undefined>;

  const result = await query(
    `SELECT
       COUNT(*)::int                                                          AS total,
       COUNT(*) FILTER (WHERE status = 'PENDING')::int                        AS pending,
       COUNT(*) FILTER (WHERE status = 'APPROVED')::int                       AS approved,
       COUNT(*) FILTER (WHERE status = 'CORRECTIONS_REQUIRED')::int           AS corrections,
       COUNT(*) FILTER (WHERE status = 'REJECTED')::int                       AS rejected,
       COUNT(*) FILTER (WHERE status = 'BLOCKED')::int                        AS blocked,
       COUNT(*) FILTER (WHERE is_eligible)::int                               AS eligible
     FROM players
     WHERE ($1::text IS NULL OR season_id = $1)`,
    [seasonId ?? null]
  );

  const byTeam = await query(
    `SELECT t.id, t.name, t.color_primary,
            COUNT(p.id)::int                                        AS total,
            COUNT(p.id) FILTER (WHERE p.is_eligible)::int           AS eligible,
            COUNT(p.id) FILTER (WHERE p.status = 'PENDING')::int    AS pending
     FROM teams t
     LEFT JOIN players p ON p.team_id = t.id
     WHERE ($1::text IS NULL OR t.season_id = $1)
     GROUP BY t.id, t.name, t.color_primary
     ORDER BY pending DESC, t.name`,
    [seasonId ?? null]
  );

  res.json({ success: true, data: { ...result.rows[0], by_team: byTeam.rows } });
});
