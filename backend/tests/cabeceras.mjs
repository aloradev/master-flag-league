/**
 * CABECERAS DE SEGURIDAD.
 *
 * Antes solo había tres, y una política demasiado estricta rompe cosas en
 * silencio — que es peor que no tenerla. Esto comprueba las dos mitades:
 * que las cabeceras estén, y que NO rompan lo que la aplicación necesita.
 *
 * Dos trampas concretas que esto vigila:
 *
 *  1. `Cross-Origin-Resource-Policy: same-site` en /media haría que los
 *     escudos de los equipos dejaran de aparecer, sin un solo error
 *     visible: la interfaz vive en Vercel y los carga con <img> desde el
 *     dominio de Render, que es otro sitio.
 *  2. El CSP de la interfaz lleva `script-src 'self'`, y `index.html`
 *     tiene un script EN LÍNEA —el que evita el destello de tema al
 *     cargar—. Va permitido por su hash; si alguien edita ese script y no
 *     actualiza el hash, el navegador lo bloquea y la aplicación
 *     parpadea en blanco al abrirse en modo oscuro. Aquí se recalcula el
 *     hash desde el HTML y se compara con `vercel.json`.
 *
 * Uso:  node tests/cabeceras.mjs      (con la API arriba)
 */
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const API = 'http://localhost:5000';
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

let pasaron = 0;
let fallaron = 0;
const check = (ok, etiqueta, detalle = '') => {
  console.log(`  ${ok ? '✓' : '✗'} ${etiqueta}${detalle ? `  (${detalle})` : ''}`);
  ok ? pasaron++ : fallaron++;
};

console.log('\n═══ 1. LA API MANDA LAS CABECERAS ═══');
{
  const r = await fetch(`${API}/api/v1`);
  const h = (n) => r.headers.get(n);

  check(h('x-content-type-options') === 'nosniff', 'X-Content-Type-Options: nosniff');
  check(h('x-frame-options') === 'DENY', 'X-Frame-Options: DENY');
  check(h('referrer-policy') === 'no-referrer', 'Referrer-Policy: no-referrer');
  check(Boolean(h('content-security-policy')), 'Content-Security-Policy presente');
  check(
    /default-src 'none'/.test(h('content-security-policy') ?? ''),
    "Con default-src 'none': la API no ejecuta ni carga nada",
    h('content-security-policy')?.slice(0, 40)
  );
  check(
    /frame-ancestors 'none'/.test(h('content-security-policy') ?? ''),
    'Y no se puede incrustar en un iframe'
  );
  check(
    /camera=\(\)/.test(h('permissions-policy') ?? ''),
    'Permissions-Policy cierra cámara y micrófono',
    h('permissions-policy')
  );
  check(h('cross-origin-resource-policy') === 'same-site',
    'CORP same-site en la API', h('cross-origin-resource-policy'));

  // HSTS solo en producción: servida en http://localhost deja el
  // navegador forzando https contra localhost para todo lo demás.
  check(h('strict-transport-security') === null,
    'Sin HSTS en desarrollo, que es http://localhost',
    h('strict-transport-security') ?? 'ausente');

  check(h('x-powered-by') === null, 'Sin X-Powered-By delatando Express',
    h('x-powered-by') ?? 'ausente');
}

console.log('\n═══ 2. Y NO ROMPEN LO QUE LA APLICACIÓN USA ═══');
{
  // El JSON sigue llegando con CORS: CORP no aplica a peticiones con CORS.
  const r = await fetch(`${API}/api/v1`, { headers: { Origin: 'http://localhost:5173' } });
  check(r.status === 200, 'La API responde 200 desde el origen de la interfaz');
  check(
    r.headers.get('access-control-allow-origin') === 'http://localhost:5173',
    'Con la cabecera de CORS intacta',
    r.headers.get('access-control-allow-origin') ?? 'ausente'
  );
  const cuerpo = await r.json();
  check(cuerpo?.name === 'Master Flag League API', 'Y el cuerpo llega completo');

  // /media va cross-origin, o los escudos desaparecen sin error visible.
  const media = await fetch(`${API}/media/no-existe.png`);
  check(
    media.headers.get('cross-origin-resource-policy') === 'cross-origin',
    'En /media, CORP es cross-origin para que los escudos carguen',
    media.headers.get('cross-origin-resource-policy') ?? 'ausente'
  );

  const publico = await fetch(`${API}/api/v1/public/standings`);
  check(publico.status === 200 || publico.status === 404,
    'Las páginas públicas siguen respondiendo', `${publico.status}`);
}

console.log('\n═══ 3. EL HASH DEL SCRIPT EN LÍNEA SIGUE AL DÍA ═══');
{
  const html = await readFile(join(RAIZ, 'frontend', 'index.html'), 'utf8');
  const vercel = JSON.parse(await readFile(join(RAIZ, 'frontend', 'vercel.json'), 'utf8'));

  const enLinea = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)]
    .map((m) => m[1]);
  check(enLinea.length === 1, 'index.html tiene un solo script en línea', `${enLinea.length}`);

  const csp = vercel.headers
    .flatMap((h) => h.headers)
    .find((h) => h.key === 'Content-Security-Policy')?.value ?? '';
  check(Boolean(csp), 'vercel.json define un CSP');
  check(/script-src 'self' 'sha256-/.test(csp), "Con script-src 'self' más un hash");

  for (const script of enLinea) {
    const hash =
      'sha256-' + createHash('sha256').update(script, 'utf8').digest('base64');
    check(
      csp.includes(`'${hash}'`),
      'El hash del script del tema coincide con el CSP',
      hash
    );
  }

  // Lo que la interfaz necesita de verdad, y que un CSP estricto rompe.
  check(/img-src[^;]*blob:/.test(csp),
    'img-src admite blob: — los documentos se muestran como URL de objeto');
  check(/frame-src[^;]*blob:/.test(csp),
    'frame-src admite blob: — el visor de PDF es un iframe con blob');
  check(/img-src[^;]*res\.cloudinary\.com/.test(csp),
    'img-src admite Cloudinary — de ahí salen avatares y escudos');
  check(/style-src[^;]*'unsafe-inline'/.test(csp),
    "style-src admite inline — los colores de equipo van en atributo style");
  check(/connect-src[^;]*onrender\.com/.test(csp),
    'connect-src admite la API en Render');
  check(/camera=\(self\)/.test(
      vercel.headers.flatMap((h) => h.headers).find((h) => h.key === 'Permissions-Policy')?.value ?? ''),
    'Permissions-Policy deja la cámara propia: el registro abre la cámara en celular');
}

console.log('\n════════════════════════════════════════');
console.log(`  RESULTADO: ${pasaron} pasaron · ${fallaron} fallaron`);
console.log('════════════════════════════════════════');
process.exit(fallaron === 0 ? 0 : 1);
