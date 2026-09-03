/**
 * CORS — normalización del origen permitido
 *
 * Este archivo existe por un fallo real: en Render se configuró
 * FRONTEND_URL="https://master-flag-league.vercel.app/" (copiada del
 * navegador, con barra final) y el servicio arrancaba perfectamente pero
 * rechazaba TODAS las peticiones del sitio. El navegador manda
 * `Origin: https://master-flag-league.vercel.app` —sin barra, porque un
 * origen es esquema+host+puerto y nada más (RFC 6454)— y la comparación
 * literal nunca coincidía.
 *
 * Uso:  node tests/cors.mjs        (requiere `npm run build` antes)
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 5199;
const SITIO = 'https://master-flag-league.vercel.app';

const server = spawn(process.execPath, ['dist/index.js'], {
  cwd: ROOT,
  env: {
    PATH: process.env.PATH,
    NODE_ENV: 'production',
    PORT: String(PORT),
    FRONTEND_URL: `${SITIO}/`, // con la barra: es el caso que falló
    DATABASE_URL: 'postgres://u:p@127.0.0.1:1/none', // no se toca la base
    JWT_SECRET: 'x'.repeat(48),
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let salida = '';
server.stdout.on('data', (d) => (salida += d));
server.stderr.on('data', (d) => (salida += d));

const esperarArranque = async () => {
  for (let intento = 0; intento < 40; intento++) {
    try {
      await fetch(`http://127.0.0.1:${PORT}/health`);
      return true;
    } catch {
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  return false;
};

let pasaron = 0;
let fallaron = 0;
const check = (ok, etiqueta, detalle) => {
  console.log(`  ${ok ? '✓' : '✗'} ${etiqueta}`);
  if (detalle) console.log(`      ${detalle}`);
  ok ? pasaron++ : fallaron++;
};

if (!(await esperarArranque())) {
  console.error('❌ El servidor no arrancó:\n' + salida);
  server.kill('SIGKILL');
  process.exit(1);
}

const allowOrigin = async (origin) => {
  const res = await fetch(`http://127.0.0.1:${PORT}/health`, { headers: { Origin: origin } });
  return res.headers.get('access-control-allow-origin');
};

console.log(`\n═══ CORS con FRONTEND_URL="${SITIO}/" ═══`);

check(
  salida.includes(`CORS:         ${SITIO}\n`),
  'El arranque informa el origen ya normalizado (sin barra)'
);
check((await allowOrigin(SITIO)) !== null, 'Acepta el origen tal como lo manda el navegador');
check((await allowOrigin(`${SITIO}/`)) !== null, 'Acepta también el origen con barra final');
check(
  (await allowOrigin('https://Master-Flag-League.vercel.app')) !== null,
  'El host es insensible a mayúsculas'
);
check(
  (await allowOrigin('https://sitio-falso.example')) === null,
  'Un origen ajeno sigue rechazado'
);
check(
  salida.includes('[cors] origen rechazado: https://sitio-falso.example'),
  'El rechazo se registra con el origen y la lista permitida'
);

// Sin cabecera Origin no hay nada que reflejar; lo que importa es que no se bloquee.
const sinOrigin = await fetch(`http://127.0.0.1:${PORT}/health`);
check(sinOrigin.status === 200, 'Sin cabecera Origin (curl, monitor de Render) responde 200');

// El preflight con credenciales es exactamente lo que dispara el login.
const pre = await fetch(`http://127.0.0.1:${PORT}/api/v1/auth/login`, {
  method: 'OPTIONS',
  headers: {
    Origin: SITIO,
    'Access-Control-Request-Method': 'POST',
    'Access-Control-Request-Headers': 'content-type',
  },
});
check(pre.status === 204, `El preflight del login responde 204 (fue ${pre.status})`);
check(
  pre.headers.get('access-control-allow-origin') === SITIO,
  'El preflight devuelve el origen del sitio'
);
check(
  pre.headers.get('access-control-allow-credentials') === 'true',
  'El preflight permite credenciales'
);

server.kill('SIGKILL');

console.log('\n════════════════════════════════════════');
console.log(`  RESULTADO: ${pasaron} pasaron · ${fallaron} fallaron`);
console.log('════════════════════════════════════════');
process.exit(fallaron === 0 ? 0 : 1);
