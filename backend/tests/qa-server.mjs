// Entorno de revisión exclusivamente local: datos ficticios y PostgreSQL en memoria.
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
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
process.env.FRONTEND_URL = process.env.QA_FRONTEND_URL || 'http://127.0.0.1:5176';
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
if (process.env.QA_VISUAL_FIXTURES === '1') {
  await db.exec(`
    UPDATE seasons SET registration_deadline = CURRENT_DATE + 30 WHERE id = 'season_2026';
    INSERT INTO players(id,team_id,season_id,category_id,first_name,last_name_paternal,date_of_birth,jersey_number,status,is_eligible)
    VALUES ('qa-player','qa-home','season_2026','cat_mixto_2026','Alejandra','Hernández de la Torre','1998-05-10',12,'APPROVED',true),
      ('qa-pending','qa-away','season_2026','cat_mixto_2026','Carlos','González','1996-01-15',7,'PENDING',false);
    INSERT INTO referees(id,season_id,user_id,name) VALUES('qa-referee','season_2026','referee','Árbitro de prueba');
    INSERT INTO rounds(id,season_id,number,scheduled_date,status) VALUES
      ('qa-round','season_2026',1,CURRENT_DATE,'PUBLISHED'),
      ('qa-past','season_2026',2,CURRENT_DATE - 7,'FINISHED');
    INSERT INTO round_time_slots(id,round_id,start_time) VALUES('qa-slot','qa-round','19:00');
    INSERT INTO games(id,season_id,round_id,category_id,field_id,home_team_id,away_team_id,scheduled_time,status,home_score,away_score)
    VALUES ('qa-game','season_2026','qa-round','cat_mixto_2026','field_1_2026','qa-home','qa-away','19:00','SCHEDULED',0,0),
      ('qa-finished','season_2026','qa-past','cat_mixto_2026','field_1_2026','qa-home','qa-away','19:00','FINISHED',20,13);
    INSERT INTO game_referees(id,game_id,referee_id) VALUES('qa-assignment','qa-game','qa-referee');
    INSERT INTO fees(id,season_id,team_id,concept,description,amount_cents,due_date)
      VALUES('qa-fee','season_2026','qa-home','INSCRIPTION','Inscripción de prueba',100000,CURRENT_DATE - 7);
    INSERT INTO payments(id,season_id,team_id,fee_id,amount_cents,paid_on,method)
      VALUES('qa-payment','season_2026','qa-home','qa-fee',30000,CURRENT_DATE,'CASH');
    INSERT INTO expenses(id,season_id,category,description,amount_cents,spent_on)
      VALUES('qa-expense','season_2026','FIELDS','Renta de campo de prueba',25000,CURRENT_DATE);
  `);
  const { default: sharp } = await import('sharp');
  const sample = await sharp(Buffer.from('<svg width="640" height="400"><rect width="640" height="400" fill="#e2edf3"/><text x="40" y="180" font-size="30" fill="#12445b">DOCUMENTO DE PRUEBA</text><text x="40" y="235" font-size="20" fill="#12445b">Datos ficticios para revisión de la interfaz</text></svg>')).png().toBuffer();
  await mkdir(process.env.PRIVATE_UPLOAD_DIR, { recursive: true });
  await writeFile(join(process.env.PRIVATE_UPLOAD_DIR, 'qa-document.png'), sample);
  for (const type of ['PHOTO', 'ID_FRONT', 'ID_BACK']) {
    const id = `qa-doc-${type.toLowerCase()}`;
    await db.query(`INSERT INTO player_documents(id,player_id,document_type,file_url,storage_key,mime_type,file_size,status)
      VALUES($1,'qa-player',$2,$3,'qa-document.png','image/png',$4,'APPROVED')`, [id,type,`/api/v1/documents/${id}/file`,sample.length]);
  }
}
const { errorHandler } = await import('../dist/middleware/errorHandler.js');
const app = express();
app.use(cors({ origin: /^http:\/\/(127\.0\.0\.1|localhost):\d+$/ }));
app.use(express.json());
app.use('/media',express.static(process.env.PUBLIC_UPLOAD_DIR));
app.use('/api/v1', routes);
app.use(errorHandler);
const port = Number(process.env.QA_API_PORT || 5099);
app.listen(port,'127.0.0.1',()=>console.log(`QA_READY http://127.0.0.1:${port} (memory only, external calls blocked)`));
