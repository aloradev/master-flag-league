import { query } from '../config/database.js';
import { enqueueEmail, drainEmailQueue } from './email-queue.service.js';
import { operationalAlert } from './operations.service.js';
import { escapeHtml as e, renderEmail, siteUrl } from './email-template.service.js';

export type Channel = 'EMAIL' | 'WHATSAPP' | 'PUSH';
export interface Notification {
  to: string; subject: string; body: string; channel?: Channel; dedupeKey?: string; expiresAt?: Date;
}

/** Con executor, el correo forma parte de la transacción y sus fallos hacen rollback. */
export async function send(notification: Notification, executor?: typeof query): Promise<boolean> {
  try {
    if (notification.channel && notification.channel !== 'EMAIL') throw new Error('Canal no implementado');
    const from = (process.env.EMAIL_FROM || 'Master Flag League <noreply@masterflagleague.mx>').trim().replace(/^['"]|['"]$/g, '').trim();
    if (!/^(?:[^<>\r\n]+\s*<)?[^<>\s@]+@[^<>\s@]+\.[^<>\s@]+>?$/.test(from)) throw new Error('Remitente inválido');
    await enqueueEmail({ from, to: [notification.to], subject: notification.subject,
      html: renderEmail(notification.subject, notification.body) },
      { dedupeKey: notification.dedupeKey, expiresAt: notification.expiresAt }, executor);
    if (!executor) void drainEmailQueue();
    return true;
  } catch (error) {
    if (executor) throw error;
    void operationalAlert('EMAIL_ENQUEUE_FAILED');
    return false;
  }
}

interface StatusChangePayload {
  playerId: string; playerName: string; teamId: string; action: string; newStatus: string; reason?: string;
}
export async function notifyPlayerStatusChange(payload: StatusChangePayload, executor: typeof query): Promise<void> {
  const managers = await executor(`SELECT DISTINCT u.email FROM team_users tu JOIN users u ON u.id = tu.user_id
    WHERE tu.team_id = $1 AND u.active = TRUE`, [payload.teamId]);
  const titles: Record<string, string> = { APPROVE: 'Registro aprobado', REQUEST_CORRECTION: 'Tu registro necesita una corrección',
    REJECT: 'Actualización de tu registro', BLOCK: 'Registro bloqueado' };
  const title = titles[payload.action];
  if (!title) return;
  const body = `<p>Tenemos una actualización sobre <strong>${e(payload.playerName)}</strong>.</p>
    <p>Estado: <strong>${e(payload.newStatus)}</strong>.</p>
    ${payload.reason ? `<div style="padding:16px;background:#fff7ed;border-left:4px solid #eab308"><strong>Motivo:</strong><br>${e(payload.reason)}</div>` : ''}
    <p>${payload.action === 'APPROVE' ? 'El registro fue aprobado. Ya puedes consultar su elegibilidad en la aplicación.' : 'Entra al registro del jugador para revisar los detalles. Si se solicitó corrección, carga el documento actualizado.'}</p>`;
  for (const manager of managers.rows) await send({ to: manager.email, subject: title, body }, executor);
}

export async function notifyNewUser(params: { email: string; name: string; temporaryPassword?: string; roleLabel: string }, executor: typeof query): Promise<void> {
  await send({ to: params.email, subject: 'Bienvenido a Master Flag League',
    body: `<p>Hola <strong>${e(params.name)}</strong>, ¡ya eres parte de la liga!</p>
      <p>Tu cuenta tiene el rol <strong>${e(params.roleLabel)}</strong>.</p>
      <div style="padding:20px;background:#f1f5f9;border-radius:12px"><strong>Usuario:</strong> ${e(params.email)}
      ${params.temporaryPassword ? `<p><strong>Contraseña temporal:</strong> <code>${e(params.temporaryPassword)}</code></p>` : ''}</div>
      <p>${params.temporaryPassword ? 'Cambia tu contraseña al ingresar por primera vez. No compartas este correo.' : 'Ingresa con la contraseña que se configuró para tu cuenta.'}</p>` }, executor);
}

export async function notifyRoundPublished(params: { seasonId: string; roundId: string; roundName: string; scheduledDate: string }, executor: typeof query): Promise<void> {
  const managers = await executor(`SELECT DISTINCT u.email, u.name FROM team_users tu
    JOIN users u ON u.id = tu.user_id JOIN teams t ON t.id = tu.team_id
    WHERE t.season_id = $1 AND u.active = TRUE`, [params.seasonId]);
  for (const manager of managers.rows) await send({ to: manager.email,
    dedupeKey: `round-published:${params.roundId}:${manager.email.toLowerCase()}`,
    subject: `${params.roundName} ya está publicada`,
    body: `<p>Hola ${e(manager.name)}, ¡es momento de preparar al equipo!</p>
      <p>La jornada del <strong>${e(params.scheduledDate)}</strong> ya está disponible.</p>
      <p>Revisa tu rival, campo, horario y árbitros antes de salir.</p>
      <p><a href="${e(siteUrl())}/jornada" style="color:#087c91;font-weight:bold">Consultar los partidos de la jornada →</a></p>` }, executor);
}
