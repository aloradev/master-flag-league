import { tmpdir } from 'node:os';
import { join } from 'node:path';
// Base PostgreSQL efímera: nunca usa .env, DATABASE_URL ni los datos de la liga.
import assert from 'node:assert/strict';
import { readFile, mkdtemp } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import express from 'express';
import bcrypt from 'bcryptjs';
const storage = await mkdtemp(join(tmpdir(), 'mfl-onboarding-test-'));
const db = await PGlite.create();
await db.exec(await readFile(new URL('../src/db/migrations.sql', import.meta.url), 'utf8'));
await db.exec(await readFile(new URL('../src/db/seed.sql', import.meta.url), 'utf8'));
await db.query("UPDATE seasons SET registration_deadline='2099-12-31' WHERE id='season_2026'");
await db.query("INSERT INTO users(id,league_id,email,password_hash,name,role_id) VALUES ('qa_admin','league_cancun','ananias.lora@go1.mx',$1,'QA','role_super_admin')", [await bcrypt.hash('Cancun2026',10)]);
const socket = new PGLiteSocketServer({ db, port: 55439, host: '127.0.0.1' });
await socket.start();
Object.assign(process.env, { DATABASE_URL:'', DB_HOST:'127.0.0.1', DB_PORT:'55439', DB_NAME:'postgres', DB_USER:'postgres', DB_PASSWORD:'postgres', JWT_SECRET:'isolated-tests-secret-only-2026', NODE_ENV:'test', RESEND_API_KEY:'', EMAIL_WORKER_ENABLED:'false', CLOUDINARY_URL:'', CLOUDINARY_NAME:'', CLOUDINARY_API_KEY:'', CLOUDINARY_API_SECRET:'', PRIVATE_UPLOAD_DIR:join(storage,'private'), PUBLIC_UPLOAD_DIR:join(storage,'public') });
const { default: routes } = await import('../dist/routes/index.js');
const { errorHandler } = await import('../dist/middleware/errorHandler.js');
const { default: pool } = await import('../dist/config/database.js');
pool.options.max = 1; // PGlite atiende una conexión a la vez.
const app = express(); app.use(express.json()); app.use('/media', express.static(join(storage,'public'), { maxAge: '30d', immutable:true })); app.use('/api/v1',routes); app.use(errorHandler);
const server = app.listen(0, '127.0.0.1');
await new Promise(r => server.once('listening', r));
const base = `http://127.0.0.1:${server.address().port}/api/v1`;
// Vista manual aislada: sirve la compilación local con esta misma API efímera.
if (process.argv.includes('--preview')) {
  const frontend = new URL('../../frontend/dist/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
  app.use(express.static(decodeURIComponent(frontend)));
  app.get('/{*path}', (_req,res) => res.sendFile('index.html', { root: decodeURIComponent(frontend) }));
  console.log(`QA AISLADO: ${base.replace('/api/v1','')} (sin datos de producción)`);
  await new Promise(() => {});
}
const call = async (method,path,body,token) => {
  const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:body?JSON.stringify(body):undefined});
  return {status:r.status,...await r.json()};
};
const credentials = {name:'Encargado',email:'new@example.test',password:'Password123',leagueId:'league_cancun'};
try {
  assert.equal((await call('GET','/public/registration-options')).data.length,3);
  assert.equal((await call('POST','/auth/register',{...credentials,role:'SUPER_ADMIN'})).status,201);
  assert.equal((await call('POST','/auth/register',{...credentials,email:' NEW@example.test '})).status,409);
  const login = await call('POST','/auth/login',credentials);
  assert.equal(login.data.user.role,'TEAM_MANAGER'); const token=login.data.accessToken;
  const enrollment = {name:'Nuevo Equipo',seasonId:'season_2026',categoryId:'cat_varonil_2026'};
  const team=await call('POST','/teams',enrollment,token); assert.equal(team.status,201,JSON.stringify(team));
  assert.equal((await call('POST','/teams',enrollment,token)).data.id,team.data.id);
  assert.equal((await call('GET','/teams',null,token)).data.length,1);
  const playerBody = {teamId:team.data.id,firstName:'Jugador',lastNamePaternal:'Prueba',dateOfBirth:'1990-01-01',jerseyNumber:12,categoryId:'cat_femenil_2026'};
  assert.equal((await call('POST','/players',playerBody,token)).status,201);
  const roster = (await call('GET',`/teams/${team.data.id}`,null,token)).data.roster;
  assert.equal(roster.length,1);
  assert.equal((await call('GET',`/players/${roster[0].id}`,null,token)).data.category_id,enrollment.categoryId);
  assert.equal((await call('POST','/players',playerBody,token)).status,409);
  await db.query('UPDATE players SET removed_at=NOW() WHERE id=$1',[roster[0].id]);
  assert.equal((await call('PUT',`/teams/${team.data.id}`,{name:'Nuevo Equipo'},token)).status,200);
  assert.equal((await call('PUT',`/teams/${team.data.id}`,{status:'SUSPENDED'},token)).status,403);
  const other={...credentials,email:'other@example.test'};
  await call('POST','/auth/register',other);
  const otherToken=(await call('POST','/auth/login',other)).data.accessToken;
  assert.equal((await call('POST','/players',playerBody,otherToken)).status,403);
  assert.equal((await call('POST','/teams',{...enrollment,name:' nuevo   equipo '},otherToken)).status,409);
  assert.equal((await call('PUT',`/teams/${team.data.id}`,{name:'Stolen'},otherToken)).status,403);
  assert.equal((await call('GET',`/teams/${team.data.id}`,null,otherToken)).status,403);
  assert.equal((await call('GET',`/teams/${team.data.id}/registration-status`,null,otherToken)).status,403);
  assert.equal((await call('GET',`/teams/${team.data.id}/registration-status`,null,token)).data.total,0);
  await db.query(`INSERT INTO players(id,team_id,season_id,category_id,first_name,last_name_paternal,date_of_birth)
    VALUES ('progress_test',$1,'season_2026','cat_varonil_2026','Prueba','Avance','1990-01-01')`,[team.data.id]);
  let progress = (await call('GET',`/teams/${team.data.id}/registration-status`,null,token)).data;
  assert.equal(progress.total,1); assert.equal(progress.documented,0); assert.equal(progress.players[0].missing.length,3);
  await db.query(`INSERT INTO player_documents(id,player_id,document_type,file_url,is_current)
    VALUES ('progress_photo','progress_test','PHOTO','test-only',true)`);
  progress = (await call('GET',`/teams/${team.data.id}/registration-status`,null,token)).data;
  assert.equal(progress.players[0].missing.length,2); assert.equal(progress.eligible,0);
  await db.query(`UPDATE players SET removed_at=NOW() WHERE id='progress_test'`);
  assert.equal((await call('GET',`/teams/${team.data.id}/registration-status`,null,token)).data.total,0);
  assert.equal((await call('POST','/admin/rounds',{},token)).status,403);
  assert.equal((await call('POST','/teams',{...enrollment,categoryId:'bad'},token)).status,400);
  await db.query("UPDATE seasons SET registration_deadline='2000-01-01' WHERE id='season_2026'");
  assert.equal((await call('POST','/teams',{...enrollment,name:'Cerrado'},token)).status,409);
  assert.equal((await db.query("SELECT count(*)::int n FROM teams WHERE name='Nuevo Equipo'")).rows[0].n,1);
  console.log('PASS: registro, rol fijo, inscripción idempotente, duplicados, permisos y cierre de inscripción.');
  await db.query("UPDATE seasons SET registration_deadline='2099-12-31' WHERE id='season_2026'");
  for (const test of ['integration','competition','edicion','publico']) {
    await new Promise((resolve,reject)=>{
      const child=spawn(process.execPath,[`tests/${test}.mjs`],{env:{...process.env,QA_API_URL:base},stdio:'inherit'});
      child.on('error',reject); child.on('exit', code=>code===0?resolve():reject(new Error(`${test}: ${code}`)));
    });
  }
  const adminToken=(await call('POST','/auth/login',{email:'ananias.lora@go1.mx',password:'Cancun2026'})).data.accessToken;
  const defaultPublicSeason=(await call('GET','/public/standings')).data.season.id;
  assert.equal((await call('GET','/admin/leagues',null,token)).status,403);
  const newLeague=await call('POST','/admin/leagues',{name:'Liga Norte QA',city:'Cancún',state:'Quintana Roo',seasonName:'Apertura QA',year:2026,startDate:'2026-10-01',registrationDeadline:'2026-10-20',categories:['Libre','Femenil',' libre ']},adminToken);
  assert.equal(newLeague.status,201,JSON.stringify(newLeague));
  assert.equal(newLeague.data.categories.length,2);
  assert.equal((await call('POST','/admin/leagues',{name:' Liga Norte QA ',city:'Cancún',seasonName:'Otra',year:2026,startDate:'2026-10-01',categories:['Libre']},adminToken)).status,409);
  assert.equal((await call('GET','/public/registration-options')).data.some(o=>o.league_id===newLeague.data.id),true);
  assert.equal((await call('GET','/public/standings?liga=liga-norte-qa')).data.season.id,newLeague.data.seasonId);
  assert.equal((await call('GET','/public/standings')).data.season.id,defaultPublicSeason);
  const switched=await call('POST',`/admin/leagues/${newLeague.data.id}/select`,null,adminToken);
  assert.equal(switched.status,200); assert.equal(switched.data.league.id,newLeague.data.id);
  assert.equal((await call('GET','/seasons/active',null,switched.data.accessToken)).data.id,newLeague.data.seasonId);
  console.log('PASS: alta multi-liga, categorías iniciales, permisos y cambio de contexto.');
} finally {
  await new Promise(r=>server.close(r)); await pool.end(); await socket.stop(); await db.close();
}

