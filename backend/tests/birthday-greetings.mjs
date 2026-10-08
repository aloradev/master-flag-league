import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { birthdayContent } from '../dist/services/email-template.service.js';

const messages = [];
const statuses = ['APPROVED', 'PENDING', 'CORRECTIONS_REQUIRED', 'REJECTED', 'BLOCKED'];
globalThis.__birthdayQuery = async (sql, params) => {
  assert.match(sql, /removed_at IS NULL/);
  assert.match(sql, /email IS NOT NULL AND BTRIM\(email\) <> ''/);
  assert.doesNotMatch(sql, /status\s*=/);
  assert.deepEqual(params, [10, 7]);
  return { rows: statuses.map((status, i) => ({ id: String(i), status, name: '<Andrea>', email: `test${i}@example.invalid` })) };
};
globalThis.__birthdaySend = async message => { messages.push(message); return true; };
globalThis.__birthdayContent = birthdayContent;
const source = (await readFile(new URL('../src/services/birthday.service.ts', import.meta.url), 'utf8'))
  .replace("import { query } from '../config/database.js';", 'const query = globalThis.__birthdayQuery;')
  .replace("import { send } from './notification.service.js';", 'const send = globalThis.__birthdaySend;')
  .replace("import { birthdayContent } from './email-template.service.js';", 'const birthdayContent = globalThis.__birthdayContent;');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
const { sendBirthdayGreetings } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
assert.equal(await sendBirthdayGreetings(new Date('2026-10-07T12:00:00Z')), 5);
for (const [i, message] of messages.entries()) {
  assert.ok(message.body.includes('&lt;Andrea&gt;'));
  assert.equal(message.body.includes('Te falta un paso'), statuses[i] !== 'APPROVED');
  assert.ok(!message.body.includes('autorizaste'));
  assert.equal(message.dedupeKey, `birthday:${i}:2026-10-07`);
  assert.equal(message.expiresAt.toISOString(), '2026-10-08T08:00:00.000Z');
}
console.log('PASS: cinco estados reciben felicitacion; recordatorio solo sin aprobacion, escape HTML, filtros y claves diarias. Transporte simulado, sin envios.');
