export const escapeHtml = (value: unknown): string => String(value ?? '').replace(/[&<>"']/g,
  (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));

export function siteUrl(): string {
  const configured = (process.env.FRONTEND_URL || 'https://master-flag-league.vercel.app').split(',')[0].trim();
  const url = new URL(configured);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('FRONTEND_URL inválida');
  return url.origin;
}

/** Tablas y estilos inline para clientes de correo; funciona también sin imágenes. */
export function renderEmail(title: string, content: string): string {
  const base = escapeHtml(siteUrl());
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;background:#eef2f6;color:#172438;font-family:Arial,Helvetica,sans-serif">
<div style="display:none;max-height:0;overflow:hidden">${escapeHtml(title)} · Master Flag League</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef2f6;padding:28px 12px"><tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:20px;overflow:hidden">
<tr><td style="padding:32px 28px;background:#052f49;text-align:center;border-bottom:5px solid #eab308">
<img src="${base}/logo-256.webp" width="104" height="104" alt="Logo de Master Flag League" style="display:block;margin:0 auto 16px;border:0;border-radius:18px">
<p style="margin:0;color:#ffffff;font-size:22px;font-weight:800;letter-spacing:1px">MASTER FLAG LEAGUE</p>
<p style="margin:8px 0 0;color:#a5e4ef;font-size:12px;letter-spacing:2px">TOCHO BANDERA · CANCÚN</p></td></tr>
<tr><td style="padding:32px 28px;font-size:16px;line-height:1.7">
<h1 style="margin:0 0 20px;color:#052f49;font-size:26px;line-height:1.25">${escapeHtml(title)}</h1>${content}
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px 0 12px"><tr><td bgcolor="#087c91" style="border-radius:10px"><a href="${base}" style="display:inline-block;padding:14px 24px;color:#ffffff;font-weight:bold;text-decoration:none">Entrar a mi liga →</a></td></tr></table>
<p style="font-size:13px;color:#64748b">Tu equipo, tus partidos y tu temporada en un solo lugar.</p></td></tr>
<tr><td style="padding:20px 28px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:12px;line-height:1.7;color:#64748b">Master Flag League · Cancún, Quintana Roo<br>Este mensaje es automático. Para recibir ayuda, contacta a la administración de tu liga.</td></tr>
</table></td></tr></table></body></html>`;
}

export function birthdayContent(name: string): string {
  return `<p style="font-size:42px;margin:0 0 8px">🎉 🏈 🎂</p><p>¡Hoy celebramos contigo, <strong>${escapeHtml(name)}</strong>!</p>
  <p>La familia de Master Flag League te desea un cumpleaños lleno de alegría, salud y grandes momentos con las personas que quieres.</p>
  <div style="padding:20px;background:#fef9c3;border-left:4px solid #eab308;border-radius:8px;color:#713f12;font-size:19px;font-weight:bold">Que este nuevo año venga con nuevas metas, buenas jugadas y muchas razones para celebrar.</div>
  <p>Gracias por ser parte de nuestra comunidad. ¡Nos vemos en el campo!</p>
  <p style="font-size:12px;color:#64748b">Recibes esta felicitación porque autorizaste los correos de cumpleaños en tu registro. Puedes pedir a tu manager o a administración que desactive esa opción.</p>`;
}
