/**
 * PRIMERO, antes que nada: este import valida CLOUDINARY_URL antes de que
 * el SDK de Cloudinary se cargue —el SDK lanza al importarse si la URL
 * está mal escrita, y entonces el log solo muestra un stack de Node—.
 * Mover esta línea más abajo devuelve ese fallo.
 */
// Carga .env antes de importar módulos que leen EMAIL_FROM y otras variables
// durante su inicialización. En producción Render ya las inyecta; en local
// esto evita que los servicios queden configurados con valores de respaldo.
import 'dotenv/config';
import { validateEnvironment } from './config/env.js';
import { revisarEsquema, mensajeDeDesfase } from './db/verificar-esquema.js';

import express from 'express';
import cors from 'cors';

import routes from './routes/index.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';
import { healthCheck } from './config/database.js';
import { activeDriver, publicDir, PUBLIC_ROUTE } from './services/storage.service.js';

// Antes de cualquier otra cosa: si falta configuración, mejor no arrancar.
validateEnvironment();

const app = express();
const PORT = parseInt(process.env.PORT || '5000', 10);

// Detrás del proxy de Render, para que req.ip sea la IP real del cliente.
app.set('trust proxy', 1);

// Express anuncia "X-Powered-By: Express" en cada respuesta. No abre
// ninguna puerta por sí solo, pero le dice a quien escanea qué buscar.
app.disable('x-powered-by');

/**
 * El navegador envía el origen sin ruta ni barra final (RFC 6454: esquema,
 * host y puerto, nada más). En el panel de Render, en cambio, es natural pegar
 * la URL copiada del navegador —"https://sitio.app/"— y esa barra hacía que la
 * comparación literal fallara siempre: el servicio arrancaba sano y rechazaba
 * cada petición. Se normaliza con `URL`, que además absorbe las mayúsculas del
 * host y el puerto por omisión, para que el despliegue no dependa de un
 * carácter invisible.
 */
const normalizeOrigin = (value: string): string => {
  try {
    return new URL(value.trim()).origin;
  } catch {
    return value.trim().replace(/\/+$/, '');
  }
};

const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:5173')
  .split(',')
  .map(normalizeOrigin)
  .filter((origin) => origin.length > 0);

app.use(
  cors({
    origin: (origin, callback) => {
      // Sin origin: curl, apps móviles, health checks.
      if (!origin || allowedOrigins.includes(normalizeOrigin(origin))) {
        return callback(null, true);
      }
      /**
       * Se responde sin la cabecera en lugar de lanzar: el navegador bloquea
       * igual, pero el log queda legible y dice qué origen llegó contra qué
       * lista, que es justo el dato que faltaba para diagnosticarlo.
       */
      console.warn(
        `[cors] origen rechazado: ${origin} — permitidos: ${allowedOrigins.join(', ')}`
      );
      callback(null, false);
    },
    credentials: true,
  })
);

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

/**
 * CABECERAS DE SEGURIDAD.
 *
 * A mano y sin `helmet`: son seis cabeceras y una dependencia menos que
 * auditar. Antes solo estaban tres.
 *
 * Notas de las que importan:
 *
 * · `Content-Security-Policy` con todo en `'none'`. Esto es una API que
 *   responde JSON y sirve imágenes; no ejecuta scripts, no carga estilos
 *   y no debe poder ser incrustada. Si algún día una respuesta acabara
 *   reflejando HTML del usuario, esta política impide que ese HTML
 *   ejecute nada. La interfaz vive en otro dominio (Vercel) y lleva su
 *   propia política en `vercel.json`.
 * · `Strict-Transport-Security` solo con NODE_ENV=production: en
 *   desarrollo se trabaja sobre http://localhost, y una cabecera HSTS
 *   servida ahí deja el navegador forzando https contra localhost para
 *   todo lo demás que se desarrolle en esa máquina. Se arregla borrando
 *   el estado del navegador, y es un rato perdido evitable.
 * · `X-Frame-Options: DENY` se conserva junto a `frame-ancestors` porque
 *   navegadores viejos no entienden la directiva de CSP.
 */
const enProduccion = process.env.NODE_ENV === 'production';

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'none'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"
  );
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');

  /**
   * CORP protege contra lecturas entre orígenes de recursos que se
   * piden SIN CORS —una etiqueta <img>, por ejemplo—. El JSON de la API
   * viaja con CORS y no le afecta, pero los avatares y escudos de
   * `/media` sí: la interfaz vive en Vercel y los carga con <img> desde
   * el dominio de Render, que es otro sitio. Con `same-site` a secas,
   * los escudos dejarían de aparecer en modo local sin un solo error
   * visible. Por eso esa carpeta —y solo esa, que son derivados
   * públicos de 512 px hechos para incrustarse— se marca cross-origin.
   */
  const esMediaPublico = req.path.startsWith(`${PUBLIC_ROUTE}/`);
  res.setHeader('Cross-Origin-Resource-Policy', esMediaPublico ? 'cross-origin' : 'same-site');

  if (enProduccion) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
});

/**
 * Archivos públicos: avatares derivados y logos de equipo.
 *
 * Solo en modo local. Con Cloudinary configurado los sirve su CDN y esta
 * ruta queda sin uso. Nunca expone el directorio privado: son dos
 * carpetas distintas y aquí solo se monta la pública.
 */
if (activeDriver() === 'local') {
  app.use(
    PUBLIC_ROUTE,
    express.static(publicDir(), {
      // Los derivados llevan nombre aleatorio y nunca se sobrescriben,
      // así que se pueden cachear de forma agresiva.
      maxAge: '30d',
      immutable: true,
      index: false,
      dotfiles: 'deny',
    })
  );
}

/**
 * Health check en dos niveles, y la distinción importa por costo.
 *
 * GET /health          → solo confirma que el proceso responde.
 * GET /health?db=1     → además verifica la conexión a la base.
 *
 * Neon apaga el cómputo tras 5 minutos de inactividad y el plan gratuito
 * da ~400 horas al mes. Un monitor que evita que Render se duerma
 * consulta cada 14 minutos; si ese ping tocara la base, la despertaría
 * ~100 veces al día y cada despertar cuesta un mínimo de 5 minutos de
 * cómputo: unas 260 horas mensuales gastadas en no hacer nada.
 *
 * Por eso el chequeo profundo es opt-in: el monitor usa /health y solo
 * un diagnóstico manual pide ?db=1.
 */
app.get('/health', async (req, res) => {
  const checkDatabase = req.query.db === '1' || req.query.db === 'true';

  if (!checkDatabase) {
    return res.json({
      status: 'OK',
      storage: activeDriver(),
      timestamp: new Date().toISOString(),
    });
  }

  const dbOk = await healthCheck();
  res.status(dbOk ? 200 : 503).json({
    status: dbOk ? 'OK' : 'DEGRADED',
    database: dbOk ? 'connected' : 'unreachable',
    storage: activeDriver(),
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/v1', (_req, res) => {
  res.json({
    name: 'Master Flag League API',
    version: '1.0.0',
    phase: 'FASE 1 — CORE',
  });
});

app.use('/api/v1', routes);

app.use(notFound);
app.use(errorHandler);

/**
 * Se comprueba el esquema ANTES de aceptar peticiones.
 *
 * Un desfase entre el código y la base no se nota al arrancar: se nota
 * cuando alguien abre la pantalla de equipos y recibe "Error interno del
 * servidor". Reportado tal cual: "ya no me carga los equipos", después de
 * desplegar la baja de jugadores sin correr migraciones.
 *
 * En producción se aborta, para que el desfase salga en el log del
 * despliegue y no en la cara de un encargado. En desarrollo solo avisa:
 * quien está trabajando en el esquema no necesita que le cierren el
 * servidor en la cara.
 */
const comprobarBase = async () => {
  try {
    const faltantes = await revisarEsquema();
    if (faltantes.length === 0) return;

    if (process.env.NODE_ENV === 'production') {
      console.error(mensajeDeDesfase(faltantes));
      process.exit(1);
    }
    console.warn(mensajeDeDesfase(faltantes));
  } catch (err) {
    // Si no se puede ni preguntar, el problema es la conexión y de eso ya
    // avisa el healthcheck. No se impide arrancar por no poder revisar.
    console.warn(
      '⚠️  No se pudo comprobar el esquema:',
      err instanceof Error ? err.message : err
    );
  }
};

await comprobarBase();

app.listen(PORT, () => {
  console.log(`\n🏆 Master Flag League API`);
  console.log(`   Puerto:       ${PORT}`);
  console.log(`   Entorno:      ${process.env.NODE_ENV || 'development'}`);
  console.log(`   Almacenaje:   ${activeDriver()}`);
  console.log(`   CORS:         ${allowedOrigins.join(', ')}\n`);
});

export default app;
