// Contratos de los controladores con pg simulado: no abre conexiones ni usa PGlite.
// Ejecutar después de npm run build.
import assert from 'node:assert/strict';
import pool from '../dist/config/database.js';
import { assignReferees, createReferee, updateGame } from '../dist/controllers/games.controller.js';

let calls = [];
let respond = () => ({ rows: [] });
pool.query = async (sql, params) => {
  calls.push({ sql, params, client: false });
  return respond(sql, params);
};
pool.connect = async () => ({
  query: async (sql, params) => { calls.push({ sql, params, client: true }); return respond(sql, params); },
  release: () => calls.push({ sql: 'RELEASE', client: true }),
});
const invoke = (handler, body) => new Promise((resolve) => {
  const res = { status() { return this; }, json(data) { resolve({ data }); } };
  handler({ params: { id: 'game' }, body, user: { id: 'admin' } }, res, (error) => resolve({ error }));
});
let passed = 0;
async function test(name, run) {
  calls = []; respond = () => ({ rows: [] });
  await run(); passed++; console.log(`✓ ${name}`);
}
const game = { id: 'game', season_id: 'season', round_id: 'round', scheduled_time: '19:00', status: 'SCHEDULED' };

await test('rechaza árbitro repetido antes de consultar', async () => {
  const r = await invoke(assignReferees, { assignments: [{ refereeId: 'a', role: 'PRINCIPAL' }, { refereeId: 'a', role: 'AUXILIAR' }] });
  assert.equal(r.error.statusCode, 400); assert.equal(calls.length, 0);
});
await test('rechaza dos principales', async () => {
  const r = await invoke(assignReferees, { assignments: [{ refereeId: 'a' }, { refereeId: 'b' }] });
  assert.equal(r.error.statusCode, 400);
});
await test('rechaza cuerpo que no es arreglo', async () => {
  assert.equal((await invoke(assignReferees, { assignments: {} })).error.statusCode, 400);
});
await test('no cambia árbitros de partidos terminados', async () => {
  respond = () => ({ rows: [{ ...game, status: 'FINISHED' }] });
  assert.equal((await invoke(assignReferees, { assignments: [] })).error.statusCode, 409);
});
await test('rechaza árbitros inactivos o de otra temporada', async () => {
  respond = (sql) => ({ rows: sql.includes('FROM games WHERE') ? [game] : [] });
  assert.equal((await invoke(assignReferees, { assignments: [{ refereeId: 'other' }] })).error.statusCode, 400);
  assert.ok(!calls.some((c) => c.sql.includes('DELETE')));
});
await test('retira asignaciones en una sola conexión', async () => {
  respond = (sql) => ({ rows: sql.includes('FROM games WHERE') ? [game] : [] });
  assert.ok((await invoke(assignReferees, { assignments: [] })).data);
  assert.deepEqual(calls.filter((c) => c.client).map((c) => c.sql), ['BEGIN', 'DELETE FROM game_referees WHERE game_id = $1', 'COMMIT', 'RELEASE']);
});
await test('rollback conserva asignaciones si falla inserción', async () => {
  respond = (sql) => {
    if (sql.includes('INSERT INTO game_referees')) throw new Error('fallo simulado');
    return { rows: sql.includes('FROM games WHERE') ? [game] : sql.includes('SELECT id FROM referees') ? [{ id: 'a' }] : [] };
  };
  assert.ok((await invoke(assignReferees, { assignments: [{ refereeId: 'a' }] })).error);
  assert.ok(calls.some((c) => c.client && c.sql === 'ROLLBACK'));
  assert.ok(!calls.some((c) => c.sql === 'COMMIT'));
});
await test('rechaza campo de otra temporada', async () => {
  respond = (sql) => ({ rows: sql.includes('SELECT * FROM games') || sql.includes('SELECT id FROM games WHERE id = $1 FOR UPDATE') ? [game] : [] });
  assert.equal((await invoke(updateGame, { fieldId: 'other' })).error.statusCode, 400);
});
await test('rechaza horario inválido', async () => {
  respond = () => ({ rows: [game] });
  assert.equal((await invoke(updateGame, { scheduledTime: '25:00' })).error.statusCode, 400);
});
await test('detecta conflicto de árbitro al cambiar horario', async () => {
  respond = () => ({ rows: [game] });
  assert.equal((await invoke(updateGame, { scheduledTime: '20:00' })).error.statusCode, 409);
});
await test('no reprograma un partido en vivo', async () => {
  respond = () => ({ rows: [{ ...game, status: 'LIVE' }] });
  assert.equal((await invoke(updateGame, { scheduledTime: '20:00' })).error.statusCode, 409);
});
await test('rechaza alta con cuenta no árbitro', async () => {
  respond = (sql) => ({ rows: sql.includes('FROM seasons') ? [{ id: 'season' }] : [] });
  assert.equal((await invoke(createReferee, { seasonId: 'season', name: 'Ana', userId: 'u' })).error.statusCode, 400);
});
await test('rechaza cuenta ya vinculada y libera transacción', async () => {
  respond = () => ({ rows: [{ id: 'existing' }] });
  assert.equal((await invoke(createReferee, { seasonId: 'season', name: 'Ana', userId: 'u' })).error.statusCode, 409);
  assert.ok(calls.some((c) => c.sql === 'ROLLBACK'));
  assert.equal(calls.at(-1).sql, 'RELEASE');
});
console.log(`${passed} pruebas aprobadas (sin base de datos).`);
await pool.end();
