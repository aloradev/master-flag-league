import { query as defaultQuery } from '../config/database.js';
import { query } from '../config/database.js';

/**
 * ELEGIBILIDAD — el concepto central del sistema.
 *
 * Nunca se captura a mano: se DERIVA de dos condiciones.
 *   1. El jugador está APPROVED por administración.
 *   2. Tiene la versión vigente de todos los documentos requeridos.
 *
 * El árbitro solo ve 🟢 Elegible / 🔴 No elegible, sin revisar documentos.
 */

export const DEFAULT_REQUIRED_DOCS = ['PHOTO', 'ID_FRONT', 'ID_BACK'] as const;

export interface EligibilityResult {
  isEligible: boolean;
  reason: string | null;
  status: string;
  missingDocuments: string[];
  presentDocuments: string[];
}

/** Documentos exigidos por la temporada (configurable en `settings`). */
export const getRequiredDocuments = async (seasonId: string, query: typeof defaultQuery = defaultQuery): Promise<string[]> => {
  const result = await query<{ value: { required?: string[] } }>(
    `SELECT value FROM settings WHERE season_id = $1 AND key = 'documents' LIMIT 1`,
    [seasonId]
  );
  const configured = result.rows[0]?.value?.required;
  return Array.isArray(configured) && configured.length > 0
    ? configured
    : [...DEFAULT_REQUIRED_DOCS];
};

/** Calcula la elegibilidad sin escribir en la base de datos. */
export const computeEligibility = async (playerId: string, query: typeof defaultQuery = defaultQuery): Promise<EligibilityResult> => {
  const playerResult = await query<{ status: string; season_id: string }>(
    'SELECT status, season_id FROM players WHERE id = $1',
    [playerId]
  );

  const player = playerResult.rows[0];
  if (!player) {
    return {
      isEligible: false,
      reason: 'El jugador no existe',
      status: 'UNKNOWN',
      missingDocuments: [],
      presentDocuments: [],
    };
  }

  const required = await getRequiredDocuments(player.season_id, query);

  const docsResult = await query<{ document_type: string }>(
    `SELECT DISTINCT document_type FROM player_documents
     WHERE player_id = $1 AND is_current = TRUE`,
    [playerId]
  );

  const present = docsResult.rows.map((r) => r.document_type);
  const missing = required.filter((type) => !present.includes(type));

  // Orden de evaluación: el motivo más accionable primero.
  let reason: string | null = null;
  if (player.status === 'BLOCKED') {
    reason = 'Jugador bloqueado por administración';
  } else if (missing.length > 0) {
    reason = `Documentación incompleta: falta ${missing.map(documentLabel).join(', ')}`;
  } else if (player.status === 'PENDING') {
    reason = 'Pendiente de revisión administrativa';
  } else if (player.status === 'CORRECTIONS_REQUIRED') {
    reason = 'Requiere corrección de documentación';
  } else if (player.status === 'REJECTED') {
    reason = 'Registro rechazado';
  }

  return {
    isEligible: player.status === 'APPROVED' && missing.length === 0,
    reason,
    status: player.status,
    missingDocuments: missing,
    presentDocuments: present,
  };
};

/** Recalcula y persiste la elegibilidad. Llamar tras cualquier cambio relevante. */
export const refreshEligibility = async (playerId: string, query: typeof defaultQuery = defaultQuery): Promise<EligibilityResult> => {
  const result = await computeEligibility(playerId, query);
  await query(
    `UPDATE players SET is_eligible = $1, eligibility_reason = $2, updated_at = NOW()
     WHERE id = $3`,
    [result.isEligible, result.reason, playerId]
  );
  return result;
};

/** Etiqueta legible para managers y árbitros. */
export const documentLabel = (type: string): string =>
  ({
    PHOTO: 'fotografía',
    ID_FRONT: 'identificación (frente)',
    ID_BACK: 'identificación (reverso)',
  }[type] ?? type);

/**
 * Recalcula la elegibilidad de todos los jugadores de una temporada.
 *
 * Necesario cuando cambia la configuración de documentos requeridos: el
 * valor guardado en is_eligible quedaría obsoleto y un jugador podría
 * aparecer elegible sin cumplir la nueva regla.
 */
export const refreshSeasonEligibility = async (
  seasonId: string
): Promise<{ evaluated: number; changed: number }> => {
  const players = await query<{ id: string; is_eligible: boolean }>(
    'SELECT id, is_eligible FROM players WHERE season_id = $1 AND removed_at IS NULL',
    [seasonId]
  );

  let changed = 0;
  for (const player of players.rows) {
    const result = await refreshEligibility(player.id);
    if (result.isEligible !== player.is_eligible) changed += 1;
  }

  return { evaluated: players.rows.length, changed };
};
