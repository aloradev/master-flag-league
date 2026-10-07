const { chromium } = require(process.env.QA_PLAYWRIGHT_PATH || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const base = process.env.QA_BASE_URL || 'http://127.0.0.1:5191';
const output = path.resolve(__dirname, '../../.qa-artifacts');
const run = Date.now();
const playerName = width => `Jugador Demo ${width} ${run}`;

(async () => {
  await fs.mkdir(output, { recursive: true });
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  try {
    for (const width of [320, 390, 1280]) {
      const page = await browser.newPage({ viewport: { width, height: 844 }, acceptDownloads: true });
      page.setDefaultTimeout(15000); page.setDefaultNavigationTimeout(15000);
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(base + '/jugar', { waitUntil: 'domcontentloaded' });
      await page.getByLabel('Nombre', { exact: true }).fill(playerName(width));
      await page.getByLabel('Correo electrónico', { exact: true }).fill(`jugador-${width}-${run}@prueba.invalid`);
      await page.getByLabel('Teléfono (opcional)', { exact: true }).fill('+529981234567');
      await page.getByRole('checkbox').check();
      const bodyPromise = page.waitForRequest(request => request.url().endsWith('/public/player-interest') && request.method() === 'POST');
      await page.getByRole('button', { name: 'Enviar solicitud', exact: true }).click();
      const submitted = (await bodyPromise).postDataJSON();
      assert.equal(submitted.consent, true);
      await page.getByRole('heading', { name: 'Solicitud recibida', exact: true }).waitFor();
      await page.goto(base + '/partido/demo_final', { waitUntil: 'domcontentloaded' });
      await page.getByRole('heading', { name: 'Resultado final', exact: true }).waitFor();
      await page.locator('.public-share-panel > summary').click();
      for (const [format, height] of [['portrait',1350],['story',1920],['square',1080]]) {
        await page.getByLabel('Formato', { exact: true }).selectOption(format);
        await page.getByRole('button', { name: 'Vista previa', exact: true }).click();
        const preview = page.getByRole('img', { name: /^Vista previa:/ });
        await preview.waitFor();
        await preview.evaluate(img => img.decode());
        assert.deepEqual(await preview.evaluate(img => [img.naturalWidth, img.naturalHeight]), [1080,height]);
        if (width === 390) {
          const downloadPromise = page.waitForEvent('download');
          await page.getByRole('button', { name: 'Descargar tarjeta', exact: true }).click();
          await (await downloadPromise).saveAs(path.join(output, `social-match-${format}.png`));
        }
      }
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
      await page.goto(base + '/tabla', { waitUntil: 'domcontentloaded' });
      const group = page.locator('section').filter({ has: page.getByRole('heading', { name: /Varonil/ }) }).last();
      await group.locator('.public-share-panel > summary').click();
      const share = group.locator('select').filter({ has: page.locator('option[value="square"]') });
      await share.selectOption('square');
      await group.getByRole('button', { name: 'Vista previa', exact: true }).click();
      await group.getByRole('img', { name: /^Vista previa:/ }).waitFor();
      // A long table paginates instead of drawing over the footer.
      const tableResponse = await page.request.get(base + '/api/v1/public/standings').then(response => response.json());
      const original = tableResponse.data.categories.find(category => category.rows.length);
      const rows = Array.from({ length: 32 }, (_, index) => ({ ...original.rows[0], team_id: `long-${index}`, team_name: `Equipo de nombre largo número ${index + 1}`, position: index + 1 }));
      await page.route('**/public/standings', route => route.fulfill({ json: { success: true, data: { ...tableResponse.data, categories: [{ ...original, rows }] } } }));
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.locator('.public-share-panel > summary').click();
      await page.getByLabel('Formato', { exact: true }).selectOption('square');
      const last = await page.getByLabel('Página', { exact: true }).locator('option').last().getAttribute('value');
      assert.equal(last, '4');
      await page.getByLabel('Página', { exact: true }).selectOption(last);
      const downloadPromise = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Descargar tarjeta', exact: true }).click();
      const tableDownload = await downloadPromise;
      assert.ok(tableDownload.suggestedFilename().endsWith('-square-5.png'));
      if (width === 390) await tableDownload.saveAs(path.join(output, 'social-table-last.png'));
      assert.deepEqual(errors, []);
      console.log(`PASS ${width}px: solicitud real, consentimiento, confirmación, tres formatos PNG, vista previa, dimensiones, tablas paginadas.`);
      await page.close();
    }
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    page.setDefaultTimeout(15000);
    const login = await page.request.post(base + '/api/v1/auth/login', { data: { email: 'admin@demo.invalid', password: 'Demo2026League' } }).then(response => response.json());
    await page.addInitScript(token => localStorage.setItem('mfl.token', token), login.data.accessToken);
    await page.goto(base + '/admin/interesados', { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: playerName(320), exact: true }).waitFor();
    await page.getByLabel(`Estado de ${playerName(320)}`, { exact: true }).selectOption('CONTACTED');
    await page.getByRole('heading', { name: playerName(320), exact: true }).waitFor({ state: 'hidden' });
    await page.getByLabel('Estado', { exact: true }).selectOption('CONTACTED');
    await page.getByRole('heading', { name: playerName(320), exact: true }).waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
    await page.screenshot({ path: path.join(output, 'interest-admin.png'), fullPage: true });
    console.log('PASS: bandeja administrativa real, solicitud recibida y cambio de estado.');
    await page.close();
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
