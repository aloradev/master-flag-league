import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';

const lastAlert = new Map<string, number>();
/** Solo códigos controlados, sin correos, tokens, cuerpos ni mensajes del proveedor. */
export async function operationalAlert(code: string): Promise<void> {
  const now = Date.now();
  if (now - (lastAlert.get(code) ?? 0) < 15 * 60_000) return;
  lastAlert.set(code, now);
  console.error(JSON.stringify({ event: 'operational_alert', code, timestamp: new Date(now).toISOString() }));
  const url = process.env.OPERATIONS_WEBHOOK_URL;
  if (!url) return;
  try {
    if (new URL(url).protocol !== 'https:') throw new Error('https required');
    const response = await fetch(url, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(5000),
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: `Master Flag League: ${code}`, code, timestamp: new Date(now).toISOString() }),
    });
    if (!response.ok) throw new Error('webhook failed');
  } catch {
    console.error(JSON.stringify({ event: 'alert_delivery_failed', code }));
  }
}

export const requestTelemetry: RequestHandler = (req, res, next) => {
  const requestId = randomUUID();
  const started = Date.now();
  res.locals.requestId = requestId;
  res.setHeader('X-Request-ID', requestId);
  res.on('finish', () => {
    // No usar originalUrl: recuperación de contraseña lleva un token en la ruta.
    const route = typeof req.route?.path === 'string' ? req.route.path : 'unmatched';
    const durationMs = Date.now() - started;
    console.log(JSON.stringify({ event: 'http_request', requestId, method: req.method,
      route, status: res.statusCode, durationMs }));
    if (res.statusCode >= 500) void operationalAlert('HTTP_5XX');
    else if (durationMs > 10_000) void operationalAlert('HTTP_SLOW');
  });
  next();
};
