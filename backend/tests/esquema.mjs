/**
 * DESFASE ENTRE EL CÓDIGO Y LA BASE.
 *
 * Este archivo existe por un reporte de tres palabras: "ya no me carga
 * los equipos". Se había desplegado la baja de jugadores —que agrega
 * `players.removed_at`— sin correr migraciones, y las consultas de
 * equipos filtran por esa columna. La API arrancaba sana, el healthcheck
 * respondía, y la pantalla de equipos devolvía "Error interno del
 * servidor". El aviso llegó por WhatsApp; el log no dijo nada.
 *
 * Dos cosas se comprueban aquí:
 *  1. Las expectativas se DERIVAN de migrations.sql, no se escriben a
 *     mano: una migración futura queda cubierta sola.
 *  2. En producción, una base atrasada aborta el arranque nombrando lo
 *     que falta, en lugar de servir 500 en una pantalla.
 *
 * Usa su propia base (mfl_esquema) para no tocar la de las otras suites.
 * Si no puede crearla, avisa y no falla: el resto de la regresión no
 * depende de esto.
 *
 * Uso:  node tests/esquema.mjs      (requiere `npm run build`)
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readFile } from 'node:fs/promises';
import pg from 'pg';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 5196;
const BASE = 'mfl_esquema';

let pasaron = 0;
let fallaron = 0;
const check = (ok, etiqueta, detalle = '') => {
  console.log(`  ${ok ? '✓' : '✗'} ${etiqueta}${detalle ? `  (${detalle})` : ''}`);
  ok ? pasaron++ : fallaron++;
};

const entornoBase = {
  PATH: process.env.PATH,
  DB_HOST: process.env.DB_HOST || '127.0.0.1',
  DB_PORT: process.env.DB_PORT || '5432',
  DB_USER: process.env.DB_USER || 'postgres',
  DB_PASSWORD: process.env.DB_PASSWORD || 'x',
  JWT_SECRET: 'x'.repeat(48),
  FRONTEND_URL: 'http://localhost:5173',
};

/** Corre un comando y devuelve su salida completa. */
const correr = (cmd, args, extra) =>
  new Promise((resolve) => {
    const proc = spawn(cmd, args, {
      cwd: ROOT,
      env: { ...entornoBase, ...extra },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let salida = '';
    proc.stdout.on('data', (d) => (salida += d));
    proc.stderr.on('data', (d) => (salida += d));
    proc.on('exit', (code) => resolve({ salida, code, vivo: false }));
    setTimeout(() => {
      if (proc.exitCode === null) {
        proc.kill('SIGKILL');
        resolve({ salida, code: null, vivo: true });
      }
    }, 12000);
  });

const arrancarApi = (extra) =>
  correr(process.execPath, ['dist/index.js'], {
    NODE_ENV: 'production',
    PORT: String(PORT),
    DB_NAME: BASE,
    ...extra,
  });

console.log('\n═══ 1. LAS EXPECTATIVAS SALEN DEL PROPIO SQL ═══');
/**
 * Lo importante no es que la lista sea correcta hoy, sino que no haya
 * lista: si se derivan del SQL, una migración nueva queda cubierta sin
 * que nadie se acuerde de añadirla.
 */
{
  const { esperadoSegunMigraciones } = await import('../dist/db/verificar-esquema.js');
  const esperado = await esperadoSegunMigraciones();

  check(esperado.tablas.length > 15, 'Encuentra las tablas del esquema', `${esperado.tablas.length}`);
  for (const t of ['users', 'teams', 'players', 'games', 'rounds', 'fees', 'payments']) {
    check(esperado.tablas.includes(t), `Incluye "${t}"`);
  }
  check(
    esperado.columnas.some((c) => c.tabla === 'players' && c.columna === 'removed_at'),
    'Y la columna incremental que provocó el fallo',
    'players.removed_at'
  );
  check(
    esperado.columnas.some((c) => c.tabla === 'players' && c.columna === 'avatar_url'),
    'Junto con las incrementales anteriores'
  );

  const { mensajeDeDesfase } = await import('../dist/db/verificar-esquema.js');
  const msg = mensajeDeDesfase([
    { tipo: 'columna', tabla: 'players', columna: 'removed_at' },
    { tipo: 'tabla', tabla: 'fees' },
  ]);
  check(/players\.removed_at/.test(msg), 'El mensaje nombra la columna que falta');
  check(/falta la tabla "fees"/.test(msg), 'Y la tabla que falta');
  check(/npm run migrate/.test(msg), 'Y dice exactamente qué correr');

  const seed = await readFile(join(ROOT, 'dist', 'db', 'seed.sql'), 'utf8');
  const settingsConflict = seed.match(
    /INSERT INTO settings[\s\S]*?ON CONFLICT \(league_id, season_id, key\) ([^;]+);/
  )?.[1] ?? '';
  check(
    /DO NOTHING/.test(settingsConflict) && !/DO UPDATE/.test(settingsConflict),
    'El seed nunca reemplaza configuración editable al arrancar'
  );
}

console.log('\n═══ 2. UNA BASE ATRASADA NO DEJA ARRANCAR EN PRODUCCIÓN ═══');
const admin = new pg.Client({
  host: entornoBase.DB_HOST,
  port: Number(entornoBase.DB_PORT),
  user: entornoBase.DB_USER,
  password: entornoBase.DB_PASSWORD,
  database: 'postgres',
});

let conBase = false;
try {
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS ${BASE}`);
  await admin.query(`CREATE DATABASE ${BASE}`);
  conBase = true;
} catch (e) {
  console.log(`  ⚠️  Sin permisos para crear la base de prueba: ${e.message}`);
  console.log('     (se omite la parte de integración; la parte 1 ya corrió)');
}

if (conBase) {
  const migrada = await correr(process.execPath, ['dist/db/migrate.js'], { DB_NAME: BASE });
  check(/Migraciones completadas/.test(migrada.salida), 'La base se migra desde el JS compilado');

  // El migrador corre en cada arranque de producción. Los valores del seed
  // son solo iniciales: nunca deben reemplazar lo configurado por la liga.
  const configuracion = new pg.Client({
    host: entornoBase.DB_HOST, port: Number(entornoBase.DB_PORT),
    user: entornoBase.DB_USER, password: entornoBase.DB_PASSWORD, database: BASE,
  });
  await configuracion.connect();
  await configuracion.query(
    `UPDATE settings
        SET value = '{"required":["PHOTO"],"allowed_mime":["image/png"],"max_size_mb":9}'::jsonb
      WHERE season_id = 'season_2026' AND key = 'documents'`
  );
  await configuracion.end();

  const remigrada = await correr(process.execPath, ['dist/db/migrate.js'], { DB_NAME: BASE });
  check(/Migraciones completadas/.test(remigrada.salida), 'Puede migrar otra vez sobre datos configurados');

  const compruebaConfiguracion = new pg.Client({
    host: entornoBase.DB_HOST, port: Number(entornoBase.DB_PORT),
    user: entornoBase.DB_USER, password: entornoBase.DB_PASSWORD, database: BASE,
  });
  await compruebaConfiguracion.connect();
  const valorConfigurado = await compruebaConfiguracion.query(
    `SELECT value FROM settings WHERE season_id = 'season_2026' AND key = 'documents'`
  );
  await compruebaConfiguracion.end();
  check(
    valorConfigurado.rows[0]?.value?.max_size_mb === 9 &&
      JSON.stringify(valorConfigurado.rows[0]?.value?.required) === JSON.stringify(['PHOTO']),
    'Volver a migrar no reemplaza la configuración de la temporada'
  );

  const sana = await arrancarApi({});
  check(sana.vivo, 'Con la base al día, la API arranca');
  check(!/atrasada/.test(sana.salida), 'Sin avisos de desfase');

  // Se quita la columna que provocó el reporte real.
  const cliente = new pg.Client({
    host: entornoBase.DB_HOST, port: Number(entornoBase.DB_PORT),
    user: entornoBase.DB_USER, password: entornoBase.DB_PASSWORD, database: BASE,
  });
  await cliente.connect();
  await cliente.query('ALTER TABLE players DROP COLUMN removed_at CASCADE');
  await cliente.end();

  const atrasada = await arrancarApi({});
  check(!atrasada.vivo && atrasada.code === 1, 'Con la base atrasada, aborta', `código ${atrasada.code}`);
  check(/atrasada respecto al código/.test(atrasada.salida), 'Diciendo que la base está atrasada');
  check(/players\.removed_at/.test(atrasada.salida), 'Y nombrando exactamente lo que falta');
  check(/npm run migrate/.test(atrasada.salida), 'Con el comando que lo arregla');

  // En desarrollo solo avisa: no se le cierra el servidor en la cara a
  // quien está trabajando en el esquema.
  const dev = await correr(process.execPath, ['dist/index.js'], {
    NODE_ENV: 'development', PORT: String(PORT), DB_NAME: BASE,
  });
  check(dev.vivo, 'En desarrollo arranca igual');
  check(/atrasada respecto al código/.test(dev.salida), 'Pero avisa del desfase');

  // Y volver a migrar lo repara.
  const reparada = await correr(process.execPath, ['dist/db/migrate.js'], { DB_NAME: BASE });
  check(/Migraciones completadas/.test(reparada.salida), 'Migrar otra vez repara el desfase');
  const otraVez = await arrancarApi({});
  check(otraVez.vivo && !/atrasada/.test(otraVez.salida), 'Y la API vuelve a arrancar limpia');

  await admin.query(`DROP DATABASE IF EXISTS ${BASE}`);
  await admin.end();
}

console.log('\n════════════════════════════════════════');
console.log(`  RESULTADO: ${pasaron} pasaron · ${fallaron} fallaron`);
console.log('════════════════════════════════════════');
process.exit(fallaron === 0 ? 0 : 1);
