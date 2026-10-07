const { chromium } = require(process.env.QA_PLAYWRIGHT_PATH || 'playwright');
const assert = require('node:assert/strict');
const base = process.env.QA_BASE_URL || 'http://127.0.0.1:5191';

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  try {
    for (const width of [320, 360, 390, 430, 640, 768, 1024, 1280]) for (const theme of ['light', 'dark']) {
      const page = await browser.newPage({ viewport: { width, height: 844 } });
      await page.addInitScript(theme => localStorage.setItem('mfl.theme', theme), theme);
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(base);
      const access = () => page.locator('.public-shell > header').getByRole('link', { name: 'Favoritos', exact: true });
      await access().waitFor();
      const rect = await access().boundingBox();
      assert.ok(rect.width >= 44 && rect.height >= 44 && rect.x >= 0 && rect.x + rect.width <= width);
      assert.equal(await access().getAttribute('href'), '/favoritos');
      assert.equal(await access().getByRole('status').count(), 0);
      // Reach the link through actual tab order, not focus() or selector clicks.
      let found = false;
      for (let press = 0; press < 15; press++) {
        await page.keyboard.press('Tab');
        if (await access().evaluate(element => element === document.activeElement)) { found = true; break; }
      }
      assert.ok(found, 'Favorites is reachable by keyboard from first visit');
      await page.keyboard.press('Enter');
      await page.getByRole('heading', { name: 'Todavía no tienes favoritos', exact: true }).waitFor();
      assert.equal(await access().getAttribute('aria-current'), 'page');
      assert.equal(await page.getByRole('checkbox', { name: 'Avisos en esta web' }).isChecked(), false);
      await page.getByRole('link', { name: 'Ver equipos', exact: true }).click();
      await page.getByRole('heading', { level: 1 }).waitFor();
      await page.goto(base + '/jugador/demo_player');
      const save = page.getByRole('button', { name: 'Guardar en favoritos: Andrea Demo', exact: true });
      await save.click();
      await page.getByRole('button', { name: 'Quitar de favoritos: Andrea Demo', exact: true }).waitFor();
      await page.locator('.public-shell > header').getByRole('link', { name: 'Ir al inicio de Master Flag League', exact: true }).click();
      await access().click();
      const saved = page.locator('.public-favorite-list').getByRole('link', { name: 'Andrea Demo', exact: true });
      await saved.waitFor();
      await page.reload();
      await saved.click();
      await page.getByRole('heading', { name: 'Andrea Demo', exact: true }).waitFor();
      assert.equal(await page.getByRole('button', { name: 'Quitar de favoritos: Andrea Demo', exact: true }).getAttribute('aria-pressed'), 'true');
      await access().click();
      assert.equal(await page.getByRole('checkbox', { name: 'Avisos en esta web' }).isChecked(), false);
      await page.getByRole('button', { name: 'Quitar Andrea Demo', exact: true }).click();
      await page.getByRole('heading', { name: 'Todavía no tienes favoritos', exact: true }).waitFor();
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      assert.deepEqual(errors, []);
      if ([320, 1280].includes(width)) await page.screenshot({ path: `../.qa-artifacts/favorites-discovery-${width}-${theme}.png`, fullPage: true });
      await page.close();
      console.log(`PASS ${width} ${theme}: first visit, keyboard access, empty state, save/return/reload/remove, notices opt-in. Not a human recognition test.`);
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
