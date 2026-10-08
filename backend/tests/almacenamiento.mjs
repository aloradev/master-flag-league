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
        CLOUDINARY_URL: '',
        CLOUDINARY_NAME: '',
        CLOUDINARY_CLOUD_NAME: '',
        CLOUDINARY_API_KEY: '',
        CLOUDINARY_API_SECRET: '',
        EMAIL_WORKER_ENABLED: 'false',
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

console.log('\n═══ 5. LAS DOS FORMAS DE CONFIGURAR CLOUDINARY ═══');
/**
 * El panel de Cloudinary muestra como principal una sola línea,
 * CLOUDINARY_URL, y es lo que uno copia. Mientras el código solo miraba
 * las tres variables sueltas, pegar esa línea dejaba el almacenamiento
 * en local sin decir nada: las imágenes se iban al disco efímero.
 */
{
  const { credencialesCloudinary, activeDriver } = await import(
    '../dist/services/storage.service.js'
  );

  const tres = {
    CLOUDINARY_NAME: 'miliga',
    CLOUDINARY_API_KEY: '123456789012345',
    CLOUDINARY_API_SECRET: 'abcdefghijklmnopqrstuvwxyz1',
  };
  const c1 = credencialesCloudinary(tres);
  check(c1?.origen === 'tres-variables', 'Tres variables: se leen', c1?.origen);
  check(c1?.cloudName === 'miliga', 'Con el nombre correcto', c1?.cloudName);
  check(activeDriver(tres) === 'cloudinary', 'Y el driver es cloudinary');

  const url = { CLOUDINARY_URL: 'cloudinary://123456789012345:abcdefghijklmnopqrstuvwxyz1@miliga' };
  const c2 = credencialesCloudinary(url);
  check(c2?.origen === 'CLOUDINARY_URL', 'CLOUDINARY_URL sola: se interpreta', c2?.origen);
  check(c2?.cloudName === 'miliga', 'Nombre del cloud', c2?.cloudName);
  check(c2?.apiKey === '123456789012345', 'Llave', c2?.apiKey);
  check(c2?.apiSecret === 'abcdefghijklmnopqrstuvwxyz1', 'Secreto');
  check(activeDriver(url) === 'cloudinary', 'Y el driver es cloudinary');

  // Render conserva el salto de línea al pegar; producía un 401 idéntico
  // al de una llave equivocada.
  const conEspacios = credencialesCloudinary({
    CLOUDINARY_NAME: ' miliga\n',
    CLOUDINARY_API_KEY: '123456789012345 ',
    CLOUDINARY_API_SECRET: '\tabcdefghijklmnopqrstuvwxyz1',
  });
  check(conEspacios?.cloudName === 'miliga', 'Los espacios y saltos se recortan');

  check(
    credencialesCloudinary({ ...tres, CLOUDINARY_URL: 'cloudinary://9:9@otro' })?.cloudName ===
      'miliga',
    'Con ambas formas, ganan las tres variables sueltas'
  );

  check(credencialesCloudinary({}) === null, 'Sin nada: no hay credenciales');
  check(
    credencialesCloudinary({ CLOUDINARY_URL: 'https://miliga.cloudinary.com' }) === null,
    'Una CLOUDINARY_URL mal escrita no se inventa credenciales'
  );
  check(activeDriver({}) === 'local', 'Y el driver cae a local');
}

console.log('\n═══ 6. EL DIAGNÓSTICO NOMBRA EL ERROR DE CAPTURA ═══');
{
  const { revisarFormato, informeDeAlmacenamiento, enmascarar, diagnosticarPing } = await import(
    '../dist/services/diagnostics.service.js'
  );

  const buenas = {
    CLOUDINARY_NAME: 'miliga',
    CLOUDINARY_API_KEY: '123456789012345',
    CLOUDINARY_API_SECRET: 'abcdefghijklmnopqrstuvwxyz1',
  };
  check(revisarFormato(buenas).length === 0, 'Una configuración correcta no genera hallazgos');

  const errores = (env) => revisarFormato(env).filter((h) => h.gravedad === 'error');
  const textos = (env) => revisarFormato(env).map((h) => h.mensaje).join(' | ');

  check(
    errores({ ...buenas, CLOUDINARY_NAME: 'miliga\n' }).length === 1,
    'Detecta el salto de línea al final'
  );
  check(
    /espacios o un salto/.test(textos({ ...buenas, CLOUDINARY_NAME: 'miliga\n' })),
    'Y lo explica en lugar de decir "credenciales inválidas"'
  );

  const urlEnLugarEquivocado = { CLOUDINARY_NAME: 'cloudinary://9:s@miliga' };
  check(
    /va en la\s+variable CLOUDINARY_URL|va en la variable CLOUDINARY_URL/.test(
      textos(urlEnLugarEquivocado)
    ),
    'Detecta la URL pegada en la variable equivocada'
  );

  check(
    /no tiene la forma/.test(textos({ CLOUDINARY_URL: 'cloudinary//mal' })),
    'Detecta una CLOUDINARY_URL que no se puede interpretar'
  );

  check(
    /parece un correo o un dominio/.test(textos({ ...buenas, CLOUDINARY_NAME: 'yo@correo.com' })),
    'Detecta el correo usado como nombre del cloud'
  );

  const invertidas = {
    CLOUDINARY_NAME: 'miliga',
    CLOUDINARY_API_KEY: 'abcdefghijklmnopqrstuvwxyz1',
    CLOUDINARY_API_SECRET: '123456789012345',
  };
  check(
    /invertidos/.test(textos(invertidas)),
    'Detecta la llave y el secreto intercambiados'
  );

  check(
    /suelen\s+tener 27|suelen tener 27/.test(textos({ ...buenas, CLOUDINARY_API_SECRET: 'corto' })),
    'Avisa del secreto cortado al copiar'
  );

  // ── El informe no filtra secretos ──
  const informe = informeDeAlmacenamiento(buenas);
  check(informe.driver === 'cloudinary', 'El informe reporta el driver activo');
  check(informe.credenciales.cloud_name === 'miliga', 'Muestra el nombre del cloud en claro');
  check(
    !informe.credenciales.api_secret.includes('defghijklmnopqrstuvwxy'),
    'Pero NUNCA el secreto completo'
  );
  check(
    !JSON.stringify(informe).includes(buenas.CLOUDINARY_API_SECRET),
    'El JSON completo tampoco contiene el secreto'
  );
  check(
    !JSON.stringify(informe).includes(buenas.CLOUDINARY_API_KEY),
    'Ni la llave completa'
  );
  check(informe.credenciales.api_secret_largo === 27, 'El largo sí, que es lo que se revisa');

  check(enmascarar('123456') === '••••••', 'Un valor corto se tapa entero');
  check(enmascarar('123456789012345').startsWith('123'), 'Uno largo deja ver el principio');
  check(enmascarar('123456789012345').endsWith('345'), 'Y el final, para reconocerlo');

  const local = informeDeAlmacenamiento({});
  check(local.driver === 'local', 'Sin credenciales: modo local');
  check(local.credenciales === null, 'Sin bloque de credenciales');
  check(/se borra en cada despliegue/.test(local.diagnosis), 'Y el diagnóstico avisa del riesgo');
  check(
    /CLOUDINARY_NAME/.test(local.diagnosis),
    'Nombrando las variables que faltan'
  );

  const urlRota = informeDeAlmacenamiento({ CLOUDINARY_URL: 'cloudinary//mal' });
  check(urlRota.driver === 'local', 'Una URL rota deja el driver en local');
  check(
    /no se pudo interpretar/.test(urlRota.diagnosis),
    'Y el diagnóstico dice que la URL es el problema, no que falten variables'
  );

  const cred = { cloudName: 'miliga', apiKey: '1', apiSecret: '2', origen: 'CLOUDINARY_URL' };
  check(/acepta las credenciales/.test(diagnosticarPing(cred, { ok: true })), 'Ping bueno');
  check(
    /Settings → API Keys/.test(diagnosticarPing(cred, { ok: false, http_code: 401 })),
    'Un 401 dice dónde volver a copiar las llaves'
  );
  check(
    /no existe/.test(diagnosticarPing(cred, { ok: false, http_code: 404 })),
    'Un 404 dice que el nombre del cloud no existe'
  );
}

console.log('\n═══ 7. ARRANQUE CON CLOUDINARY_URL ═══');
/**
 * Dos regresiones que introdujo el soporte de CLOUDINARY_URL, las dos
 * encontradas al escribir estas pruebas:
 *
 *  · La comprobación de arranque contaba variables en lugar de mirar las
 *    credenciales. Con una URL válida más un CLOUDINARY_NAME olvidado de
 *    un intento anterior —lo normal al migrar de una forma a la otra—,
 *    la aplicación se negaba a arrancar teniendo todo lo necesario.
 *  · Con una URL mal escrita como única configuración no decía nada y
 *    las imágenes se iban al disco efímero: exactamente el fallo
 *    silencioso que este archivo existe para impedir.
 */
{
  const URL_OK = 'cloudinary://123456789012345:abcdefghijklmnopqrstuvwxyz1@miliga';

  const soloUrl = await arrancar({ CLOUDINARY_URL: URL_OK });
  check(soloUrl.vivo, 'Solo CLOUDINARY_URL: arranca');
  check(/Almacenaje:\s+cloudinary/.test(soloUrl.salida), 'Y reporta Cloudinary');
  check(
    !/EFÍMERO/.test(soloUrl.salida),
    'Sin el aviso de disco efímero, que sería mentira'
  );

  const urlYSobrante = await arrancar({ CLOUDINARY_URL: URL_OK, CLOUDINARY_NAME: 'miliga' });
  check(
    urlYSobrante.vivo,
    'URL válida + una variable suelta olvidada: arranca igual',
    `código ${urlYSobrante.code}`
  );
  check(
    !/Cloudinary a medias/.test(urlYSobrante.salida),
    'Sin declararla "a medias": las credenciales están completas'
  );

  /**
   * Un typo aquí no era "a medias": el SDK de Cloudinary lanza al
   * importarse si la URL no empieza con cloudinary://, así que la API
   * entera moría con un stack de Node en el log de Render, antes de que
   * ninguna validación pudiera decir qué revisar.
   */
  const urlRota = await arrancar({ CLOUDINARY_URL: 'cloudinary//mal' });
  check(!urlRota.vivo && urlRota.code === 1, 'URL mal escrita: aborta el arranque');
  check(
    /CLOUDINARY_URL mal escrita/.test(urlRota.salida),
    'Con un mensaje propio, no con el stack del SDK'
  );
  check(
    !/at module.exports|node_modules\/cloudinary/.test(urlRota.salida),
    'Sin rastro del stack de Node, que no dice qué revisar'
  );
  check(
    /cloudinary:\/\/<api_key>:<api_secret>@<cloud_name>/.test(urlRota.salida),
    'Diciendo qué forma debe tener'
  );
  check(
    /Settings → API Keys/.test(urlRota.salida),
    'Y de dónde copiarla'
  );
}

console.log('\n════════════════════════════════════════');
console.log(`  RESULTADO: ${pasaron} pasaron · ${fallaron} fallaron`);
console.log('════════════════════════════════════════');
process.exit(fallaron === 0 ? 0 : 1);
