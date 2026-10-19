import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import pool from '../dist/config/database.js';
import { teamProgress,updateCompetitionEntry } from '../dist/controllers/team-progress.controller.js';
import { calcularPosiciones } from '../dist/services/competition.service.js';
const db=new PGlite();
const migration=await readFile(new URL('../src/db/migrations.sql',import.meta.url),'utf8');
await db.exec(migration); await db.exec(migration);
await db.exec(await readFile(new URL('../src/db/seed.sql',import.meta.url),'utf8'));
pool.query=(sql,params)=>db.query(sql,params);
pool.connect=async()=>({query:pool.query,release(){}});
const user={id:'tp_admin',role:'SUPER_ADMIN',leagueId:'league_cancun'};
const invoke=(fn,body={},actor=user)=>new Promise(resolve=>fn(
 {params:{id:'tp_a'},query:{seasonId:'season_2026'},body,user:actor},
 {json:json=>resolve({data:json.data})},error=>resolve({error})
));
await db.exec(`UPDATE seasons SET start_date='2020-01-01' WHERE id='season_2026';
 INSERT INTO users(id,league_id,email,password_hash,name,role_id) VALUES ('tp_admin','league_cancun','progress@test.local','unused','Admin','role_super_admin');
 INSERT INTO teams(id,season_id,category_id,name) VALUES ('tp_a','season_2026','cat_varonil_2026','Equipo A'),('tp_b','season_2026','cat_varonil_2026','Equipo B');`);
for(let n=1;n<=14;n++) await db.query(`INSERT INTO rounds(id,season_id,number,scheduled_date,status,round_type)
 VALUES($1,'season_2026',$2,$3,$4,$5)`,[`tp_r${n}`,n,n===9?'2099-01-01':`2020-01-${String(n).padStart(2,'0')}`,n===10?'DRAFT':n===11?'CANCELLED':'PUBLISHED',n===12?'SCRIMMAGE':'OFFICIAL']);
await db.exec("INSERT INTO round_byes(id,round_id,team_id,reason) VALUES('tp_bye','tp_r3','tp_a','MANUAL')");
for(const [n,status] of [[4,'FINISHED'],[5,'SCHEDULED'],[6,'POSTPONED'],[7,'WALKOVER'],[8,'CANCELLED'],[9,'SCHEDULED'],[10,'FINISHED'],[11,'FINISHED'],[12,'FINISHED'],[14,'LIVE']]) {
 await db.query(`INSERT INTO games(id,season_id,round_id,category_id,home_team_id,away_team_id,scheduled_time,status,home_score,away_score,game_type)
 VALUES($1,'season_2026',$2,'cat_varonil_2026','tp_a','tp_b','19:00',$3,12,6,$4)`,[`tp_g${n}`,`tp_r${n}`,status,n===12?'SCRIMMAGE':'OFFICIAL']);
}
let result=await invoke(teamProgress);
assert.ok(!result.error,result.error?.stack);
let a=result.data.find(t=>t.id==='tp_a');
assert.equal(a.competition_start_date,null,'No infiere incorporación de created_at');
assert.equal(a.timeline.length,11,'Excluye borrador, jornada cancelada y scrimmage');
assert.equal(a.counts.PLAYED,1); assert.equal(a.counts.WALKOVER,1);
assert.equal(a.counts.AWAITING_RESULT,1); assert.equal(a.counts.POSTPONED,1);
assert.equal(a.counts.LIVE,1); assert.equal(a.counts.SCHEDULED,1);
assert.equal(a.counts.CANCELLED,1); assert.equal(a.counts.BYE,1);
assert.equal(a.counts.UNASSIGNED_ELAPSED,3);
assert.equal(a.timeline.find(r=>r.number===6).opponent,'Equipo B');
const standings=await calcularPosiciones('season_2026');
const body={date:'2020-01-03',reason:'Confirmado con el acta de inscripción'};
result=await invoke(updateCompetitionEntry,body);
assert.ok(!result.error,result.error?.stack);
a=(await invoke(teamProgress)).data.find(t=>t.id==='tp_a');
assert.equal(a.counts.BEFORE_ENTRY,2); assert.equal(a.counts.UNASSIGNED_ELAPSED,1);
assert.equal(a.counts.BYE,1); assert.equal(a.competition_start_date,'2020-01-03');
assert.deepEqual(await calcularPosiciones('season_2026'),standings,'No altera posiciones');
assert.equal((await invoke(updateCompetitionEntry,{...body,date:'2020-01-04'})).error.statusCode,409);
for(const date of ['2019-01-01','2020-02-30','no-fecha',undefined]) assert.equal((await invoke(updateCompetitionEntry,{...body,date})).error.statusCode,400);
assert.equal((await invoke(updateCompetitionEntry,{...body,reason:''})).error.statusCode,400);
for(const fn of [teamProgress,updateCompetitionEntry]) {
 assert.equal((await invoke(fn,body,{...user,role:'TEAM_MANAGER'})).error.statusCode,403);
 assert.equal((await invoke(fn,body,{...user,leagueId:'otra_liga'})).error.statusCode,404);
}
const original=pool.query;
pool.connect=async()=>({release(){},query:async(sql,params)=>{if(sql.includes('INSERT INTO audit_logs'))throw new Error('audit unavailable');return original(sql,params);}});
assert.ok((await invoke(updateCompetitionEntry,{...body,date:null})).error);
assert.equal((await invoke(teamProgress)).data.find(t=>t.id==='tp_a').competition_start_date,'2020-01-03');
pool.connect=async()=>({query:original,release(){}});
assert.ok(!(await invoke(updateCompetitionEntry,{...body,date:null})).error);
a=(await invoke(teamProgress)).data.find(t=>t.id==='tp_a');
assert.equal(a.counts.BEFORE_ENTRY,0);assert.equal(a.counts.UNASSIGNED_ELAPSED,3);
assert.equal((await db.query("SELECT COUNT(*)::int AS n FROM audit_logs WHERE action='UPDATE_COMPETITION_ENTRY'")).rows[0].n,2);
assert.equal(a.counts.BYE_CLOSED,0,'Una jornada publicada no cuenta como cerrada');
await db.exec(`INSERT INTO round_byes(id,round_id,team_id,reason) VALUES
 ('tp_bye_open','tp_r1','tp_a','ODD_TEAMS'),
 ('tp_bye_draft','tp_r10','tp_a','MANUAL'),
 ('tp_bye_cancelled','tp_r11','tp_a','CAPACITY'),
 ('tp_bye_scrimmage','tp_r12','tp_a','MANUAL');
 UPDATE rounds SET status='FINISHED' WHERE id IN ('tp_r3','tp_r12');
 UPDATE round_byes SET reason='FIRST_LEG' WHERE id='tp_bye';`);
a=(await invoke(teamProgress)).data.find(t=>t.id==='tp_a');
assert.equal(a.counts.BYE_CLOSED,1,'Solo descansos registrados en jornadas oficiales cerradas');
assert.equal((await invoke(teamProgress)).data.find(t=>t.id==='tp_b').counts.BYE_CLOSED,0,'No inventa BYE para un equipo sin descanso registrado');
await db.exec("UPDATE rounds SET status='FINISHED' WHERE id='tp_r1'");
assert.equal((await invoke(teamProgress)).data.find(t=>t.id==='tp_a').counts.BYE_CLOSED,2,'Actualiza el total al cerrar otra jornada');
await db.exec("UPDATE rounds SET status='CANCELLED' WHERE id='tp_r1'");
assert.equal((await invoke(teamProgress)).data.find(t=>t.id==='tp_a').counts.BYE_CLOSED,1,'Excluye una jornada cancelada aunque antes estuviera cerrada');
await db.close();await pool.end();
console.log('OK: seguimiento por jornada, estados separados, incorporación explícita, permisos, exclusiones, sin efectos en posiciones y auditoría atómica.');
