// Respaldo de datos consistente y de solo lectura. Requiere backend compilado.
// No sustituye pg_dump para restaurar objetos/esquemas PostgreSQL externos a MFL.
import { mkdir, writeFile, copyFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import pool from '../dist/config/database.js';
const destination = resolve('../.qa-artifacts/backups', `mfl-data-${new Date().toISOString().replace(/[:.]/g,'-')}`);
const client = await pool.connect();
try {
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const tables = (await client.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows;
  const snapshots = [];
  const counts = {};
  for (const { tablename } of tables) {
    const identifier = '"' + tablename.replaceAll('"','""') + '"';
    // PostgreSQL serializa directamente: no perder precisión de números o timestamps en JS.
    const rows = (await client.query(`SELECT row_to_json(t)::text AS record FROM public.${identifier} t`)).rows;
    counts[tablename] = rows.length;
    snapshots.push(JSON.stringify(tablename)+':['+rows.map(r=>r.record).join(',')+']');
  }
  const columns = (await client.query("SELECT table_name,column_name,data_type,udt_name,is_nullable,column_default FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name,ordinal_position")).rows;
  await client.query('COMMIT');
  const data = '{'+snapshots.join(',')+'}';
  await mkdir(destination, {recursive:true});
  await writeFile(join(destination,'data.json'),data,{flag:'wx'});
  await writeFile(join(destination,'manifest.json'),JSON.stringify({createdAt:new Date().toISOString(),counts,columns,sha256:createHash('sha256').update(data).digest('hex'),scope:'Datos de todas las tablas public. Restaurar primero en una base aislada; no contiene roles PostgreSQL ni objetos externos a MFL.'},null,2),{flag:'wx'});
  await copyFile('src/db/migrations.sql',join(destination,'migrations.sql'));
  console.log(JSON.stringify({destination,counts,sha256:createHash('sha256').update(data).digest('hex')}));
} catch(error) {
  await client.query('ROLLBACK');
  throw error;
} finally { client.release(); await pool.end(); }
