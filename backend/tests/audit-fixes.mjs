import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import pool from '../dist/config/database.js';
import { generateTokens, generateAccessToken, verifyToken } from '../dist/utils/jwt.js';
import { refresh } from '../dist/controllers/auth.controller.js';
import { requireAuth, restrictScrimmageToken } from '../dist/middleware/auth.js';
import { create } from '../dist/controllers/scrimmages.controller.js';
import { startGame } from '../dist/controllers/games.controller.js';

// PostgreSQL aislado en memoria. Nunca conecta a Neon ni escribe datos reales.
const db = new PGlite();
pool.query = (sql, values) => db.query(sql, values);
pool.connect = async () => ({ query: pool.query, release() {} });
const sql = await readFile(new URL('../src/db/migrations.sql', import.meta.url), 'utf8');
await db.exec(sql);
await db.exec(sql);
await db.exec(`INSERT INTO leagues(id,name,slug) VALUES('l','Pruebas','pruebas');
INSERT INTO roles(id,name) VALUES('admin','SUPER_ADMIN'),('ref','REFEREE');
INSERT INTO users(id,league_id,email,password_hash,name,role_id) VALUES('u','l','test@example.invalid','hash','Prueba','admin');
INSERT INTO seasons(id,league_id,name,year,start_date) VALUES('s','l','Prueba',2040,'2040-01-01');
INSERT INTO categories(id,season_id,name,slug) VALUES('c','s','Mixto','mixto');`);
const input = { id: 'u', email: 'test@example.invalid', name: 'Prueba', role: 'SUPER_ADMIN', leagueId: 'l', sessionVersion: 0 };
const invoke = (handler, req) => new Promise((resolve, reject) => {
  const res = { code: 200, status(code) { this.code=code; return this; }, json(data) { resolve({ code: this.code, data }); } };
  Promise.resolve(handler(req, res, error => error ? resolve({ code: error.statusCode ?? 500, error }) : resolve({ code: 200, req }))).catch(reject);
});
const tokens = generateTokens(input);
const temporary = generateAccessToken({ ...input, role: 'REFEREE', scope: 'SCRIMMAGE_REFEREE', scrimmageGameId: 'game' });
for (const token of [tokens.accessToken, temporary]) {
  assert.equal((await invoke(refresh,{body:{refreshToken:token}})).code,401);
}
assert.equal((await invoke(refresh,{body:{refreshToken:tokens.refreshToken}})).code,200);
const auth = token => invoke(requireAuth,{headers:{authorization:`Bearer ${token}`}});
assert.equal((await auth(tokens.refreshToken)).code,401);
assert.equal((await auth(tokens.accessToken)).code,200);
await db.exec("UPDATE users SET password_hash='changed' WHERE id='u'");
assert.equal((await auth(tokens.accessToken)).code,401);
assert.equal((await auth(temporary)).code,401);
assert.equal((await invoke(refresh,{body:{refreshToken:tokens.refreshToken}})).code,401);
let version = 1;
for (const change of ["role_id='ref'", "active=false", "active=true"]) {
  await db.exec(`UPDATE users SET ${change} WHERE id='u'`);
  assert.equal((await db.query("SELECT session_version FROM users WHERE id='u'")).rows[0].session_version, ++version);
}
await db.exec("UPDATE users SET role_id='admin' WHERE id='u'");
version++;
const req = { user: { ...input, sessionVersion: version }, headers: {}, body: { seasonId:'s',categoryId:'c',homeTeamName:'Local',awayTeamName:'Visita',date:'2040-01-01',time:'19:00' } };
const first = await invoke(create,req);
assert.equal(first.code,201,first.error?.stack);
const { roundId, gameId } = first.data.data;
await db.query("UPDATE rounds SET status='FINISHED' WHERE id=$1",[roundId]);
const second = await invoke(create,{...req,body:{...req.body,time:'20:00'}});
assert.equal(second.code,201,second.error?.stack);
assert.equal(second.data.data.roundId,roundId);
assert.equal((await invoke(startGame,{user:{...input,role:'REFEREE'},params:{id:gameId},body:{}})).code,403);
await db.query("INSERT INTO rounds(id,season_id,number,scheduled_date) VALUES('official','s',1,'2040-01-08')");
assert.equal((await db.query("SELECT count(*)::int AS n FROM rounds WHERE season_id='s' AND number=1")).rows[0].n,2);
const scoped = { ...input, role:'REFEREE', sessionVersion:version, scrimmageGameId:gameId };
assert.equal((await invoke(restrictScrimmageToken,{user:scoped,path:`/games/${gameId}/start`})).code,200);
assert.equal((await invoke(restrictScrimmageToken,{user:scoped,path:'/games/official/start'})).code,403);
assert.equal((await invoke(restrictScrimmageToken,{user:scoped,path:'/admin/users'})).code,403);
assert.equal(verifyToken(first.data.data.accessToken).sessionVersion,version);
await db.close();
await pool.end();
console.log('✓ Migración idempotente, tipos de token, revocación, alcance y jornadas independientes.');
