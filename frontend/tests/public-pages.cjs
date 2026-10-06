const { chromium } = require(process.env.QA_PLAYWRIGHT_PATH || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

const base = process.env.QA_BASE_URL || 'http://127.0.0.1:5184';
const team = { team_id: 'home', team_name: 'Equipo de prueba con nombre largo', short_name: 'MFL', logo_url: null, position: 1, played: 2, wins: 2, draws: 0, losses: 0, point_diff: 20, points_for: 40, points_against: 20, form: ['W', 'W'] };
const game = { id: 'live', category_name: 'Mixto', category_color: null, home_team_id: 'home', away_team_id: 'away', home_team_name: team.team_name, away_team_name: 'Visitantes', home_short_name: 'MFL', away_short_name: 'VIS', home_score: 14, away_score: 6, status: 'LIVE', scheduled_time: '20:00', field_name: 'Campo 1', touchdowns: [] };
const season = { id: 'season', name: 'Temporada de prueba', year: 2026 };
const round = { season, round: { id: 'current', number: 3, scheduled_date: '2026-10-10', status: 'IN_PROGRESS' }, games: [game, { ...game, id: 'next', status: 'SCHEDULED', home_score: null, away_score: null }], byes: [] };

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  try {
    for (const width of [390, 1280]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      page.setDefaultTimeout(15000);
      page.setDefaultNavigationTimeout(15000);
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.route('**/api/v1/**', route => {
        const endpoint = new URL(route.request().url()).pathname;
        let data = [];
        if (endpoint.endsWith('/public/round')) data = round;
        if (endpoint.endsWith('/public/round/previous')) data = { ...round, round: { ...round.round, id: 'previous' }, games: [{ ...game, id: 'final', status: 'FINISHED' }] };
        if (endpoint.endsWith('/public/rounds')) data = { season, rounds: [{ id: 'previous', status: 'FINISHED', scheduled_date: '2026-10-03' }] };
        if (endpoint.endsWith('/public/standings')) data = { season, categories: [{ category: { id: 'mixed', name: 'Mixto' }, rows: [team] }] };
        return route.fulfill({ json: { success: true, data } });
      });
      for (const url of ['/', '/jornada', '/tabla']) {
        console.log(`Checking ${width} ${url}`);
        await page.goto(base + url, { waitUntil: 'domcontentloaded' });
        await page.getByText(team.team_name, { exact: true }).and(page.locator(':visible')).first().waitFor();
        if (url === '/') {
          await page.locator('a[href="/partido/final"]').waitFor();
          await page.locator('#liga-hoy').scrollIntoViewIfNeeded();
        }
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `Overflow: ${url} ${width}`);
        await fs.mkdir(path.resolve(__dirname, '../../.qa-artifacts'), { recursive: true });
        await page.screenshot({ path: path.resolve(__dirname, `../../.qa-artifacts/public-${width}-${url === '/' ? 'home' : url.slice(1)}.png`), fullPage: url !== '/', timeout: 15000, animations: 'disabled' });
      }
      assert.deepEqual(errors, []);
      // An unavailable secondary feed must not hide a loaded round.
      await page.route('**/public/scrimmages', route => route.abort());
      await page.goto(base + '/jornada', { waitUntil: 'domcontentloaded' });
      await page.getByText(team.team_name, { exact: true }).first().waitFor();
      await page.close();
    }
    const page = await browser.newPage();
    page.setDefaultTimeout(15000);
    page.setDefaultNavigationTimeout(15000);
    let failing = true;
    await page.route('**/api/v1/**', route => route.fulfill(failing
      ? { status: 503, json: { success: false, error: 'Servidor temporalmente no disponible' } }
      : { json: { success: true, data: { season, categories: [] } } }));
    await page.goto(base + '/tabla', { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Reintentar', exact: true }).waitFor();
    failing = false;
    await page.getByRole('button', { name: 'Reintentar', exact: true }).click();
    await page.getByText('Todavía no se juega nada', { exact: true }).waitFor();
    await page.close();
    console.log('OK: Home, Jornada y Tabla; 390/1280 px; resultados previos; scrimmages fallidos; recuperación tras error; sin errores de React ni desbordamiento.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
