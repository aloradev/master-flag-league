import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import { query } from '../config/database.js';
import { newPrefixedId } from '../utils/id.js';

/**
 * RESTABLECER CONTRASEÑA.
 *
 * Un solo mecanismo con dos entregas: el propio encargado lo pide desde
 * la pantalla de ingreso y le llega por correo, o administración genera el
 * enlace y lo pega en el grupo de WhatsApp. Lo segundo existe porque el
 * correo depende de tener un dominio verificado en Resend, y el día del
 * arranque no puede haber nadie sin poder entrar por eso.
 *
 * Decisiones que importan:
 *
 * · En la base vive el SHA-256 del token, nunca el token. Una base
 *   filtrada no entrega el acceso a las cuentas. Es hash sin sal ni coste
 *   a propósito: el token son 32 bytes aleatorios, no una contraseña que
 *   alguien pueda adivinar por diccionario, y la búsqueda tiene que ser
 *   un índice y no un recorrido de la tabla.
 * · Un solo uso y una hora de vida.
 * · Pedir uno nuevo invalida los anteriores sin usar: si alguien pidió
 *   dos correos, solo el último sirve.
 */

const VIDA_MINUTOS = 60;

/** SHA-256 en hexadecimal: 64 caracteres, cabe en el índice único. */
const huella = (token: string): string => createHash('sha256').update(token).digest('hex');

export interface TokenCreado {
  token: string;
  expiraEn: Date;
}

/**
 * Crea un token para el usuario. No comprueba si existe ni si está
 * activo: eso lo decide quien llama, porque la respuesta al usuario debe
 * ser idéntica exista o no la cuenta.
 */
export const crearToken = async (
  userId: string,
  creadoPor: string | null = null
): Promise<TokenCreado> => {
  // Los anteriores sin usar dejan de valer.
  await query(
    `UPDATE password_resets SET used_at = NOW()
     WHERE user_id = $1 AND used_at IS NULL`,
    [userId]
  );

  // 32 bytes en base64url: 43 caracteres sin nada que escapar en una URL.
  const token = randomBytes(32).toString('base64url');
  const expiraEn = new Date(Date.now() + VIDA_MINUTOS * 60_000);

  await query(
    `INSERT INTO password_resets (id, user_id, token_hash, expires_at, created_by)
     VALUES ($1, $2, $3, $4, $5)`,
    [newPrefixedId('rst'), userId, huella(token), expiraEn, creadoPor]
  );

  return { token, expiraEn };
};

export interface TokenValido {
  id: string;
  userId: string;
  email: string;
  name: string;
}

/**
 * Comprueba el token SIN gastarlo, para que la pantalla pueda decir
 * "este enlace ya venció" antes de pedirle una contraseña nueva a alguien
 * que va a perderla.
 */
export const validarToken = async (token: string): Promise<TokenValido | null> => {
  if (!token || token.length < 20) return null;

  const result = await query<{
    id: string;
    user_id: string;
    email: string;
    name: string;
    token_hash: string;
  }>(
    `SELECT p.id, p.user_id, u.email, u.name, p.token_hash
     FROM password_resets p
     JOIN users u ON u.id = p.user_id
     WHERE p.token_hash = $1
       AND p.used_at IS NULL
       AND p.expires_at > NOW()
       AND u.active`,
    [huella(token)]
  );

  const fila = result.rows[0];
  if (!fila) return null;

  /**
   * Comparación en tiempo constante aunque la búsqueda ya fue por índice:
   * cuesta nada y evita que una futura reescritura de esta consulta abra
   * un canal de tiempo sin que nadie lo note.
   */
  const a = Buffer.from(fila.token_hash);
  const b = Buffer.from(huella(token));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  return { id: fila.id, userId: fila.user_id, email: fila.email, name: fila.name };
};

/** Marca el token como gastado. Devuelve false si alguien se adelantó. */
export const consumirToken = async (id: string): Promise<boolean> => {
  const result = await query(
    `UPDATE password_resets SET used_at = NOW()
     WHERE id = $1 AND used_at IS NULL`,
    [id]
  );
  return (result.rowCount ?? 0) > 0;
};

/** El enlace que se le entrega a la persona. */
export const enlaceDeRestablecimiento = (token: string): string => {
  const base = (process.env.FRONTEND_URL || 'http://localhost:5173')
    .split(',')[0]
    .trim()
    .replace(/\/+$/, '');
  return `${base}/restablecer?token=${encodeURIComponent(token)}`;
};

/**
 * Freno de peticiones, en memoria.
 *
 * Suficiente aquí: el plan gratuito de Render corre un solo proceso, así
 * que no hay nada que compartir entre instancias, y si el proceso duerme
 * y despierta el contador se reinicia —lo cual no importa, porque el
 * objetivo es cortar un bucle de reintentos, no resistir un ataque
 * distribuido—. Si algún día hay varias instancias, esto se muda a la
 * base o a un contador externo.
 */
const intentos = new Map<string, number[]>();
const VENTANA_MS = 15 * 60_000;

export const demasiadosIntentos = (clave: string, maximo: number): boolean => {
  const ahora = Date.now();
  const previos = (intentos.get(clave) ?? []).filter((t) => ahora - t < VENTANA_MS);
  if (previos.length >= maximo) {
    intentos.set(clave, previos);
    return true;
  }
  previos.push(ahora);
  intentos.set(clave, previos);
  return false;
};
