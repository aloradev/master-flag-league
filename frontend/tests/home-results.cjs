const { chromium } = require(process.env.QA_PLAYWRIGHT_PATH || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const base = process.env.QA_BASE_URL || 'http://127.0.0.1:5191';
const season = { id: 'season', name: 'Temporada 2026', year: 2026 };
const game = { category_name: 'Mixto', category_color: null, home_team_id: 'home', away_team_id: 'away', home_team_name: 'Halcones'.repeat(8), away_team_name: 'Aztecas', home_short_name: 'HAL', away_short_name: 'AZT', home_logo_url: null, away_logo_url: null, status: 'FINISHED', home_score: 18, away_score: 6, scheduled_time: '19:00', field_name: 'Cancha 1', touchdowns: [] };
const current = { season, round: { id: 'current', number: 3, scheduled_date: '2026-10-10', status: 'IN_PROGRESS' }, byes: [], games: [{ ...game, id: 'live', status: 'LIVE' }, { ...game, id: 'current-final' }] };
const previous = { season, round: { id: 'previous', number: 2, name: 'Jornada anterior con nombre largo de prueba', scheduled_date: '2026-10-03T00:00:00.000Z', status: 'FINISHED' }, byes: [], games: [{ ...game, id: 'old-unknown', scheduled_time: null }, { ...game, id: 'old-early', status: 'WALKOVER' }, { ...game, id: 'old-late', scheduled_time: '22:00' }, { ...game, id: 'current-final', home_score: 99 }] };

async function checkGroups(page) {
  const problems = await page.locator('.league-live').evaluate(live => {
    const errors = [];
    const groups = [...live.querySelectorAll('section[aria-labelledby^="home-results-"]')];
    for (const [index, group] of groups.entries()) {
      const bounds = group.getBoundingClientRect();
      const heading = group.querySelector('h4').getBoundingClientRect();
      const cards = [...group.querySelectorAll('.public-match-card')];
      if (heading.bottom > cards[0].getBoundingClientRect().top + 1) errors.push('Date overlaps match');
      for (const card of cards) {
        const r = card.getBoundingClientRect();
        if (r.bottom > bounds.bottom + 1 || r.bottom > live.getBoundingClientRect().bottom + 1) errors.push('Result outside section');
        if (card.nextElementSibling && r.bottom > card.nextElementSibling.getBoundingClientRect().top + 1) errors.push('Results overlap');
      }
      if (groups[index + 1] && bounds.bottom > groups[index + 1].getBoundingClientRect().top + 1) errors.push('Round groups overlap');
    }
    if (document.documentElement.scrollWidth > innerWidth + 1) errors.push('Horizontal overflow');
    return errors;
  });
  assert.deepEqual(problems, []);
}

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const output = path.resolve(__dirname, '../../.qa-artifacts');
  await fs.mkdir(output, { recursive: true });
  try {
    for (const width of [320, 360, 390, 430, 640, 768, 1024, 1280]) for (const theme of ['light', 'dark']) {
      const context = await browser.newContext({ viewport: { width, height: 844 } });
      await context.addInitScript(theme => localStorage.setItem('mfl.theme', theme), theme);
      const page = await context.newPage();
      page.setDefaultTimeout(15000);
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      let state = 'both';
      let gate;
      let release;
      await page.route('**/api/v1/**', async route => {
        const endpoint = new URL(route.request().url()).pathname;
        if ((state === 'previous-first' && endpoint.endsWith('/public/round')) || (state === 'current-first' && endpoint.endsWith('/public/round/previous'))) await gate;
        if ((state === 'calendar-error' && endpoint.endsWith('/public/rounds')) || (state === 'previous-error' && endpoint.endsWith('/public/round/previous')) || (state === 'current-error' && endpoint.endsWith('/public/round'))) return route.fulfill({ status: 503, json: { success: false, error: 'Datos no disponibles' } });
        let data = [];
        if (endpoint.endsWith('/public/round')) data = state === 'empty' ? { ...current, games: [] } : current;
        if (endpoint.endsWith('/public/round/previous')) data = previous;
        if (endpoint.endsWith('/public/round/current')) data = current;
        if (endpoint.endsWith('/public/standings')) data = { season, categories: [] };
        if (endpoint.endsWith('/public/rounds')) data = { season, rounds: ['none', 'empty'].includes(state) ? [] : [state === 'same' ? current.round : previous.round] };
        await route.fulfill({ json: { success: true, data } });
      });
      const resultCards = page.locator('section[aria-labelledby^="home-results-"] .public-match-card');
      const verifyBoth = async () => {
        await page.locator('a[href="/partido/old-late"]').waitFor();
        await page.locator('#home-results-current').waitFor();
        assert.deepEqual(await resultCards.locator('a[href^="/partido/"]').evaluateAll(links => links.map(link => link.getAttribute('href'))), ['/partido/current-final', '/partido/old-late', '/partido/old-early']);
        assert.deepEqual(await page.locator('h4 time').evaluateAll(times => times.map(time => time.getAttribute('datetime'))), ['2026-10-10', '2026-10-03']);
        assert.match(await page.locator('#home-results-previous').innerText(), /3 de octubre de 2026/);
        assert.equal(await page.locator('#home-results-previous a').getAttribute('href'), '/jornada/previous');
        assert.equal(await resultCards.filter({ has: page.locator('a[href="/partido/current-final"]') }).locator('.public-match-score').first().innerText(), '18');
        await checkGroups(page);
      };
      await page.goto(base);
      await verifyBoth();
      if ([390, 1280].includes(width)) {
        await page.locator('#home-results-current').scrollIntoViewIfNeeded();
        await page.screenshot({ path: path.join(output, `home-results-${width}-${theme}.png`) });
      }
      if ([320, 1280].includes(width)) {
        for (state of ['same', 'none', 'calendar-error', 'previous-error', 'current-error', 'empty']) {
          await page.reload();
          if (state === 'empty') await page.getByText('Todavía no hay resultados publicados.', { exact: true }).waitFor();
          else if (state === 'current-error') {
            await page.locator('#home-results-previous').waitFor();
            assert.equal(await page.locator('#home-results-current').count(), 0);
            assert.equal(await resultCards.count(), 3);
          } else {
            await page.locator('#home-results-current').waitFor();
            if (['calendar-error', 'previous-error'].includes(state)) {
              const retry = page.getByRole('button', { name: 'Reintentar resultados', exact: true });
              await retry.waitFor();
              assert.equal(await resultCards.count(), 1);
              state = 'both';
              await retry.click();
              await verifyBoth();
            } else assert.equal(await resultCards.count(), 1);
          }
          await checkGroups(page);
        }
        for (state of ['previous-first', 'current-first']) {
          gate = new Promise(resolve => { release = resolve; });
          await page.reload({ waitUntil: 'domcontentloaded' });
          await page.locator(state === 'previous-first' ? '#home-results-previous' : '#home-results-current').waitFor();
          await checkGroups(page);
          release();
          await verifyBoth();
        }
      }
      assert.deepEqual(errors, []);
      console.log(`PASS ${width} ${theme}: dates, source round, ordering, deduplication, containment`);
      await context.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
