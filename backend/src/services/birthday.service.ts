import { query } from '../config/database.js';
import { send } from './notification.service.js';
import { birthdayContent } from './email-template.service.js';

/** Envía una felicitación por jugador y día; la clave evita duplicados al reiniciar Render. */
export async function sendBirthdayGreetings(now = new Date()): Promise<number> {
  const rows = await query<{ id: string; email: string; name: string }>(`SELECT id, email,
    CONCAT_WS(' ', first_name, last_name_paternal) AS name
    FROM players WHERE status = 'APPROVED' AND removed_at IS NULL AND email IS NOT NULL AND email <> ''
      AND EXTRACT(MONTH FROM date_of_birth) = $1 AND EXTRACT(DAY FROM date_of_birth) = $2`,
    [now.getUTCMonth() + 1, now.getUTCDate()]);
  const date = now.toISOString().slice(0, 10);
  let queued = 0;
  for (const player of rows.rows) {
    const accepted = await send({
      to: player.email,
      subject: '🎉 ¡Feliz cumpleaños, de parte de Master Flag League!',
      body: birthdayContent(player.name),
      dedupeKey: `birthday:${player.id}:${date}`,
      expiresAt: new Date(now.getTime() + 20 * 3600_000),
    });
    if (accepted) queued++;
  }
  return queued;
}
