const { chromium } = require(process.env.QA_PLAYWRIGHT_PATH || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

const base = process.env.QA_BASE_URL || 'http://127.0.0.1:5184';
const team = { team_id: 'home', team_name: 'Equipo de prueba con nombre largo', short_name: 'MFL', logo_url: null, position: 1, played: 2, wins: 2, draws: 0, losses: 0, point_diff: 20, points_for: 40, points_against: 20, form: ['W', 'W'] };
const game = { id: 'live', category_name: 'Mixto', category_color: null, home_team_id: 'home', away_team_id: 'away', home_team_name: team.team_name, away_team_name: 'Visitantes', home_short_name: 'MFL', away_short_name: 'VIS', home_score: 14, away_score: 6, status: 'LIVE', scheduled_time: '20:00', field_name: 'Campo 1', touchdowns: [] };
const season = { id: 'season', name: 'Temporada de prueba', year: 2026 };
const round = { season, round: { id: 'current', number: 3, scheduled_date: '2026-10-10', status: 'IN_PROGRESS' }, games: [game, { ...game, id: 'next', status: 'SCHEDULED', home_score: null, away_score: null }], byes: [] };

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  try {
    for (const width of [320, 390, 470, 640, 768, 1024, 1280]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      await page.addInitScript(() => {
        window.cardText = [];
        const original = CanvasRenderingContext2D.prototype.fillText;
        CanvasRenderingContext2D.prototype.fillText = function (...args) { window.cardText.push(args[0]); return original.apply(this, args); };
      });
      page.setDefaultTimeout(15000);
      page.setDefaultNavigationTimeout(15000);
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.route('**/api/v1/**', route => {
        const endpoint = new URL(route.request().url()).pathname;
        let data = [];
        if (endpoint.endsWith('/public/round')) data = round;
        if (endpoint.endsWith('/public/round/previous')) data = { ...round, round: { ...round.round, id: 'previous', number: 2, scheduled_date: '2026-10-03' }, games: [{ ...game, id: 'final', status: 'FINISHED' }] };
        if (endpoint.endsWith('/public/rounds')) data = { season, rounds: [{ id: 'previous', status: 'FINISHED', scheduled_date: '2026-10-03' }] };
        if (endpoint.endsWith('/public/standings')) data = { season, categories: [{ category: { id: 'mixed', name: 'Mixto' }, rows: [team] }] };
        return route.fulfill({ json: { success: true, data } });
      });
      for (const url of ['/', '/jornada', '/tabla']) {
        console.log(`Checking ${width} ${url}`);
        await page.goto(base + url, { waitUntil: 'domcontentloaded' });
        await page.getByText(team.team_name, { exact: true }).and(page.locator(':visible')).first().waitFor();
        if (url === '/') {
          await page.locator('a[href="/partido/final"]').waitFor();
          const layoutErrors = await page.locator('.league-live').evaluate(section => {
            const errors = [];
            const cards = [...section.querySelectorAll('.public-match-card')];
            for (const card of cards) {
              const box = card.getBoundingClientRect();
              const parent = card.parentElement.getBoundingClientRect();
              if (box.bottom > parent.bottom + 1) errors.push('Card outside its column');
              if (box.bottom > section.getBoundingClientRect().bottom + 1) errors.push('Card outside league section');
              const next = card.nextElementSibling;
              if (next && box.bottom > next.getBoundingClientRect().top + 1) errors.push('Card overlaps next sibling');
              for (const child of card.children) {
                if (child.getBoundingClientRect().bottom > box.bottom + 1) errors.push('Card content outside border');
              }
            }
            const columns = section.querySelector(':scope > .grid').children;
            const left = columns[0].getBoundingClientRect();
            const right = columns[1].getBoundingClientRect();
            if (right.left < left.right - 1 && right.top < left.bottom - 1) errors.push('Standings overlap matches');
            if (section.nextElementSibling.getBoundingClientRect().top < section.getBoundingClientRect().bottom - 1) errors.push('Following section overlaps league');
            return errors;
          });
          assert.deepEqual(layoutErrors, [], `Home vertical layout ${width}`);
          await page.locator('#liga-hoy').scrollIntoViewIfNeeded();
        }
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `Overflow: ${url} ${width}`);
        assert.equal(await page.locator('.skip-link').evaluate(element => getComputedStyle(element).scrollMarginBlockStart), '160px');
        if (url === '/jornada') {
          const filterStatus = page.locator('.public-filters [role="status"]');
          assert.equal(await filterStatus.getAttribute('aria-atomic'), 'true');
          assert.ok((await filterStatus.textContent()).includes('Filtros de la jornada:'));
        }
        if (url === '/tabla' && width === 390) {
          await page.locator('.public-share-panel > summary').click();
          for (const format of ['square', 'portrait', 'story']) {
            await page.getByLabel('Formato', { exact: true }).selectOption(format);
            await page.evaluate(() => { window.cardText = []; });
            const download = page.waitForEvent('download');
            await page.getByRole('button', { name: 'Descargar tarjeta', exact: true }).click();
            assert.ok((await download).suggestedFilename().endsWith('.png'));
            const text = await page.evaluate(() => window.cardText.join(' '));
            assert.ok(text.includes('Base IFAF'));
            assert.ok(text.includes('puntos en contra'));
            assert.ok(text.includes('posición provisional'));
            assert.ok(text.includes('resolución de la liga'));
            assert.ok(!text.includes('sorteo'));
          }
        }
        await page.locator('.skip-link').focus();
        await page.keyboard.press('Enter');
        assert.equal(await page.evaluate(() => document.activeElement?.tagName), 'MAIN', `Skip link: ${url}`);
        await page.keyboard.press('Tab');
        assert.equal(await page.evaluate(() => document.activeElement === document.body), false, `Keyboard entry: ${url}`);
        const firstControl = await page.evaluate(() => document.activeElement.outerHTML);
        await page.keyboard.press('Tab');
        await page.keyboard.press('Shift+Tab');
        assert.equal(await page.evaluate(() => document.activeElement.outerHTML), firstControl, `Keyboard return: ${url}`);
        await fs.mkdir(path.resolve(__dirname, '../../.qa-artifacts'), { recursive: true });
        if (url === '/') await page.locator('.league-live').screenshot({ path: path.resolve(__dirname, `../../.qa-artifacts/home-layout-${width}.png`), animations: 'disabled' });
        await page.screenshot({ path: path.resolve(__dirname, `../../.qa-artifacts/public-${width}-${url === '/' ? 'home' : url.slice(1)}.png`), fullPage: url !== '/', timeout: 15000, animations: 'disabled' });
      }
      assert.deepEqual(errors, []);
      // An unavailable secondary feed must not hide a loaded round.
      await page.route('**/public/scrimmages', route => route.abort());
      await page.goto(base + '/jornada', { waitUntil: 'domcontentloaded' });
      await page.getByText(team.team_name, { exact: true }).first().waitFor();
      await page.close();
    }
    const page = await browser.newPage();
    page.setDefaultTimeout(15000);
    page.setDefaultNavigationTimeout(15000);
    let failing = true;
    await page.route('**/api/v1/**', route => route.fulfill(failing
      ? { status: 503, json: { success: false, error: 'Servidor temporalmente no disponible' } }
      : { json: { success: true, data: { season, categories: [] } } }));
    await page.goto(base + '/tabla', { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Reintentar', exact: true }).waitFor();
    failing = false;
    await page.getByRole('button', { name: 'Reintentar', exact: true }).click();
    await page.getByText('Todavía no se juega nada', { exact: true }).waitFor();
    await page.close();
    console.log('OK: Home, Jornada y Tabla; 320/390/470/640/768/1024/1280 px; salto al contenido, Tab/Shift+Tab; contencion vertical de tarjetas y secciones; resultados previos; scrimmages fallidos; recuperacion tras error; sin errores de React ni desbordamiento.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
