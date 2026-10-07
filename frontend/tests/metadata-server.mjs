import assert from 'node:assert/strict';
import handler from '../api/page.mjs';
import { metadata, metadataTags, SITE, publicEndpoint } from '../src/lib/pageMetadata.mjs';

const originalFetch = globalThis.fetch;
let response = { status: 200, data: { id: 'game', home_team_name: 'Local <script>', away_team_name: 'Visitante & amigos', home_score: 18, away_score: 6, status: 'FINISHED', category_name: 'Mixto', scheduled_date: '2026-10-06', scheduled_time: '19:00', field_name: 'Cancha 1' } };
const requests = [];
globalThis.fetch = async (url, options) => {
  requests.push(url);
  assert.ok(options.signal);
  return { ok: response.status === 200, status: response.status, json: async () => ({ success: true, data: response.data }) };
};
async function render(path) {
  const output = { statusCode: 200, headers: {}, body: '' };
  const res = { setHeader: (key, value) => { output.headers[key] = value; }, end: value => { output.body = value; }, status: code => { output.statusCode = code; return res; } };
  Object.defineProperty(res, 'statusCode', { get: () => output.statusCode, set: value => { output.statusCode = value; } });
  await handler({ url: `/api/page?path=${encodeURIComponent(path)}` }, res);
  return output;
}
try {
  const game = await render('/partido/game');
  assert.equal(game.statusCode, 200);
  assert.match(game.body, /Local &lt;script&gt; 18 - 6 Visitante &amp; amigos/);
  assert.match(game.body, /property="og:url" content="https:\/\/master-flag-league.vercel.app\/partido\/game"/);
  assert.equal((game.body.match(/<title>/g) || []).length, 1);
  assert.equal((game.body.match(/property="og:title"/g) || []).length, 1);
  assert.match(game.body, /\/assets\/index-.*\.js/);
  assert.match(game.headers['Cache-Control'], /s-maxage=60/);
  assert.ok(requests[0].endsWith('/api/v1/public/games/game'));
  response.data = { ...response.data, status: 'SCHEDULED', home_score: 0, away_score: 0 };
  const scheduled = await render('/partido/game');
  assert.match(scheduled.body, /Local &lt;script&gt; vs Visitante/);
  assert.doesNotMatch(scheduled.body, /0 - 0/);
  response.data = { team: { name: 'Equipo Demo', category_name: 'Mixto', season_name: '2026', logo_url: 'javascript:alert(1)' } };
  const team = await render('/equipos/team');
  assert.match(team.body, /Equipo Demo/);
  assert.doesNotMatch(team.body, /javascript:alert/);
  response.data = { full_name: 'Andrea Demo', team_name: 'Equipo Demo', category_name: 'Mixto', avatar_url: 'https://res.cloudinary.com/demo/image.png' };
  assert.match((await render('/jugador/player')).body, /Andrea Demo/);
  response.status = 404;
  const missing = await render('/jugador/missing');
  assert.equal(missing.statusCode, 404);
  assert.match(missing.body, /noindex, nofollow/);
  assert.equal(missing.headers['Cache-Control'], 'no-store');
  response.status = 500;
  assert.equal((await render('/equipos/team')).statusCode, 503);
  globalThis.fetch = async () => { throw new Error('offline'); };
  assert.equal((await render('/partido/game')).statusCode, 503);
  assert.equal((await render('/admin/usuarios')).statusCode, 404);
  for (const path of ['/', '/jornada', '/tabla', '/estadisticas', '/jugar', '/registro', '/favoritos']) {
    const page = await render(path);
    assert.equal(page.statusCode, 200);
    assert.match(page.body, /property="og:image"/);
  }
  assert.equal(metadata('/admin', undefined).robots, 'noindex, nofollow');
  assert.equal(metadata('/favoritos').robots, 'noindex, nofollow');
  assert.equal(metadata('/tabla?x').url, `${SITE}/tabla?x`);
  assert.equal(publicEndpoint('/equipos/a'), '/public/teams/a');
  assert.doesNotMatch(metadataTags(metadata('/tabla', undefined, undefined, { title: '"><script>alert(1)</script>' })), /<script>/);
  console.log('PASS: HTML inicial, títulos, Open Graph, canonical, imágenes seguras, escape HTML, páginas estáticas, errores 404/503 y rutas privadas.');
} finally { globalThis.fetch = originalFetch; }
