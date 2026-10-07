export const SITE = 'https://master-flag-league.vercel.app';
const pages = {
  '/': ['Master Flag League Cancún', 'Flag football en Cancún: jornadas, resultados, equipos, posiciones e inscripciones.'],
  '/jornada': ['Jornada', 'Horarios, canchas, partidos en vivo y resultados de Master Flag League Cancún.'],
  '/tabla': ['Tabla de posiciones', 'Clasificación, victorias y puntos de los equipos por categoría.'],
  '/estadisticas': ['Estadísticas y líderes', 'Touchdowns, yardas, intercepciones y líderes de la temporada de MFL.'],
  '/jugar': ['Quiero jugar', '¿Buscas equipo de flag football en Cancún? Envía tu solicitud a Master Flag League.'],
  '/registro': ['Registro', 'Crea tu cuenta para formar parte de Master Flag League Cancún.'],
  '/favoritos': ['Favoritos y avisos', 'Tus equipos, jugadores y partidos favoritos de Master Flag League.'],
};
export function publicPath(path) {
  return Object.hasOwn(pages, path) || /^\/(equipos|jugador|partido|jornada)\/[^/?#]+$/.test(path);
}
export function metadata(path, data, origin = SITE, overrides = {}) {
  let [title, description] = pages[path] || ['Master Flag League', 'Flag football en Cancún.'];
  let image = '/logo.webp';
  if (path.startsWith('/equipos/') && data?.team) {
    title = data.team.name; description = `${title} · ${data.team.category_name} · ${data.team.season_name}. Plantilla, partidos y resultados.`;
    image = data.team.logo_url || image;
  } else if (path.startsWith('/jugador/') && data?.full_name) {
    title = data.full_name; description = `${title} · ${data.team_name} · ${data.category_name}. Estadísticas y reconocimientos de temporada.`;
    image = data.avatar_url || image;
  } else if (path.startsWith('/partido/') && data?.home_team_name) {
    const scored = ['LIVE', 'FINISHED', 'WALKOVER'].includes(data.status) && data.home_score != null && data.away_score != null;
    title = `${data.home_team_name} ${scored ? `${data.home_score} - ${data.away_score}` : 'vs'} ${data.away_team_name}`;
    const states = { LIVE: 'En vivo', FINISHED: 'Resultado final', WALKOVER: 'Incomparecencia', SCHEDULED: 'Próximo partido', POSTPONED: 'Pospuesto', CANCELLED: 'Cancelado' };
    description = `${states[data.status] || 'Partido'} · ${data.category_name} · ${data.scheduled_date?.slice(0, 10) || 'Fecha por confirmar'} · ${data.scheduled_time || 'Hora por confirmar'} · ${data.field_name || 'Cancha por confirmar'}.`;
  } else if (path.startsWith('/jornada/') && data?.round) {
    title = `Jornada ${data.round.number}`;
    description = `${data.season?.name || 'MFL'} · ${data.round.scheduled_date?.slice(0, 10) || 'Fecha por confirmar'}. Horarios, canchas y resultados.`;
  }
  title = overrides.title || title; description = overrides.description || description;
  let imageUrl;
  try { imageUrl = new URL(overrides.image || image, origin); }
  catch { imageUrl = new URL('/logo.webp', origin); }
  const safeImage = imageUrl.origin === origin || imageUrl.origin === 'https://res.cloudinary.com';
  return { title: title.startsWith('Master Flag League') ? title : `${title} | Master Flag League Cancún`, description, url: new URL(path, origin).href, image: safeImage ? imageUrl.href : `${origin}/logo.webp`, robots: publicPath(path) && path !== '/favoritos' ? 'index, follow' : 'noindex, nofollow' };
}
export function publicEndpoint(path) {
  const match = /^\/(equipos|jugador|partido|jornada)\/([^/]+)$/.exec(path);
  if (!match) return null;
  const resource = { equipos: 'teams', jugador: 'players', partido: 'games', jornada: 'round' }[match[1]];
  return `/public/${resource}/${encodeURIComponent(decodeURIComponent(match[2]))}`;
}
export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}
export function metadataTags(meta) {
  const tag = (key, value, property = false) => `<meta ${property ? 'property' : 'name'}="${key}" content="${escapeHtml(value)}" />`;
  return `<title>${escapeHtml(meta.title)}</title>\n<link rel="canonical" href="${escapeHtml(meta.url)}" />\n` +
    [tag('description', meta.description), tag('robots', meta.robots), tag('og:type', 'website', true), tag('og:locale', 'es_MX', true), tag('og:site_name', 'Master Flag League', true),
      ...['title', 'description', 'url', 'image'].map(key => tag(`og:${key}`, meta[key], true)), tag('og:image:alt', meta.title, true), tag('twitter:card', 'summary'),
      ...['title', 'description', 'image'].map(key => tag(`twitter:${key}`, meta[key]))].join('\n');
}
