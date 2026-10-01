import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import pool from '../dist/config/database.js';
import { adminPending } from '../dist/controllers/admin-pending.controller.js';
import { getValidationQueue } from '../dist/controllers/validation.controller.js';
const db=new PGlite();
await db.exec(await readFile(new URL('../src/db/migrations.sql',import.meta.url),'utf8'));
await db.exec(await readFile(new URL('../src/db/seed.sql',import.meta.url),'utf8'));
pool.query=(sql,params)=>db.query(sql,params);
const user={id:'todo_admin',role:'SUPER_ADMIN',leagueId:'league_cancun'};
const invoke=(actor=user,seasonId='season_2026')=>new Promise(resolve=>adminPending(
  {user:actor,query:{seasonId}}, {json:r=>resolve({data:r.data})}, error=>resolve({error})
));
await db.exec(`INSERT INTO teams(id,season_id,category_id,name) VALUES
  ('todo_a','season_2026','cat_varonil_2026','Equipo A'),('todo_b','season_2026','cat_varonil_2026','Equipo B');
  INSERT INTO users(id,league_id,email,password_hash,name,role_id) VALUES
  ('todo_ref','league_cancun','todo-ref@test.local','unused','Ref','role_referee');
  INSERT INTO referees(id,season_id,user_id,name) VALUES ('todo_ref','season_2026','todo_ref','Ref'),('todo_no_account','season_2026',null,'Sin cuenta');
  INSERT INTO players(id,team_id,season_id,category_id,first_name,last_name_paternal,date_of_birth,status,eligibility_reason) VALUES
  ('todo_p','todo_a','season_2026','cat_varonil_2026','Ana','Pendiente','2000-01-01','PENDING','Falta fotografía'),
  ('todo_c','todo_a','season_2026','cat_varonil_2026','Beto','Corrección','2000-01-01','CORRECTIONS_REQUIRED','Documento ilegible'),
  ('todo_removed','todo_a','season_2026','cat_varonil_2026','Baja','Registro','2000-01-01','PENDING',null);
  UPDATE players SET removed_at=NOW() WHERE id='todo_removed';`);
const cases=[
  ['old','2000-01-01','SCHEDULED','PUBLISHED','OFFICIAL','COMPLETE'],
  ['future','2099-01-01','SCHEDULED','PUBLISHED','OFFICIAL','COMPLETE'],
  ['stats','2000-01-01','FINISHED','FINISHED','OFFICIAL','PENDING'],
  ['done','2000-01-01','FINISHED','FINISHED','OFFICIAL','COMPLETE'],
  ['postponed','2000-01-01','POSTPONED','PUBLISHED','OFFICIAL','COMPLETE'],
  ['draft','2000-01-01','SCHEDULED','DRAFT','OFFICIAL','COMPLETE'],
  ['cancelled_round','2000-01-01','SCHEDULED','CANCELLED','OFFICIAL','COMPLETE'],
  ['cancelled_game','2000-01-01','CANCELLED','PUBLISHED','OFFICIAL','COMPLETE'],
  ['scrimmage','2000-01-01','SCHEDULED','PUBLISHED','SCRIMMAGE','COMPLETE'],
  ['assigned','2099-01-01','SCHEDULED','PUBLISHED','OFFICIAL','COMPLETE'],
  ['no_account','2099-01-01','SCHEDULED','PUBLISHED','OFFICIAL','COMPLETE'],
  ['walkover','2000-01-01','WALKOVER','FINISHED','OFFICIAL','COMPLETE'],
];
for(const [i,[id,date,status,roundStatus,type,statisticsStatus]] of cases.entries()) {
  await db.query('INSERT INTO rounds(id,season_id,number,scheduled_date,status,round_type) VALUES($1,$2,$3,$4,$5,$6)',[`todo_r_${id}`,'season_2026',i+1,date,roundStatus,type]);
  await db.query(`INSERT INTO games(id,season_id,round_id,category_id,home_team_id,away_team_id,scheduled_time,status,game_type,statistics_status)
    VALUES($1,'season_2026',$2,'cat_varonil_2026','todo_a','todo_b','19:00',$3,$4,$5)`,[`todo_${id}`,`todo_r_${id}`,status,type,statisticsStatus]);
}
await db.exec(`INSERT INTO game_referees(id,game_id,referee_id,role) VALUES
  ('todo_gr1','todo_assigned','todo_ref','PRINCIPAL'),('todo_gr2','todo_no_account','todo_no_account','PRINCIPAL');`);
let result=await invoke(); assert.ok(!result.error,result.error?.stack);
assert.deepEqual(Object.fromEntries(Object.entries(result.data.counts).filter(([key])=>key!=='TEAM')),{RESULT:1,STATISTICS:1,REFEREE:3,POSTPONED:1,REGISTRATION:2});
assert.ok(result.data.counts.TEAM > 0);
assert.ok(result.data.items.some(item=>item.type==='team' && item.kinds.includes('TEAM')));
assert.equal(result.data.items.filter(item=>item.type!=='team').length,7,'Cada partido aparece una sola vez aunque tenga varios pendientes');
assert.deepEqual(result.data.items.find(i=>i.id==='todo_old').kinds,['RESULT','REFEREE']);
assert.equal(result.data.items.find(i=>i.id==='todo_old').round_id,'todo_r_old');
assert.ok(!result.data.items.find(i=>i.id==='todo_future').kinds.includes('RESULT'),'La fecha futura no exige resultado');
assert.equal(result.data.items.find(i=>i.id==='todo_p').reason,'Falta fotografía');
assert.equal(result.data.items.find(i=>i.id==='todo_p').team_id,'todo_a');
for(const id of ['done','draft','cancelled_round','cancelled_game','scrimmage','assigned','removed','walkover']) assert.ok(!result.data.items.some(i=>i.id===`todo_${id}`),id);
assert.equal((await invoke({...user,role:'TEAM_MANAGER'})).error.statusCode,403);
assert.equal((await invoke({...user,role:'FINANCE_ADMIN'})).error.statusCode,403);
assert.equal((await invoke({...user,leagueId:'other'})).error.statusCode,404);
assert.equal((await invoke(user,'missing')).error.statusCode,404);
assert.equal((await invoke({...user,role:'SPORTS_ADMIN'})).data.items.filter(item=>item.type!=='team').length,7);
const queueFor = actor => new Promise(resolve=>getValidationQueue(
  {user:actor,query:{teamId:'todo_a'}}, {json:r=>resolve({data:r.data})},error=>resolve({error})
));
const queue = await queueFor(user);
assert.ok(!queue.error,queue.error?.stack);
assert.equal(queue.data.players.length,2,'El acceso de revisión carga los registros pendientes del equipo');
assert.equal((await queueFor({...user,leagueId:'other'})).data.players.length,0,'El enlace no permite leer registros de otra liga');
await db.exec("UPDATE users SET active=false WHERE id='todo_ref'");
assert.ok((await invoke()).data.items.some(i=>i.id==='todo_assigned'),'Una cuenta inactiva requiere resolver la asignación');
// Resolver en las tablas fuente elimina los avisos, sin guardar otra copia de pendientes.
await db.exec(`UPDATE games SET status='FINISHED',statistics_status='COMPLETE' WHERE game_type='OFFICIAL';
  UPDATE players SET status='APPROVED',is_eligible=true WHERE removed_at IS NULL;`);
result=await invoke();assert.equal(result.data.items.length,1);
assert.equal(result.data.items[0].id,'todo_b','El equipo sin plantilla sigue pendiente');
await db.exec(`INSERT INTO players(id,team_id,season_id,category_id,first_name,last_name_paternal,date_of_birth,status,is_eligible) VALUES ('todo_b_ready','todo_b','season_2026','cat_varonil_2026','Listo','Prueba','2000-01-01','APPROVED',true)`);
result=await invoke();assert.equal(result.data.items.length,0);
assert.ok(Object.values(result.data.counts).every(n=>n===0));
await db.close();await pool.end();
console.log('OK: permisos, temporada, exclusiones, deduplicación, fechas, árbitros con cuenta activa, registros y resolución automática de pendientes.');
