const { chromium } = require(process.env.QA_PLAYWRIGHT_PATH || 'playwright');
const assert = require('node:assert/strict');
const base = process.env.QA_BASE_URL || 'http://127.0.0.1:5191';
const png = require('node:fs').readFileSync(require('node:path').join(__dirname, '../public/favicon.png'));

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    for (const width of [320, 390, 1280]) for (const theme of ['light', 'dark']) {
      const page = await browser.newPage({ viewport: { width, height: 900 }, serviceWorkers: 'block' });
      await page.addInitScript(theme => localStorage.setItem('mfl.theme', theme), theme);
      const original = await page.request.get(base + '/api/v1/public/players/demo_player').then(r => r.json());
      let requests = 0;
      await page.route('**/qa-identity-*', route => {
        requests++;
        if (route.request().url().includes('good')) return route.fulfill({ contentType: 'image/png', body: png });
        if (route.request().url().includes('corrupt')) return route.fulfill({ contentType: 'image/png', body: 'not an image' });
        return route.fulfill({ status: 404, body: '' });
      });
      await page.route('**/public/players/qa-*', route => {
        const mode = route.request().url().split('qa-').at(-1);
        route.fulfill({ json: { ...original, data: { ...original.data, id: `qa-${mode}`, full_name: 'Andrea Demo', jersey_number: mode === 'initials' ? null : 0,
          avatar_url: mode === 'initials' ? null : `${base}/qa-identity-${mode}-avatar.png`,
          team_logo: mode === 'initials' ? null : `${base}/qa-identity-${mode}-crest.png` } } });
      });
      await page.goto(base + '/jugador/qa-missing');
      const identity = page.getByRole('region', { name: 'Identidad deportiva' });
      const avatar = () => identity.getByRole('img', { name: 'Andrea Demo', exact: true });
      await avatar().waitFor();
      await page.waitForFunction(() => document.querySelector('[aria-label="Identidad deportiva"] [aria-label="Andrea Demo"]')?.tagName === 'DIV');
      assert.equal(await avatar().textContent(), '0');
      assert.equal((await avatar().boundingBox()).width, 80);
      const team = identity.getByRole('img', { name: original.data.team_name, exact: true });
      await page.waitForFunction(name => document.querySelector(`[aria-label="Identidad deportiva"] [aria-label="${name}"]`)?.tagName === 'DIV', original.data.team_name);
      assert.ok((await team.textContent()).length > 0);
      assert.equal((await team.boundingBox()).width, 32);
      assert.ok(requests <= 2, 'No image retry loop');
      // Router transition without a document reload exercises URL-keyed failure reset.
      for (const mode of ['good', 'corrupt', 'initials', 'good']) {
        await page.evaluate(mode => { history.pushState({}, '', `/jugador/qa-${mode}`); dispatchEvent(new PopStateEvent('popstate')); }, mode);
        if (mode === 'good') {
          await page.waitForFunction(() => {
            const img = document.querySelector('[aria-label="Identidad deportiva"] img[alt="Andrea Demo"]');
            return img?.complete && img.naturalWidth > 0;
          });
        } else {
          await page.waitForFunction(() => document.querySelector('[aria-label="Identidad deportiva"] [aria-label="Andrea Demo"]')?.tagName === 'DIV');
          assert.equal(await avatar().textContent(), mode === 'initials' ? 'AD' : '0');
        }
        assert.equal((await avatar().boundingBox()).width, 80);
      }
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.evaluate(() => { history.pushState({}, '', '/jugador/qa-corrupt'); dispatchEvent(new PopStateEvent('popstate')); });
      await page.waitForFunction(() => document.querySelector('[aria-label="Identidad deportiva"] [aria-label="Andrea Demo"]')?.tagName === 'DIV');
      await page.screenshot({ path: `../.qa-artifacts/identity-${width}-${theme}.png`, fullPage: true });
      await page.close();
      console.log(`PASS ${width} ${theme}: 404, corrupt PNG, missing URL, zero jersey, initials, dimensions, URL recovery, no retry loop.`);
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
