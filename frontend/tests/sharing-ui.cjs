const { chromium } = require(process.env.QA_PLAYWRIGHT_PATH || 'playwright');
const assert = require('node:assert/strict');
const base = process.env.QA_BASE_URL || 'http://127.0.0.1:5191';

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  try {
    for (const width of [320, 390, 1280]) for (const theme of ['light', 'dark']) {
      const context = await browser.newContext({ viewport: { width, height: 900 } });
      await context.addInitScript(theme => {
        localStorage.setItem('mfl.theme', theme);
        window.calls = []; window.mode = 'ok'; window.allowed = true;
        Object.defineProperty(navigator, 'share', { configurable: true, value: async data => {
          window.calls.push({ url: data.url, files: data.files?.map(f => ({ name: f.name, size: f.size, type: f.type })), active: navigator.userActivation.isActive });
          if (window.mode !== 'ok') throw new DOMException('Mock', window.mode);
        } });
        Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => window.allowed });
        Object.defineProperty(navigator, 'clipboard', { value: { writeText: async text => {
          if (window.mode === 'clipboard') throw new Error('Blocked');
          window.copied = text;
        } } });
      }, theme);
      const page = await context.newPage();
      let downloads = 0;
      page.on('download', () => downloads++);
      await page.goto(base + '/partido/demo_final?origen=prueba');
      await page.locator('.public-link-share > summary').click();
      await page.getByRole('button', { name: 'Copiar enlace', exact: true }).click();
      await page.getByText('Enlace copiado.', { exact: true }).waitFor();
      assert.equal(await page.evaluate(() => window.copied), page.url());
      await page.getByRole('button', { name: 'Otras aplicaciones', exact: true }).click();
      assert.equal(await page.evaluate(() => window.calls[0].url), page.url());
      await page.evaluate(() => window.mode = 'clipboard');
      await page.getByRole('button', { name: 'Copiar enlace', exact: true }).click();
      assert.equal(await page.getByLabel('Enlace para compartir').inputValue(), page.url());
      await page.locator('.public-link-share > summary').click();
      await page.evaluate(() => window.mode = 'ok');
      await page.locator('.public-share-panel > summary').click();
      for (const format of ['portrait', 'story', 'square']) {
        await page.getByLabel('Formato', { exact: true }).selectOption(format);
        const count = await page.evaluate(() => window.calls.length);
        await page.getByRole('button', { name: 'Preparar imagen', exact: true }).click();
        await page.getByRole('button', { name: 'Compartir imagen', exact: true }).waitFor();
        assert.equal(await page.evaluate(() => window.calls.length), count);
        await page.getByRole('button', { name: 'Compartir imagen', exact: true }).click();
        const call = await page.evaluate(() => window.calls.at(-1));
        assert.ok(call.active);
        assert.ok(call.files[0].name.endsWith(`-${format}-1.png`));
        assert.equal(call.files[0].type, 'image/png');
        assert.ok(call.files[0].size > 1000);
      }
      await page.evaluate(() => window.mode = 'AbortError');
      await page.getByRole('button', { name: 'Compartir imagen', exact: true }).click();
      assert.equal(await page.locator('.public-share-panel [role=alert]').count(), 0);
      await page.evaluate(() => window.mode = 'NotAllowedError');
      await page.getByRole('button', { name: 'Compartir imagen', exact: true }).click();
      await page.locator('.public-share-panel [role=alert]').waitFor();
      assert.equal(downloads, 0);
      await page.locator('.public-share-panel > summary').click();
      await page.locator('.public-share-panel > summary').click();
      await page.evaluate(() => { window.allowed = false; window.mode = 'ok'; });
      await page.getByRole('button', { name: 'Preparar imagen', exact: true }).click();
      await page.getByText('Compartir imagen no está disponible en este dispositivo.', { exact: true }).waitFor();
      assert.equal(downloads, 0);
      const download = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Descargar tarjeta', exact: true }).click();
      assert.ok((await download).suggestedFilename().endsWith('-square-1.png'));
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.evaluate(() => { document.activeElement.blur(); window.scrollTo(0, 0); });
      await page.screenshot({ path: `../.qa-artifacts/sharing-${width}-${theme}.png`, fullPage: true });
      await context.close();
    }
    const page = await browser.newPage();
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'share', { value: undefined });
      Object.defineProperty(navigator, 'canShare', { value: undefined });
      const original = HTMLCanvasElement.prototype.toBlob;
      HTMLCanvasElement.prototype.toBlob = function(callback, ...args) {
        original.call(this, blob => { window.releaseImage = () => callback(blob); }, ...args);
      };
    });
    await page.goto(base + '/partido/demo_final');
    await page.locator('.public-link-share > summary').click();
    assert.equal(await page.getByRole('button', { name: 'Otras aplicaciones', exact: true }).count(), 0);
    await page.locator('.public-share-panel > summary').click();
    assert.equal(await page.getByRole('button', { name: 'Preparar imagen', exact: true }).count(), 0);
    await page.getByRole('button', { name: 'Vista previa', exact: true }).click();
    await page.waitForFunction(() => typeof window.releaseImage === 'function');
    await page.locator('.public-share-panel > summary').click();
    await page.evaluate(() => window.releaseImage());
    await page.locator('.public-share-panel > summary').click();
    assert.equal(await page.locator('.public-share-panel img').count(), 0);
    assert.equal(await page.getByRole('button', { name: 'Vista previa', exact: true }).isEnabled(), true);
    console.log('Sharing: links, clipboard fallback, native activation, three PNG formats, cancel/error, unsupported APIs/files, stale generation, explicit download, responsive themes: PASS');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
