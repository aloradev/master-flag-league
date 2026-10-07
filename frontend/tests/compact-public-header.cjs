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
    for (const width of [320, 390, 640, 1280]) {
      for (const theme of ['light', 'dark']) {
        const context = await browser.newContext({ viewport: { width, height: 900 } });
        await context.addInitScript(theme => {
          localStorage.setItem('mfl.theme', theme);
          localStorage.setItem('mfl.favorites.v1', JSON.stringify({ favorites: [], enabled: false, snapshots: {}, notices: Array.from({ length: 30 }, (_, index) => ({ id: `notice-${index}`, gameId: 'demo_final', text: 'Resultado final de prueba', created: Date.now(), read: false })) }));
        }, theme);
        const page = await context.newPage();
        page.setDefaultTimeout(15000);
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        for (const route of ['/favoritos', '/jornada/demo_finished', '/tabla', '/estadisticas', '/partido/demo_final', '/equipos/demo_home', '/jugador/demo_player', '/jugar', '/']) {
          await page.goto(base + route);
          const heading = page.getByRole('heading', { level: 1 }).first();
          await heading.waitFor();
          if (route === '/partido/demo_final') await page.getByRole('heading', { name: 'Resultado final', exact: true }).waitFor();
          if (route === '/equipos/demo_home') await page.getByRole('heading', { name: 'Halcones Demo', exact: true }).waitFor();
          if (route === '/jugador/demo_player') await page.getByRole('heading', { name: 'Andrea Demo', exact: true }).waitFor();
          const header = page.locator('.public-shell > header');
          const favorite = header.getByRole('link', { name: 'Favoritos', exact: true });
          assert.equal(await favorite.count(), 1);
          const badge = favorite.getByRole('status');
          assert.equal(await badge.getAttribute('aria-label'), '30 avisos sin leer');
          assert.equal(await badge.textContent(), '9+');
          const headerBox = await header.boundingBox();
          assert.ok(headerBox.height <= (width < 640 ? 68 : 116), `${width} ${route}: header ${headerBox.height}`);
          const favoriteBox = await favorite.boundingBox();
          assert.ok(favoriteBox.width >= 44 && favoriteBox.height >= 44);
          const controls = await header.locator('a:visible, button:visible').evaluateAll(elements => elements.map(element => {
            const { x, y, right, bottom } = element.getBoundingClientRect(); return { x, y, right, bottom };
          }));
          for (let i = 0; i < controls.length; i++) {
            assert.ok(controls[i].x >= 0 && controls[i].right <= width + 1);
            for (let j = i + 1; j < controls.length; j++) {
              const a = controls[i], b = controls[j];
              assert.ok(!(Math.min(a.right, b.right) - Math.max(a.x, b.x) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y) > 1), `Overlapping controls: ${width} ${route}`);
            }
          }
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `${width} ${route}: overflow`);
          if (route !== '/') {
            assert.ok(await heading.evaluate(element => parseFloat(getComputedStyle(element).fontSize)) <= 32);
            assert.equal(await header.getByRole('link', { name: 'Compartir', exact: true }).count(), 0);
          }
          if (route === '/favoritos') {
            assert.equal(await favorite.getAttribute('aria-current'), 'page');
            await page.screenshot({ path: path.join(output, `compact-favorites-${width}-${theme}.png`), fullPage: true });
            await favorite.focus();
            assert.equal(await favorite.evaluate(element => document.activeElement === element), true);
          }
          if (route === '/partido/demo_final') await page.screenshot({ path: path.join(output, `compact-match-${width}-${theme}.png`), fullPage: true });
        }
        await page.goto(base + '/tabla');
        await page.getByRole('link', { name: 'Favoritos', exact: true }).click();
        await page.getByRole('heading', { name: 'Favoritos y avisos', exact: true }).waitFor();
        await page.getByRole('button', { name: 'Marcar como leídos', exact: true }).click();
        await page.waitForFunction(() => !document.querySelector('.public-favorites-count'));
        // An unbroken long name wraps inside the compact heading.
        await page.route('**/public/players/demo_player', async route => {
          const response = await route.fetch();
          const body = await response.json();
          body.data.full_name = 'Jugador'.repeat(35);
          await route.fulfill({ json: body });
        });
        await page.goto(base + '/jugador/demo_player');
        await page.getByRole('heading', { name: 'Jugador'.repeat(35), exact: true }).waitFor();
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
        assert.deepEqual(errors, []);
        console.log(`PASS ${width}px ${theme}: cabecera compacta, controles sin solaparse, favoritos y contador, navegación, títulos largos y capturas.`);
        await context.close();
      }
    }
    const context = await browser.newContext({ viewport: { width: 320, height: 900 } });
    await context.addInitScript(() => localStorage.setItem('mfl.token', 'test-session'));
    await context.route('**/auth/me', route => route.fulfill({ json: { success: true, data: { id: 'test-user', name: 'Manager Demo', role: 'TEAM_MANAGER', league_id: 'league_cancun', teams: [] } } }));
    const page = await context.newPage();
    await page.goto(base + '/partido/demo_final');
    await page.getByRole('link', { name: 'Mi espacio', exact: true }).waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
    assert.ok((await page.locator('.public-shell > header').boundingBox()).height <= 68);
    await page.screenshot({ path: path.join(output, 'compact-authenticated-320.png'), fullPage: true });
    await context.close();
    console.log('PASS: cabecera con sesión iniciada en 320px.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
