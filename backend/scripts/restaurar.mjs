/**
 * RESTAURACIÓN.
 *
 * Un respaldo que nunca se ha restaurado no es un respaldo: es un
 * archivo. Este script existe para que la restauración se pueda ensayar
 * antes de necesitarla, y `tests/respaldo.mjs` la ensaya de verdad en
 * cada corrida —vuelca, cifra, descifra, restaura en una base vacía y
 * compara los conteos de cada tabla—.
 *
 * Uso:
 *   npm run restaurar -- --archivo=/ruta/al.enc --a=postgres://…
 *   npm run restaurar -- --id=mfl/respaldos/mfl-2026-09-04… --a=postgres://…
 *
 * `--a` es OBLIGATORIO y explícito. No hay valor por omisión a
 * propósito: el fallo que este script podría causar es sobrescribir la
 * base de producción por descuido, así que hay que teclear a dónde va.
 */
import { spawn } from 'node:child_process';
import { createDecipheriv, createHash } from 'node:crypto';
import { createGunzip } from 'node:zlib';
import { createReadStream, createWriteStream } from 'node:fs';
import { open, unlink, mkdir } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';

const valor = (nombre) => {
  const encontrado = process.argv.find((a) => a.startsWith(`--${nombre}=`));
  return encontrado ? encontrado.split('=').slice(1).join('=') : undefined;
};

const clave = () => {
  const passphrase = (process.env.BACKUP_KEY ?? '').trim();
  if (passphrase.length < 24) {
    throw new Error('BACKUP_KEY no está definida o es demasiado corta. Sin ella no hay restauración.');
  }
  return createHash('sha256').update(passphrase).digest();
};

/**
 * Descifra el formato que escribe respaldo.mjs:
 *   [ 12 bytes IV ][ 16 bytes etiqueta GCM ][ datos ]
 *
 * Si la clave es otra, o el archivo se corrompió, GCM lo detecta y
 * `pipeline` lanza. Eso es deliberado: mejor fallar que restaurar un
 * volcado a medias sobre una base con datos.
 */
export const descifrarArchivo = async (origen, destino, llave) => {
  const fd = await open(origen, 'r');
  const cabecera = Buffer.alloc(28);
  await fd.read(cabecera, 0, 28, 0);
  await fd.close();

  const iv = cabecera.subarray(0, 12);
  const etiqueta = cabecera.subarray(12, 28);

  const decipher = createDecipheriv('aes-256-gcm', llave, iv);
  decipher.setAuthTag(etiqueta);

  await pipeline(createReadStream(origen, { start: 28 }), decipher, createWriteStream(destino));
};

const bajarDeCloudinary = async (publicId, destino) => {
  const { credencialesCloudinary } = await import('../dist/config/credenciales.js');
  const cred = credencialesCloudinary();
  if (!cred) throw new Error('Sin credenciales de Cloudinary: usa --archivo con una copia local.');
  const { v2: cloudinary } = await import('cloudinary');
  cloudinary.config({
    cloud_name: cred.cloudName, api_key: cred.apiKey, api_secret: cred.apiSecret, secure: true,
  });
  const url = cloudinary.utils.private_download_url(publicId, '', {
    resource_type: 'raw',
    type: 'private',
    expires_at: Math.floor(Date.now() / 1000) + 300,
  });
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Cloudinary respondió ${r.status} al bajar ${publicId}`);
  await pipeline(r.body, createWriteStream(destino));
};

export const restaurarSql = (rutaSql, destino) =>
  new Promise((resolve, reject) => {
    const p = spawn('psql', ['--quiet', '--set', 'ON_ERROR_STOP=off', '-f', rutaSql, destino], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let err = '';
    p.stderr.on('data', (d) => (err += d));
    p.on('error', reject);
    p.on('exit', (c) => (c === 0 ? resolve(err) : reject(new Error(`psql salió con ${c}: ${err.slice(0, 600)}`))));
  });

const main = async () => {
  const archivo = valor('archivo');
  const id = valor('id');
  const destino = valor('a');

  if (!destino) {
    console.error(
      '\n❌ Falta --a con la cadena de conexión de destino.\n\n' +
        '   Es obligatorio a propósito: lo peor que puede hacer este script es\n' +
        '   sobrescribir la base de producción por descuido, así que hay que\n' +
        '   teclear a dónde va.\n\n' +
        '   npm run restaurar -- --archivo=/tmp/x.enc --a=postgres://usuario:clave@host/base\n'
    );
    process.exit(1);
  }
  if (!archivo && !id) {
    console.error('\n❌ Indica --archivo=<ruta local> o --id=<public_id de Cloudinary>.\n');
    process.exit(1);
  }

  console.log('\n♻️  Restauración de Master Flag League\n');
  const llave = clave();
  const carpeta = join(tmpdir(), 'mfl-restauracion');
  await mkdir(carpeta, { recursive: true });

  let cifrado = archivo;
  if (id) {
    cifrado = join(carpeta, 'bajado.enc');
    console.log(`  · Bajando ${id}…`);
    await bajarDeCloudinary(id, cifrado);
  }

  const comprimido = join(carpeta, 'restaurar.sql.gz');
  const sql = join(carpeta, 'restaurar.sql');

  console.log('  · Descifrando…');
  await descifrarArchivo(cifrado, comprimido, llave);

  console.log('  · Descomprimiendo…');
  await pipeline(createReadStream(comprimido), createGunzip(), createWriteStream(sql));
  await unlink(comprimido);

  console.log('  · Restaurando…');
  await restaurarSql(sql, destino);
  await unlink(sql);
  if (id) await unlink(cifrado);

  console.log('\n✅ Restauración terminada.\n');
  console.log('   Comprueba los conteos antes de dar por buena la base:\n');
  console.log("   psql '<destino>' -c \"SELECT 'equipos', count(*) FROM teams UNION ALL");
  console.log("      SELECT 'jugadores', count(*) FROM players UNION ALL");
  console.log("      SELECT 'documentos', count(*) FROM player_documents\"\n");
};

/**
 * Solo se ejecuta como programa, no al importarlo.
 *
 * Comparar el URL del módulo con argv[1] y no el nombre del archivo: la
 * prueba que importa esto se llama `tests/restaurar.mjs`, así que un
 * `endsWith('restaurar.mjs')` daba verdadero y el script arrancaba de
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
