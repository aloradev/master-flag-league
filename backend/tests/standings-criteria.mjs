import assert from 'node:assert/strict';
import pool from '../dist/config/database.js';
import { calcularPosiciones } from '../dist/services/competition.service.js';
const row = (id, wins, losses, pf, pa, category = 'cat') => ({ team_id: id, team_name: id, category_id: category, played: wins + losses, wins, losses, draws: 0, points_for: pf, points_against: pa, historial: [] });
let rows = [];
pool.query = async sql => ({ rows: sql.includes('WITH resultados') ? rows : [] });
try {
  for (const category of ['Varonil', 'Femenil', 'Mixto']) {
    rows = [row('unbeaten', 1, 0, 100, 0, category), row('more-wins', 3, 4, 10, 90, category)];
    assert.deepEqual((await calcularPosiciones('s')).map(x => x.team_id), ['more-wins', 'unbeaten']);
    rows = [row('attack', 2, 1, 100, 99, category), row('difference', 2, 4, 20, 0, category)];
    assert.equal((await calcularPosiciones('s'))[0].team_id, 'difference');
    rows = [row('less-pf', 2, 1, 20, 10, category), row('more-pf', 2, 1, 40, 30, category)];
    assert.equal((await calcularPosiciones('s'))[0].team_id, 'more-pf');
    rows = [row('z', 1, 1, 20, 20, category), row('a', 1, 5, 20, 20, category), row('winner', 2, 0, 30, 0, category)];
    const tied = await calcularPosiciones('s');
    assert.deepEqual(tied.map(x => [x.team_id, x.position, x.tiebreak_pending]), [['winner', 1, false], ['a', 2, true], ['z', 2, true]]);
    rows.reverse();
    assert.deepEqual(await calcularPosiciones('s'), tied);
  }
  rows = [row('empty', 0, 0, 0, 0), row('loser', 0, 2, 10, 30), row('draw', 0, 0, 6, 6)];
  rows[2].draws = rows[2].played = 1;
  assert.deepEqual((await calcularPosiciones('s')).map(x => x.team_id), ['draw', 'empty', 'loser']);
  rows = [row('z', 0, 0, 0, 0), row('a', 0, 0, 0, 0)];
  assert.ok((await calcularPosiciones('s')).every(x => x.position === 1 && x.tiebreak_pending));
  rows = [row('a', 2, 1, 100, 10), row('b', 2, 1, 40, 30)];
  rows[0].historial = [{ rival: 'b', pf: 0, pa: 6 }];
  rows[1].historial = [{ rival: 'a', pf: 6, pa: 0 }];
  assert.equal((await calcularPosiciones('s'))[0].team_id, 'a');
  rows = [row('furia', 2, 0, 27, 25, 'Mixto'), row('tocho', 2, 1, 61, 51, 'Mixto'), row('alphas', 2, 1, 37, 18, 'Mixto'), row('dep', 1, 1, 52, 19, 'Mixto'), row('bac', 1, 2, 39, 43, 'Mixto'), row('aztecas', 0, 3, 13, 73, 'Mixto'), row('varonil', 1, 0, 1, 0, 'Varonil')];
  const table = await calcularPosiciones('s');
  assert.deepEqual(table.filter(x => x.category_id === 'Mixto').map(x => x.team_id), ['alphas', 'tocho', 'furia', 'dep', 'bac', 'aztecas']);
  assert.equal(table.find(x => x.team_id === 'varonil').position, 1);
  rows[0].wins = 3;
  rows[0].played = 3;
  assert.equal((await calcularPosiciones('s')).find(x => x.team_id === 'furia').position, 1);
  rows = rows.filter(x => x.team_id !== 'furia');
  assert.equal((await calcularPosiciones('s'))[0].team_id, 'alphas');
  console.log('PASS: JG, DIF, PF, empate deportivo, orden alfabetico, JJ y porcentaje excluidos, cero juegos, directo excluido, categorias y recalculo.');
} finally { await pool.end(); }
