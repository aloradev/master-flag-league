import assert from 'node:assert/strict';

// Solo el PostgreSQL desechable de CI; nunca cargar .env ni aceptar Neon.
if (process.env.CI !== 'true' || process.env.DB_HOST !== '127.0.0.1' ||
    process.env.DB_NAME !== 'mfl' || process.env.DATABASE_URL) {
  throw new Error('Esta prueba requiere PostgreSQL local y desechable de CI.');
}
const { default: pool } = await import('../dist/config/database.js');
const { enqueueEmail, processEmailBatch } = await import('../dist/services/email-queue.service.js');
process.env.EMAIL_QUEUE_KEY = 'ci-only-email-encryption-secret';
process.env.RESEND_API_KEY = 'simulated-provider';
delete process.env.OPERATIONS_WEBHOOK_URL;
let accepted = [];
globalThis.fetch = async (_url, options) => {
  accepted.push(options.headers['Idempotency-Key']);
  return new Response('{}', {status:200});
};
try {
  const payload = {from:'test@example.com',to:['recipient@example.com'],subject:'CI',html:'synthetic'};
  for (let i = 0; i < 4; i++) await enqueueEmail(payload, {dedupeKey:`ci-${i}`});
  await enqueueEmail(payload, {dedupeKey:'ci-0'});
  assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM email_jobs')).rows[0].n, 4);
  await Promise.all([processEmailBatch(4), processEmailBatch(4)]);
  assert.equal(accepted.length, 4);
  assert.equal(new Set(accepted).size, 4, 'Dos procesadores enviaron el mismo trabajo');
  const settled = await pool.query('SELECT status, payload FROM email_jobs');
  assert.ok(settled.rows.every((r) => r.status === 'SENT' && r.payload === null));

  await enqueueEmail(payload, {dedupeKey:'ci-expired', expiresAt:new Date(Date.now()-1000)});
  await processEmailBatch();
  assert.equal(accepted.length, 4, 'No enviar un trabajo vencido');
  assert.equal((await pool.query("SELECT COUNT(*)::int AS n FROM email_jobs WHERE last_error = 'EXPIRED' AND payload IS NULL")).rows[0].n, 1);

  await enqueueEmail(payload, {dedupeKey:'ci-recover-lease'});
  await pool.query("UPDATE email_jobs SET status='PROCESSING', lease_until=NOW()-INTERVAL '1 minute', lease_token='dead-worker' WHERE status='PENDING'");
  await processEmailBatch();
  assert.equal(accepted.length, 5, 'Recuperar lease de un proceso caído');
  for (const [httpStatus, expected] of [[429, 'PENDING'], [422, 'FAILED']]) {
    globalThis.fetch = async () => new Response('{}', {status:httpStatus});
    await enqueueEmail(payload, {dedupeKey:`ci-status-${httpStatus}`});
    assert.equal(await processEmailBatch(1), 1);
    const result = await pool.query('SELECT status,payload,last_error FROM email_jobs WHERE last_error=$1', [`RESEND_${httpStatus}`]);
    assert.equal(result.rows.length, 1);
    assert.equal(result.rows[0].status, expected);
    assert.equal(result.rows[0].payload !== null, expected === 'PENDING');
  }
  console.log('OK PostgreSQL: deduplicación, dos workers, purga, vencimiento, recuperación de lease y estados SENT/PENDING/FAILED.');
} finally { await pool.end(); }
