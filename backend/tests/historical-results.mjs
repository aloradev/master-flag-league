import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import pool from '../dist/config/database.js';
import { saveHistoricalResult } from '../dist/controllers/historical-results.controller.js';
import { refrescarMarcador, calcularPosiciones } from '../dist/services/competition.service.js';
import { getPublicGame } from '../dist/controllers/public.controller.js';

// Base efímera: ejecuta migraciones y consultas reales, sin tocar datos de la liga.
const db = new PGlite();
const migration = await readFile(new URL('../src/db/migrations.sql', import.meta.url), 'utf8');
await db.exec(migration);
await db.exec(migration);
await db.exec(await readFile(new URL('../src/db/seed.sql', import.meta.url), 'utf8'));
pool.query = (sql, params) => db.query(sql, params);
pool.connect = async () => ({ query: pool.query, release() {} });
await db.exec(`
 INSERT INTO users(id,league_id,email,password_hash,name,role_id)
 VALUES ('hist_admin','league_cancun','history@test.local','unused','Admin','role_super_admin');
 INSERT INTO teams(id,season_id,category_id,name) VALUES
 ('hist_home','season_2026','cat_varonil_2026','Hist Local'),
 ('hist_away','season_2026','cat_varonil_2026','Hist Visitante');
 INSERT INTO rounds(id,season_id,number,scheduled_date,status)
 VALUES ('hist_round','season_2026',900,'2020-01-01','PUBLISHED');
 INSERT INTO games(id,season_id,round_id,category_id,home_team_id,away_team_id,scheduled_time)
 VALUES ('hist_game','season_2026','hist_round','cat_varonil_2026','hist_home','hist_away','19:00');
`);
const user = { id: 'hist_admin', role: 'SUPER_ADMIN', leagueId: 'league_cancun' };
const invoke = (handler, body={}, actor=user) => new Promise(resolve => handler(
 { params: { id: 'hist_game' }, body, user: actor },
 { json: data => resolve({ data }) }, error => resolve({ error }),
));
const body = { homeScore: 24, awayScore: 18, reason: 'Acta jornada 1' };
const reject = async (patch, status, actor) => {
 const r = await invoke(saveHistoricalResult, { ...body, ...patch }, actor);
 assert.equal(r.error?.statusCode, status, r.error?.message ?? JSON.stringify(r));
};
await reject({}, 403, { ...user, role: 'REFEREE' });
await reject({}, 404, { ...user, leagueId: 'otra_liga' });
for (const homeScore of [-1, 1.5, 1000, '24', null]) await reject({ homeScore }, 400);
await reject({ reason: ' ' }, 400);
await db.exec("UPDATE rounds SET status='DRAFT'");
await reject({}, 409);
await db.exec("UPDATE rounds SET status='PUBLISHED', scheduled_date=CURRENT_DATE+1");
await reject({}, 400);
await db.exec("UPDATE rounds SET scheduled_date='2020-01-01'; UPDATE games SET status='LIVE'");
await reject({}, 409);
await db.exec("UPDATE games SET status='SCHEDULED'");
let saved = await invoke(saveHistoricalResult, body);
assert.ok(!saved.error, saved.error?.stack);
assert.equal(saved.data.data.statistics_status, 'PENDING');
assert.equal(saved.data.data.status, 'FINISHED');
assert.equal((await db.query("SELECT status FROM rounds WHERE id='hist_round'")).rows[0].status, 'FINISHED');
assert.deepEqual(await refrescarMarcador('hist_game'), { home: 24, away: 18 });
let table = await calcularPosiciones('season_2026', 'cat_varonil_2026');
assert.equal(table.find(t => t.team_id === 'hist_home').wins, 1);
assert.equal(table.find(t => t.team_id === 'hist_home').points_for, 24);
const publicResult = await invoke(getPublicGame);
assert.equal(publicResult.data.data.statistics_status, 'PENDING');
assert.equal(publicResult.data.data.home_score, 24);
// La corrección conserva un solo partido y actualiza posiciones, con auditoría.
saved = await invoke(saveHistoricalResult, { ...body, homeScore: 12, reason: 'Corrección del acta' });
assert.ok(!saved.error, saved.error?.stack);
table = await calcularPosiciones('season_2026', 'cat_varonil_2026');
assert.equal(table.find(t => t.team_id === 'hist_home').played, 1);
assert.equal(table.find(t => t.team_id === 'hist_home').losses, 1);
assert.deepEqual(await refrescarMarcador('hist_game'), { home: 12, away: 18 });
const logs = await db.query("SELECT action, new_value FROM audit_logs WHERE entity_id='hist_game' ORDER BY created_at");
assert.equal(logs.rows.length, 2);
assert.equal(logs.rows[1].action, 'CORRECT_HISTORICAL_RESULT');
assert.equal(logs.rows[1].new_value.reason, 'Corrección del acta');
// Si falla auditoría, también se revierte el resultado.
const originalQuery = pool.query;
pool.connect = async () => ({ release() {}, query: async (sql, params) => {
 if (sql.includes('INSERT INTO audit_logs')) throw new Error('audit unavailable');
 return originalQuery(sql, params);
} });
assert.ok((await invoke(saveHistoricalResult, body)).error);
assert.deepEqual(await refrescarMarcador('hist_game'), { home: 12, away: 18 });
pool.connect = async () => ({ query: originalQuery, release() {} });
// No convierte resultados calculados ni encuentros con jugadas en históricos.
await db.exec("UPDATE games SET score_source='EVENTS'");
await reject({}, 409);
await db.exec("UPDATE games SET status='SCHEDULED'; INSERT INTO game_events(id,game_id,team_id,event_type,points) VALUES ('hist_event','hist_game','hist_home','TOUCHDOWN',6)");
await reject({}, 409);
assert.deepEqual(await refrescarMarcador('hist_game'), { home: 6, away: 0 });
// Segunda entrega: captura después del cierre y publicación de estadísticas.
await db.exec(`DELETE FROM game_events WHERE game_id='hist_game';
 UPDATE games SET score_source='MANUAL',status='FINISHED',statistics_status='PENDING',home_score=6,away_score=0;
 INSERT INTO players(id,team_id,season_id,category_id,first_name,last_name_paternal,date_of_birth,status,is_eligible)
 VALUES ('hist_player','hist_home','season_2026','cat_varonil_2026','Ana','Prueba','2000-01-01','APPROVED',true);`);
const { updateHistoricalStatistics } = await import('../dist/controllers/historical-statistics.controller.js');
const { publicPlayerStats } = await import('../dist/controllers/statistics.controller.js');
const { voidEvent } = await import('../dist/controllers/games.controller.js');
const mutateStats = (body, actor=user) => invoke(updateHistoricalStatistics, { reason:'Transcripción del acta', ...body }, actor);
const expectError = async (body, code, actor) => assert.equal((await mutateStats(body,actor)).error?.statusCode, code);
const touchdown = { action:'ADD',eventType:'TOUCHDOWN',teamId:'hist_home',playerId:'hist_player' };
await expectError(touchdown,403,{ ...user,role:'REFEREE' });
await expectError(touchdown,404,{ ...user,leagueId:'otra' });
await expectError({ ...touchdown,reason:'' },400);
await expectError({ ...touchdown,teamId:'hist_away' },400);
await expectError({ ...touchdown,playerId:null },400);
await expectError({ ...touchdown,quarter:99 },400);
await expectError({ ...touchdown,yards:10 },400);
await expectError({ action:'COMPLETE' },409);
await db.exec("UPDATE players SET is_eligible=false WHERE id='hist_player'");
await expectError(touchdown,409);
await db.exec("UPDATE players SET is_eligible=true WHERE id='hist_player'");
assert.ok(!(await mutateStats(touchdown)).error);
const getStats = () => new Promise(resolve => publicPlayerStats(
 { query:{seasonId:'season_2026',playerId:'hist_player'} }, {json:data=>resolve(data.data[0])}, error=>{throw error;}
));
assert.equal((await getStats()).touchdowns,0,'No publica estadísticas parciales');
assert.equal((await getStats()).games_played,0);
assert.deepEqual(await refrescarMarcador('hist_game'),{home:6,away:0});
await expectError({ action:'ADD',eventType:'RECEPTION',teamId:'hist_home',playerId:'hist_player',yards:101 },400);
assert.ok(!(await mutateStats({ action:'ADD',eventType:'RECEPTION',teamId:'hist_home',playerId:'hist_player',yards:20 })).error);
const touchdownId = (await db.query("SELECT id FROM game_events WHERE game_id='hist_game' AND event_type='TOUCHDOWN'")).rows[0].id;
const legacyVoid = await new Promise(resolve=>voidEvent(
 {params:{id:'hist_game',eventId:touchdownId},user}, {json:data=>resolve({data})}, error=>resolve({error})
));
assert.equal(legacyVoid.error?.statusCode,409,'No puede evadir el flujo con la ruta antigua');
await expectError({ action:'COMPLETE',mvpOffensivePlayerId:'otro' },400);
assert.ok(!(await mutateStats({ action:'COMPLETE',mvpOffensivePlayerId:'hist_player' })).error);
assert.equal((await getStats()).touchdowns,1);
assert.equal((await getStats()).yards,20);
assert.equal((await getStats()).offensive_mvps,1);
assert.equal((await invoke(getPublicGame)).data.data.statistics_status,'COMPLETE');
await expectError(touchdown,409);
await expectError({action:'VOID',eventId:touchdownId},409);
assert.ok(!(await mutateStats({action:'REOPEN'})).error);
assert.equal((await getStats()).touchdowns,0);
assert.ok(!(await mutateStats({action:'VOID',eventId:touchdownId})).error);
assert.deepEqual(await refrescarMarcador('hist_game'),{home:6,away:0});
await expectError({action:'COMPLETE'},409);
await expectError({action:'VOID',eventId:touchdownId},409);
assert.ok(!(await mutateStats(touchdown)).error);
assert.ok(!(await mutateStats({action:'COMPLETE'})).error);
assert.equal((await getStats()).touchdowns,1,'La jugada anulada no se duplica al corregir');
assert.equal((await calcularPosiciones('season_2026','cat_varonil_2026')).find(t=>t.team_id==='hist_home').played,1);
// Un fallo en auditoría revierte la reapertura y conserva la publicación.
pool.connect = async () => ({ release() {}, query: async (sql,params) => {
 if(sql.includes('INSERT INTO audit_logs')) throw new Error('audit unavailable');
 return originalQuery(sql,params);
} });
assert.ok((await mutateStats({action:'REOPEN'})).error);
assert.equal((await getStats()).touchdowns,1);
pool.connect = async () => ({query:originalQuery,release(){}});
const actions = (await db.query("SELECT action,new_value FROM audit_logs WHERE action LIKE 'HISTORICAL_STATISTICS_%'")).rows;
for(const action of ['ADD','VOID','COMPLETE','REOPEN']) assert.ok(actions.some(r=>r.action===`HISTORICAL_STATISTICS_${action}`));
assert.ok(actions.every(r=>r.new_value.reason==='Transcripción del acta'));
console.log('OK: estadísticas posteriores al cierre, permisos, jugadores, conciliación, MVP, publicación, reapertura, anulación y rollback.');

await db.close();
await pool.end();
console.log('OK: migración repetible, permisos, validación, resultado sin roster, posiciones, vista pública, corrección auditada, rollback y marcador preservado.');
