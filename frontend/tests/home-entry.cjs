const { chromium } = require(process.env.QA_PLAYWRIGHT_PATH || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const base = process.env.QA_BASE_URL || 'http://127.0.0.1:5191';
const season = { id: 'entry-season', name: 'Temporada 2026', year: 2026 };
const game = {
  id: 'entry-live', status: 'LIVE', category_name: 'Mixto', category_color: null,
  home_team_id: 'home', away_team_id: 'away', home_team_name: 'Halcones', away_team_name: 'Aztecas',
  home_short_name: 'HAL', away_short_name: 'AZT', home_score: 18, away_score: 6,
  home_logo_url: null, away_logo_url: null, scheduled_time: '20:00', field_name: 'Cancha 1', touchdowns: [],
};
const team = { team_id: 'home', team_name: 'Halcones', short_name: 'HAL', logo_url: null, position: 1, wins: 2, losses: 0, point_diff: 12 };
const round = { season, round: { id: 'entry-round', number: 3, scheduled_date: '2026-10-10', status: 'IN_PROGRESS' }, byes: [] };

async function geometry(page) {
  return page.evaluate(() => {
    const errors = [];
    const box = element => element.getBoundingClientRect();
    const hero = document.querySelector('.campaign-hero');
    const live = document.querySelector('.league-live');
    if (hero.nextElementSibling !== live) errors.push('Activity is not immediately after identity');
    if (box(hero).bottom > box(live).top + 1) errors.push('Hero overlaps activity');
    for (const element of hero.querySelectorAll('h1,p,.campaign-button')) {
      const r = box(element), parent = box(hero);
      if (r.left < parent.left - 1 || r.right > parent.right + 1 || r.bottom > parent.bottom + 1) errors.push('Hero content outside bounds');
    }
    for (const card of live.querySelectorAll('.public-match-card')) {
      const r = box(card);
      if (r.bottom > box(card.parentElement).bottom + 1) errors.push('Match outside column');
      if (r.bottom > box(live).bottom + 1) errors.push('Match outside section');
      if (card.nextElementSibling && r.bottom > box(card.nextElementSibling).top + 1) errors.push('Match overlaps sibling');
      for (const child of card.children) if (box(child).bottom > r.bottom + 1) errors.push('Match content outside border');
    }
    if (box(live).bottom > box(live.nextElementSibling).top + 1) errors.push('Activity overlaps following section');
    if (document.documentElement.scrollWidth > innerWidth + 1) errors.push('Horizontal overflow');
    const first = live.querySelector('.public-match-card');
    const bottomNav = document.querySelector('.public-bottom-nav');
    const visibleBottom = getComputedStyle(bottomNav).display === 'none' ? innerHeight : box(bottomNav).top;
    return {
      errors, firstTop: first && box(first).top,
      firstTeamBottom: first && box(first.querySelector('.public-match-team')).bottom,
      activityHeadingBottom: box(document.querySelector('#liga-hoy')).bottom, visibleBottom,
    };
  });
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
      let state = 'full';
      let release;
      let gate;
      await page.route('**/api/v1/**', async route => {
        const endpoint = new URL(route.request().url()).pathname;
        if (gate) await gate;
        if (state === 'error' && endpoint.endsWith('/public/round')) return route.fulfill({ status: 503, json: { success: false, error: 'Datos temporalmente no disponibles' } });
        let data = [];
        if (endpoint.endsWith('/public/round')) data = { ...round, games: state === 'empty' ? [] : state === 'final' ? [{ ...game, status: 'FINISHED' }] : [game, ...Array.from({ length: 3 }, (_, i) => ({ ...game, id: `next-${i}`, status: 'SCHEDULED', home_score: null, away_score: null }))] };
        if (endpoint.endsWith('/public/rounds')) data = { season, rounds: state === 'full' ? [{ id: 'entry-previous', status: 'FINISHED', scheduled_date: '2026-10-03' }] : [] };
        if (endpoint.endsWith('/public/round/entry-previous')) data = { ...round, round: { ...round.round, id: 'entry-previous', number: 2, scheduled_date: '2026-10-03' }, games: Array.from({ length: 3 }, (_, i) => ({ ...game, id: `result-${i}`, status: 'FINISHED' })) };
        if (endpoint.endsWith('/public/standings')) data = { season, categories: [{ category: { id: 'mixed', name: 'Mixto' }, rows: [team] }] };
        if (endpoint.endsWith('/public/registration-options')) data = [{ category_id: 'mixed', category_name: 'Mixto' }, { category_id: 'women', category_name: 'Femenil' }];
        if (state === 'long' && Array.isArray(data.games)) data.games = data.games.map(game => ({ ...game, home_team_name: 'Halcones'.repeat(9), away_team_name: 'Aztecas'.repeat(9), field_name: 'Cancha con nombre extendido '.repeat(3) }));
        await route.fulfill({ json: { success: true, data } });
      });
      await page.goto(base);
      await page.locator('a[href="/partido/result-2"]').waitFor();
      assert.equal(await page.locator('.league-live .public-match-card').count(), 7);
      assert.match(await page.locator('h1').innerText(), /MASTER FLAG\s+LEAGUE/);
      const result = await geometry(page);
      assert.deepEqual(result.errors, [], `${width} ${theme}`);
      assert.ok(result.firstTeamBottom < result.visibleBottom, `First team not visible at entry: ${width} ${theme}`);
      for (const target of ['/jornada', '/registro', '/jugar']) {
        const link = page.locator(`.campaign-hero a[href="${target}"]`);
        const r = await link.boundingBox();
        assert.ok(r.width >= 44 && r.height >= 44);
      }
      const image = page.locator('.campaign-hero-art');
      await image.evaluate(img => img.decode());
      assert.ok(await image.evaluate(img => img.naturalWidth > 0 && img.getBoundingClientRect().height > 0));
      if ([390, 1280].includes(width)) await page.screenshot({ path: path.join(output, `home-entry-${width}-${theme}.png`), animations: 'disabled' });
      for (const target of ['/jornada', '/registro', '/jugar']) {
        await page.locator(`.campaign-hero a[href="${target}"]`).click();
        await page.waitForURL(base + target);
        await page.goto(base);
        await page.locator('a[href="/partido/result-2"]').waitFor();
      }
      if ([320, 1280].includes(width)) {
        for (state of ['empty', 'final', 'long', 'error']) {
          await page.reload();
          if (state === 'empty') await page.getByText('Todavía no hay resultados publicados.', { exact: true }).waitFor();
          if (state === 'final') await page.locator('.league-live .public-match-card').waitFor();
          if (state === 'long') await page.getByText('Halcones'.repeat(9), { exact: true }).first().waitFor();
          if (state === 'error') {
            await page.getByRole('button', { name: 'Reintentar', exact: true }).waitFor();
            state = 'final';
            await page.getByRole('button', { name: 'Reintentar', exact: true }).click();
            await page.locator('.league-live .public-match-card').waitFor();
          }
          assert.deepEqual((await geometry(page)).errors, []);
        }
        state = 'full';
        gate = new Promise(resolve => { release = resolve; });
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.getByText('Cargando datos de la liga...', { exact: true }).first().waitFor();
        assert.deepEqual((await geometry(page)).errors, []);
        gate = null;
        release();
        await page.locator('a[href="/partido/result-2"]').waitFor();
        // Enlarge text without reserving rigid heights for dynamic content.
        const enlarged = await page.addStyleTag({ content: '.public-shell { font-size:200%; } .campaign-hero h1 { font-size:64px; } .campaign-hero p,.campaign-hero .campaign-button { font-size:24px; }' });
        assert.deepEqual((await geometry(page)).errors, [], `Enlarged text ${width} ${theme}`);
        await enlarged.evaluate(style => style.remove());
        await page.setViewportSize({ width, height: width === 320 ? 667 : 600 });
        const short = await geometry(page);
        assert.deepEqual(short.errors, []);
        assert.ok(short.activityHeadingBottom < short.visibleBottom, `Activity heading hidden on short viewport ${width} ${theme}`);
      }
      assert.deepEqual(errors, []);
      console.log(`PASS ${width} ${theme}: first match at ${Math.round(result.firstTop)}px; entry, links, containment, image`);
      await context.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
