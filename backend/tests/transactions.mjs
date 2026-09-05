import assert from 'node:assert/strict';
import pool from '../dist/config/database.js';
import { withLockedGame } from '../dist/services/game-transaction.service.js';
import { cancelRound } from '../dist/controllers/rounds.controller.js';
import { refrescarMarcador } from '../dist/services/competition.service.js';

// Contratos de conexión/rollback; no se conecta a Neon ni crea PGlite.
let calls = [];
let fail = '';
pool.query = async (sql) => {
  assert.ok(sql.includes('audit_logs') || sql.includes('SELECT * FROM rounds'), 'Consulta fuera de transacción: ' + sql);
  return { rows: [] };
};
pool.connect = async () => ({
  query: async (sql) => {
    calls.push(sql);
    if (fail && sql.includes(fail)) throw new Error('fallo simulado');
    return { rows: sql.includes('SELECT') ? [{ id: 'g', status: 'PUBLISHED' }] : [] };
  },
  release: () => calls.push('RELEASE'),
});
await withLockedGame('g', async (q) => { await q('UPDATE games SET notes = notes'); });
assert.equal(calls[0], 'BEGIN');
assert.ok(calls[1].includes('FOR UPDATE OF p'));
assert.ok(calls[2].includes('FOR UPDATE OF r'));
assert.ok(calls[3].includes('FOR UPDATE'));
assert.deepEqual(calls.slice(-2), ['COMMIT', 'RELEASE']);
calls = []; fail = 'UPDATE games';
await assert.rejects(withLockedGame('g', (q) => q('UPDATE games SET notes = notes')));
assert.deepEqual(calls.slice(-2), ['ROLLBACK', 'RELEASE']);
assert.ok(!calls.includes('COMMIT'));

const invoke = () => new Promise((resolve) => cancelRound(
  { params: { id: 'r' }, body: {}, user: { id: 'u' } },
  { json: (data) => { assert.ok(calls.includes('COMMIT')); resolve({ data }); } },
  (error) => resolve({ error }),
));
calls = []; fail = 'UPDATE rounds';
assert.ok((await invoke()).error);
assert.deepEqual(calls.slice(-2), ['ROLLBACK', 'RELEASE']);
assert.ok(!calls.includes('COMMIT'));
calls = []; fail = '';
assert.ok((await invoke()).data);
assert.ok(calls[1].includes('FOR UPDATE'));

const scoreCalls = [];
const score = await refrescarMarcador('g', async (sql) => {
  scoreCalls.push(sql);
  return { rows: sql.includes('FROM games') ? [{home_team_id:'h', away_team_id:'a', status:'LIVE'}]
    : sql.includes('SUM(points)') ? [{team_id:'h', puntos:6}] : [] };
});
assert.deepEqual(score, { home: 6, away: 0 });
assert.equal(scoreCalls.length, 3);
console.log('OK: bloqueos ordenados, commit, rollback, cancelación y marcador con conexión compartida.');
await pool.end();
