/**
 * ALMACENAMIENTO DE IMÁGENES — configuración a medias
 *
 * Este archivo existe por un fallo reportado desde la aplicación:
 * "intenté subir una foto del equipo y marcó Error interno del
 * servidor". La causa no estaba en la imagen ni en el código de subida,
 * sino en las credenciales de Cloudinary: con la llave equivocada, la
 * subida moría con un 403 que llegaba al usuario como un 500 genérico.
 *
 * Tres defectos alrededor de eso:
 *  1. El driver se activaba con solo NAME y API_KEY, sin el secreto.
 *  2. `validateEnvironment` solo avisaba de NAME, así que una
 *     configuración a medias arrancaba sin decir nada.
 *  3. El fallo del almacenamiento se respondía como "Error interno del
 *     servidor", que no dice qué revisar.
 *
 * No se prueba contra Cloudinary de verdad —eso exigiría credenciales
 * reales y red—; se prueba que el arranque y los mensajes se comporten
 * como deben en cada combinación.
 *
 * Uso:  node tests/almacenamiento.mjs      (requiere `npm run build`)
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 5197;

let pasaron = 0;
let fallaron = 0;
const check = (ok, etiqueta, detalle = '') => {
  console.log(`  ${ok ? '✓' : '✗'} ${etiqueta}${detalle ? `  (${detalle})` : ''}`);
  ok ? pasaron++ : fallaron++;
};

/** Arranca la API compilada con un entorno concreto y devuelve su salida. */
const arrancar = (extra) =>
  new Promise((resolve) => {
    const proc = spawn(process.execPath, ['dist/index.js'], {
      cwd: ROOT,
      env: {
        PATH: process.env.PATH,
        NODE_ENV: 'production',
        PORT: String(PORT),
        FRONTEND_URL: 'http://localhost:5173',
        DATABASE_URL: 'postgres://u:p@127.0.0.1:1/none',
        JWT_SECRET: 'x'.repeat(48),
        ...extra,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let salida = '';
    proc.stdout.on('data', (d) => (salida += d));
    proc.stderr.on('data', (d) => (salida += d));
    proc.on('exit', (code) => resolve({ salida, code, vivo: false }));

    // Si a los 3 s sigue vivo, arrancó bien.
    setTimeout(() => {
      if (proc.exitCode === null) {
        proc.kill('SIGKILL');
        resolve({ salida, code: null, vivo: true });
      }
    }, 3000);
  });

console.log('\n═══ 1. SIN CLOUDINARY: arranca en modo local ═══');
{
  const r = await arrancar({});
  check(r.vivo, 'La API arranca');
  check(/Almacenaje:\s+local/.test(r.salida), 'Y reporta almacenamiento local');
  check(
    /EFÍMERO/.test(r.salida),
    'Avisando de que el disco de Render se borra en cada despliegue'
  );
}

console.log('\n═══ 2. CON LAS TRES CREDENCIALES: modo Cloudinary ═══');
{
  const r = await arrancar({
    CLOUDINARY_NAME: 'demo',
    CLOUDINARY_API_KEY: '123456789',
    CLOUDINARY_API_SECRET: 'secreto',
  });
  check(r.vivo, 'La API arranca');
  check(/Almacenaje:\s+cloudinary/.test(r.salida), 'Y reporta Cloudinary');
  check(!/EFÍMERO/.test(r.salida), 'Sin el aviso de disco efímero, que ya no aplica');
}

console.log('\n═══ 3. A MEDIAS: SE NIEGA A ARRANCAR ═══');
/**
 * Es el caso que provocó el reporte. Antes arrancaba sin decir nada y el
 * fallo aparecía media hora después, cuando alguien subía un escudo.
 */
for (const [etiqueta, faltante, env] of [
  ['falta el SECRETO', 'CLOUDINARY_API_SECRET',
    { CLOUDINARY_NAME: 'demo', CLOUDINARY_API_KEY: '123' }],
  ['falta la LLAVE', 'CLOUDINARY_API_KEY',
    { CLOUDINARY_NAME: 'demo', CLOUDINARY_API_SECRET: 'sec' }],
  ['falta el NOMBRE', 'CLOUDINARY_NAME',
    { CLOUDINARY_API_KEY: '123', CLOUDINARY_API_SECRET: 'sec' }],
  ['solo el NOMBRE', 'CLOUDINARY_API_KEY',
    { CLOUDINARY_NAME: 'demo' }],
]) {
  const r = await arrancar(env);
  check(!r.vivo && r.code === 1, `${etiqueta}: aborta el arranque`, `código ${r.code}`);
  check(/Cloudinary a medias/.test(r.salida), `${etiqueta}: y explica por qué`);
  check(
    r.salida.includes(faltante),
    `${etiqueta}: nombrando la variable que falta`,
    faltante
  );
}

console.log('\n═══ 4. EL MENSAJE DEL FALLO DE SUBIDA ═══');
/**
 * Se comprueba la traducción directamente sobre el módulo compilado, sin
 * red: lo que importa es que un 403 no llegue al usuario como "Error
 * interno del servidor" sino nombrando las variables a revisar.
 */
{
  process.env.CLOUDINARY_NAME = 'demo';
  process.env.CLOUDINARY_API_KEY = '123';
  process.env.CLOUDINARY_API_SECRET = 'sec';
  const { StorageError } = await import('../dist/services/storage.service.js');
  check(typeof StorageError === 'function', 'El módulo exporta StorageError');

  const e = new StorageError('prueba');
  check(e.name === 'StorageError', 'Con el nombre que el errorHandler reconoce', e.name);

  // El errorHandler responde 502 y con el mensaje, no 500 genérico.
  const { errorHandler } = await import('../dist/middleware/errorHandler.js');
  let estado = null;
  let cuerpo = null;
  const res = {
    status(c) { estado = c; return this; },
    json(b) { cuerpo = b; return this; },
  };
  errorHandler(
    new StorageError(
      'El almacenamiento de imágenes (Cloudinary) rechazó la petición. ' +
        'Revisa CLOUDINARY_NAME, CLOUDINARY_API_KEY y CLOUDINARY_API_SECRET en el servidor.'
    ),
    {}, res, () => {}
  );
  check(estado === 502, 'Un fallo del almacenamiento responde 502, no 500', `${estado}`);
  check(
    /CLOUDINARY_API_SECRET/.test(cuerpo?.error ?? ''),
    'Y el mensaje nombra las variables a revisar'
  );
  check(
    cuerpo?.error !== 'Error interno del servidor',
    'En lugar del genérico que no dice nada'
  );
}

console.log('\n════════════════════════════════════════');
console.log(`  RESULTADO: ${pasaron} pasaron · ${fallaron} fallaron`);
console.log('════════════════════════════════════════');
process.exit(fallaron === 0 ? 0 : 1);
