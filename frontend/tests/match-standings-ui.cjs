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
        await context.addInitScript(theme => localStorage.setItem('mfl.theme', theme), theme);
        const page = await context.newPage();
        page.setDefaultTimeout(15000);
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        const round = await page.request.get(base + '/api/v1/public/round/demo_finished').then(response => response.json());
        const original = round.data.games[0];
        const states = ['LIVE', 'FINISHED', 'SCHEDULED', 'POSTPONED', 'CANCELLED', 'WALKOVER'];
        const games = states.map((status, index) => ({ ...original, id: `ui-${status}`, status, home_team_name: 'Halcones del Caribe con nombre largo', away_team_name: 'Aztecas'.repeat(12), home_score: status === 'FINISHED' ? 123 : 0, away_score: 6, scheduled_time: index % 2 ? '21:00' : null, field_name: index % 2 ? 'Cancha principal de la unidad deportiva' : null, statistics_status: 'PENDING', touchdowns: [{ ...original.touchdowns[0], team_id: original.home_team_id, quantity: 3, created_at: '2026-10-06' }] }));
        await page.route('**/public/round/demo_finished', route => route.fulfill({ json: { ...round, data: { ...round.data, games } } }));
        await page.goto(base + '/jornada/demo_finished');
        const cards = page.locator('article.public-match-card');
        await cards.first().waitFor();
        assert.equal(await cards.count(), 6);
        for (const status of states) {
          const card = cards.filter({ has: page.locator(`a[href="/partido/ui-${status}"]`) });
          assert.equal(await card.locator('.public-match-team').count(), 2);
          const logos = await card.locator('.public-match-team > :first-child').evaluateAll(elements => elements.map(element => [element.getBoundingClientRect().width, element.getBoundingClientRect().height]));
          assert.deepEqual(logos, [[36, 36], [36, 36]]);
          const scores = await card.locator('.public-match-score').allTextContents();
          if (['SCHEDULED', 'POSTPONED', 'CANCELLED'].includes(status)) assert.deepEqual(scores, ['—', '—']);
          else assert.deepEqual(scores, [status === 'FINISHED' ? '123' : '0', '6']);
          assert.equal(await card.getByText('Local', { exact: true }).count() + await card.getByText('Visitante', { exact: true }).count() > 0, true);
          assert.equal(await card.locator('.public-match-details dt').count(), 2);
          const scoreBoxes = await card.locator('.public-match-score').evaluateAll(elements => elements.map(element => element.getBoundingClientRect().right));
          assert.ok(Math.abs(scoreBoxes[0] - scoreBoxes[1]) < 1);
          if (status === 'LIVE') {
            await card.getByText('En vivo', { exact: true }).waitFor();
            assert.ok(await card.evaluate(element => parseFloat(getComputedStyle(element).borderLeftWidth)) >= 3);
          }
          if (status === 'FINISHED') await card.getByText('Ganador', { exact: true }).waitFor();
        }
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
        await page.screenshot({ path: path.join(output, `matches-ui-${width}-${theme}.png`), fullPage: true });
        const standings = await page.request.get(base + '/api/v1/public/standings').then(response => response.json());
        const category = standings.data.categories.find(group => group.rows.length);
        const rows = Array.from({ length: 6 }, (_, index) => ({ ...category.rows[0], team_id: `ui-team-${index}`, team_name: index ? `Equipo de nombre largo número ${index + 1}` : 'Halcones'.repeat(12), position: index + 1, played: 10, wins: 6, draws: 1, losses: 3, points_for: 123, points_against: 129, point_diff: -6, form: ['W', 'D', 'L', 'W', 'L'] }));
        await page.route('**/public/standings', route => route.fulfill({ json: { ...standings, data: { ...standings.data, categories: [{ ...category, rows }] } } }));
        await page.goto(base + '/tabla');
        const region = page.getByRole('region', { name: `Posiciones de ${category.category.name}`, exact: true });
        await region.waitFor();
        assert.equal(await region.getByRole('table').count(), 1);
        assert.equal(await region.locator('tbody tr').count(), 6);
        assert.equal(await region.locator('thead th').count(), 10);
        assert.equal(await region.locator('tbody tr').first().getByRole('cell', { name: '123', exact: true }).count(), 1);
        await region.getByRole('img', { name: 'Últimos resultados: Ganado, Empatado, Perdido, Ganado, Perdido', exact: true }).first().waitFor();
        const firstRow = region.locator('tbody tr').first();
        const before = await firstRow.locator('.standing-rank, .standing-team').evaluateAll(elements => elements.map(element => element.getBoundingClientRect().x));
        await region.evaluate(element => { element.scrollLeft = element.scrollWidth; });
        const after = await firstRow.locator('.standing-rank, .standing-team').evaluateAll(elements => elements.map(element => element.getBoundingClientRect().x));
        before.forEach((value, index) => assert.ok(Math.abs(value - after[index]) <= 1, `Sticky column moved at ${width}`));
        const teamEdge = await firstRow.locator('.standing-team').evaluate(element => element.getBoundingClientRect().right);
        const formBoxes = await firstRow.locator('.standing-form > span > span').evaluateAll(elements => elements.map(element => ({ left: element.getBoundingClientRect().left, right: element.getBoundingClientRect().right })));
        formBoxes.forEach(box => assert.ok(box.left >= teamEdge - 1 && box.right <= width - 15, `Recent result hidden at ${width}`));
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
        await region.screenshot({ path: path.join(output, `standings-ui-scrolled-${width}-${theme}.png`) });
        await region.evaluate(element => { element.scrollLeft = 0; });
        await region.focus();
        assert.equal(await region.evaluate(element => document.activeElement === element), true);
        if (width < 1024) {
          await page.keyboard.press('ArrowRight');
          await page.waitForFunction(() => document.querySelector('.public-standings-scroll').scrollLeft > 0);
        }
        await region.evaluate(element => { element.scrollLeft = 0; });
        await region.screenshot({ path: path.join(output, `standings-ui-${width}-${theme}.png`) });
        await firstRow.getByRole('link').click();
        assert.ok(page.url().endsWith('/equipos/ui-team-0'));
        assert.deepEqual(errors, []);
        console.log(`PASS ${width}px ${theme}: seis estados de partido, nombres largos, marcadores y escudos; tabla completa, columnas fijas, desplazamiento, teclado, enlaces y capturas.`);
        await context.close();
      }
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
