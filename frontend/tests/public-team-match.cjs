const { chromium } = require(process.env.QA_PLAYWRIGHT_PATH || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const base = process.env.QA_BASE_URL || 'http://127.0.0.1:5190';

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  try {
    for (const width of [320, 390, 1280]) {
      const page = await browser.newPage({ viewport: { width, height: 844 }, acceptDownloads: true });
      page.setDefaultTimeout(15000);
      page.setDefaultNavigationTimeout(15000);
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      const capture = async name => {
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, name);
        await fs.mkdir(path.resolve(__dirname, '../../.qa-artifacts'), { recursive: true });
        await page.screenshot({ path: path.resolve(__dirname, `../../.qa-artifacts/${name}-${width}.png`), fullPage: true, animations: 'disabled', timeout: 15000 });
      };
      await page.goto(base + '/equipos/demo_home', { waitUntil: 'domcontentloaded' });
      await page.getByRole('heading', { name: 'Halcones Demo', exact: true }).waitFor();
      await page.getByRole('link', { name: 'Ver partido', exact: true }).click();
      await page.getByRole('heading', { name: 'Próximo partido', exact: true }).waitFor();
      assert.equal(await page.getByLabel('Sin marcador', { exact: true }).textContent(), 'VS');
      const calendarPromise = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Agregar a mi calendario', exact: true }).click();
      assert.ok((await calendarPromise).suggestedFilename().endsWith('.ics'));
      await capture('match-scheduled');
      await page.getByRole('link').filter({ hasText: 'Halcones Demo' }).click();
      const views = page.getByRole('navigation', { name: 'Vistas del equipo', exact: true });
      await views.getByRole('link', { name: 'Plantilla', exact: true }).click();
      await page.getByRole('link', { name: 'Andrea Demo', exact: true }).waitFor();
      assert.ok(!(await page.locator('main').textContent()).includes('Oculto'));
      await capture('team-roster');
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.getByRole('link', { name: 'Andrea Demo', exact: true }).click();
      await page.getByRole('heading', { name: 'Andrea Demo', exact: true }).waitFor();
      await page.goBack({ waitUntil: 'domcontentloaded' });
      await views.getByRole('link', { name: 'Resultados', exact: true }).click();
      await page.getByRole('link', { name: 'Ver partido', exact: true }).click();
      await page.getByRole('heading', { name: 'Resultado final', exact: true }).waitFor();
      await page.getByLabel('Marcador 18 a 6', { exact: true }).waitFor();
      await page.getByText('MVP ofensivo', { exact: true }).waitFor();
      assert.equal(await page.getByRole('button', { name: 'Agregar a mi calendario', exact: true }).count(), 0);
      await capture('match-final');
      const imagePromise = page.waitForEvent('download');
      await page.locator('.public-share-panel > summary').click();
      await page.getByRole('button', { name: 'Descargar tarjeta', exact: true }).click();
      assert.ok((await imagePromise).suggestedFilename().endsWith('.png'));
      assert.ok((await page.getByRole('link', { name: 'Compartir', exact: true }).getAttribute('href')).includes('demo_final'));
      // Live polling, pending statistics and unavailable pages are independent states.
      const actual = await page.request.get(base + '/api/v1/public/games/demo_final').then(response => response.json());
      await page.route('**/public/games/demo_final', route => route.fulfill({ json: { ...actual, data: { ...actual.data, status: 'LIVE', statistics_status: 'PENDING' } } }));
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.getByText('En vivo · Actualización cada 10 segundos', { exact: true }).waitFor();
      await page.getByText('Estadísticas provisionales del partido en curso.', { exact: true }).waitFor();
      await page.unroute('**/public/games/demo_final');
      await page.route('**/public/games/demo_final', route => route.fulfill({ json: { ...actual, data: { ...actual.data, statistics_status: 'PENDING', players: [] } } }));
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.getByText('Resultado confirmado. Estadísticas individuales pendientes de captura.', { exact: true }).waitFor();
      assert.equal(await page.getByText('MVP ofensivo', { exact: true }).count(), 0);
      await page.goto(base + '/equipos/missing', { waitUntil: 'domcontentloaded' });
      await page.getByRole('heading', { name: 'Equipo no encontrado', exact: true }).waitFor();
      let fail = true;
      await page.route('**/public/teams/demo_home', route => fail ? route.fulfill({ status: 503, json: { success: false, error: 'Sin conexión con el servidor' } }) : route.continue());
      await page.goto(base + '/equipos/demo_home', { waitUntil: 'domcontentloaded' });
      await page.getByRole('button', { name: 'Reintentar', exact: true }).waitFor();
      fail = false;
      await page.getByRole('button', { name: 'Reintentar', exact: true }).click();
      await page.getByRole('heading', { name: 'Halcones Demo', exact: true }).waitFor();
      assert.deepEqual(errors, []);
      console.log(`PASS ${width}px: equipo, plantilla, perfil, resultados, partido, marcador, MVP, calendario, PNG, estados y reintento.`);
      await page.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
