import type { Response } from 'express';
import { query } from '../config/database.js';
import { comparePassword, hashPassword, validatePassword } from '../utils/password.js';
import { generateTokens, verifyToken } from '../utils/jwt.js';
import { AppError, asyncHandler } from '../middleware/errorHandler.js';
import { audit } from '../services/audit.service.js';
import type { AuthRequest } from '../middleware/auth.js';
import {
  crearToken,
  validarToken,
  consumirToken,
  enlaceDeRestablecimiento,
} from '../services/password-reset.service.js';
import {
  demasiadosIntentos,
  estaFrenado,
  registrarFallo,
  limpiarFallos,
} from '../services/freno.service.js';
import { send as enviarNotificacion } from '../services/notification.service.js';

interface UserRow {
  id: string;
  email: string;
  name: string;
  password_hash: string;
  active: boolean;
  league_id: string | null;
  role_name: string;
  permissions: Record<string, string[]>;
  must_change_password: boolean;
}

const teamsForUser = async (userId: string) => {
  const result = await query(
    `SELECT t.id, t.name, t.logo_url, t.color_primary,
            c.name AS category_name, tu.role AS manager_role
     FROM team_users tu
     JOIN teams t ON t.id = tu.team_id
     JOIN categories c ON c.id = t.category_id
     WHERE tu.user_id = $1
     ORDER BY c.name, t.name`,
    [userId]
  );
  return result.rows;
};

const findUserByEmail = async (email: string) => {
  const result = await query<UserRow>(
    `SELECT u.id, u.email, u.name, u.password_hash, u.active, u.league_id,
            u.must_change_password, r.name AS role_name, r.permissions
     FROM users u
     JOIN roles r ON r.id = u.role_id
     WHERE LOWER(u.email) = LOWER($1)`,
    [email]
  );
  return result.rows[0] ?? null;
};

/** POST /api/v1/auth/login */
export const login = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { email, password } = req.body ?? {};

  if (!email || !password) {
    throw new AppError('Email y contraseña son obligatorios', 400);
  }

  /**
   * FRENO DE INTENTOS.
   *
   * `/auth/login` es público y la política de contraseña admite ocho
   * caracteres con una letra y un número: probar contraseñas contra el
   * correo de un encargado era gratis y sin tope.
   *
   * Se cuentan solo los intentos FALLIDOS y se limpian al entrar bien.
   * Esa es la diferencia entre un freno y una forma de dejar a alguien
   * fuera: si contara todos los intentos, cualquiera podría bloquear la
   * cuenta de un encargado escribiendo su correo con contraseñas
   * inventadas hasta el tope.
   *
   * Los dos topes protegen cosas distintas y por eso son muy distintos:
   *
   * · Por CORREO, 10 en 15 minutos. Es lo que detiene el ataque que
   *   importa —probar contraseñas contra una cuenta concreta— y 10 deja
   *   sitio de sobra a quien de verdad no se acuerda de la suya.
   * · Por ORIGEN, 60. Sirve contra el barrido de muchos correos, y ese
   *   tiene que ser holgado: en la cancha los encargados comparten el
   *   WiFi del campo o el NAT de la misma operadora, así que un tope
   *   bajo por origen dejaría fuera a un equipo entero por los dedazos
   *   de tres personas. Un barrido de verdad necesita miles de intentos,
   *   así que 60 sigue cortándolo.
   */
  const correoNormalizado = String(email).trim().toLowerCase();
  const clavePorCorreo = `login:${correoNormalizado}`;
  const clavePorOrigen = `login-ip:${req.ip ?? 'sin-ip'}`;

  if (estaFrenado(clavePorCorreo, 10) || estaFrenado(clavePorOrigen, 60)) {
    throw new AppError(
      'Demasiados intentos fallidos. Espera unos minutos y vuelve a probar, ' +
        'o usa "Olvidé mi contraseña".',
      429
    );
  }

  const user = await findUserByEmail(email);

  // Mensaje idéntico para usuario inexistente y contraseña incorrecta:
  // no revela qué correos están registrados.
  const invalid = new AppError('Credenciales incorrectas', 401);
  const apuntarFallo = () => {
    registrarFallo(clavePorCorreo);
    registrarFallo(clavePorOrigen);
  };

  if (!user) {
    apuntarFallo();
    throw invalid;
  }

  const passwordOk = await comparePassword(password, user.password_hash);
  if (!passwordOk) {
    apuntarFallo();
    throw invalid;
  }

  // Entró: los fallos de ESTE correo se olvidan. Los del origen no, para
  // que un barrido no se limpie acertando una sola cuenta.
  limpiarFallos(clavePorCorreo);

  if (!user.active) {
    throw new AppError('Esta cuenta está desactivada. Contacta a administración.', 403);
  }

  const tokens = generateTokens({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role_name,
    leagueId: user.league_id,
  });

  await query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]);
  const teams = await teamsForUser(user.id);

  res.json({
    success: true,
    data: {
      ...tokens,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role_name,
        permissions: user.permissions,
        leagueId: user.league_id,
        mustChangePassword: user.must_change_password,
        teams,
      },
    },
  });
});

/** GET /api/v1/auth/me */
export const me = asyncHandler(async (req: AuthRequest, res: Response) => {
  const result = await query(
    `SELECT u.id, u.email, u.name, u.phone, u.league_id, u.must_change_password,
            r.name AS role, r.label AS role_label, r.permissions
     FROM users u JOIN roles r ON r.id = u.role_id
     WHERE u.id = $1 AND u.active = TRUE`,
    [req.user!.id]
  );

  const user = result.rows[0];
  if (!user) throw new AppError('Usuario no encontrado o inactivo', 404);

  const teams = await teamsForUser(req.user!.id);

  res.json({ success: true, data: { ...user, teams } });
});

/** POST /api/v1/auth/refresh */
export const refresh = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { refreshToken } = req.body ?? {};
  if (!refreshToken) throw new AppError('refreshToken es obligatorio', 400);

  const payload = verifyToken(refreshToken);
  if (!payload) throw new AppError('Token de refresco inválido o expirado', 401);

  const result = await query<{ active: boolean; role_name: string }>(
    `SELECT u.active, r.name AS role_name FROM users u
     JOIN roles r ON r.id = u.role_id WHERE u.id = $1`,
    [payload.id]
  );

  const current = result.rows[0];
  if (!current?.active) throw new AppError('Cuenta desactivada', 403);

  res.json({
    success: true,
    data: generateTokens({
      id: payload.id,
      email: payload.email,
      name: payload.name,
      // El rol se relee de la base: si cambió, el token nuevo ya lo refleja.
      role: current.role_name,
      leagueId: payload.leagueId,
    }),
  });
});

/** POST /api/v1/auth/change-password */
export const changePassword = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { currentPassword, newPassword } = req.body ?? {};
  if (!currentPassword || !newPassword) {
    throw new AppError('Contraseña actual y nueva son obligatorias', 400);
  }

  const check = validatePassword(newPassword);
  if (!check.valid) {
    throw new AppError('La nueva contraseña no cumple los requisitos', 400, check.errors);
  }

  const result = await query<{ password_hash: string }>(
    'SELECT password_hash FROM users WHERE id = $1',
    [req.user!.id]
  );
  const user = result.rows[0];
  if (!user) throw new AppError('Usuario no encontrado', 404);

  const ok = await comparePassword(currentPassword, user.password_hash);
  if (!ok) throw new AppError('La contraseña actual es incorrecta', 401);

  await query(
    `UPDATE users SET password_hash = $1, must_change_password = FALSE, updated_at = NOW()
     WHERE id = $2`,
    [await hashPassword(newPassword), req.user!.id]
  );

  await audit(req, { action: 'CHANGE_PASSWORD', entityType: 'user', entityId: req.user!.id });

  res.json({ success: true, message: 'Contraseña actualizada' });
});

/**
 * RESTABLECER CONTRASEÑA — SIN PASAR POR ADMINISTRACIÓN
 *
 * Antes, quien olvidaba su contraseña tenía que escribirle a
 * administración para que le generara una temporal. Con veinte encargados
 * y una jornada el sábado, eso es un cuello de botella.
 *
 * Límite conocido y aceptado: un token de sesión emitido ANTES del cambio
 * sigue siendo válido hasta que expire (8 h). Revocarlo exigiría
 * consultar la base en cada petición —`requireAuth` hoy no toca la base a
 * propósito, y el plan gratuito de Neon cobra un arranque en frío por
 * conexión—. Para una liga local, con ventana de 8 horas, no compensa.
 */

/** POST /api/v1/auth/forgot-password */
export const forgotPassword = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { email } = req.body ?? {};

  /**
   * La respuesta es SIEMPRE la misma, exista el correo o no. Es la misma
   * razón por la que el login no distingue entre "no existe" y
   * "contraseña incorrecta": si aquí dijéramos "ese correo no está
   * registrado", cualquiera podría averiguar quién pertenece a la liga
   * probando correos.
   */
  const respuesta = {
    success: true,
    message:
      'Si ese correo pertenece a una cuenta, te llegará un enlace para ' +
      'restablecer tu contraseña. Revisa también la carpeta de correo no deseado.',
  };

  if (!email || typeof email !== 'string') return res.json(respuesta);

  const correo = email.trim().toLowerCase();

  // Dos frenos: uno por correo, para no inundar a nadie con mensajes; y
  // uno por dirección de origen, para cortar el barrido de correos.
  if (demasiadosIntentos(`correo:${correo}`, 5)) return res.json(respuesta);
  if (demasiadosIntentos(`ip:${req.ip ?? 'sin-ip'}`, 20)) return res.json(respuesta);

  const user = await findUserByEmail(correo);
  if (!user || !user.active) return res.json(respuesta);

  const { token } = await crearToken(user.id, null);
  const enlace = enlaceDeRestablecimiento(token);

  const enviado = await enviarNotificacion({
    to: user.email,
    subject: 'Restablece tu contraseña — Master Flag League',
    body:
      `<p>Hola ${user.name},</p>` +
      `<p>Para poner una contraseña nueva, abre este enlace:</p>` +
      `<p><a href="${enlace}">${enlace}</a></p>` +
      `<p>Vence en una hora y solo sirve una vez. ` +
      `Si no lo pediste, puedes ignorar este correo: tu contraseña no cambia.</p>`,
  });

  /**
   * Si el correo no salió —sin RESEND_API_KEY, o sin dominio verificado—
   * queda en el log del servidor, que es donde administración puede
   * recuperarlo. El usuario no se enteraría de nada, y por eso existe el
   * enlace que genera administración desde la pantalla de usuarios.
   */
  if (!enviado) {
    console.warn(
      `[reset] No se pudo enviar el correo a ${user.email}. ` +
        `Enlace para entregar a mano: ${enlace}`
    );
  }

  res.json(respuesta);
});

/**
 * GET /api/v1/auth/reset-password/:token
 *
 * Comprueba el enlace sin gastarlo. Sin esto, alguien con un enlace
 * vencido escribiría una contraseña nueva, la enviaría y solo entonces se
 * enteraría de que el enlace ya no valía.
 */
export const checkResetToken = asyncHandler(async (req: AuthRequest, res: Response) => {
  const valido = await validarToken(req.params.token ?? '');
  res.json({ success: true, data: { valid: Boolean(valido) } });
});

/** POST /api/v1/auth/reset-password */
export const resetPassword = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { token, password } = req.body ?? {};

  if (!token || !password) {
    throw new AppError('Token y contraseña nueva son obligatorios', 400);
  }

  const check = validatePassword(password);
  if (!check.valid) {
    throw new AppError('La contraseña no cumple los requisitos', 400, check.errors);
  }

  const valido = await validarToken(token);
  if (!valido) {
    throw new AppError(
      'Este enlace ya no sirve: venció o se usó. Pide uno nuevo desde "Olvidé mi contraseña".',
      400
    );
  }

  // Se gasta el token ANTES de cambiar la contraseña: si dos peticiones
  // llegan juntas, solo una pasa de aquí.
  const gastado = await consumirToken(valido.id);
  if (!gastado) {
    throw new AppError('Este enlace ya se usó. Pide uno nuevo.', 400);
  }

  await query(
    `UPDATE users SET password_hash = $1, must_change_password = FALSE, updated_at = NOW()
     WHERE id = $2`,
    [await hashPassword(password), valido.userId]
  );

  /**
   * La auditoría se registra con el usuario dueño de la cuenta, no con la
   * sesión de quien llama —no hay sesión: esta ruta es pública—.
   */
  await audit({ user: { id: valido.userId } } as AuthRequest, {
    action: 'RESET_PASSWORD',
    entityType: 'user',
    entityId: valido.userId,
    newValue: { via: 'enlace' },
  });

  res.json({
    success: true,
    message: 'Contraseña actualizada. Ya puedes ingresar con la nueva.',
  });
});
