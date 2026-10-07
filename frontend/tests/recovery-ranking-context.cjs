const { chromium } = require(process.env.QA_PLAYWRIGHT_PATH || 'playwright');
const assert = require('node:assert/strict');
const base = process.env.QA_BASE_URL || 'http://127.0.0.1:5191';

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  try {
    const fixture = await browser.newContext();
    const cases = [
      ['equipos', 'teams', 'demo_home', '/tabla', 'Ver equipos'],
      ['jugador', 'players', 'demo_player', '/estadisticas', 'Ver estadísticas'],
      ['partido', 'games', 'demo_final', '/jornada', 'Ver jornada'],
      ['jornada', 'round', 'demo_finished', '/jornada', 'Ver jornada'],
    ];
    const data = {};
    for (const [, resource, id] of cases) data[resource] = await fixture.request.get(`${base}/api/v1/public/${resource}/${id}`).then(r => r.json());
    await fixture.close();
    for (const width of [320, 390, 640, 1280]) for (const theme of ['light', 'dark']) {
      const page = await browser.newPage({ viewport: { width, height: 844 }, serviceWorkers: 'block' });
      await page.addInitScript(theme => localStorage.setItem('mfl.theme', theme), theme);
      let status = 404;
      await page.route(/\/public\/(teams|players|games|round)\/qa$/, route => {
        if (status === 0) return route.abort('failed');
        const resource = new URL(route.request().url()).pathname.split('/').at(-2);
        return route.fulfill(status === 200 ? { json: data[resource] } : { status, json: { success: false, error: 'Recurso de prueba no disponible' } });
      });
      await page.route('**/public/scrimmages', route => route.fulfill({ json: { success: true, data: [] } }));
      for (const [screen, , , destination, label] of cases) {
        status = 404;
        await page.goto(`${base}/${screen}/qa`);
        const empty = page.locator('.ui-empty-state');
        const exit = empty.getByRole('link', { name: label, exact: true });
        await exit.waitFor();
        assert.equal(await exit.getAttribute('href'), destination);
        assert.equal(await empty.getByRole('button', { name: 'Reintentar', exact: true }).count(), 0);
        if (screen === 'jugador' && [320, 1280].includes(width)) await page.screenshot({ path: `../.qa-artifacts/not-found-${width}-${theme}.png`, fullPage: true });
        const rect = await exit.boundingBox();
        assert.ok(rect.height >= 44 && rect.x >= 0 && rect.x + rect.width <= width);
        await exit.focus();
        await page.keyboard.press('Enter');
        assert.equal(new URL(page.url()).pathname, destination);
        status = 503;
        await page.goto(`${base}/${screen}/qa`);
        await empty.getByRole('button', { name: 'Reintentar', exact: true }).waitFor();
        status = 200;
        await empty.getByRole('button', { name: 'Reintentar', exact: true }).click();
        await page.locator('.public-page-actions').waitFor();
        assert.equal(await empty.count(), 0);
      }
      const longName = 'Halcones'.repeat(12);
      const player = { player_id: 'p1', player_name: 'Andrea Demo', team_id: 't1', team_name: longName, category_id: 'c1', category_name: 'Mixto', games_played: 3, touchdowns: 4, interceptions: 2 };
      await page.route('**/public/standings', route => route.fulfill({ json: { success: true, data: { season: { id: 's1', name: 'Temporada 2026' }, categories: [{ category: { id: 'c1', name: 'Mixto' }, rows: [] }] } } }));
      await page.route('**/public/statistics/players?*', route => route.fulfill({ json: { success: true, data: [player] } }));
      await page.goto(base + '/estadisticas?categoria=c1&equipo=t1&origen=prueba');
      await page.getByRole('list', { name: 'Ranking de Touchdowns' }).waitFor();
      const context = page.locator('#ranking-context');
      assert.equal(await context.textContent(), `Mixto · ${longName}`);
      assert.equal(await page.locator('section[aria-labelledby=ranking-title]').getAttribute('aria-describedby'), 'ranking-context');
      assert.ok(decodeURIComponent(await page.locator('.public-link-share a').getAttribute('href')).includes(`Mixto · ${longName}`));
      await page.getByLabel('Estadística', { exact: true }).selectOption('interceptions');
      assert.equal(await context.textContent(), `Mixto · ${longName}`);
      await page.reload();
      await page.getByRole('list', { name: 'Ranking de Intercepciones' }).waitFor();
      assert.equal(await context.textContent(), `Mixto · ${longName}`);
      await page.screenshot({ path: `../.qa-artifacts/ranking-context-${width}-${theme}.png`, fullPage: true });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.getByRole('button', { name: 'Limpiar filtros', exact: true }).click();
      assert.equal(await context.textContent(), 'Todas las categorías · Todos los equipos');
      assert.equal(new URL(page.url()).searchParams.get('metrica'), 'interceptions');
      assert.equal(new URL(page.url()).searchParams.get('origen'), 'prueba');
      await page.goto(base + '/estadisticas?categoria=unknown&equipo=unknown');
      await page.getByRole('heading', { name: 'Aún no hay registros para este filtro', exact: true }).waitFor();
      assert.equal(await context.textContent(), 'Categoría no disponible · Equipo no disponible');
      status = 0;
      await page.goto(base + '/jugador/qa');
      await page.locator('.ui-empty-state').getByRole('button', { name: 'Reintentar', exact: true }).waitFor();
      status = 200;
      await page.locator('.ui-empty-state').getByRole('button', { name: 'Reintentar', exact: true }).click();
      await page.getByRole('heading', { name: 'Andrea Demo', exact: true }).waitFor();
      await page.route('**/public/round', route => route.fulfill({ status: 404, json: { success: false, error: 'Sin jornada publicada' } }));
      await page.goto(base + '/jornada');
      await page.getByRole('heading', { name: 'Todavía no hay jornada publicada', exact: true }).waitFor();
      assert.equal(await page.locator('.ui-empty-state').getByRole('link', { name: 'Ver equipos', exact: true }).getAttribute('href'), '/tabla');
      status = 404;
      await page.route('**/public/scrimmages', route => route.fulfill({ json: { success: true, data: [{ ...data.round.data.games[0], game_type: 'SCRIMMAGE' }] } }));
      await page.goto(base + '/jornada/qa');
      await page.getByRole('heading', { name: 'Jornada no encontrada', exact: true }).waitFor();
      await page.getByRole('heading', { name: 'Scrimmages · Hoy', exact: true }).waitFor();
      await page.close();
      console.log(`PASS ${width} ${theme}: four 404 exits, keyboard, 503 retry recovery, ranking scope, unknown IDs, long names, reload and filters.`);
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
