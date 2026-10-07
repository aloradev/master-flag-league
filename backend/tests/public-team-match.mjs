import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { PGlite } from '@electric-sql/pglite';
import pool from '../dist/config/database.js';
import routes from '../dist/routes/index.js';
import { errorHandler } from '../dist/middleware/errorHandler.js';
import { generateAccessToken } from '../dist/utils/jwt.js';
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';

// All fixtures live in memory; no credentials or league database are used.
const db = new PGlite();
await db.exec(await readFile(new URL('../src/db/migrations.sql', import.meta.url), 'utf8'));
await db.exec(await readFile(new URL('../src/db/seed.sql', import.meta.url), 'utf8'));
pool.query = (sql, params) => db.query(sql, params);
process.env.JWT_SECRET = 'isolated-interest-test-secret-only';
await db.query(`INSERT INTO users(id,league_id,email,password_hash,name,role_id) VALUES
  ('demo_admin','league_cancun','admin@demo.invalid',$1,'Admin Demo','role_super_admin'),
  ('demo_manager','league_cancun','manager@demo.invalid',$1,'Manager Demo','role_team_manager')`, [await bcrypt.hash('Demo2026League', 10)]);
await db.exec(`
  INSERT INTO teams(id,season_id,category_id,name,short_name) VALUES
    ('demo_home','season_2026','cat_varonil_2026','Halcones Demo','HAL'),
    ('demo_away','season_2026','cat_varonil_2026','Aztecas Demo','AZT');
  INSERT INTO teams(id,season_id,category_id,name,team_type) VALUES
    ('demo_test','season_2026','cat_varonil_2026','Privado Scrimmage','SCRIMMAGE');
  INSERT INTO players(id,team_id,season_id,category_id,first_name,last_name_paternal,date_of_birth,status,jersey_number) VALUES
    ('demo_player','demo_home','season_2026','cat_varonil_2026','Andrea','Demo','2000-01-01','APPROVED',7),
    ('demo_pending','demo_home','season_2026','cat_varonil_2026','Oculto','Pendiente','2000-01-01','PENDING',8),
    ('demo_removed','demo_home','season_2026','cat_varonil_2026','Oculto','Baja','2000-01-01','APPROVED',9);
  UPDATE players SET removed_at=NOW() WHERE id='demo_removed';
  INSERT INTO rounds(id,season_id,number,scheduled_date,status,notes) VALUES
    ('demo_finished','season_2026',501,'2026-10-03','FINISHED','NOTA-PRIVADA'),
    ('demo_upcoming','season_2026',502,'2026-10-17','PUBLISHED','NOTA-PRIVADA'),
    ('demo_draft','season_2026',503,'2026-10-24','DRAFT','NOTA-PRIVADA'),
    ('demo_practice','season_2026',504,'2026-10-24','PUBLISHED','NOTA-PRIVADA');
  INSERT INTO games(id,season_id,round_id,category_id,home_team_id,away_team_id,scheduled_time,status,home_score,away_score,statistics_status,mvp_offensive_player_id,notes) VALUES
    ('demo_final','season_2026','demo_finished','cat_varonil_2026','demo_home','demo_away','19:00','FINISHED',18,6,'COMPLETE','demo_player','NOTA-PRIVADA'),
    ('demo_next','season_2026','demo_upcoming','cat_varonil_2026','demo_home','demo_away','20:00','SCHEDULED',0,0,'PENDING',NULL,'NOTA-PRIVADA'),
    ('demo_secret','season_2026','demo_draft','cat_varonil_2026','demo_home','demo_away','21:00','SCHEDULED',0,0,'PENDING',NULL,'NOTA-PRIVADA');
  INSERT INTO games(id,season_id,round_id,category_id,home_team_id,away_team_id,scheduled_time,status,game_type) VALUES
    ('demo_scrimmage','season_2026','demo_practice','cat_varonil_2026','demo_home','demo_away','22:00','SCHEDULED','SCRIMMAGE');
  INSERT INTO game_events(id,game_id,team_id,player_id,event_type,points,quantity,voided_at) VALUES
    ('demo_td','demo_final','demo_home','demo_player','TOUCHDOWN',6,3,NULL),
    ('demo_void','demo_final','demo_home','demo_player','TOUCHDOWN',6,5,NOW()),
    ('demo_private','demo_final','demo_home','demo_pending','TOUCHDOWN',6,1,NULL);
`);
const app = express();
app.use(express.json());
app.use('/api/v1', routes);
app.use(errorHandler);
const server = app.listen(process.argv.includes('--preview') ? Number(process.env.QA_PREVIEW_PORT || 5190) : 0, '127.0.0.1');
await new Promise(resolve => server.once('listening', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const get = async path => { const response = await fetch(base + '/api/v1' + path); return { status: response.status, ...await response.json() }; };
try {
  const team = await get('/public/teams/demo_home');
  assert.equal(team.status, 200);
  assert.deepEqual(team.data.roster.map(player => player.id), ['demo_player']);
  assert.deepEqual(team.data.games.map(game => game.id), ['demo_final', 'demo_next']);
  assert.equal(team.data.standing.wins, 1);
  assert.equal(team.data.standing.position, 1);
  assert.equal((await get('/public/teams/demo_test')).status, 404);
  assert.equal((await get('/public/teams/missing')).status, 404);
  assert.equal((await get('/public/games/demo_secret')).status, 404);
  const game = await get('/public/games/demo_final');
  assert.equal(game.status, 200);
  assert.equal(game.data.players.length, 1);
  assert.equal(game.data.players[0].touchdowns, 3);
  assert.equal(game.data.players[0].offensive_mvp, true);
  assert.equal(game.data.round_id, 'demo_finished');
  await db.exec("UPDATE games SET statistics_status='PENDING' WHERE id='demo_final'");
  assert.deepEqual((await get('/public/games/demo_final')).data.players, []);
  await db.exec("UPDATE games SET status='LIVE' WHERE id='demo_final'");
  assert.equal((await get('/public/games/demo_final')).data.players[0].touchdowns, 3);
  await db.exec("UPDATE games SET statistics_status='COMPLETE',status='FINISHED' WHERE id='demo_final'");
  for (const payload of [team, game]) {
    const raw = JSON.stringify(payload);
    for (const secret of ['NOTA-PRIVADA','Oculto','date_of_birth','recorded_by','email','phone','managers','eligibility_reason']) assert.ok(!raw.includes(secret), secret);
  }
  const profile = await get('/public/players/demo_player');
  assert.equal(profile.data.season_id, 'season_2026');
  assert.equal(profile.data.team_id, 'demo_home');
  const send = async (path, body, token, method = 'POST') => {
    const response = await fetch(base + '/api/v1' + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
    return { status: response.status, ...await response.json() };
  };
  const interest = { requestId: randomUUID(), name: 'Jugador Interesado', email: 'jugador@demo.invalid', phone: '+529981234567', category: 'Por definir', experience: 'NEW', availability: 'Sábados', consent: true };
  assert.equal((await send('/public/player-interest', { ...interest, consent: false })).status, 400);
  assert.equal((await send('/public/player-interest', interest)).status, 201);
  assert.equal((await send('/public/player-interest', interest)).status, 201);
  assert.equal((await db.query('SELECT COUNT(*)::int AS total FROM player_interests')).rows[0].total, 1);
  assert.equal((await get('/admin/player-interest')).status, 401);
  const token = role => generateAccessToken({ id: role === 'TEAM_MANAGER' ? 'demo_manager' : 'demo_admin', role, leagueId: 'league_cancun', name: 'Demo', email: 'demo@demo.invalid', sessionVersion: 0 });
  const adminToken = token('SUPER_ADMIN');
  const adminList = await fetch(base + '/api/v1/admin/player-interest', { headers: { Authorization: `Bearer ${adminToken}` } }).then(response => response.json());
  assert.equal(adminList.data[0].email, interest.email);
  const prospectId = adminList.data[0].id;
  assert.equal((await send(`/admin/player-interest/${prospectId}`, { status: 'CONTACTED' }, token('TEAM_MANAGER'), 'PUT')).status, 403);
  assert.equal((await send(`/admin/player-interest/${prospectId}`, { status: 'INVALID' }, adminToken, 'PUT')).status, 400);
  assert.equal((await send(`/admin/player-interest/${prospectId}`, { status: 'CONTACTED' }, adminToken, 'PUT')).status, 200);
  const otherLeagueToken = generateAccessToken({ id: 'demo_admin', role: 'SUPER_ADMIN', leagueId: 'another-league', name: 'Demo', email: 'demo@demo.invalid', sessionVersion: 0 });
  assert.equal((await send(`/admin/player-interest/${prospectId}`, { status: 'CLOSED' }, otherLeagueToken, 'PUT')).status, 404);
  for (let index = 0; index < 2; index++) assert.equal((await send('/public/player-interest', { ...interest, requestId: randomUUID() })).status, 201);
  assert.equal((await send('/public/player-interest', { ...interest, requestId: randomUUID() })).status, 429);
  await db.query("DELETE FROM player_interests WHERE email='jugador@demo.invalid'");
  console.log('PASS: solicitudes públicas, consentimiento, reintentos idempotentes, límite por correo, bandeja privada, roles y aislamiento entre ligas.');
  console.log('PASS: perfiles y partidos públicos sin sesión; plantilla aprobada; jornadas privadas y scrimmages excluidos; posiciones, MVP, cantidades, anulaciones y estadísticas pendientes.');
  if (process.argv.includes('--preview')) {
    const root = fileURLToPath(new URL('../../frontend/dist/', import.meta.url));
    app.use(express.static(root));
    app.get('/{*path}', (_request, response) => response.sendFile('index.html', { root }));
    console.log(`Vista previa con datos de prueba: ${base}/equipos/demo_home`);
    await new Promise(() => {});
  }
} finally {
  await new Promise(resolve => server.close(resolve));
  await pool.end();
  await db.close();
}
