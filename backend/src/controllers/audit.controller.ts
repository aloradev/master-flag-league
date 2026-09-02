import type { Response } from 'express';
import { query } from '../config/database.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import type { AuthRequest } from '../middleware/auth.js';

/**
 * GET /api/v1/admin/audit — req. 42
 * Los registros son de solo lectura: no existe endpoint de edición ni borrado.
 */
export const listAuditLogs = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { entityType, entityId, userId, action, limit, offset } = req.query as Record<
    string,
    string | undefined
  >;

  const conditions: string[] = [];
  const params: any[] = [];

  if (entityType) {
    params.push(entityType);
    conditions.push(`entity_type = $${params.length}`);
  }
  if (entityId) {
    params.push(entityId);
    conditions.push(`entity_id = $${params.length}`);
  }
  if (userId) {
    params.push(userId);
    conditions.push(`user_id = $${params.length}`);
  }
  if (action) {
    params.push(`%${action}%`);
    conditions.push(`action ILIKE $${params.length}`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const pageSize = Math.min(parseInt(limit ?? '100', 10) || 100, 500);
  const skip = parseInt(offset ?? '0', 10) || 0;

  params.push(pageSize, skip);

  const result = await query(
    `SELECT id, user_id, user_email, action, entity_type, entity_id,
            old_value, new_value, ip_address, created_at
     FROM audit_logs ${where}
     ORDER BY created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  const totalResult = await query<{ total: string }>(
    `SELECT COUNT(*)::text AS total FROM audit_logs ${where}`,
    params.slice(0, params.length - 2)
  );

  res.json({
    success: true,
    data: result.rows,
    meta: { total: parseInt(totalResult.rows[0].total, 10), limit: pageSize, offset: skip },
  });
});
