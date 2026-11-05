import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import pool from '../dist/config/database.js';
import { calcularPosiciones } from '../dist/services/competition.service.js';
const db = new PGlite();
pool.query = (sql, params) => db.query(sql, params);
try {
  await db.exec(await readFile(new URL('../src/db/migrations.sql', import.meta.url), 'utf8'));
  await db.exec(await readFile(new URL('../src/db/seed.sql', import.meta.url), 'utf8'));
  await db.exec(`INSERT INTO teams(id,season_id,category_id,name) VALUES
    ('test_home','season_2026','cat_varonil_2026','Local'),
    ('test_away','season_2026','cat_varonil_2026','Visitante');
    INSERT INTO rounds(id,season_id,number,scheduled_date,status) VALUES ('test_round','season_2026',900,'2020-01-01','PUBLISHED');
    INSERT INTO games(id,season_id,round_id,category_id,home_team_id,away_team_id,status,home_score,away_score,scheduled_time)
    VALUES ('test_game','season_2026','test_round','cat_varonil_2026','test_home','test_away','FINISHED',24,18,'19:00');`);
  const home = async () => (await calcularPosiciones('season_2026')).find(x => x.team_id === 'test_home');
  assert.equal((await home()).wins, 1);
  await db.exec("UPDATE teams SET excluded_from_standings=TRUE WHERE id='test_home'");
  const excluded = await calcularPosiciones('season_2026', 'cat_varonil_2026');
  assert.equal(excluded.at(-1).team_id, 'test_home');
  assert.equal(excluded.at(-1).position, 0);
  assert.equal(excluded.at(-1).wins, 1);
  assert.equal(excluded.at(-1).points_for, 24);
  const rival = excluded.find(x => x.team_id === 'test_away');
  assert.deepEqual([rival.wins,rival.losses,rival.points_for,rival.points_against,rival.point_diff], [1,0,6,0,6]);
  assert.deepEqual(rival.form, ['W']);
  assert.equal(rival.streak, 'G1');
  assert.deepEqual((await db.query("SELECT home_score,away_score FROM games WHERE id='test_game'")).rows[0], {home_score:24,away_score:18});
  for (const guest of ['test_home', 'test_away']) {
    for (const [hs, as] of [[24,18], [0,12], [7,7]]) {
      await db.query('UPDATE teams SET excluded_from_standings=(id=$1)', [guest]);
      await db.query("UPDATE games SET home_score=$1,away_score=$2 WHERE id='test_game'", [hs,as]);
      const table = await calcularPosiciones('season_2026', 'cat_varonil_2026');
      const regular = table.find(x => x.team_id === (guest === 'test_home' ? 'test_away' : 'test_home'));
      assert.deepEqual([regular.played,regular.wins,regular.draws,regular.losses,regular.points_for,regular.points_against], [1,1,0,0,6,0]);
      const outside = table.find(x => x.team_id === guest);
      assert.equal(outside.points_for, guest === 'test_home' ? hs : as);
      assert.equal(outside.position, 0);
    }
  }
  await db.exec("UPDATE teams SET excluded_from_standings=TRUE WHERE id IN ('test_home','test_away'); UPDATE games SET home_score=24,away_score=18 WHERE id='test_game'");
  assert.equal((await home()).points_for,24);
  await db.exec("UPDATE teams SET excluded_from_standings=FALSE WHERE id='test_away'");
  await db.exec("UPDATE teams SET excluded_from_standings=FALSE WHERE id='test_home'");
  assert.equal((await home()).position, 1);
  await db.exec("UPDATE games SET home_score=12,away_score=18 WHERE id='test_game'");
  assert.equal((await home()).losses, 1);
  await db.exec("UPDATE teams SET excluded_from_standings=TRUE WHERE id='test_away'");
  for (const status of ['SCHEDULED', 'CANCELLED', 'LIVE']) {
    await db.query("UPDATE games SET status=$1 WHERE id='test_game'", [status]);
    assert.equal((await home()).played, 0);
  }
  await db.exec("UPDATE games SET status='FINISHED',game_type='SCRIMMAGE' WHERE id='test_game'");
  assert.equal((await home()).played, 0);
  await db.exec("UPDATE games SET game_type='OFFICIAL' WHERE id='test_game'; UPDATE rounds SET status='CANCELLED' WHERE id='test_round'");
  assert.equal((await home()).played, 0);
  await db.exec("UPDATE rounds SET status='PUBLISHED' WHERE id='test_round'; DELETE FROM games WHERE id='test_game'");
  const empty = await home();
  assert.equal(empty.played, 0);
  assert.equal(empty.points_for, 0);
  assert.equal(empty.points_against, 0);
  console.log('PASS: consultas reales, resultados oficiales, correccion, pendientes, cancelados, scrimmage y eliminacion.');
} finally { await db.close(); await pool.end(); }
