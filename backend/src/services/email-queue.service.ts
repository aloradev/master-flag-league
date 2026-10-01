import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'node:crypto';
import { query } from '../config/database.js';
import { operationalAlert } from './operations.service.js';

export interface EmailPayload { from: string; to: string[]; subject: string; html: string }
const encryptionKey = () => {
  const secret = process.env.EMAIL_QUEUE_KEY || process.env.JWT_SECRET;
  if (!secret || secret.length < 16) throw new Error('EMAIL_QUEUE_KEY o JWT_SECRET requerido');
  return createHash('sha256').update(`mfl-email-queue:${secret}`).digest();
};
export function encryptEmail(payload: EmailPayload): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString('base64')).join('.');
}
export function decryptEmail(value: string): EmailPayload {
  const [iv, tag, data] = value.split('.').map((s) => Buffer.from(s, 'base64'));
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return JSON.parse(Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8'));
}

export async function enqueueEmail(payload: EmailPayload, options: { dedupeKey?: string; expiresAt?: Date } = {}, executor: typeof query = query): Promise<void> {
  const id = randomUUID();
  // Reintentos siempre dentro de las 24 h de idempotencia del proveedor.
  const expiresAt = new Date(Math.min(options.expiresAt?.getTime() ?? Infinity, Date.now() + 20 * 3600_000));
  await executor(`INSERT INTO email_jobs (id, dedupe_key, payload, expires_at)
    VALUES ($1,$2,$3,$4) ON CONFLICT (dedupe_key) DO NOTHING`,
  [id, options.dedupeKey ? createHash('sha256').update(options.dedupeKey).digest('hex') : id, encryptEmail(payload), expiresAt]);
}

export const retryDelay = (attempt: number) => Math.min(3600, 30 * 2 ** Math.max(0, attempt - 1));
export async function deliverEmail(payload: EmailPayload, id: string): Promise<{ ok: boolean; retryable: boolean; code: string }> {
  const brevoKey = process.env.BREVO_API_KEY;
  const resendKey = process.env.RESEND_API_KEY;
  if (!brevoKey && !resendKey) return { ok: false, retryable: true, code: 'EMAIL_PROVIDER_NOT_CONFIGURED' };
  try {
    const brevo = Boolean(brevoKey);
    const response = await fetch(brevo ? 'https://api.brevo.com/v3/smtp/email' : 'https://api.resend.com/emails', {
      method: 'POST', signal: AbortSignal.timeout(10_000),
      headers: brevo
        ? { 'api-key': brevoKey!, 'Content-Type': 'application/json', 'X-MFL-Job': id }
        : { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': id },
      body: JSON.stringify(brevo ? {
        sender: { name: payload.from.replace(/\s*<[^>]+>\s*$/, ''), email: payload.from.match(/<([^>]+)>/)?.[1] ?? payload.from },
        to: payload.to.map(email => ({ email })), subject: payload.subject, htmlContent: payload.html,
      } : payload),
    });
    const detail = response.status === 409 ? await response.json().catch(() => ({})) as { name?: string } : {};
    const concurrent = detail.name === 'concurrent_idempotent_requests';
    return { ok: response.ok, retryable: response.status === 429 || response.status >= 500 || concurrent,
      code: response.ok ? 'ACCEPTED' : `${brevo ? 'BREVO' : 'RESEND'}_${response.status}` };
  } catch { return { ok: false, retryable: true, code: `${brevoKey ? 'BREVO' : 'RESEND'}_NETWORK` }; }
}

/** Reclamo atómico y lease recuperable: varias instancias no toman el mismo trabajo. */
export async function processEmailBatch(limit = 10): Promise<number> {
  const expired = await query(`UPDATE email_jobs SET status = 'FAILED', payload = NULL, lease_until = NULL,
    last_error = 'EXPIRED', updated_at = NOW()
    WHERE status IN ('PENDING','PROCESSING') AND expires_at <= NOW()
      AND (lease_until IS NULL OR lease_until < NOW())`);
  if (expired.rowCount) void operationalAlert('EMAIL_EXPIRED');
  let processed = 0;
  for (let i = 0; i < limit; i++) {
    const lease = randomUUID();
    const claimed = await query(`UPDATE email_jobs SET status = 'PROCESSING', attempts = attempts + 1,
      lease_token = $1, lease_until = NOW() + INTERVAL '2 minutes', updated_at = NOW()
      WHERE id = (SELECT id FROM email_jobs WHERE expires_at > NOW() AND
        ((status = 'PENDING' AND next_attempt_at <= NOW()) OR
         (status = 'PROCESSING' AND lease_until < NOW()))
        ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1)
      RETURNING id, payload, attempts`, [lease]);
    const job = claimed.rows[0];
    if (!job) break;
    let outcome;
    try { outcome = await deliverEmail(decryptEmail(job.payload), job.id); }
    catch { outcome = { ok: false, retryable: false, code: 'PAYLOAD_UNREADABLE' }; }
    const status = outcome.ok ? 'SENT' : outcome.retryable && job.attempts < 6 ? 'PENDING' : 'FAILED';
    // El mismo parámetro participa en una asignación varchar y una comparación;
    // fijar su tipo evita la inferencia incompatible (42P08) de PostgreSQL.
    await query(`UPDATE email_jobs SET status = $3::varchar, last_error = $4,
      next_attempt_at = NOW() + ($5 * INTERVAL '1 second'), lease_until = NULL, lease_token = NULL,
      payload = CASE WHEN $3::varchar = 'PENDING' THEN payload ELSE NULL END, updated_at = NOW()
      WHERE id = $1 AND lease_token = $2`, [job.id, lease, status, outcome.ok ? null : outcome.code, retryDelay(job.attempts)]);
    if (!outcome.ok) void operationalAlert(status === 'FAILED' ? 'EMAIL_FAILED' : 'EMAIL_RETRY');
    processed++;
  }
  return processed;
}

let running = false;
export async function drainEmailQueue(): Promise<void> {
  if (running || process.env.EMAIL_WORKER_ENABLED === 'false') return;
  running = true;
  try { await processEmailBatch(); }
  catch { await operationalAlert('EMAIL_QUEUE_DATABASE_ERROR'); }
  finally { running = false; }
}
export function startEmailWorker(): () => void {
  if (process.env.EMAIL_WORKER_ENABLED === 'false') return () => {};
  // Intervalo explícito: cada consulta consume cómputo de Neon.
  const interval = Math.max(30_000, Number(process.env.EMAIL_WORKER_INTERVAL_MS) || 300_000);
  void drainEmailQueue();
  const birthdays = () => void import('./birthday.service.js').then(({ sendBirthdayGreetings }) => sendBirthdayGreetings()).catch(() => {});
  birthdays();
  const timer = setInterval(() => { void drainEmailQueue(); }, interval);
  timer.unref();
  const birthdayTimer = setInterval(birthdays, 24 * 60 * 60_000);
  birthdayTimer.unref();
  return () => { clearInterval(timer); clearInterval(birthdayTimer); };
}
