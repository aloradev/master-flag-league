import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import pool from '../dist/config/database.js';
import {construirPropuesta,guardarPropuesta,cargarHistorial,validarIncorporacionesJornada} from '../dist/services/competition.service.js';
import {pairKey} from '../dist/lib/fixture.js';
const db=new PGlite();
await db.exec(await readFile(new URL('../src/db/migrations.sql',import.meta.url),'utf8'));
await db.exec(await readFile(new URL('../src/db/seed.sql',import.meta.url),'utf8'));
pool.query=(sql,params)=>db.query(sql,params);
pool.connect=async()=>({query:pool.query,release(){}});
await db.exec(`INSERT INTO users(id,league_id,email,password_hash,name,role_id) VALUES('gen_admin','league_cancun','gen@test.local','unused','Admin','role_super_admin');
 INSERT INTO teams(id,season_id,category_id,name,competition_start_date) VALUES
 ('gen_a','season_2026','cat_varonil_2026','A',null),('gen_b','season_2026','cat_varonil_2026','B',null),
 ('gen_c','season_2026','cat_varonil_2026','C','2026-09-26'),('gen_d','season_2026','cat_varonil_2026','D','2026-09-26');
 INSERT INTO rounds(id,season_id,number,scheduled_date,status) VALUES
 ('gen_finished','season_2026',1,'2026-09-12','FINISHED'),('gen_draft','season_2026',2,'2026-09-19','DRAFT'),
 ('gen_cancelled','season_2026',3,'2026-09-26','CANCELLED');
 INSERT INTO games(id,season_id,round_id,category_id,home_team_id,away_team_id,field_id,scheduled_time,status) VALUES
 ('gen_g1','season_2026','gen_finished','cat_varonil_2026','gen_a','gen_b','field_1_2026','19:00','FINISHED'),
 ('gen_g2','season_2026','gen_draft','cat_varonil_2026','gen_a','gen_b','field_1_2026','19:00','SCHEDULED'),
 ('gen_g3','season_2026','gen_cancelled','cat_varonil_2026','gen_a','gen_b','field_1_2026','19:00','CANCELLED');`);
const snapshot=await db.query("SELECT * FROM games ORDER BY id");
const history=await cargarHistorial('season_2026');
assert.equal(history.vecesEnfrentados[pairKey('gen_a','gen_b')],2,'Respeta terminado y borrador, excluye cancelado');
const before=await construirPropuesta({seasonId:'season_2026',scheduledDate:'2026-09-19',restTeamIds:['gen_c']});
assert.equal(before.games.length,0);assert.equal(before.byes.length,0,'No cuenta descanso antes de incorporación ni para equipo ocupado');
assert.ok(before.warnings.some(w=>w.includes('Aún no se incorporan')));
const next=await construirPropuesta({seasonId:'season_2026'});
assert.equal(next.scheduledDate,'2026-09-26');
assert.equal(new Set(next.games.flatMap(g=>[g.homeTeamId,g.awayTeamId])).size,4);
assert.ok(next.games.every(g=>pairKey(g.homeTeamId,g.awayTeamId)!==pairKey('gen_a','gen_b')),'Prefiere rivales nuevos al integrar equipos');
assert.deepEqual((await db.query('SELECT * FROM games ORDER BY id')).rows,snapshot.rows,'Proponer no altera lo guardado');
await assert.rejects(guardarPropuesta({...next,scheduledDate:'2026-09-19'},'gen_admin'));
const id=await guardarPropuesta(next,'gen_admin');
assert.ok(id);
const after=await construirPropuesta({seasonId:'season_2026',scheduledDate:'2026-09-26'});
assert.equal(after.games.length,0,'No vuelve a asignar equipos comprometidos en esa fecha');
await assert.rejects(guardarPropuesta(next,'gen_admin'),'Rechaza propuesta obsoleta');
await assert.rejects(validarIncorporacionesJornada(id,'2026-09-19'));
await validarIncorporacionesJornada(id,'2026-09-26');
// Nuevos equipos sin fecha pueden usar esa fecha, pero solo espacios libres.
await db.exec(`INSERT INTO teams(id,season_id,category_id,name) VALUES
 ('gen_e','season_2026','cat_varonil_2026','E'),('gen_f','season_2026','cat_varonil_2026','F');`);
const extra=await construirPropuesta({seasonId:'season_2026',scheduledDate:'2026-09-26',slots:['19:00','20:00','21:00']});
assert.equal(extra.games.length,1);
assert.deepEqual(new Set(extra.games.flatMap(g=>[g.homeTeamId,g.awayTeamId])),new Set(['gen_e','gen_f']));
const used=new Set(next.games.map(g=>`${g.fieldId}:${g.time}`));
assert.ok(extra.games.every(g=>!used.has(`${g.fieldId}:${g.time}`)));
const tampered=structuredClone(extra);
tampered.games[0].fieldId=next.games[0].fieldId;tampered.games[0].time=next.games[0].time;
await assert.rejects(guardarPropuesta(tampered,'gen_admin'));
await guardarPropuesta(extra,'gen_admin');
assert.deepEqual((await db.query("SELECT * FROM games WHERE id LIKE 'gen_g%' ORDER BY id")).rows,snapshot.rows);
await db.close();await pool.end();
console.log('OK: incorporación por fecha, descansos, borradores, cancelaciones, rivales nuevos, reservas, propuestas obsoletas y partidos existentes intactos.');
