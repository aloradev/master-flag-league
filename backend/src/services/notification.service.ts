import { query } from '../config/database.js';

/**
 * REQ. 31 — NOTIFICACIONES
 *
 * Arquitectura de canales lista para email, WhatsApp y push. Hoy el email
 * está implementado con Resend; los otros canales tienen su punto de
 * extensión marcado. Sin credenciales el sistema registra en consola en
 * lugar de fallar: el flujo del usuario nunca se rompe por una notificación.
 */

export type Channel = 'EMAIL' | 'WHATSAPP' | 'PUSH';

export interface Notification {
  to: string;
  subject: string;
  body: string;
  channel?: Channel;
}

const remitente = (): string => {
  const configurado = (process.env.EMAIL_FROM ?? '')
    .trim()
    .replace(/^['"]|['"]$/g, '')
    .trim();
  return configurado || 'Master Flag League <noreply@masterflagleague.mx>';
};

const remitenteValido = (value: string): boolean =>
  /^(?:[^<>\r\n]+\s*<)?[^<>\s@]+@[^<>\s@]+\.[^<>\s@]+>?$/.test(value);

const sendEmail = async (notification: Notification): Promise<boolean> => {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    console.log(
      `[notificación:pendiente] EMAIL a ${notification.to} — "${notification.subject}"`
    );
    return false;
  }

  const from = remitente();
  if (!remitenteValido(from)) {
    console.error(
      `[notificación] EMAIL_FROM inválido: ${JSON.stringify(from)}. ` +
        'Usa correo@dominio.com o Nombre <correo@dominio.com>.'
    );
    return false;
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [notification.to],
        subject: notification.subject,
        html: notification.body,
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => 'sin detalle');
      console.error(`[notificación] Resend respondió ${response.status}: ${detail}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[notificación] Error de envío:', err instanceof Error ? err.message : err);
    return false;
  }
};

/** Punto de extensión: WhatsApp Business API o Twilio. */
const sendWhatsApp = async (notification: Notification): Promise<boolean> => {
  console.log(`[notificación:no-implementado] WHATSAPP a ${notification.to}`);
  return false;
};

/** Punto de extensión: Firebase Cloud Messaging. */
const sendPush = async (notification: Notification): Promise<boolean> => {
  console.log(`[notificación:no-implementado] PUSH a ${notification.to}`);
  return false;
};

export const send = async (notification: Notification): Promise<boolean> => {
  const channel = notification.channel ?? 'EMAIL';
  if (channel === 'WHATSAPP') return sendWhatsApp(notification);
  if (channel === 'PUSH') return sendPush(notification);
  return sendEmail(notification);
};

// ─────────────────────────── PLANTILLAS ───────────────────────────

const layout = (title: string, content: string): string => `
<div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1f2937">
  <div style="background:linear-gradient(135deg,#667eea,#764ba2);border-radius:12px 12px 0 0;padding:24px;text-align:center">
    <div style="font-size:28px">🏆</div>
    <div style="color:#fff;font-size:18px;font-weight:600;margin-top:4px">Master Flag League</div>
  </div>
  <div style="background:#fff;border:1px solid #e5e7eb;border-top:0;border-radius:0 0 12px 12px;padding:24px">
    <h2 style="margin:0 0 12px;font-size:18px">${title}</h2>
    ${content}
  </div>
  <p style="text-align:center;color:#9ca3af;font-size:12px;margin-top:16px">
    Liga de Flag Football Cancún · Este es un mensaje automático
  </p>
</div>`;

interface StatusChangePayload {
  playerId: string;
  playerName: string;
  teamId: string;
  action: string;
  newStatus: string;
  reason?: string;
}

/**
 * Avisa a los encargados del equipo cuando cambia el estado de un jugador.
 * Se invoca sin await desde el controlador: no debe retrasar la respuesta.
 */
export const notifyPlayerStatusChange = async (
  payload: StatusChangePayload
): Promise<void> => {
  try {
    const managers = await query<{ email: string; name: string }>(
      `SELECT u.email, u.name FROM team_users tu
       JOIN users u ON u.id = tu.user_id
       WHERE tu.team_id = $1 AND u.active = TRUE`,
      [payload.teamId]
    );

    if (managers.rows.length === 0) return;

    const templates: Record<string, { subject: string; content: string }> = {
      APPROVE: {
        subject: `✅ ${payload.playerName} fue aprobado`,
        content: `
          <p><strong>${payload.playerName}</strong> completó su registro y ya está
          <strong style="color:#16a34a">habilitado para jugar</strong>.</p>
          <p>Aparecerá como 🟢 Elegible en la pantalla del árbitro.</p>`,
      },
      REQUEST_CORRECTION: {
        subject: `⚠️ ${payload.playerName} requiere corrección`,
        content: `
          <p>El registro de <strong>${payload.playerName}</strong> necesita una corrección
          antes de poder aprobarse.</p>
          <div style="background:#fef3c7;border-left:4px solid #f59e0b;padding:12px;margin:12px 0">
            <strong>Motivo:</strong><br>${payload.reason ?? 'Sin especificar'}
          </div>
          <p>Entra a tu portal, sube el documento corregido y el registro volverá
          automáticamente a la cola de revisión.</p>`,
      },
      REJECT: {
        subject: `❌ Registro rechazado: ${payload.playerName}`,
        content: `
          <p>El registro de <strong>${payload.playerName}</strong> fue rechazado.</p>
          <div style="background:#fee2e2;border-left:4px solid #ef4444;padding:12px;margin:12px 0">
            <strong>Motivo:</strong><br>${payload.reason ?? 'Sin especificar'}
          </div>
          <p>Puedes volver a cargar la documentación para una nueva revisión.</p>`,
      },
      BLOCK: {
        subject: `⛔ ${payload.playerName} fue bloqueado`,
        content: `
          <p><strong>${payload.playerName}</strong> fue bloqueado por administración.</p>
          ${payload.reason ? `<p><strong>Motivo:</strong> ${payload.reason}</p>` : ''}
          <p>Contacta a la liga para más información.</p>`,
      },
    };

    const template = templates[payload.action];
    if (!template) return;

    await Promise.all(
      managers.rows.map((manager) =>
        send({
          to: manager.email,
          subject: template.subject,
          body: layout(template.subject, template.content),
        })
      )
    );
  } catch (err) {
    console.error('[notificación] Fallo al notificar cambio de estado:', err);
  }
};

/** Da la bienvenida a un usuario nuevo con su contraseña temporal. */
export const notifyNewUser = async (params: {
  email: string;
  name: string;
  temporaryPassword: string;
  roleLabel: string;
}): Promise<void> => {
  await send({
    to: params.email,
    subject: 'Tu acceso a Master Flag League',
    body: layout(
      `Bienvenido, ${params.name}`,
      `<p>Se creó tu cuenta con el rol <strong>${params.roleLabel}</strong>.</p>
       <div style="background:#f3f4f6;border-radius:8px;padding:16px;margin:12px 0">
         <div><strong>Usuario:</strong> ${params.email}</div>
         <div><strong>Contraseña temporal:</strong>
           <code style="font-size:16px">${params.temporaryPassword}</code></div>
       </div>
       <p>Se te pedirá cambiarla al ingresar por primera vez.</p>`
    ),
  });
};
