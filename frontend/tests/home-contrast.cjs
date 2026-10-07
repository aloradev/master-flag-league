const { chromium } = require(process.env.QA_PLAYWRIGHT_PATH || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const base = process.env.QA_BASE_URL || 'http://127.0.0.1:5191';

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const output = path.resolve(__dirname, '../../.qa-artifacts');
  await fs.mkdir(output, { recursive: true });
  try {
    for (const width of [320, 360, 390, 430, 640, 768, 1024, 1280]) {
      let lightLayout;
      for (const theme of ['light', 'dark']) {
        const context = await browser.newContext({ viewport: { width, height: 844 } });
        await context.addInitScript(theme => localStorage.setItem('mfl.theme', theme), theme);
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.goto(base);
        await page.locator('.campaign-community-team').first().waitFor();
        await page.locator('.league-live .public-match-card').first().waitFor();
        const result = await page.evaluate(theme => {
          const canvas = document.createElement('canvas');
          canvas.width = canvas.height = 1;
          const ctx = canvas.getContext('2d');
          const luminance = color => {
            ctx.clearRect(0, 0, 1, 1);
            ctx.fillStyle = color;
            ctx.fillRect(0, 0, 1, 1);
            const channels = [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3).map(value => {
              const c = value / 255;
              return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
            });
            return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
          };
          const checks = [];
          const check = (name, element, backgrounds, minimum = 4.5) => {
            const fg = luminance(getComputedStyle(element).color);
            for (const background of backgrounds) {
              const bg = luminance(background);
              checks.push({ name, ratio: (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05), minimum });
            }
          };
          const campaign = document.querySelector('.mfl-campaign');
          const surface = getComputedStyle(campaign).backgroundColor;
          document.querySelectorAll('.campaign-community-team').forEach(team => {
            const bg = getComputedStyle(team).backgroundColor;
            check('team name', team.querySelector('.font-bold'), [bg]);
            check('team category', team.querySelector('.text-xs'), [bg]);
          });
          check('community summary', document.querySelector('.campaign-community-summary'), [surface]);
          document.querySelectorAll('.campaign-destination-link').forEach(link => {
            check('destination action', link, theme === 'light' ? ['#fff', '#edf5f8'] : ['#152031', '#0e1623']);
          });
          const invite = theme === 'light' ? ['#edf5f8', '#d9edf3'] : ['#111b2b', '#173754'];
          check('invitation label', document.querySelector('.campaign-share-link'), invite);
          check('invitation URL', document.querySelector('.campaign-share-link input'), invite);
          const strip = document.querySelector('.campaign-strip');
          check('category strip', strip, [getComputedStyle(strip).backgroundColor]);
          if (theme === 'light') check('hero emphasis', document.querySelector('.campaign-hero h1 em'), ['#e8f2f5'], 3);
          const layout = [...document.querySelectorAll('.campaign-section,.campaign-destination,.campaign-community-team')].map(element => {
            const r = element.getBoundingClientRect();
            return [r.x, r.y + scrollY, r.width, r.height].map(Math.round);
          });
          return { checks, layout, overflow: document.documentElement.scrollWidth > innerWidth + 1 };
        }, theme);
        for (const check of result.checks) assert.ok(check.ratio >= check.minimum, `${width} ${theme} ${check.name}: ${check.ratio.toFixed(2)} < ${check.minimum}`);
        assert.equal(result.overflow, false, `Overflow ${width} ${theme}`);
        assert.deepEqual(errors, []);
        if (theme === 'light') lightLayout = result.layout;
        else assert.deepEqual(result.layout, lightLayout, `Theme changed geometry at ${width}`);
        if ([390, 1280].includes(width)) {
          await page.locator('#community').scrollIntoViewIfNeeded();
          await page.screenshot({ path: path.join(output, `home-contrast-${width}-${theme}.png`) });
        }
        await page.locator('.campaign-community-team').first().click();
        await page.waitForURL('**/equipos/**');
        console.log(`PASS ${width} ${theme}: contrast, stable layout, team link`);
        await context.close();
      }
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
