import assert from 'node:assert/strict';
import pool from '../dist/config/database.js';
import { encryptEmail, decryptEmail, enqueueEmail, deliverEmail, retryDelay, processEmailBatch } from '../dist/services/email-queue.service.js';

process.env.EMAIL_QUEUE_KEY = 'test-only-encryption-key-never-used-in-production';
process.env.RESEND_API_KEY = 'test-only';
delete process.env.OPERATIONS_WEBHOOK_URL;
const payload = { from: 'Liga <test@example.com>', to: ['player@example.com'], subject: 'Prueba', html: 'token-secreto' };
const encrypted = encryptEmail(payload);
assert.ok(!encrypted.includes('token-secreto'));
assert.deepEqual(decryptEmail(encrypted), payload);
assert.notEqual(encryptEmail(payload), encrypted);
process.env.EMAIL_QUEUE_KEY = 'other-key-for-tamper-test-only';
assert.throws(() => decryptEmail(encrypted));
process.env.EMAIL_QUEUE_KEY = 'test-only-encryption-key-never-used-in-production';

let calls = [];
pool.query = async (sql, params) => { calls.push({sql, params}); return { rows: [], rowCount: 0 }; };
await enqueueEmail(payload, { dedupeKey: 'round:1:recipient' });
assert.ok(calls[0].sql.includes('ON CONFLICT (dedupe_key) DO NOTHING'));
assert.deepEqual(decryptEmail(calls[0].params[2]), payload);
assert.ok(calls[0].params[3].getTime() <= Date.now() + 20 * 3600_000);
assert.equal(retryDelay(1), 30);
assert.equal(retryDelay(20), 3600);
let headers;
globalThis.fetch = async (_url, options) => { headers = options.headers; return new Response('{}', { status: 429 }); };
assert.equal((await deliverEmail(payload, 'stable-id')).retryable, true);
assert.equal(headers['Idempotency-Key'], 'stable-id');
globalThis.fetch = async () => new Response('{}', { status: 422 });
assert.equal((await deliverEmail(payload, 'stable-id')).retryable, false);
globalThis.fetch = async () => { throw new Error('timeout'); };
assert.equal((await deliverEmail(payload, 'stable-id')).retryable, true);

for (const [httpStatus, attempts, expected] of [[200,1,'SENT'],[429,1,'PENDING'],[503,6,'FAILED'],[422,1,'FAILED']]) {
  calls = []; let claimed = false;
  pool.query = async (sql, params) => {
    calls.push({sql, params});
    if (sql.includes('RETURNING id') && !claimed) { claimed = true; return {rows:[{id:'job', payload:encrypted, attempts}]}; }
    return {rows:[], rowCount:0};
  };
  globalThis.fetch = async () => new Response('{}', {status:httpStatus});
  assert.equal(await processEmailBatch(2), 1);
  assert.ok(calls.some((c) => c.sql.includes('FOR UPDATE SKIP LOCKED')));
  const settled = calls.find((c) => c.sql.includes('WHERE id = $1 AND lease_token = $2'));
  assert.equal(settled.params[2], expected);
  assert.ok(settled.sql.includes("CASE WHEN $3 = 'PENDING' THEN payload ELSE NULL END"));
}
console.log('OK: cifrado, vencimiento, deduplicación, idempotencia, clasificación de errores, leases y reintentos.');
await pool.end();
