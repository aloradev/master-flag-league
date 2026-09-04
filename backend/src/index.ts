/**
 * PRIMERO, antes que nada: este import valida CLOUDINARY_URL antes de que
 * el SDK de Cloudinary se cargue —el SDK lanza al importarse si la URL
 * está mal escrita, y entonces el log solo muestra un stack de Node—.
 * Mover esta línea más abajo devuelve ese fallo.
 */
import { validateEnvironment } from './config/env.js';

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

import routes from './routes/index.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';
import { healthCheck } from './config/database.js';
import { activeDriver, publicDir, PUBLIC_ROUTE } from './services/storage.service.js';

dotenv.config();

// Antes de cualquier otra cosa: si falta configuración, mejor no arrancar.
validateEnvironment();

const app = express();
const PORT = parseInt(process.env.PORT || '5000', 10);

// Detrás del proxy de Render, para que req.ip sea la IP real del cliente.
app.set('trust proxy', 1);

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

// Cabeceras de seguridad mínimas sin dependencias extra.
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
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

app.listen(PORT, () => {
  console.log(`\n🏆 Master Flag League API`);
  console.log(`   Puerto:       ${PORT}`);
  console.log(`   Entorno:      ${process.env.NODE_ENV || 'development'}`);
  console.log(`   Almacenaje:   ${activeDriver()}`);
  console.log(`   CORS:         ${allowedOrigins.join(', ')}\n`);
});

export default app;
