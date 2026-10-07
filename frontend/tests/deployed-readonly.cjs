const { chromium } = require(process.env.QA_PLAYWRIGHT_PATH || 'playwright');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const site = 'https://master-flag-league.vercel.app';
const api = 'https://mfl-api.onrender.com/api/v1';

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const output = path.resolve(__dirname, '../../.qa-artifacts');
  await fs.mkdir(output, { recursive: true });
  const report = { checkedAt: new Date().toISOString(), site, readOnly: true, pages: [], api: [], assets: [], browser: [], limitations: ['No deployment, database migration, form submission, login or native sharing performed.', 'Crawler HTML is checked, not the cached preview of WhatsApp/Facebook.', 'Asset comparison identifies differences, not commit provenance.'] };
  const parser = await context.newPage();
  const parse = html => parser.evaluate(html => {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    return { title: doc.title, canonical: doc.querySelector('link[rel=canonical]')?.getAttribute('href'), robots: doc.querySelector('meta[name=robots]')?.content,
      og: Object.fromEntries([...doc.querySelectorAll('meta[property^="og:"]')].map(m => [m.getAttribute('property'), m.content])),
      assets: [...doc.querySelectorAll('script[src],link[rel=stylesheet]')].map(e => e.getAttribute('src') || e.getAttribute('href')) };
  }, html);
  const get = async (url, headers) => {
    try { const response = await context.request.get(url, { headers, timeout: 45000 }); return { response, text: await response.text() }; }
    catch (error) { return { error: error.message }; }
  };
  try {
    const routes = ['/', '/jornada', '/tabla', '/estadisticas', '/jugar', '/registro', '/favoritos'];
    const data = {};
    for (const resource of ['/public/round', '/public/standings', '/public/statistics/players']) {
      const result = await get(api + resource);
      report.api.push({ resource, status: result.response?.status(), error: result.error });
      if (result.response?.ok()) { try { data[resource] = JSON.parse(result.text).data; } catch {} }
    }
    const round = data['/public/round'];
    const team = data['/public/standings']?.categories?.flatMap(group => group.rows || [])[0];
    const player = data['/public/statistics/players']?.[0];
    if (round?.round?.id) routes.push(`/jornada/${encodeURIComponent(round.round.id)}`);
    if (round?.games?.[0]?.id) routes.push(`/partido/${encodeURIComponent(round.games[0].id)}`);
    if (team?.team_id) routes.push(`/equipos/${encodeURIComponent(team.team_id)}`);
    if (player?.player_id) routes.push(`/jugador/${encodeURIComponent(player.player_id)}`);
    else {
      for (const candidate of (data['/public/standings']?.categories?.flatMap(group => group.rows || []) || []).slice(0, 3)) {
        const result = await get(api + `/public/teams/${encodeURIComponent(candidate.team_id)}`);
        const roster = result.response?.ok() ? JSON.parse(result.text).data?.roster : [];
        if (roster?.[0]?.id) { routes.push(`/jugador/${encodeURIComponent(roster[0].id)}`); break; }
      }
      if (!routes.some(route => route.startsWith('/jugador/'))) report.limitations.push('No player deep route discovered from rankings or three public rosters.');
    }
    const local = await parse(await fs.readFile(path.resolve(__dirname, '../dist/index.html'), 'utf8'));
    for (const route of routes) {
      const result = await get(site + route + '?origen=revision', { 'User-Agent': 'WhatsApp/2.24.0' });
      const meta = result.response ? await parse(result.text) : {};
      report.pages.push({ route, status: result.response?.status(), cache: result.response?.headers()['cache-control'], xRobots: result.response?.headers()['x-robots-tag'], ...meta, canonicalExpected: site + route, error: result.error });
    }
    const root = report.pages.find(page => page.route === '/');
    report.sameAssetNamesAsLocal = JSON.stringify(root?.assets) === JSON.stringify(local.assets);
    for (const asset of root?.assets || []) {
      const result = await get(new URL(asset, site).href);
      const sha256 = result.text && crypto.createHash('sha256').update(result.text).digest('hex');
      let localSha256;
      if (/^\/assets\/[^/]+$/.test(asset)) {
        try { localSha256 = crypto.createHash('sha256').update(await fs.readFile(path.resolve(__dirname, '../dist', '.' + asset), 'utf8')).digest('hex'); } catch {}
      }
      report.assets.push({ asset, status: result.response?.status(), type: result.response?.headers()['content-type'], sha256, localSha256, matchesLocal: localSha256 ? sha256 === localSha256 : null, error: result.error });
    }
    for (const route of ['/ingresar', '/partido/qa-not-found-readonly']) {
      const result = await get(site + route);
      report.pages.push({ route, status: result.response?.status(), xRobots: result.response?.headers()['x-robots-tag'], ...(result.response ? await parse(result.text) : {}), error: result.error });
    }
    const imageUrl = root?.og?.['og:image'];
    if (imageUrl) { const result = await get(imageUrl); report.socialImage = { url: imageUrl, status: result.response?.status(), type: result.response?.headers()['content-type'] }; }
    await context.route('**/*', route => ['GET', 'HEAD', 'OPTIONS'].includes(route.request().method()) ? route.continue() : route.abort());
    for (const width of [320, 1280]) {
      const page = await context.newPage();
      await page.setViewportSize({ width, height: 844 });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      for (const route of ['/', '/tabla', '/estadisticas', '/favoritos', ...routes.filter(route => /^\/(jugador|equipos|partido|jornada)\//.test(route))]) {
        try {
          const response = await page.goto(site + route, { waitUntil: 'domcontentloaded', timeout: 45000 });
          await page.getByRole('heading', { level: 1 }).first().waitFor({ timeout: 35000 });
          if (/^\/(jugador|equipos|partido|jornada)\//.test(route)) await page.locator('.public-page-actions').waitFor({ timeout: 35000 });
          await page.locator('.ui-loading-state').first().waitFor({ state: 'hidden', timeout: 35000 });
          if (route === '/') await page.locator('.league-loading').first().waitFor({ state: 'hidden', timeout: 35000 });
          const actions = page.locator('.public-page-actions');
          report.browser.push({ width, route, status: response?.status(), h1: await page.getByRole('heading', { level: 1 }).allTextContents(), overflow: await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), shareLabel: await actions.count() ? await actions.textContent() : null, statsControlOrder: await page.locator('.public-stats-filters label').allTextContents(), errors: [...errors] });
          if (route === '/') await page.screenshot({ path: path.join(output, `deployed-home-${width}.png`), fullPage: true });
        } catch (error) { report.browser.push({ width, route, error: error.message }); }
      }
      await page.close();
    }
  } finally {
    await fs.writeFile(path.join(output, 'deployed-readonly.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
