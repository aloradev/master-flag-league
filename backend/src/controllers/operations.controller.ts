import { query, healthCheck } from '../config/database.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { drainEmailQueue } from '../services/email-queue.service.js';
import { sendBirthdayGreetings } from '../services/birthday.service.js';
import { operationalAlert } from '../services/operations.service.js';

export const status = asyncHandler(async (_req, res) => {
  const database = await healthCheck();
  if (!database) {
    void operationalAlert('DATABASE_UNREACHABLE');
    return res.status(503).json({ success: false, error: 'Base de datos no disponible' });
  }
  const counts = await query(`SELECT status, COUNT(*)::int AS count FROM email_jobs GROUP BY status`);
  const stalled = await query(`SELECT COUNT(*)::int AS count FROM email_jobs
    WHERE status IN ('PENDING','PROCESSING') AND created_at < NOW() - INTERVAL '15 minutes'`);
  const recentFailures = await query(`SELECT id, attempts, last_error, updated_at FROM email_jobs
    WHERE status = 'FAILED' ORDER BY updated_at DESC LIMIT 10`);
  if (stalled.rows[0].count > 0) void operationalAlert('EMAIL_BACKLOG');
  res.json({ success: true, data: {
    database: 'connected', workerEnabled: process.env.EMAIL_WORKER_ENABLED !== 'false',
    resendConfigured: Boolean(process.env.RESEND_API_KEY), webhookConfigured: Boolean(process.env.OPERATIONS_WEBHOOK_URL),
    counts: Object.fromEntries(counts.rows.map((row) => [row.status, row.count])),
    stalled: stalled.rows[0].count, recentFailures: recentFailures.rows,
  } });
});

export const processPending = asyncHandler(async (_req, res) => {
  void drainEmailQueue();
  res.status(202).json({ success: true, data: { message: 'Procesamiento solicitado; consulta el estado actualizado.' } });
});

export const processBirthdays = asyncHandler(async (_req, res) => {
  const queued = await sendBirthdayGreetings();
  res.status(202).json({ success: true, data: { queued } });
});
