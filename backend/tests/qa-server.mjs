// Entorno de revisión exclusivamente local: datos ficticios y PostgreSQL en memoria.
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import express from 'express';
import cors from 'cors';
const storage = await mkdtemp(join(tmpdir(), 'mfl-qa-'));
for (const key of ['DATABASE_URL','CLOUDINARY_URL','CLOUDINARY_CLOUD_NAME','CLOUDINARY_API_KEY','CLOUDINARY_API_SECRET','RESEND_API_KEY','OPERATIONS_WEBHOOK_URL']) process.env[key] = '';
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'isolated-qa-only-not-a-production-secret';
process.env.PRIVATE_UPLOAD_DIR = join(storage, 'private');
process.env.PUBLIC_UPLOAD_DIR = join(storage, 'public');
process.env.FRONTEND_URL = 'http://127.0.0.1:5176';
process.env.EMAIL_QUEUE_KEY = 'isolated-qa-encryption-key';
globalThis.fetch = async () => { throw new Error('External network disabled in QA'); };
const { default: pool } = await import('../dist/config/database.js');
const db = new PGlite();
pool.query = (sql, values) => db.query(sql, values);
pool.connect = async () => ({ query: pool.query, release() {} });
await db.exec(await readFile(new URL('../src/db/migrations.sql', import.meta.url), 'utf8'));
await db.exec(await readFile(new URL('../src/db/seed.sql', import.meta.url), 'utf8'));
const { hashPassword } = await import('../dist/utils/password.js');
const hash = await hashPassword('Cancun2026');
for (const [id, role] of [['admin','super_admin'],['sports','sports_admin'],['finance','finance_admin'],['manager','team_manager'],['referee','referee']]) {
  await db.query(`INSERT INTO users(id,league_id,email,password_hash,name,role_id)
    VALUES($1,'league_cancun',$2,$3,$4,$5)`, [id,`${id}@qa.example.invalid`,hash,`Prueba ${id}`,`role_${role}`]);
}
await db.query(`INSERT INTO users(id,league_id,email,password_hash,name,role_id)
 VALUES('legacy-test','league_cancun','ananias.lora@go1.mx',$1,'Administrador ficticio','role_super_admin')`,[hash]);
await db.exec(`INSERT INTO teams(id,season_id,category_id,name,short_name)
 VALUES('qa-home','season_2026','cat_mixto_2026','Halcones de Cancún — equipo de nombre largo','HAL'),
 ('qa-away','season_2026','cat_mixto_2026','Jaguares del Caribe','JAG');
 INSERT INTO team_users(id,team_id,user_id,role) VALUES('qa-m1','qa-home','manager','PRIMARY'),('qa-m2','qa-away','manager','PRIMARY');`);
const { default: routes } = await import('../dist/routes/index.js');
const { errorHandler } = await import('../dist/middleware/errorHandler.js');
const app = express();
app.use(cors({ origin: /^http:\/\/(127\.0\.0\.1|localhost):\d+$/ }));
app.use(express.json());
app.use('/media',express.static(process.env.PUBLIC_UPLOAD_DIR));
app.use('/api/v1', routes);
app.use(errorHandler);
app.listen(5099,'127.0.0.1',()=>console.log('QA_READY http://127.0.0.1:5099 (memory only, external calls blocked)'));
