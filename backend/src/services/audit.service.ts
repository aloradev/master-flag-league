import { query } from '../config/database.js';
import { newPrefixedId } from '../utils/id.js';
import type { AuthRequest } from '../middleware/auth.js';

interface AuditEntry {
  action: string;
  entityType: string;
  entityId?: string;
  oldValue?: unknown;
  newValue?: unknown;
}

/**
 * Req. 42: registra toda acción crítica. Fuera de transacción registra
 * errores sin interrumpir; con executor propaga el error para hacer rollback.
 */
export const audit = async (req: AuthRequest, entry: AuditEntry, executor?: typeof query): Promise<void> => {
  try {
    await (executor ?? query)(
      `INSERT INTO audit_logs
        (id, league_id, user_id, user_email, action, entity_type, entity_id,
         old_value, new_value, ip_address, user_agent)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        newPrefixedId('log'),
        req.user?.leagueId ?? null,
        req.user?.id ?? null,
        req.user?.email ?? null,
        entry.action,
        entry.entityType,
        entry.entityId ?? null,
        entry.oldValue ? JSON.stringify(entry.oldValue) : null,
        entry.newValue ? JSON.stringify(entry.newValue) : null,
        req.ip ?? null,
        req.get?.('user-agent') ?? null,
      ]
    );
  } catch (err) {
    if (executor) throw err;
    console.error('[audit] No se pudo registrar:', err instanceof Error ? err.message : err);
  }
};
