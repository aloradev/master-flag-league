import assert from 'node:assert/strict';
import pool from '../dist/config/database.js';
import { updateFee } from '../dist/controllers/finance.controller.js';
let calls = [];
let cargo = { id: 'fee', team_id: 'team', concept: 'OTHER', cancelled_at: null, round_id: null };
let paid = 2500;
let duplicate = false;
pool.connect = async () => ({
  query: async (sql, params) => {
    calls.push({ sql, params });
    if (sql.startsWith('SELECT * FROM fees')) return { rows: cargo ? [cargo] : [] };
    if (sql.includes('AS paid')) return { rows: [{ paid }] };
    if (sql.startsWith('UPDATE fees') && duplicate) throw Object.assign(new Error('duplicate'), { code: '23505' });
    return { rows: [] };
  }, release() {},
});
pool.query = async () => ({ rows: [] });
const invoke = (body = {}, role = 'FINANCE_ADMIN') => new Promise(resolve => updateFee({
  params: { id: 'fee' }, body: { concept: 'OTHER', description: 'Corrección', amount: '30.51', dueDate: '2026-11-01', ...body }, user: { id: 'user', role },
}, { json: data => resolve({ data }) }, error => resolve({ error })));
let r = await invoke();
assert.ok(r.data);
assert.equal(calls.find(c => c.sql.startsWith('UPDATE fees')).params[3], 3051);
assert.ok(calls.some(c => c.sql === 'COMMIT'));
calls = [];
r = await invoke({ amount: '24.99' });
assert.equal(r.error.statusCode, 409);
assert.ok(calls.some(c => c.sql === 'ROLLBACK'));
assert.ok(!calls.some(c => c.sql.startsWith('UPDATE fees')));
for (const body of [{ amount: '0' }, { amount: '-1' }, { amount: 'abc' }, { concept: 'BAD' }, { dueDate: '2026-02-30' }, { description: 'a'.repeat(501) }]) {
  assert.equal((await invoke(body)).error.statusCode, 400);
}
assert.equal((await invoke({}, 'SPORTS_ADMIN')).error.statusCode, 403);
cargo.cancelled_at = '2026-10-21';
assert.equal((await invoke()).error.statusCode, 409);
cargo.cancelled_at = null; cargo.round_id = 'round'; cargo.concept = 'ROUND';
assert.equal((await invoke()).error.statusCode, 400);
cargo.round_id = null; duplicate = true;
assert.equal((await invoke()).error.statusCode, 409);
duplicate = false; cargo = null;
assert.equal((await invoke()).error.statusCode, 404);
console.log('OK: edición, centavos, abonos, rollback, validaciones, permisos, cancelados, jornadas y duplicados.');
await pool.end();
