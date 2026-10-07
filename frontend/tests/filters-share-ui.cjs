const { chromium } = require(process.env.QA_PLAYWRIGHT_PATH || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const base = process.env.QA_BASE_URL || 'http://127.0.0.1:5191';

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  const output = path.resolve(__dirname, '../../.qa-artifacts');
  await fs.mkdir(output, { recursive: true });
  try {
    for (const width of [320, 390, 640, 1280]) for (const theme of ['light', 'dark']) {
      const context = await browser.newContext({ viewport: { width, height: 900 } });
      await context.addInitScript(theme => localStorage.setItem('mfl.theme', theme), theme);
      const page = await context.newPage();
      page.setDefaultTimeout(15000);
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      const round = await page.request.get(base + '/api/v1/public/round/demo_finished').then(response => response.json());
      const first = { ...round.data.games[0], field_name: 'Cancha principal con nombre largo', status: 'FINISHED' };
      await page.route('**/public/round/demo_finished', route => route.fulfill({ json: { ...round, data: { ...round.data, games: [first, { ...first, id: 'other', category_name: 'Mixto', field_name: 'Cancha 2', status: 'SCHEDULED' }] } } }));
      await page.goto(base + '/jornada/demo_finished?agrupar=cancha&origen=prueba');
      const filters = page.getByRole('region', { name: 'Filtros de la jornada', exact: true });
      await filters.getByText('Sin filtros activos', { exact: true }).waitFor();
      assert.equal(await filters.getByRole('button', { name: 'Limpiar filtros', exact: true }).isDisabled(), true);
      await page.getByLabel('Categoría', { exact: true }).selectOption(first.category_name);
      await filters.getByText('1 activo', { exact: true }).waitFor();
      await page.getByLabel('Cancha', { exact: true }).selectOption(first.field_name);
      await filters.getByText('2 activos', { exact: true }).waitFor();
      await page.getByLabel('Estado', { exact: true }).selectOption('LIVE');
      await filters.getByText('3 activos', { exact: true }).waitFor();
      await page.getByRole('heading', { name: 'No hay partidos para estos filtros', exact: true }).waitFor();
      await page.reload();
      await filters.getByText('3 activos', { exact: true }).waitFor();
      await page.screenshot({ path: path.join(output, `filters-round-${width}-${theme}.png`), fullPage: true });
      await filters.getByRole('button', { name: 'Limpiar filtros', exact: true }).click();
      const url = new URL(page.url());
      assert.equal(url.pathname, '/jornada/demo_finished');
      assert.equal(url.searchParams.get('agrupar'), 'cancha');
      assert.equal(url.searchParams.get('origen'), 'prueba');
      for (const key of ['categoria', 'cancha', 'estado']) assert.equal(url.searchParams.has(key), false);
      assert.equal(await page.getByLabel('Agrupar por', { exact: true }).inputValue(), 'cancha');
      const standings = await page.request.get(base + '/api/v1/public/standings').then(response => response.json());
      const category = standings.data.categories.find(group => group.rows.length).category;
      const player = { player_id: 'demo_player', player_name: 'Andrea Demo', team_id: 'demo_home', team_name: 'Equipo con nombre largo de prueba', category_id: category.id, category_name: category.name, games_played: 2, touchdowns: 3, interceptions: 2 };
      await page.route('**/public/statistics/players?*', route => route.fulfill({ json: { success: true, data: [player] } }));
      await page.goto(base + '/estadisticas?metrica=interceptions&origen=prueba');
      const statsFilters = page.getByRole('region', { name: 'Filtros de estadísticas', exact: true });
      await page.getByRole('list', { name: 'Ranking de Intercepciones' }).waitFor();
      await page.getByLabel('Categoría', { exact: true }).selectOption(category.id);
      await page.getByLabel('Equipo', { exact: true }).selectOption('demo_home');
      await statsFilters.getByText('2 activos', { exact: true }).waitFor();
      await page.reload();
      await statsFilters.getByText('2 activos', { exact: true }).waitFor();
      await statsFilters.getByRole('button', { name: 'Limpiar filtros', exact: true }).click();
      assert.equal(new URL(page.url()).searchParams.get('metrica'), 'interceptions');
      assert.equal(new URL(page.url()).searchParams.get('origen'), 'prueba');
      assert.equal(await page.getByLabel('Estadística', { exact: true }).inputValue(), 'interceptions');
      const panel = page.locator('.public-share-panel');
      assert.equal(await panel.getAttribute('open'), null);
      assert.equal(await page.getByRole('button', { name: 'Vista previa', exact: true }).isVisible(), false);
      const summary = panel.locator('summary');
      await summary.focus();
      await page.keyboard.press('Enter');
      await page.getByRole('button', { name: 'Vista previa', exact: true }).click();
      await page.getByRole('img', { name: /^Vista previa:/ }).waitFor();
      await page.getByLabel('Estadística', { exact: true }).selectOption('touchdowns');
      await page.getByRole('list', { name: 'Ranking de Touchdowns' }).waitFor();
      await page.getByRole('img', { name: /^Vista previa:/ }).waitFor({ state: 'hidden' });
      await page.getByRole('button', { name: 'Vista previa', exact: true }).click();
      await page.getByRole('img', { name: /Vista previa: Líderes · Touchdowns/ }).waitFor();
      await summary.click();
      assert.equal(await panel.getAttribute('open'), null);
      await summary.click();
      assert.equal(await page.getByRole('img', { name: /^Vista previa:/ }).count(), 0);
      await summary.click();
      await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo(0, 0); });
      await page.screenshot({ path: path.join(output, `filters-stats-${width}-${theme}.png`), fullPage: true });
      for (const route of ['/partido/demo_final', '/jugador/demo_player', '/tabla']) {
        await page.goto(base + route);
        const share = page.locator('.public-share-panel').first();
        await share.locator('summary').waitFor();
        assert.equal(await share.getAttribute('open'), null);
        await share.locator('summary').click();
        await share.getByLabel('Formato', { exact: true }).selectOption('square');
        await share.getByRole('button', { name: 'Vista previa', exact: true }).click();
        const image = share.getByRole('img', { name: /^Vista previa:/ });
        await image.waitFor(); await image.evaluate(image => image.decode());
        assert.deepEqual(await image.evaluate(image => [image.naturalWidth, image.naturalHeight]), [1080, 1080]);
        if (route === '/partido/demo_final') {
          await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo(0, 0); });
          await page.screenshot({ path: path.join(output, `share-open-${width}-${theme}.png`), fullPage: true });
        }
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
      }
      assert.deepEqual(errors, []);
      console.log(`PASS ${width}px ${theme}: filtros, contador, limpieza sin perder agrupación/métrica, URL y recarga; panel cerrado, teclado, vista previa e invalidación.`);
      await context.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
