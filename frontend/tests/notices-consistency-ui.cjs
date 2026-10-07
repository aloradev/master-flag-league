const { chromium } = require(process.env.QA_PLAYWRIGHT_PATH || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const base = process.env.QA_BASE_URL || 'http://127.0.0.1:5191';
const key = 'mfl.favorites.v1';
const notices = [
  { id: 'result', kind: 'result', text: 'Halcones vs Aztecas: Resultado final · 18 - 6', read: false },
  { id: 'live', kind: 'live', text: 'Halcones vs Aztecas: Partido en vivo', read: false },
  { id: 'schedule', kind: 'schedule', text: `Horario o cancha actualizados: ${'Cancha'.repeat(45)}`, read: false },
  { id: 'status', kind: 'status', text: 'Halcones vs Aztecas: Partido pospuesto', read: true },
  { id: 'legacy', text: 'Aviso anterior sin tipo guardado', read: false },
].map((notice, index) => ({ ...notice, gameId: 'demo_final', created: Date.now() - index * 60000 }));
const initial = { favorites: [{ kind: 'team', id: 'demo_home', name: 'Equipo'.repeat(25) }], enabled: false, snapshots: {}, notices };

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  const output = path.resolve(__dirname, '../../.qa-artifacts');
  await fs.mkdir(output, { recursive: true });
  try {
    for (const width of [320, 390, 640, 1280]) for (const theme of ['light', 'dark']) {
      const context = await browser.newContext({ viewport: { width, height: 900 } });
      await context.addInitScript(({ theme, initial, key }) => {
        localStorage.setItem('mfl.theme', theme);
        if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(initial));
      }, { theme, initial, key });
      const page = await context.newPage();
      page.setDefaultTimeout(15000);
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(base + '/favoritos');
      await page.getByText('4 sin leer', { exact: true }).waitFor();
      assert.equal(await page.getByRole('list', { name: 'Avisos sin leer', exact: true }).locator('li').count(), 4);
      assert.equal(await page.getByRole('list', { name: 'Avisos leídos', exact: true }).locator('li').count(), 1);
      for (const kind of ['live', 'result', 'schedule', 'status', 'update']) {
        const notice = page.locator(`.public-notice-${kind}`);
        assert.equal(await notice.count(), 1);
        assert.ok(await notice.locator('time').getAttribute('datetime'));
        assert.equal(await notice.locator('svg').count() > 0, true);
      }
      await page.screenshot({ path: path.join(output, `notices-ui-${width}-${theme}.png`), fullPage: true });
      const overflow = await page.evaluate(() => [...document.querySelectorAll('main *')].filter(element => element.getBoundingClientRect().right > innerWidth + 1).map(element => ({ tag: element.tagName, class: element.className, width: element.getBoundingClientRect().width })).slice(0, 10));
      assert.deepEqual(overflow, []);
      const read = page.getByRole('button', { name: `Marcar como leído: ${notices[0].text}`, exact: true });
      const size = await read.boundingBox();
      assert.ok(size.width >= 44 && size.height >= 44);
      await read.click();
      await page.getByText('3 sin leer', { exact: true }).waitFor();
      assert.equal(await page.locator('.public-notice-result').getByText('Leído', { exact: true }).count(), 1);
      await page.reload();
      await page.getByText('3 sin leer', { exact: true }).waitFor();
      await page.locator('.public-notice-live').getByRole('link').click();
      await page.getByRole('heading', { name: 'Resultado final', exact: true }).waitFor();
      assert.equal(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).notices.find(notice => notice.id === 'live').read, key), true);
      await page.goto(base + '/favoritos');
      await page.getByText('2 sin leer', { exact: true }).waitFor();
      await page.getByRole('button', { name: 'Marcar como leídos', exact: true }).click();
      await page.getByText('0 sin leer', { exact: true }).waitFor();
      assert.equal(await page.locator('.public-favorites-count').count(), 0);
      await page.getByRole('button', { name: 'Borrar avisos', exact: true }).click();
      await page.getByText('No hay avisos nuevos.', { exact: true }).waitFor();
      for (const route of ['/estadisticas', '/jugar', '/partido/demo_final', '/jugador/demo_player', '/tabla', '/']) {
        await page.goto(base + route);
        await page.getByRole('heading', { level: 1 }).first().waitFor();
        const buttons = await page.locator('.public-shell button:visible').evaluateAll(elements => elements.map(element => ({ height: element.getBoundingClientRect().height, radius: parseFloat(getComputedStyle(element).borderTopLeftRadius) })));
        buttons.forEach(button => { assert.ok(button.height >= 43); assert.ok(button.radius <= 8); });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
      }
      let failed = true;
      await page.route('**/public/teams/demo_home', route => failed ? route.fulfill({ status: 503, json: { success: false, error: 'No disponible temporalmente' } }) : route.continue());
      await page.goto(base + '/equipos/demo_home');
      await page.getByRole('button', { name: 'Reintentar', exact: true }).waitFor();
      const empty = page.locator('.ui-empty-state');
      assert.equal(await empty.evaluate(element => getComputedStyle(element).paddingTop), '32px');
      failed = false;
      await page.getByRole('button', { name: 'Reintentar', exact: true }).click();
      await page.getByRole('heading', { name: 'Halcones Demo', exact: true }).waitFor();
      assert.deepEqual(errors, []);
      console.log(`PASS ${width}px ${theme}: tipos de aviso, antiguos, grupos, lectura individual/enlace, persistencia y borrado; botones, radios, errores y reintento.`);
      await context.close();
    }
    const context = await browser.newContext();
    await context.addInitScript(({ initial, key }) => {
      localStorage.setItem(key, JSON.stringify({ ...initial, notices: [...initial.notices, { id: 'invalid-date', gameId: 'demo_final', text: 'Fecha inválida', created: Number.MAX_VALUE, read: false }] }));
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function (name, value) { if (name === key) throw new DOMException('Blocked', 'QuotaExceededError'); return original.call(this, name, value); };
    }, { initial, key });
    const page = await context.newPage();
    await page.goto(base + '/favoritos');
    await page.getByText('4 sin leer', { exact: true }).waitFor();
    assert.equal(await page.getByText('Fecha inválida', { exact: true }).count(), 0);
    await page.locator('.public-notice-result').getByRole('button').click();
    await page.getByRole('alert').waitFor();
    assert.equal(await page.getByText('4 sin leer', { exact: true }).count(), 1);
    await page.locator('.public-notice-live').getByRole('link').click();
    assert.ok(page.url().endsWith('/favoritos'));
    await context.close();
    console.log('PASS: almacenamiento bloqueado y fechas inválidas, sin falsa lectura ni navegación tras error.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
