/**
 * RESPALDO DE LA BASE DE DATOS.
 *
 * Existe porque en ARQUITECTURA_MFL.md había una casilla sin marcar —
 * "[ ] Estrategia de backup definida"— y dentro de esa base van a estar
 * los rosters completos y las identificaciones validadas de la
 * temporada. El plan gratuito de Neon no da restauración a un punto en
 * el tiempo: si la base se pierde en octubre, se pierde la temporada.
 *
 * Cómo funciona:
 *
 *   pg_dump  →  gzip  →  AES-256-GCM  →  Cloudinary (raw, private)
 *
 * · Se CIFRA antes de subir. El respaldo lleva nombres, teléfonos y
 *   fechas de nacimiento de menores en algunos casos; guardarlo en claro
 *   en la misma cuenta donde viven las identificaciones significaría que
 *   una sola credencial filtrada entrega todo. Con AES-256-GCM y una
 *   clave que no vive en Cloudinary, el archivo subido no sirve de nada
 *   sin `BACKUP_KEY`.
 * · Se sube a Cloudinary porque ya está pagado (25 GB gratis) y no
 *   introduce un servicio nuevo. Como `raw` y `private`: no hay URL
 *   pública que adivinar.
 * · GCM y no CBC porque autentica: si el archivo se corrompe o alguien
 *   lo altera, la restauración falla en lugar de escribir basura en la
 *   base.
 *
 * Uso:
 *   npm run respaldo                  → crea y sube uno
 *   npm run respaldo -- --solo-local  → lo deja en disco, sin subir
 *   npm run respaldo -- --listar      → lista los que hay guardados
 *
 * Variables: DATABASE_URL (o DB_*), BACKUP_KEY, y las de Cloudinary.
 */
import { spawn } from 'node:child_process';
import { createCipheriv, createHash, randomBytes } from 'node:crypto';
import { createGzip } from 'node:zlib';
import { createWriteStream, createReadStream } from 'node:fs';
import { mkdir, stat, unlink } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';

/** Cuántos respaldos se conservan en Cloudinary. */
const CONSERVAR = 14;
const CARPETA = 'mfl/respaldos';

const arg = (nombre) => process.argv.includes(`--${nombre}`);

/**
 * La clave de 32 bytes sale del passphrase por SHA-256.
 *
 * Sin derivación con sal ni iteraciones a propósito: esto no protege
 * contra un diccionario sobre una contraseña humana débil, protege
 * contra que el archivo subido sirva por sí solo. `BACKUP_KEY` se genera
 * aleatoria y se guarda en un gestor de contraseñas; si fuera algo que
 * alguien pudiera teclear de memoria, haría falta scrypt.
 */
const clave = () => {
  const passphrase = (process.env.BACKUP_KEY ?? '').trim();
  if (passphrase.length < 24) {
    throw new Error(
      'BACKUP_KEY debe tener al menos 24 caracteres. Genérala así:\n' +
        "  node -e \"console.log(require('crypto').randomBytes(32).toString('base64url'))\"\n" +
        'y guárdala en tu gestor de contraseñas. SIN ELLA NO SE PUEDE RESTAURAR.'
    );
  }
  return createHash('sha256').update(passphrase).digest();
};

/** Argumentos de conexión para pg_dump, de DATABASE_URL o de las DB_*. */
export const conexionParaPg = (env = process.env) => {
  if (env.DATABASE_URL) return { args: [env.DATABASE_URL], env: {} };
  const host = env.DB_HOST || 'localhost';
  const port = env.DB_PORT || '5432';
  const nombre = env.DB_NAME || 'postgres';
  const usuario = env.DB_USER || 'postgres';
  return {
    args: ['-h', host, '-p', String(port), '-U', usuario, '-d', nombre],
    env: { PGPASSWORD: env.DB_PASSWORD ?? '' },
  };
};

const correr = (cmd, args, extraEnv = {}) =>
  new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { env: { ...process.env, ...extraEnv }, stdio: ['ignore', 'pipe', 'pipe'] });
    let err = '';
    p.stderr.on('data', (d) => (err += d));
    p.on('error', reject);
    p.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`${cmd} salió con ${code}: ${err.slice(0, 500)}`))
    );
  });

/**
 * Formato del archivo cifrado:
 *   [ 12 bytes IV ][ 16 bytes etiqueta GCM ][ datos ]
 *
 * La etiqueta va al principio y no al final porque al restaurar hay que
 * pasarla al descifrador ANTES de leer los datos, y así se lee de una
 * sola pasada sin cargar el archivo entero en memoria.
 */
export const cifrarArchivo = async (origen, destino, llave) => {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', llave, iv);

  const temporal = `${destino}.parcial`;
  await pipeline(createReadStream(origen), cipher, createWriteStream(temporal));

  const etiqueta = cipher.getAuthTag();
  const salida = createWriteStream(destino);
  salida.write(iv);
  salida.write(etiqueta);
  await pipeline(createReadStream(temporal), salida);
  await unlink(temporal);
};

const subirACloudinary = async (ruta, nombre) => {
  const { credencialesCloudinary } = await import('../dist/config/credenciales.js');
  const cred = credencialesCloudinary();
  if (!cred) {
    console.log('  ⚠️  Sin credenciales de Cloudinary: el respaldo queda solo en disco.');
    return null;
  }
  const { v2: cloudinary } = await import('cloudinary');
  cloudinary.config({
    cloud_name: cred.cloudName,
    api_key: cred.apiKey,
    api_secret: cred.apiSecret,
    secure: true,
  });

  const subido = await cloudinary.uploader.upload(ruta, {
    public_id: `${CARPETA}/${nombre}`,
    resource_type: 'raw',
    type: 'private',
  });

  // Poda: se conservan los últimos CONSERVAR y se borran los demás.
  const listado = await cloudinary.api.resources({
    resource_type: 'raw',
    type: 'private',
    prefix: CARPETA,
    max_results: 100,
  });
  const ordenados = (listado.resources ?? []).sort(
    (a, b) => new Date(b.created_at) - new Date(a.created_at)
  );
  const sobran = ordenados.slice(CONSERVAR);
  for (const r of sobran) {
    await cloudinary.uploader.destroy(r.public_id, { resource_type: 'raw', type: 'private' });
  }
  if (sobran.length) console.log(`  · ${sobran.length} respaldo(s) viejo(s) eliminado(s)`);

  return subido.public_id;
};

const listar = async () => {
  const { credencialesCloudinary } = await import('../dist/config/credenciales.js');
  const cred = credencialesCloudinary();
  if (!cred) {
    console.error('Sin credenciales de Cloudinary: no hay nada que listar.');
    process.exit(1);
  }
  const { v2: cloudinary } = await import('cloudinary');
  cloudinary.config({
    cloud_name: cred.cloudName, api_key: cred.apiKey, api_secret: cred.apiSecret, secure: true,
  });
  const r = await cloudinary.api.resources({
    resource_type: 'raw', type: 'private', prefix: CARPETA, max_results: 100,
  });
  const items = (r.resources ?? []).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  if (items.length === 0) {
    console.log('\nNo hay respaldos guardados.\n');
    return;
  }
  console.log(`\n${items.length} respaldo(s), del más nuevo al más viejo:\n`);
  for (const i of items) {
    const mb = (i.bytes / 1024 / 1024).toFixed(2);
    console.log(`  ${i.created_at.slice(0, 19).replace('T', ' ')}  ${mb.padStart(7)} MB  ${i.public_id}`);
  }
  console.log('\nPara restaurar uno:  npm run restaurar -- --id=<public_id>\n');
};

const main = async () => {
  if (arg('listar')) return listar();

  console.log('\n💾 Respaldo de Master Flag League\n');

  const llave = clave();
  const sello = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const nombre = `mfl-${sello}.sql.gz.enc`;
  const carpeta = join(tmpdir(), 'mfl-respaldos');
  await mkdir(carpeta, { recursive: true });

  const crudo = join(carpeta, `mfl-${sello}.sql`);
  const comprimido = `${crudo}.gz`;
  const cifrado = join(carpeta, nombre);

  const { args, env } = conexionParaPg();
  console.log('  · Volcando la base…');
  await new Promise((resolve, reject) => {
    const p = spawn('pg_dump', ['--no-owner', '--no-privileges', '--clean', '--if-exists', ...args], {
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let err = '';
    p.stderr.on('data', (d) => (err += d));
    const salida = createWriteStream(crudo);
    p.stdout.pipe(salida);
    p.on('error', reject);
    p.on('exit', (c) => (c === 0 ? salida.on('close', resolve) : reject(new Error(`pg_dump: ${err.slice(0, 400)}`))));
  });
  const tamCrudo = (await stat(crudo)).size;

  console.log('  · Comprimiendo…');
  await pipeline(createReadStream(crudo), createGzip({ level: 9 }), createWriteStream(comprimido));
  await unlink(crudo);

  console.log('  · Cifrando (AES-256-GCM)…');
  await cifrarArchivo(comprimido, cifrado, llave);
  await unlink(comprimido);

  const tamFinal = (await stat(cifrado)).size;
  console.log(
    `  · ${(tamCrudo / 1024).toFixed(0)} KB de SQL → ${(tamFinal / 1024).toFixed(0)} KB cifrados`
  );

  if (arg('solo-local')) {
    console.log(`\n✅ Respaldo en ${cifrado}\n`);
    return;
  }

  console.log('  · Subiendo a Cloudinary…');
  const id = await subirACloudinary(cifrado, nombre);
  console.log(`\n✅ Respaldo listo${id ? `: ${id}` : ` en ${cifrado}`}\n`);
  if (id) {
    console.log('   Recuerda: sin BACKUP_KEY este archivo no se puede restaurar.\n');
  }
};

// Solo se ejecuta como programa, no al importarlo desde una prueba.
/**
 * Solo se ejecuta como programa, no al importarlo.
 *
 * Comparar el URL del módulo con argv[1] y no el nombre del archivo: la
 * prueba que importa esto se llama `tests/respaldo.mjs`, así que un
 * `endsWith('respaldo.mjs')` daba verdadero y el script arrancaba de
 * verdad en medio de la prueba.
 */
const invocadoDirectamente =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invocadoDirectamente) {
  main().catch((e) => {
    console.error(`\n❌ ${e.message}\n`);
    process.exit(1);
  });
}
