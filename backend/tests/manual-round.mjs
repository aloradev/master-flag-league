import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import pool from '../dist/config/database.js';
import { guardarPropuesta, construirPropuesta } from '../dist/services/competition.service.js';
import { manualOptions } from '../dist/controllers/rounds.controller.js';

// Base aislada en memoria: no conecta ni modifica Neon.
const db = new PGlite();
pool.query = (sql, values) => db.query(sql, values);
pool.connect = async () => ({ query: pool.query, release() {} });
await db.exec(await readFile(new URL('../src/db/migrations.sql', import.meta.url), 'utf8'));
await db.exec(`INSERT INTO leagues(id,name,slug) VALUES('l','Test','test');
INSERT INTO roles(id,name) VALUES('admin','SUPER_ADMIN');
INSERT INTO users(id,league_id,email,password_hash,name,role_id) VALUES('u','l','test@example.invalid','hash','Test','admin');
INSERT INTO seasons(id,league_id,name,year,start_date,require_approval_to_play) VALUES('s','l','Test',2040,'2040-01-01',false);
INSERT INTO categories(id,season_id,name,slug) VALUES('c','s','Mixto','mixto');
INSERT INTO fields(id,season_id,name) VALUES('f','s','Campo');`);
for (const id of ['a','b','c','d']) {
  await db.query("INSERT INTO teams(id,season_id,category_id,name,status) VALUES($1,'s','c',$1,'ACTIVE')", [id]);
}
await db.query("UPDATE seasons SET require_approval_to_play=true WHERE id='s'");
const automatic = await construirPropuesta({seasonId:'s', scheduledDate:'2040-01-08', slots:['19:00','20:00']});
assert.equal(automatic.games.length, 2, 'Programar equipos sin plantilla incluso con aprobación obligatoria');
const options = await new Promise((resolve, reject) => manualOptions({query:{seasonId:'s'},user:{leagueId:'l'}}, {json:resolve}, reject));
assert.equal(options.data[0].teams.length, 4, 'Endpoint manual incluye todos los oficiales activos sin jugadores');
await db.query(`INSERT INTO settings(id,league_id,season_id,key,value) VALUES('times','l','s','game_times','{"slots":["19:00","20:00"],"field_slots":{"f":["20:00"]}}')`);
const limited = await construirPropuesta({seasonId:'s',scheduledDate:'2040-01-08'});
assert.equal(limited.capacity, 1);
assert.equal(limited.games.length, 1);
assert.equal(limited.games[0].time, '20:00');
const game = { categoryId:'c',homeTeamId:'a',awayTeamId:'b',fieldId:'f',time:'19:00' };
const proposal = { seasonId:'s',scheduledDate:'2040-01-08',roundNumber:99,games:[game],byes:[{teamId:'c',categoryId:'c',reason:'MANUAL'}] };
const round = await guardarPropuesta(structuredClone(proposal),'u');
assert.deepEqual((await db.query('SELECT status,number FROM rounds WHERE id=$1',[round])).rows[0], {status:'DRAFT',number:1});
assert.equal((await db.query('SELECT reason FROM round_byes WHERE round_id=$1',[round])).rows[0].reason,'MANUAL');
const bad = [
  {...proposal,games:[{...game,awayTeamId:'a'}]},
  {...proposal,games:[{...game,categoryId:'other'}]},
  {...proposal,games:[{...game,fieldId:'other'}]},
  {...proposal,games:[{...game,time:'25:00'}]},
  {...proposal,scheduledDate:'2039-12-31'},
  {...proposal,byes:[{teamId:'a',categoryId:'c',reason:'MANUAL'}]},
  {...proposal,byes:[],games:[game,{...game,homeTeamId:'c',awayTeamId:'d'}]},
];
for(const p of bad) await assert.rejects(() => guardarPropuesta(structuredClone(p),'u'));
await db.query("UPDATE teams SET team_type='SCRIMMAGE' WHERE id='a'");
await assert.rejects(() => guardarPropuesta(structuredClone(proposal),'u'));
assert.equal((await db.query('SELECT count(*)::int n FROM rounds')).rows[0].n,1);
await db.query("UPDATE teams SET team_type='OFFICIAL' WHERE id='a'");
await db.query(`INSERT INTO settings(id,league_id,season_id,key,value) VALUES('limit','l','s','competition','{"rounds_planned":1}')`);
await assert.rejects(() => guardarPropuesta(structuredClone(proposal),'u'), /jornadas configuradas/);
await db.query(`UPDATE settings SET value='{"rounds_planned":6}' WHERE id='limit'`);
await guardarPropuesta(structuredClone(proposal),'u');
assert.equal((await db.query('SELECT count(*)::int n FROM rounds')).rows[0].n,2);
await db.close();
console.log('OK: jornada manual en borrador, descansos, numeración y rechazo de equipos, campos, horarios y fechas inválidos; rollback sin residuos.');
