const { chromium } = require(process.env.QA_PLAYWRIGHT_PATH || 'playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs/promises');

const base = process.env.QA_BASE_URL || 'http://127.0.0.1:5191';
const rows = Array.from({ length: 23 }, (_, index) => ({
  team_id: `team-${index}`, team_name: `Equipo ${String(index + 1).padStart(2, '0')}`,
  position: index + 1, played: 2, wins: 1, draws: 0, losses: 1,
  points_for: 20, points_against: 20, point_diff: 0, form: ['W', 'L'],
}));

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.addInitScript(() => {
      window.generatedCards = [];
      window.sharedFiles = [];
      const originalText = CanvasRenderingContext2D.prototype.fillText;
      CanvasRenderingContext2D.prototype.fillText = function (...args) {
        (this.canvas.cardText ||= []).push(args[0]);
        return originalText.apply(this, args);
      };
      const originalBlob = HTMLCanvasElement.prototype.toBlob;
      HTMLCanvasElement.prototype.toBlob = function (...args) {
        window.generatedCards.push({ height: this.height, text: this.cardText.join(' ') });
        return originalBlob.apply(this, args);
      };
      Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true });
      Object.defineProperty(navigator, 'share', { configurable: true, value: async ({ files }) => {
        window.sharedFiles = files.map(file => ({ name: file.name, size: file.size }));
      } });
    });
    await page.route('**/api/v1/**', route => route.fulfill({ json: {
      success: true, data: { season: { id: 's', name: 'Prueba de paginacion' },
        categories: [{ category: { id: 'mixed', name: 'Mixto' }, rows }] },
    } }));
    await page.goto(base + '/tabla');
    await page.locator('.public-share-panel > summary').click();
    await fs.mkdir(path.resolve(__dirname, '../../.qa-artifacts'), { recursive: true });
    for (const [format, capacity] of [['square', 5], ['portrait', 9], ['story', 18]]) {
      await page.getByLabel('Formato', { exact: true }).selectOption(format);
      const count = Math.ceil(rows.length / capacity);
      assert.equal(await page.getByLabel('Página', { exact: true }).locator('option').count(), count);
      await page.evaluate(() => { window.generatedCards = []; });
      const downloads = [];
      const onDownload = download => downloads.push(download);
      page.on('download', onDownload);
      await page.getByRole('button', { name: `Descargar todas (${count})`, exact: true }).click();
      await page.waitForFunction(expected => window.generatedCards.length === expected, count);
      await page.waitForFunction(() => !document.querySelector('.public-share-content button:disabled'));
      for (let attempt = 0; downloads.length < count && attempt < 50; attempt++) await page.waitForTimeout(100);
      page.off('download', onDownload);
      assert.equal(downloads.length, count, `${format}: all PNG downloads`);
      const cards = await page.evaluate(() => window.generatedCards);
      for (let index = 0; index < count; index++) {
        assert.ok(cards[index].text.includes(` ${index + 1}/${count}`));
        assert.ok(cards[index].text.includes('lanzamiento de moneda'));
        assert.ok(downloads[index].suggestedFilename().endsWith(`-${index + 1}.png`));
        await downloads[index].saveAs(path.resolve(__dirname, `../../.qa-artifacts/pagination-${format}-${index + 1}.png`));
      }
      for (const row of rows) assert.equal(cards.filter(card => card.text.includes(row.team_name)).length, 1, `${format}: ${row.team_name} appears once`);
      await page.getByLabel('Página', { exact: true }).selectOption(String(count - 1));
      await page.getByRole('button', { name: 'Vista previa', exact: true }).click();
      await page.getByAltText(`Vista previa: Posiciones · Mixto · página ${count}`).waitFor();
      await page.getByRole('button', { name: 'Preparar imágenes', exact: true }).click();
      await page.getByRole('button', { name: 'Compartir imágenes', exact: true }).click();
      const shared = await page.evaluate(() => window.sharedFiles);
      assert.equal(shared.length, count);
      assert.ok(shared.every(file => file.size > 0));
      await page.screenshot({ path: path.resolve(__dirname, `../../.qa-artifacts/pagination-ui-${format}.png`), fullPage: true });
    }
    console.log('PASS: 23 equipos, tres formatos, todas las paginas PNG, filas sin omisiones/duplicados, ultima pagina y compartir multiples archivos.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
