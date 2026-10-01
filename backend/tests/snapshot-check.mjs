import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
const directory = process.argv[2];
if (!directory) throw new Error('Indica el directorio del snapshot. Solo restaura en memoria.');
const raw = await readFile(join(directory,'data.json'),'utf8');
const manifest = JSON.parse(await readFile(join(directory,'manifest.json'),'utf8'));
assert.equal(createHash('sha256').update(raw).digest('hex'),manifest.sha256);
const tables = JSON.parse(raw);
const db = await PGlite.create();
try {
  await db.exec(await readFile(join(directory,'migrations.sql'),'utf8'));
  const dependencies = (await db.query(`SELECT conrelid::regclass::text AS child, confrelid::regclass::text AS parent FROM pg_constraint WHERE contype='f' AND conrelid<>confrelid`)).rows;
  const restored = new Set();
  while (restored.size < Object.keys(tables).length) {
    const next = Object.keys(tables).find(table=>!restored.has(table) && dependencies.filter(d=>d.child===table).every(d=>restored.has(d.parent)));
    if (!next) throw new Error('Dependencias circulares: requieren restauración específica.');
    const name = '"'+next.replaceAll('"','""')+'"';
    if (tables[next].length) await db.query(`INSERT INTO ${name} SELECT * FROM json_populate_recordset(NULL::${name},$1::json)`,[JSON.stringify(tables[next])]);
    assert.equal((await db.query(`SELECT count(*)::int AS n FROM ${name}`)).rows[0].n,manifest.counts[next]);
    restored.add(next);
  }
  console.log(`PASS: SHA256 y restauración aislada de ${restored.size} tablas; conteos coinciden.`);
} finally { await db.close(); }
