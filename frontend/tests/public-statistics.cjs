const { chromium } = require(process.env.QA_PLAYWRIGHT_PATH || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const base = process.env.QA_BASE_URL || 'http://127.0.0.1:5187';
const season = { id: 'test-season', name: 'Temporada de prueba', year: 2026 };
const categories = ['Mixto', 'Femenil'].map((name, index) => ({ category: { id: `cat-${index}`, name }, rows: [] }));
const player = { player_id: 'one', player_name: 'Andrea Jugadora de prueba', team_id: 'first', team_name: 'Equipo con un nombre muy largo de prueba', category_id: 'cat-0', category_name: 'Mixto', games_played: 3, touchdowns: 3, interceptions: 1 };
const players = [player, { ...player, player_id: 'two', player_name: 'Beatriz Jugadora', team_id: 'second', team_name: 'Segundo equipo', touchdowns: 3, interceptions: 4 }, { ...player, player_id: 'three', player_name: 'Carla Jugadora', touchdowns: 1 }];

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  try {
    for (const width of [320, 390, 1280]) {
      const page = await browser.newPage({ viewport: { width, height: 844 } });
      page.setDefaultTimeout(15000);
      page.setDefaultNavigationTimeout(15000);
      const errors = [];
      const privateRequests = [];
      let failing = false;
      page.on('pageerror', error => errors.push(error.message));
      await page.route('**/api/v1/**', route => {
        const url = new URL(route.request().url());
        if (!url.pathname.includes('/public/')) privateRequests.push(url.pathname);
        let data = [];
        if (url.pathname.endsWith('/standings')) data = { season, categories };
        if (url.pathname.endsWith('/statistics/players')) {
          if (failing) return route.fulfill({ status: 503, json: { success: false, error: 'Servidor temporalmente no disponible' } });
          data = url.searchParams.get('categoryId') === 'cat-1' ? [] : players;
        }
        if (url.pathname.endsWith('/players/one')) data = { ...player, full_name: player.player_name, season_id: season.id, season_name: season.name };
        return route.fulfill({ json: { success: true, data } });
      });
      await page.goto(base + '/estadisticas', { waitUntil: 'domcontentloaded' });
      const nav = page.getByRole('navigation', { name: width < 640 ? 'Navegación pública móvil' : 'Navegación pública', exact: true });
      await nav.getByRole('link', { name: 'Estadísticas', exact: true }).waitFor();
      assert.equal(await nav.getByRole('link', { name: 'Estadísticas', exact: true }).getAttribute('aria-current'), 'page');
      const ranking = page.getByRole('list', { name: 'Ranking de Touchdowns' });
      await ranking.waitFor();
      assert.deepEqual(await ranking.locator('li > span:first-child').allTextContents(), ['1', '1', '3']);
      await page.getByLabel('Estadística', { exact: true }).selectOption('interceptions');
      assert.equal(await page.getByRole('list', { name: 'Ranking de Intercepciones' }).locator('li a').first().textContent(), 'Beatriz Jugadora');
      await page.getByLabel('Equipo', { exact: true }).selectOption('first');
      assert.equal(await page.getByRole('list', { name: 'Ranking de Intercepciones' }).locator('li').count(), 2);
      assert.ok(page.url().includes('equipo=first'));
      assert.ok(decodeURIComponent(await page.locator('.public-link-share a').getAttribute('href')).includes('equipo=first'));
      await fs.mkdir(path.resolve(__dirname, '../../.qa-artifacts'), { recursive: true });
      await page.screenshot({ path: path.resolve(__dirname, `../../.qa-artifacts/statistics-${width}.png`), fullPage: true, animations: 'disabled', timeout: 15000 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
      if (width < 640) {
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        const footer = await page.getByRole('link', { name: 'Acceso para encargados y árbitros' }).boundingBox();
        const bar = await nav.boundingBox();
        assert.ok(footer.y + footer.height <= bar.y, 'Navigation covers footer');
      }
      await page.getByLabel('Categoría', { exact: true }).selectOption('cat-1');
      await page.getByText('Aún no hay registros para este filtro', { exact: true }).waitFor();
      assert.ok(!page.url().includes('equipo='));
      // Reload proves a shared filter URL works without a session or prior cache.
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.getByText('Aún no hay registros para este filtro', { exact: true }).waitFor();
      failing = true;
      await page.goto(base + '/estadisticas?categoria=cat-0', { waitUntil: 'domcontentloaded' });
      await page.getByRole('button', { name: 'Reintentar', exact: true }).waitFor();
      failing = false;
      await page.getByRole('button', { name: 'Reintentar', exact: true }).click();
      await page.getByRole('link', { name: player.player_name, exact: true }).click();
      await page.getByRole('heading', { name: player.player_name, exact: true }).waitFor();
      await nav.getByRole('link', { name: 'Estadísticas', exact: true }).click();
      await page.getByRole('list', { name: 'Ranking de Touchdowns' }).waitFor();
      assert.deepEqual(privateRequests, []);
      assert.deepEqual(errors, []);
      console.log(`OK ${width}px: acceso anónimo, navegación, filtros, empates, enlaces compartidos, error y reintento, perfil y regreso.`);
      await page.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
