import assert from 'node:assert/strict';
import pool from '../dist/config/database.js';
import { calcularPosiciones } from '../dist/services/competition.service.js';
const row = (id, wins, losses, pf, pa, historial = [], category = 'cat') => ({ team_id: id, team_name: id, category_id: category, played: wins + losses, wins, losses, draws: 0, points_for: pf, points_against: pa, historial });
let rows = [];
pool.query = async sql => ({ rows: sql.includes('WITH resultados') ? rows : [] });
try {
  rows = [row('empty', 0, 0, 0, 0), row('more-wins', 3, 1, 99, 10), row('unbeaten', 1, 0, 1, 90)];
  assert.deepEqual((await calcularPosiciones('s')).map(x => x.team_id), ['unbeaten', 'more-wins', 'empty']);
  rows = [row('less', 1, 1, 100, 1), row('more', 2, 1, 20, 30)];
  assert.equal((await calcularPosiciones('s'))[0].team_id, 'more');
  rows = [row('less', 2, 1, 20, 30), row('more', 2, 1, 40, 30)];
  assert.equal((await calcularPosiciones('s'))[0].team_id, 'more');
  rows = [row('attack', 2, 1, 100, 30), row('defense', 2, 1, 40, 20)];
  assert.equal((await calcularPosiciones('s'))[0].team_id, 'defense');
  rows = [row('a', 2, 1, 100, 10, [{ rival: 'b', pf: 0, pa: 6 }]), row('b', 2, 1, 40, 30, [{ rival: 'a', pf: 6, pa: 0 }])];
  assert.equal((await calcularPosiciones('s'))[0].team_id, 'b');
  rows.push(row('c', 2, 1, 50, 20));
  assert.deepEqual((await calcularPosiciones('s')).map(x => x.team_id), ['a', 'c', 'b']);
  rows = [row('b', 1, 1, 20, 20), row('a', 1, 1, 20, 20), row('z', 1, 0, 10, 0, [], 'other')];
  const tied = await calcularPosiciones('s');
  assert.ok(tied.filter(x => x.category_id === 'cat').every(x => x.tiebreak_pending));
  assert.equal(tied.find(x => x.team_id === 'z').position, 1);
  rows = [row('z', 0, 0, 0, 0), row('a', 0, 0, 0, 0)];
  assert.ok((await calcularPosiciones('s')).every(x => !x.tiebreak_pending));
  console.log('PASS: sin jugar al final, derrotas, directo de dos, empate triple sin directo, defensa, sorteo pendiente y posiciones por categoria.');
} finally { await pool.end(); }
