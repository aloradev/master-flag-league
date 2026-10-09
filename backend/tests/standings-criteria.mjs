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
  assert.equal((await calcularPosiciones('s'))[0].team_id, 'attack');
  rows = [row('a', 2, 1, 100, 10, [{ rival: 'b', pf: 0, pa: 6 }]), row('b', 2, 1, 40, 30, [{ rival: 'a', pf: 6, pa: 0 }])];
  assert.equal((await calcularPosiciones('s'))[0].team_id, 'b');
  rows.push(row('c', 2, 1, 50, 20));
  assert.deepEqual((await calcularPosiciones('s')).map(x => x.team_id), ['a', 'c', 'b']);
  rows = [row('few-losses', 1, 1, 50, 0), row('better-percentage', 3, 2, 0, 50)];
  assert.equal((await calcularPosiciones('s'))[0].team_id, 'better-percentage');
  rows = [row('a', 1, 1, 20, 10), { ...row('b', 0, 0, 30, 10), draws: 2, played: 2 }];
  assert.equal((await calcularPosiciones('s'))[0].team_id, 'b');
  const game = (rival, pf, pa) => ({ rival, pf, pa });
  rows = [
    row('a', 2, 2, 10, 30, [game('b', 10, 0), game('c', 10, 0)]),
    row('b', 2, 2, 50, 0, [game('a', 0, 10), game('c', 10, 0)]),
    row('c', 2, 2, 90, 0, [game('a', 0, 10), game('b', 0, 10)]),
  ];
  assert.deepEqual((await calcularPosiciones('s')).map(x => x.team_id), ['a', 'b', 'c']);
  // Direct percentage ties: use direct differential before overall differential.
  rows = [
    row('a', 1, 1, 0, 50, [game('b', 20, 0), game('b', 0, 6)]),
    row('b', 1, 1, 50, 0, [game('a', 0, 20), game('a', 6, 0)]),
  ];
  assert.equal((await calcularPosiciones('s'))[0].team_id, 'a');
  // After splitting by direct percentage, recalculate direct DIF in the remaining subgroup.
  rows = [
    row('a', 4, 4, 1, 100, [game('b', 20, 0), game('b', 20, 0), game('c', 20, 0), game('c', 20, 0)]),
    row('b', 4, 4, 1, 100, [game('a', 0, 20), game('a', 0, 20), game('c', 10, 0), game('c', 0, 1)]),
    row('c', 4, 4, 100, 0, [game('a', 0, 20), game('a', 0, 20), game('b', 0, 10), game('b', 1, 0)]),
  ];
  assert.deepEqual((await calcularPosiciones('s')).map(x => x.team_id), ['a', 'b', 'c']);
  rows = [row('dep', 1, 0, 40, 0), row('furia', 1, 0, 13, 12),
    row('alphas', 1, 1, 31, 18, [game('tocho', 12, 18)]),
    row('bac', 1, 1, 39, 37, [game('tocho', 27, 24)]),
    row('tocho', 1, 1, 42, 39, [game('alphas', 18, 12), game('bac', 24, 27)]),
    row('aztecas', 0, 2, 0, 59)];
  assert.deepEqual((await calcularPosiciones('s')).map(x => x.team_id), ['dep', 'furia', 'alphas', 'tocho', 'bac', 'aztecas']);
  rows = [row('b', 1, 1, 20, 20), row('a', 1, 1, 20, 20), row('z', 1, 0, 10, 0, [], 'other')];
  const tied = await calcularPosiciones('s');
  assert.ok(tied.filter(x => x.category_id === 'cat').every(x => x.tiebreak_pending));
  assert.deepEqual((await calcularPosiciones('s')).map(x => x.team_id), tied.map(x => x.team_id));
  assert.equal(tied.find(x => x.team_id === 'z').position, 1);
  rows = [row('z', 0, 0, 0, 0), row('a', 0, 0, 0, 0)];
  assert.ok((await calcularPosiciones('s')).every(x => !x.tiebreak_pending));
  console.log('PASS: porcentaje IFAF, empates, directo de dos y tres, DIF, PF, jornadas 1/2, moneda pendiente sin azar automatico y categorias.');
} finally { await pool.end(); }
