const { chromium } = require(process.env.QA_PLAYWRIGHT_PATH || 'playwright');
const assert = require('node:assert/strict');
const base = process.env.QA_BASE_URL || 'http://127.0.0.1:5191';
const metrics = ['touchdowns', 'yards', 'receptions', 'completions', 'interceptions', 'flag_pulls', 'passes_defended', 'offensive_mvps', 'defensive_mvps'];

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  try {
    for (const width of [320, 360, 390, 430, 640, 768, 1024, 1280]) for (const theme of ['light', 'dark']) {
      const page = await browser.newPage({ viewport: { width, height: 844 }, serviceWorkers: 'block' });
      await page.addInitScript(theme => localStorage.setItem('mfl.theme', theme), theme);
      const players = ['Andrea Demo', 'Beatriz Demo', 'Carla Demo'].map((name, index) => ({
        player_id: `p${index}`, player_name: name, team_id: 't1', team_name: 'Halcones Demo', category_id: 'c1', category_name: 'Mixto', games_played: 4,
        ...Object.fromEntries(metrics.map(key => [key, index < 2 ? 12 : 1])),
      }));
      await page.route('**/public/standings', route => route.fulfill({ json: { success: true, data: { season: { id: 's1', name: 'Temporada 2026', year: 2026 }, categories: [{ category: { id: 'c1', name: 'Mixto' }, rows: [] }] } } }));
      await page.route('**/public/statistics/players?*', route => route.fulfill({ json: { success: true, data: players } }));
      await page.goto(base + '/estadisticas?origen=prueba');
      const ranking = page.getByRole('list', { name: /^Ranking de / });
      await ranking.waitFor();
      assert.deepEqual(await page.locator('.public-stats-filters label').allTextContents(), ['Estadística', 'Categoría', 'Equipo']);
      const metric = await page.getByLabel('Estadística', { exact: true }).boundingBox();
      const category = await page.getByLabel('Categoría', { exact: true }).boundingBox();
      assert.ok(metric.height >= 44);
      assert.ok(width < 640 ? metric.y < category.y : Math.abs(metric.y - category.y) < 1);
      const improvement = await page.locator('#ranking-title').evaluate(heading => {
        const section = heading.closest('section');
        const note = [...section.querySelectorAll('p')].find(p => p.textContent.startsWith('Solo partidos oficiales'));
        const next = note.nextSibling;
        const current = heading.getBoundingClientRect().y;
        section.parentNode.insertBefore(note, section);
        const before = heading.getBoundingClientRect().y;
        section.insertBefore(note, next);
        return before - current;
      });
      assert.ok(improvement >= 40);
      const first = await ranking.locator('li a').first().boundingBox();
      assert.ok(first.y + first.height < 760, 'Leader name visible in initial 844px viewport');
      for (const key of metrics) {
        await page.getByLabel('Estadística', { exact: true }).selectOption(key);
        assert.deepEqual(await ranking.locator('li > span:first-child').allTextContents(), ['1', '1', '3']);
        assert.equal(await ranking.locator('li a').first().textContent(), 'Andrea Demo');
        assert.equal(new URL(page.url()).searchParams.get('origen'), 'prueba');
      }
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.screenshot({ path: `../.qa-artifacts/statistics-priority-${width}-${theme}.png`, fullPage: true });
      if (width === 320) {
        await ranking.locator('li a').first().evaluate(element => { element.textContent = 'Jugador'.repeat(30); element.style.fontSize = '32px'; });
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        const name = await ranking.locator('li a').first().boundingBox();
        const row = await ranking.locator('li').first().boundingBox();
        assert.ok(name.y + name.height <= row.y + row.height);
      }
      console.log(`PASS ${width} ${theme}: metric first, leader visible, heading ${improvement}px earlier, nine metrics/ties, URL and overflow.`);
      await page.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
