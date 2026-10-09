export type SocialFormat = 'portrait' | 'story' | 'square';
export interface SocialCardData {
  title: string; subtitle: string; lines: string[]; url: string;
  table?: { headers: string[]; rows: string[][] };
  tableNotes?: string[];
  match?: { home: { name: string; score: number | null; logo?: string | null }; away: { name: string; score: number | null; logo?: string | null } };
}
export const socialSize = (format: SocialFormat) => ({ width: 1080, height: format === 'story' ? 1920 : format === 'square' ? 1080 : 1350 });
export const socialPages = (data: SocialCardData, format: SocialFormat) => {
  const capacity = data.table ? Math.max(1, Math.floor((socialSize(format).height - 570 - (data.tableNotes?.length ? 190 : 0)) / 64)) : 7;
  const count = data.table?.rows.length ?? data.lines.length;
  return { capacity, count: Math.max(1, Math.ceil(count / capacity)) };
};

export async function renderSocialCard(data: SocialCardData, format: SocialFormat, page = 0): Promise<Blob> {
  const size = socialSize(format);
  const canvas = document.createElement('canvas');
  canvas.width = size.width; canvas.height = size.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No se pudo crear la imagen.');
  const ink = '#101719', cyan = '#007d89', pink = '#d52166';
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, size.width, size.height);
  ctx.fillStyle = cyan; ctx.fillRect(0, 0, size.width, 16);
  ctx.fillStyle = pink; ctx.fillRect(0, 16, 280, 8);
  // Text fits its assigned box, including a single unusually long word.
  const text = (value: string, x: number, y: number, width: number, height: number, fontSize: number, color = ink, align: CanvasTextAlign = 'left') => {
    let lines: string[] = [];
    let font = fontSize;
    for (; font >= 14; font = Math.max(14, font - 1)) {
      ctx.font = `800 ${font}px Arial`;
      lines = [''];
      for (const word of value.trim().split(/\s+/)) {
        const last = lines.length - 1;
        const candidate = lines[last] ? `${lines[last]} ${word}` : word;
        if (ctx.measureText(candidate).width <= width) lines[last] = candidate;
        else {
          if (lines[last]) lines.push('');
          for (const character of Array.from(word)) {
            const current = lines.length - 1;
            if (lines[current] && ctx.measureText(lines[current] + character).width > width) lines.push(character);
            else lines[current] += character;
          }
        }
      }
      if (lines.length * font * 1.25 <= height || font === 14) break;
    }
    ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'top';
    const maxLines = Math.max(1, Math.floor(height / (font * 1.25)));
    lines.slice(0, maxLines).forEach((line, index) => ctx.fillText(line, align === 'center' ? x + width / 2 : x, y + index * font * 1.25, width));
    ctx.textAlign = 'left';
  };
  const picture = async (url: string | null | undefined, name: string, x: number, y: number, dimension: number) => {
    if (url) {
      try {
        const img = new Image(); img.crossOrigin = 'anonymous';
        const loaded = new Promise<void>((resolve, reject) => { img.onload = () => resolve(); img.onerror = () => reject(new Error('Imagen no disponible')); });
        img.src = url;
        let timer: ReturnType<typeof setTimeout> | undefined;
        try { await Promise.race([loaded, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Imagen no disponible')), 4000); })]); }
        finally { clearTimeout(timer); }
        const scale = Math.min(dimension / img.width, dimension / img.height);
        ctx.drawImage(img, x + (dimension - img.width * scale) / 2, y + (dimension - img.height * scale) / 2, img.width * scale, img.height * scale);
        return;
      } catch { /* Keep a readable identity when a remote logo is unavailable. */ }
    }
    ctx.fillStyle = '#e8f3f4'; ctx.fillRect(x, y, dimension, dimension);
    text(name.split(/\s+/).filter(Boolean).slice(0, 3).map(word => word[0]).join(''), x + 8, y + dimension / 3, dimension - 16, dimension / 2, 36, cyan, 'center');
  };
  await picture('/logo-256.webp', 'MFL', 56, 48, 86);
  text('MASTER FLAG LEAGUE', 162, 61, 860, 45, 32);
  text('CANCÚN · FLAG FOOTBALL', 162, 106, 860, 30, 21, cyan);
  text(data.title.toUpperCase(), 56, 170, 968, 104, 46);
  text(data.subtitle, 56, 285, 968, 65, 25, cyan);
  const pages = socialPages(data, format);
  const footerY = size.height - 130;
  if (data.table) {
    const table = data.table;
    const weights = table.headers.map((header, index) => index === 1 || /EQUIPO|JUGADOR/i.test(header) ? 4 : 1);
    const unit = 968 / weights.reduce((sum, weight) => sum + weight, 0);
    ctx.fillStyle = '#e6f4f5'; ctx.fillRect(56, 370, 968, 60);
    let x = 56;
    table.headers.forEach((header, index) => { text(header, x + 8, 387, weights[index] * unit - 16, 35, 22, cyan); x += weights[index] * unit; });
    table.rows.slice(page * pages.capacity, (page + 1) * pages.capacity).forEach((row, index) => {
      const y = 438 + index * 64;
      ctx.fillStyle = index % 2 ? '#f3f6f6' : '#ffffff'; ctx.fillRect(56, y, 968, 64);
      let left = 56;
      row.forEach((value, column) => { if (column < weights.length) text(value, left + 8, y + 9, weights[column] * unit - 16, 48, 23); left += (weights[column] ?? 0) * unit; });
    });
    if (data.tableNotes?.length) {
      const noteY = footerY - 190;
      ctx.fillStyle = '#e6f4f5'; ctx.fillRect(56, noteY, 968, 178);
      data.tableNotes.slice(0, 3).forEach((note, index) => text(note, 72, noteY + 10 + index * 54, 936, 50, 20));
    }
  } else if (data.match) {
    const { home, away } = data.match;
    await picture(home.logo, home.name, 180, 380, 150);
    await picture(away.logo, away.name, 750, 380, 150);
    text(home.name, 56, 555, 400, 120, 36, ink, 'center');
    text(away.name, 624, 555, 400, 120, 36, ink, 'center');
    text(home.score != null && away.score != null ? `${home.score} – ${away.score}` : 'VS', 390, 410, 300, 115, 70, cyan, 'center');
    data.lines.slice(3, 6).forEach((line, index) => text(line, 56, 715 + index * 60, 968, 52, 27, ink, 'center'));
  } else {
    const lines = data.lines.slice(page * pages.capacity, (page + 1) * pages.capacity);
    const rowHeight = Math.min(130, (footerY - 395) / Math.max(lines.length, 1));
    lines.forEach((line, index) => {
      const y = 380 + index * rowHeight;
      ctx.fillStyle = index % 2 ? '#f2f6f6' : '#eaf5f5'; ctx.fillRect(56, y, 968, rowHeight - 8);
      text(line, 80, y + 15, 920, rowHeight - 30, 34);
    });
  }
  ctx.fillStyle = ink; ctx.fillRect(0, footerY, size.width, 130);
  text('EL JUEGO NOS UNE.', 56, footerY + 16, 968, 35, 28, '#ffffff');
  text(data.url, 56, footerY + 58, 968, 28, 18, '#8ae3e7');
  text(`${new Date().toLocaleString('es-MX', { timeZone: 'America/Cancun' })} · ${page + 1}/${pages.count}`, 56, footerY + 95, 968, 24, 16, '#ffffff');
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('No se pudo crear la imagen.')), 'image/png'));
}
