import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

import routes from './routes/index.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';
import { healthCheck } from './config/database.js';
import { activeDriver } from './services/storage.service.js';

dotenv.config();

const app = express();
const PORT = parseInt(process.env.PORT || '5000', 10);

// Detrás del proxy de Render, para que req.ip sea la IP real del cliente.
app.set('trust proxy', 1);

const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim());

app.use(
  cors({
    origin: (origin, callback) => {
      // Sin origin: curl, apps móviles, health checks.
      if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
      callback(new Error('Origen no permitido por CORS'));
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

/** Health check. Render lo consulta para saber si el servicio está vivo. */
app.get('/health', async (_req, res) => {
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
