const { chromium } = require(process.env.QA_PLAYWRIGHT_PATH || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const base = process.env.QA_BASE_URL || 'http://127.0.0.1:5191';
const row = (id, wins, losses) => ({ team_id: id, team_name: id, position: 1, played: wins + losses,
  wins, losses, draws: 0, points_for: 20, points_against: 10, point_diff: 10, form: ['W'] });
const standings = { season: { id: 's', name: 'Temporada de prueba' }, categories: [
  { category: { id: 'mixed', name: 'Mixto' }, rows: [row('Furia', 1, 0)] },
  { category: { id: 'women', name: 'Femenil' }, rows: [row('Queens', 1, 1)] },
] };

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  try {
    await fs.mkdir(path.resolve(__dirname, '../../.qa-artifacts'), { recursive: true });
    for (const width of [320, 390, 768, 1280]) for (const theme of ['light', 'dark']) {
      const page = await browser.newPage({ viewport: { width, height: 844 } });
      page.setDefaultTimeout(15000);
      await page.addInitScript(theme => localStorage.setItem('mfl.theme', theme), theme);
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.route('**/api/v1/**', route => route.fulfill({ json: { success: true,
        data: route.request().url().includes('/public/standings') ? standings : [] } }));
      await page.goto(base + '/tabla?origen=prueba');
      const category = page.getByLabel('Categoría', { exact: true });
      await category.waitFor();
      const rules = page.locator('details').filter({ has: page.locator('summary', { hasText: '¿Cómo se ordena la tabla?' }) });
      assert.equal(await rules.getAttribute('open'), null);
      assert.equal(await page.locator('table').count(), 2);
      assert.equal(await page.locator('table').first().getByRole('columnheader', { name: '%', exact: true }).count(), 1);
      assert.ok((await page.locator('table').first().textContent()).includes('100%'));
      await category.selectOption('women');
      assert.equal(await page.locator('table').count(), 1);
      assert.ok((await page.locator('table').textContent()).includes('50%'));
      assert.ok(page.url().includes('origen=prueba'));
      await page.reload();
      assert.equal(await category.inputValue(), 'women');
      await page.getByRole('button', { name: 'Limpiar filtros' }).click();
      assert.equal(await page.locator('table').count(), 2);
      await rules.locator('summary').click();
      await page.getByText(/Anotar más no supera/).waitFor();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
      await rules.locator('summary').click();
      const headerControls = await page.locator('.public-shell > header a:visible, .public-shell > header button:visible').evaluateAll(elements =>
        elements.map(element => { const r = element.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }; }));
      for (let i = 0; i < headerControls.length; i++) {
        const a = headerControls[i];
        assert.ok(a.left >= 0 && a.right <= width + 1);
        for (let j = i + 1; j < headerControls.length; j++) {
          const b = headerControls[j];
          assert.ok(!(Math.min(a.right, b.right) > Math.max(a.left, b.left) + 1 && Math.min(a.bottom, b.bottom) > Math.max(a.top, b.top) + 1), 'Header controls must not overlap');
        }
      }
      await page.screenshot({ path: path.resolve(__dirname, `../../.qa-artifacts/ux-table-${width}-${theme}.png`), fullPage: true });
      await page.goto(base + '/tabla?categoria=removed');
      await page.getByRole('button', { name: 'Ver todas las categorías', exact: true }).click();
      assert.equal(await page.locator('table').count(), 2);
      await page.goto(base + '/enlace-inexistente');
      await page.getByRole('heading', { name: 'Página no encontrada', exact: true }).waitFor();
      assert.ok(page.url().endsWith('/enlace-inexistente'));
      await page.getByRole('link', { name: 'Ver jornada', exact: true }).click();
      assert.ok(page.url().endsWith('/jornada'));
      assert.deepEqual(errors, []);
      await page.close();
      console.log(`PASS ${width} ${theme}: filtro, porcentaje, explicacion, persistencia, categoria ausente y enlace inexistente.`);
    }
    // Restore the session after registration has already mounted: hook order must stay stable.
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => localStorage.setItem('mfl.token', 'test-session'));
    await page.route('**/api/v1/**', async route => {
      const url = route.request().url();
      let data = [];
      if (url.includes('/auth/me')) {
        await new Promise(resolve => setTimeout(resolve, 800));
        data = { id: 'manager', role: 'TEAM_MANAGER', league_id: 'league', name: 'Manager', teams: [] };
      }
      if (url.includes('/registration-options')) data = [{ id: 's', name: 'Temporada', league_id: 'league', league_name: 'MFL', category_id: 'mixed', category_name: 'Mixto' }];
      return route.fulfill({ json: { success: true, data } });
    });
    await page.goto(base + '/registro');
    await page.getByRole('heading', { name: 'Inscribir equipo', exact: true }).waitFor();
    assert.ok(page.url().endsWith('/equipo/nuevo'));
    assert.deepEqual(errors, []);
    await page.getByRole('button', { name: 'Más', exact: true }).click();
    await page.getByRole('dialog', { name: 'Más secciones', exact: true }).waitFor();
    await page.keyboard.press('Escape');
    assert.equal(await page.getByRole('dialog').count(), 0);
    await page.locator('header').getByRole('link', { name: 'Ir al inicio de Master Flag League', exact: true }).click();
    assert.equal(new URL(page.url()).pathname, '/');
    console.log('PASS: registro con restauracion tardia, menu movil, Escape y regreso al sitio publico.');
    const admin = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await admin.addInitScript(() => localStorage.setItem('mfl.token', 'test-session'));
    await admin.route('**/api/v1/**', route => {
      const url = route.request().url();
      let data = {};
      if (url.includes('/auth/me')) data = { id: 'sports', role: 'SPORTS_ADMIN', name: 'Deportivo', league_id: 'league', permissions: [] };
      if (url.includes('/seasons/active')) data = { id: 's', name: 'Temporada', start_date: '2026-01-01', categories: [], fields: [] };
      return route.fulfill({ json: { success: true, data } });
    });
    await admin.goto(base + '/admin/temporada');
    await admin.getByRole('heading', { name: /Temporada y categorías/ }).waitFor();
    for (const label of ['Inicio de temporada', 'Cierre de registro (opcional)', 'Límite de temporada (opcional)', 'Horario base de jornada', 'Exigir aprobación para jugar']) {
      assert.equal(await admin.getByLabel(label, { exact: false }).isDisabled(), true, label);
    }
    await admin.getByLabel('Nueva categoría', { exact: true }).waitFor();
    await admin.getByLabel('Nuevo campo', { exact: true }).waitFor();
    assert.equal(await admin.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
    console.log('PASS: configuracion sin edicion engañosa y altas con etiquetas visibles.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
