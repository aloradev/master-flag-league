const { chromium } = require(process.env.QA_PLAYWRIGHT_PATH || 'playwright');
const assert = require('node:assert/strict');
const base = process.env.QA_BASE_URL || 'http://127.0.0.1:5191';

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  try {
    for (const width of [320, 390, 1280]) for (const theme of ['light', 'dark']) {
      const page = await browser.newPage({ viewport: { width, height: 900 }, serviceWorkers: 'block' });
      await page.addInitScript(theme => localStorage.setItem('mfl.theme', theme), theme);
      await page.clock.install();
      let failing = false;
      let release;
      let gate = Promise.resolve();
      await page.route('**/public/standings', async route => {
        await gate;
        if (failing) return route.fulfill({ status: 503, json: { success: false, error: 'Error de prueba' } });
        return route.continue();
      });
      await page.goto(base + '/tabla');
      const stamp = page.locator('.public-data-freshness time').first();
      await stamp.waitFor();
      const before = await stamp.getAttribute('datetime');
      assert.ok(Number.isFinite(Date.parse(before)));
      const nav = page.getByRole('navigation', { name: width < 640 ? 'Navegación pública móvil' : 'Navegación pública', exact: true });
      await nav.getByRole('link', { name: 'Jugar', exact: true }).click();
      await page.waitForURL('**/jugar');
      await stamp.waitFor({ state: 'detached' });
      await page.clock.setFixedTime(new Date(Date.parse(before) + 61000));
      gate = new Promise(resolve => release = resolve);
      failing = true;
      const request = page.waitForRequest(request => request.url().includes('/public/standings'));
      await nav.getByRole('link', { name: width < 640 ? 'Tabla' : 'Posiciones', exact: true }).click();
      await request;
      await page.getByText('Consultando de nuevo…', { exact: true }).waitFor();
      assert.equal(await stamp.getAttribute('datetime'), before);
      release();
      const retry = page.getByRole('button', { name: 'Reintentar consulta: Posiciones', exact: true });
      await retry.waitFor();
      assert.equal(await stamp.getAttribute('datetime'), before);
      assert.ok(await page.locator('.public-standings').count() > 0, 'Retain table on failed refresh');
      failing = false;
      await retry.click();
      await page.waitForFunction(before => document.querySelector('.public-data-freshness time')?.dateTime !== before, before);
      for (const route of ['/tabla', '/estadisticas', '/jornada/demo_finished', '/partido/demo_final', '/jugador/demo_player', '/equipos/demo_home']) {
        await page.goto(base + route);
        await page.locator('.public-data-freshness time').first().waitFor();
        // Simulate text-only enlargement, including pixel-based typography.
        await page.evaluate(() => {
          const styles = [...document.querySelectorAll('.public-shell *')].map(element => {
            const s = getComputedStyle(element); return [element, parseFloat(s.fontSize), parseFloat(s.lineHeight)];
          });
          for (const [element, font, line] of styles) {
            if (element instanceof HTMLElement) { element.style.fontSize = `${font * 2}px`; if (Number.isFinite(line)) element.style.lineHeight = `${line * 2}px`; }
          }
        });
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
        if (overflow) {
          console.error(await page.locator('.public-shell *').evaluateAll(elements => elements.filter(e => e.getBoundingClientRect().right > innerWidth + 1 || e.scrollWidth > e.clientWidth + 2 && getComputedStyle(e).overflowX === 'visible').map(e => ({ tag: e.tagName, cls: e.className, text: e.textContent.slice(0, 60), width: e.clientWidth, scroll: e.scrollWidth })).slice(0, 20)));
          await page.screenshot({ path: '../.qa-artifacts/text-overflow.png', fullPage: true });
        }
        assert.ok(!overflow, `${width} ${route}: overflow at 200% text`);
        const clipping = await page.locator('main button, main summary, main select').evaluateAll(elements => elements.filter(e => e.getClientRects().length && (e.scrollHeight > e.clientHeight + 2)).map(e => ({ text: e.textContent.slice(0, 50), scroll: e.scrollHeight, client: e.clientHeight })));
        assert.deepEqual(clipping, [], `${width} ${route}: controls clip enlarged text`);
        if (route === '/estadisticas' && width < 640) {
          const category = await page.getByLabel('Categoría', { exact: true }).boundingBox();
          const team = await page.getByLabel('Equipo', { exact: true }).boundingBox();
          assert.ok(team.y >= category.y + category.height, 'Enlarged filters stack instead of clipping side by side');
        }
        const panels = page.locator('.public-share-panel > summary');
        const linkPanel = page.locator('.public-link-share > summary');
        if (await linkPanel.count()) {
          await linkPanel.focus();
          await page.keyboard.press('Enter');
          await page.keyboard.press('Tab');
          assert.ok(await page.evaluate(() => !!document.activeElement.closest('.public-link-share-options')));
          await linkPanel.focus();
          await page.keyboard.press('Enter');
        }
        if (await panels.count()) {
          await panels.focus();
          assert.ok(await panels.evaluate(e => parseFloat(getComputedStyle(e).outlineWidth) > 0), 'Visible keyboard focus');
          await page.keyboard.press('Enter');
          assert.equal(await page.locator('.public-share-panel').getAttribute('open'), '');
          await page.keyboard.press('Tab');
          assert.equal(await page.getByLabel('Formato', { exact: true }).evaluate(e => e === document.activeElement), true);
          assert.ok(await page.getByLabel('Formato', { exact: true }).evaluate(e => e.scrollHeight <= e.clientHeight + 2), 'Open format control fits enlarged text');
          await page.keyboard.press('ArrowDown');
          await panels.focus();
          await page.keyboard.press('Enter');
          assert.equal(await page.locator('.public-share-panel').getAttribute('open'), null);
        }
        await page.keyboard.press('Control+Home');
        const skip = page.getByRole('link', { name: 'Saltar al contenido', exact: true });
        await skip.focus();
        await page.keyboard.press('Enter');
        assert.equal(await page.locator('main').evaluate(e => e === document.activeElement), true);
        if (route === '/estadisticas') await page.screenshot({ path: `../.qa-artifacts/text-200-${width}-${theme}.png`, fullPage: true });
        if (width < 640) {
          await page.evaluate(() => document.fonts.ready);
          await page.waitForFunction(() => {
            window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' });
            const footer = document.querySelector('footer > a').getBoundingClientRect();
            const nav = document.querySelector('.public-bottom-nav').getBoundingClientRect();
            return footer.bottom <= nav.top + 1;
          });
        }
      }
      await page.close();
      console.log(`PASS ${width} ${theme}: consultation time, failed refresh/retry, retained data, 200% text, keyboard panels and skip link.`);
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
