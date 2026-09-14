import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import pool from '../dist/config/database.js';
import { getValidationStats } from '../dist/controllers/validation.controller.js';
import { updateSeason } from '../dist/controllers/seasons.controller.js';
import { registrationOpen } from '../dist/utils/registration.js';
const db = new PGlite();
await db.exec(await readFile(new URL('../src/db/migrations.sql',import.meta.url),'utf8'));
await db.exec(await readFile(new URL('../src/db/seed.sql',import.meta.url),'utf8'));
pool.query = (sql,params)=>db.query(sql,params);
const user={id:'reg_admin',leagueId:'league_cancun',role:'SUPER_ADMIN'};
const invoke=(fn,body={},actor=user)=>new Promise(resolve=>fn(
 {params:{id:'season_2026'},query:{seasonId:'season_2026'},body,user:actor},
 {json:data=>resolve({data:data.data})},error=>resolve({error})
));
await db.exec(`
 INSERT INTO users(id,league_id,email,password_hash,name,role_id,active) VALUES
 ('reg_admin','league_cancun','reg@test.local','unused','Admin','role_super_admin',true),
 ('reg_inactive','league_cancun','inactive@test.local','unused','Inactive','role_team_manager',false);
 INSERT INTO teams(id,season_id,category_id,name,team_type) VALUES
 ('reg_empty','season_2026','cat_varonil_2026','Sin plantilla','OFFICIAL'),
 ('reg_team','season_2026','cat_varonil_2026','Con pendientes','OFFICIAL'),
 ('reg_test','season_2026','cat_varonil_2026','Prueba','SCRIMMAGE');
 INSERT INTO team_users(id,team_id,user_id) VALUES ('reg_tu1','reg_empty','reg_inactive'),('reg_tu2','reg_team','reg_admin');
 INSERT INTO players(id,team_id,season_id,category_id,first_name,last_name_paternal,date_of_birth,status,is_eligible,eligibility_reason,removed_at) VALUES
 ('reg_p1','reg_team','season_2026','cat_varonil_2026','Ana','Lista','2000-01-01','APPROVED',true,null,null),
 ('reg_p2','reg_team','season_2026','cat_varonil_2026','Beto','Pendiente','2000-01-01','PENDING',false,'Documentación incompleta: falta fotografía',null),
 ('reg_p3','reg_team','season_2026','cat_varonil_2026','Celia','Corrección','2000-01-01','CORRECTIONS_REQUIRED',false,'Requiere corrección de documentación',null),
 ('reg_removed','reg_team','season_2026','cat_varonil_2026','Baja','Prueba','2000-01-01','PENDING',false,null,NOW()),
 ('reg_fake','reg_test','season_2026','cat_varonil_2026','Prueba','Prueba','2000-01-01','PENDING',false,null,null);
`);
let response=await invoke(getValidationStats);
assert.ok(!response.error,response.error?.stack);
assert.equal(response.data.total,3);
assert.equal(response.data.eligible,1);
assert.equal(response.data.corrections,1);
assert.equal(response.data.by_team.length,2);
const empty=response.data.by_team.find(t=>t.id==='reg_empty');
assert.equal(empty.total,0); assert.equal(empty.not_eligible,0); assert.deepEqual(empty.pending_players,[]);
assert.equal(empty.managers_count,0,'Cuenta desactivada no resuelve falta de encargado');
const team=response.data.by_team.find(t=>t.id==='reg_team');
assert.equal(team.managers_count,1); assert.equal(team.not_eligible,2);
assert.equal(team.pending_players.length,2);
assert.ok(team.pending_players.some(p=>p.reason.includes('fotografía')));
assert.ok(!team.pending_players.some(p=>p.id==='reg_removed'));
response=await invoke(getValidationStats,{}, {...user,leagueId:'otra_liga'});
assert.equal(response.data.total,0); assert.deepEqual(response.data.by_team,[]);
const deadline=async()=> (await db.query("SELECT registration_deadline FROM seasons WHERE id='season_2026'")).rows[0].registration_deadline;
const before=await deadline();
assert.ok(!(await invoke(updateSeason,{name:'Temporada en curso'})).error);
assert.equal(String(await deadline()),String(before),'Omitir fecha la conserva');
assert.ok(!(await invoke(updateSeason,{registrationDeadline:null})).error);
assert.equal(await deadline(),null);
assert.equal(registrationOpen(await deadline()),true);
assert.ok(!(await invoke(updateSeason,{registrationDeadline:'2020-01-01'})).error);
assert.equal(registrationOpen(await deadline()),false);
assert.equal((await invoke(updateSeason,{registrationDeadline:'2026-02-30'})).error.statusCode,400);
assert.equal((await invoke(updateSeason,{registrationDeadline:null},{...user,leagueId:'otra'})).error.statusCode,404);
assert.equal(registrationOpen('2026-09-14',new Date('2026-09-15T04:59:59Z')),true);
assert.equal(registrationOpen('2026-09-14',new Date('2026-09-15T05:00:00Z')),false);
assert.equal((await db.query("SELECT COUNT(*)::int AS n FROM audit_logs WHERE action='UPDATE_SEASON'")).rows[0].n,3);
await db.close(); await pool.end();
console.log('OK: equipos vacíos, encargados inactivos, motivos de pendientes, bajas, scrimmages, alcance por liga, reapertura auditada y cierre inclusivo de Cancún.');
