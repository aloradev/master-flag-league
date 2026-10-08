const { chromium } = require(process.env.QA_PLAYWRIGHT_PATH || 'playwright');
const assert = require('node:assert/strict');
const base = process.env.QA_BASE_URL || 'http://127.0.0.1:5191';

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  try {
    for (const width of [320, 390, 640, 1280]) for (const theme of ['light', 'dark']) {
      const page = await browser.newPage({ viewport: { width, height: 900 }, serviceWorkers: 'block', reducedMotion: 'reduce' });
      await page.addInitScript(theme => localStorage.setItem('mfl.theme', theme), theme);
      const round = await page.request.get(base + '/api/v1/public/round/demo_finished').then(r => r.json());
      round.data.games = [{ ...round.data.games[0], status: 'SCHEDULED', touchdowns: [], statistics_status: 'COMPLETE' }];
      const standings = await page.request.get(base + '/api/v1/public/standings').then(r => r.json());
      let release;
      let gate = new Promise(resolve => release = resolve);
      let fail = false;
      await page.route('**/public/round', async route => { await gate; await route.fulfill(fail ? { status: 500, json: { success: false, error: 'Error de prueba' } } : { json: round }); });
      await page.route('**/public/standings', async route => { await gate; await route.fulfill({ json: standings }); });
      await page.route('**/public/rounds', async route => { await gate; await route.fulfill({ json: { success: true, data: { rounds: [] } } }); });
      await page.goto(base);
      await page.locator('.league-loading').first().waitFor();
      assert.equal(await page.locator('.league-loading').count(), 3);
      assert.equal(await page.locator('.league-loading a, .league-loading button').count(), 0);
      assert.equal(await page.getByText('Todavía no hay resultados publicados.', { exact: true }).count(), 0);
      const pending = await page.getByRole('heading', { name: 'Resultados recientes', exact: true }).boundingBox();
      // Measure the former text-only state against the same final data and viewport.
      const baseline = await page.locator('.league-loading').first().evaluate(element => {
        const html = element.innerHTML;
        element.innerHTML = '<p class="py-4 text-sm">Cargando datos de la liga...</p>';
        const y = [...document.querySelectorAll('.league-live h3')].find(h => h.textContent === 'Resultados recientes').getBoundingClientRect().y;
        element.innerHTML = html;
        return y;
      });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.screenshot({ path: `../.qa-artifacts/home-loading-${width}-${theme}.png`, fullPage: true });
      release();
      await page.locator('.league-live .public-match-card').waitFor();
      await page.waitForFunction(() => !document.querySelector('.league-loading'));
      const loaded = await page.getByRole('heading', { name: 'Resultados recientes', exact: true }).boundingBox();
      assert.ok(Math.abs(loaded.y - pending.y) < Math.abs(loaded.y - baseline), `Shift not reduced at ${width}`);
      assert.ok(Math.abs(loaded.y - pending.y) < 80, `Single-match fixture shift: ${loaded.y - pending.y}`);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      console.log(`PASS ${width} ${theme}: shift ${Math.round(Math.abs(loaded.y - pending.y))}px vs text-only ${Math.round(Math.abs(loaded.y - baseline))}px; accessible loading, reduced motion, no overflow.`);
      gate = new Promise(resolve => release = resolve);
      const refresh = page.waitForRequest(request => request.url().endsWith('/public/round'));
      await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')));
      await refresh;
      assert.equal(await page.locator('.league-loading').count(), 0, 'Retain data during background refresh');
      assert.equal(await page.locator('.league-live .public-match-card').count(), 1);
      release();
      // Failed first load releases placeholders and remains retryable.
      fail = true;
      await page.reload();
      await page.locator('.league-live').getByRole('button', { name: 'Reintentar', exact: true }).waitFor();
      await page.locator('.league-loading').first().waitFor({ state: 'hidden' });
      assert.equal(await page.locator('.league-loading').count(), 0);
      fail = false;
      await page.locator('.league-live').getByRole('button', { name: 'Reintentar', exact: true }).click();
      await page.locator('.league-live .public-match-card').waitFor();
      await page.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
