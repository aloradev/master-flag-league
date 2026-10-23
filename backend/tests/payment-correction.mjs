import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import pool from '../dist/config/database.js';
import * as finance from '../dist/controllers/finance.controller.js';
const db = new PGlite();
await db.exec(await readFile(new URL('../src/db/migrations.sql', import.meta.url), 'utf8'));
await db.exec(await readFile(new URL('../src/db/seed.sql', import.meta.url), 'utf8'));
pool.query = (sql, values) => db.query(sql, values);
pool.connect = async () => ({query: pool.query, release() {}});
await db.exec("INSERT INTO users(id,league_id,email,password_hash,name,role_id) VALUES('finance-test','league_cancun','finance-test@qa.invalid','dummy','Prueba','role_finance_admin'); INSERT INTO teams(id,season_id,category_id,name) VALUES('qa-home','season_2026','cat_mixto_2026','Equipo ficticio');");
const call = (method, path, body) => new Promise((resolve, reject) => {
  const params = {};
  let handler;
  if (path === '/finance/fees') handler = finance.createFee;
  else if (path === '/finance/payments') handler = finance.createPayment;
  else if (path.endsWith('/void')) { handler = finance.voidPayment; params.id = path.split('/')[3]; }
  else { handler = finance.getTeamStatement; params.teamId = 'qa-home'; }
  const res = { status() { return this; }, json(result) { resolve(result.data); } };
  handler({ body, params, query: {}, user: { id: 'finance-test', role: 'FINANCE_ADMIN', leagueId: 'league_cancun' } }, res, reject);
});
for (const concept of ['INSCRIPTION', 'ROUND']) {
  const fee = await call('POST','/finance/fees',{teamId:'qa-home',concept,description:`Corrección ${concept}`,amount:'1000',dueDate:'2026-12-01'});
  const payment = await call('POST','/finance/payments',{feeId:fee.id,amount:'1000',method:'CASH'});
  const voided = await call('POST',`/finance/payments/${payment.id}/void`,{reason:'Se capturaron 1000 pero se recibieron 300'});
  assert.equal(voided.fee.paid_cents,0); assert.equal(voided.fee.balance_cents,100000); assert.equal(voided.fee.status,'PENDING');
  await call('POST','/finance/payments',{feeId:fee.id,amount:'300',method:'CASH'});
  const statement = await call('GET','/finance/teams/qa-home/statement');
  const updated = statement.fees.find(f=>f.id===fee.id);
  assert.equal(updated.amount_cents,100000); assert.equal(updated.paid_cents,30000); assert.equal(updated.balance_cents,70000); assert.equal(updated.status,'PARTIAL');
  assert.ok(statement.payments.find(p=>p.id===payment.id).voided_at);
  console.log(`OK ${concept}: 1000 anulados, abono correcto 300, saldo 700, estado parcial e historial conservado.`);
}

await db.close(); await pool.end();
