/**
 * RESPALDO Y RESTAURACIÓN.
 *
 * Este archivo existe porque en ARQUITECTURA_MFL.md había una casilla sin
 * marcar: "[ ] Estrategia de backup definida". Dentro de esa base van a
 * estar los rosters y las identificaciones validadas de la temporada, y
 * el plan gratuito de Neon no da restauración a un punto en el tiempo.
 *
 * Y existe con esta forma —viaje completo de ida y vuelta— porque un
 * respaldo que nunca se ha restaurado no es un respaldo, es un archivo.
 * Aquí se vuelca la base de verdad, se cifra, se descifra, se restaura en
 * una base VACÍA y se comparan los conteos tabla por tabla. Si algo del
 * camino se rompe, esto lo dice antes de que haga falta de verdad.
 *
 * No toca Cloudinary: la subida es la parte que no puede fallar en
 * silencio (o sube o lanza) y probarla exigiría credenciales reales.
 *
 * Uso:  node tests/respaldo.mjs      (requiere `npm run build`)
 */
import { createHash, randomBytes } from 'node:crypto';
import { readFile, writeFile, unlink, mkdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import pg from 'pg';

import { cifrarArchivo, conexionParaPg } from '../scripts/respaldo.mjs';
import { descifrarArchivo, restaurarSql } from '../scripts/restaurar.mjs';

let pasaron = 0;
let fallaron = 0;
const check = (ok, etiqueta, detalle = '') => {
  console.log(`  ${ok ? '✓' : '✗'} ${etiqueta}${detalle ? `  (${detalle})` : ''}`);
  ok ? pasaron++ : fallaron++;
};

const ORIGEN = process.env.DB_NAME || 'mfl';
const COPIA = 'mfl_restaurada';
const conn = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 5432),
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'x',
};
const cadena = (base) =>
  `postgres://${conn.user}:${conn.password}@${conn.host}:${conn.port}/${base}`;

const carpeta = join(tmpdir(), 'mfl-prueba-respaldo');
const llave = createHash('sha256').update('clave-de-prueba-larga-de-sobra-32').digest();

const correr = (cmd, args, extraEnv = {}) =>
  new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { env: { ...process.env, ...extraEnv }, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (err += d));
    p.on('error', reject);
    p.on('exit', (c) => (c === 0 ? resolve(out) : reject(new Error(`${cmd} → ${c}: ${err.slice(0, 400)}`))));
  });

const conteos = async (base) => {
  const c = new pg.Client({ ...conn, database: base });
  await c.connect();
  const tablas = (
    await c.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name`
    )
  ).rows.map((r) => r.table_name);
  const salida = {};
  for (const t of tablas) {
    salida[t] = Number((await c.query(`SELECT count(*)::int AS n FROM "${t}"`)).rows[0].n);
  }
  await c.end();
  return salida;
};

console.log('\n═══ 1. CIFRADO: IDA Y VUELTA ═══');
await mkdir(carpeta, { recursive: true });
{
  const claro = join(carpeta, 'claro.txt');
  const cifrado = join(carpeta, 'cifrado.enc');
  const vuelta = join(carpeta, 'vuelta.txt');

  // Contenido con datos que de verdad viajan en un respaldo.
  const contenido =
    'CREATE TABLE players (...);\n' +
    "INSERT INTO players VALUES ('Iván Canché', '1997-03-03', '9981112233');\n".repeat(500);
  await writeFile(claro, contenido, 'utf8');

  await cifrarArchivo(claro, cifrado, llave);
  const bytes = await readFile(cifrado);
  check(bytes.length > 28, 'El archivo cifrado tiene cabecera y datos', `${bytes.length} bytes`);
  check(!bytes.includes(Buffer.from('Iván Canché', 'utf8')), 'Y NO contiene el texto en claro');
  check(!bytes.includes(Buffer.from('9981112233', 'utf8')), 'Ni los teléfonos');
  check(!bytes.includes(Buffer.from('CREATE TABLE', 'utf8')), 'Ni el propio SQL');

  await descifrarArchivo(cifrado, vuelta, llave);
  check((await readFile(vuelta, 'utf8')) === contenido, 'Se descifra idéntico al original');

  // Con otra clave debe FALLAR, no devolver basura.
  const otra = createHash('sha256').update('otra-clave-completamente-distinta').digest();
  let falló = false;
  try {
    await descifrarArchivo(cifrado, join(carpeta, 'nada.txt'), otra);
  } catch {
    falló = true;
  }
  check(falló, 'Con la clave equivocada falla, no devuelve basura');

  // Alterar un byte del contenido debe detectarse: GCM autentica.
  const alterado = join(carpeta, 'alterado.enc');
  const copia = Buffer.from(bytes);
  copia[copia.length - 5] ^= 0xff;
  await writeFile(alterado, copia);
  let detectado = false;
  try {
    await descifrarArchivo(alterado, join(carpeta, 'nada2.txt'), llave);
  } catch {
    detectado = true;
  }
  check(detectado, 'Un archivo alterado se detecta y se rechaza');
}

console.log('\n═══ 2. LA CONEXIÓN SALE DEL ENTORNO, EN LAS DOS FORMAS ═══');
{
  const conUrl = conexionParaPg({ DATABASE_URL: 'postgres://u:p@host/base' });
  check(conUrl.args[0] === 'postgres://u:p@host/base', 'Con DATABASE_URL se pasa tal cual');
  const conSueltas = conexionParaPg({
    DB_HOST: 'h', DB_PORT: '6000', DB_NAME: 'n', DB_USER: 'u', DB_PASSWORD: 's',
  });
  check(conSueltas.args.join(' ') === '-h h -p 6000 -U u -d n', 'Con las DB_* se arman los argumentos',
    conSueltas.args.join(' '));
  check(conSueltas.env.PGPASSWORD === 's', 'Y la contraseña va por PGPASSWORD, no en la línea de comandos');
}

console.log('\n═══ 3. VIAJE COMPLETO CONTRA POSTGRESQL ═══');
/**
 * La prueba de verdad: volcar la base real, cifrar, descifrar, restaurar
 * en una base vacía y comparar tabla por tabla.
 */
const admin = new pg.Client({ ...conn, database: 'postgres' });
let conBase = false;
try {
  await admin.connect();
  conBase = true;
} catch (e) {
  console.log(`  ⚠️  Sin acceso a PostgreSQL: ${e.message}`);
  console.log('     (se omite el viaje completo; las partes 1 y 2 ya corrieron)');
}

if (conBase) {
  const antes = await conteos(ORIGEN);
  const tablasConDatos = Object.entries(antes).filter(([, n]) => n > 0);
  check(tablasConDatos.length >= 5, 'La base de origen tiene datos que perder',
    `${tablasConDatos.length} tablas con filas`);

  const volcado = join(carpeta, 'real.sql');
  const { args, env } = conexionParaPg({ DATABASE_URL: cadena(ORIGEN) });
  await correr('pg_dump', ['--no-owner', '--no-privileges', '--clean', '--if-exists', '-f', volcado, ...args], env);
  const tam = (await stat(volcado)).size;
  check(tam > 1000, 'pg_dump produce un volcado', `${(tam / 1024).toFixed(0)} KB`);

  const cifrado = join(carpeta, 'real.sql.enc');
  const devuelto = join(carpeta, 'real-vuelta.sql');
  await cifrarArchivo(volcado, cifrado, llave);
  await descifrarArchivo(cifrado, devuelto, llave);
  check(
    (await readFile(volcado, 'utf8')) === (await readFile(devuelto, 'utf8')),
    'El volcado sobrevive el cifrado sin cambiar un byte'
  );

  await admin.query(`DROP DATABASE IF EXISTS ${COPIA}`);
  await admin.query(`CREATE DATABASE ${COPIA}`);
  const vacia = await conteos(COPIA);
  check(Object.keys(vacia).length === 0, 'La base de destino arranca vacía', `${Object.keys(vacia).length} tablas`);

  await restaurarSql(devuelto, cadena(COPIA));
  const despues = await conteos(COPIA);

  check(
    Object.keys(despues).length === Object.keys(antes).length,
    'Se restauran TODAS las tablas',
    `${Object.keys(despues).length} de ${Object.keys(antes).length}`
  );

  const distintas = Object.entries(antes).filter(([t, n]) => despues[t] !== n);
  check(distintas.length === 0, 'Y cada tabla con exactamente las mismas filas',
    distintas.map(([t, n]) => `${t}: ${n}→${despues[t]}`).join(', ') || 'todas coinciden');

  // Una comprobación con nombre propio sobre lo que de verdad dolería perder.
  for (const tabla of ['teams', 'players', 'player_documents', 'games', 'game_events', 'fees']) {
    if (antes[tabla] === undefined) continue;
    check(despues[tabla] === antes[tabla], `${tabla}: ${antes[tabla]} filas intactas`);
  }

  // Y que los datos sean los mismos, no solo la cantidad.
  const c = new pg.Client({ ...conn, database: COPIA });
  await c.connect();
  const o = new pg.Client({ ...conn, database: ORIGEN });
  await o.connect();
  const consulta =
    `SELECT id, first_name, last_name_paternal, jersey_number, is_eligible
     FROM players ORDER BY id LIMIT 20`;
  const [rc, ro] = [await c.query(consulta), await o.query(consulta)];
  check(JSON.stringify(rc.rows) === JSON.stringify(ro.rows),
    'Los jugadores restaurados son idénticos, no solo igual de muchos');
  await c.end();
  await o.end();

  await admin.query(`DROP DATABASE IF EXISTS ${COPIA}`);
  await admin.end();
}

console.log('\n════════════════════════════════════════');
console.log(`  RESULTADO: ${pasaron} pasaron · ${fallaron} fallaron`);
console.log('════════════════════════════════════════');
process.exit(fallaron === 0 ? 0 : 1);
