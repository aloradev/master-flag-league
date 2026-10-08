const { chromium } = require(process.env.QA_PLAYWRIGHT_PATH || 'playwright');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  try {
    for (const width of [390, 1280]) {
      const page = await browser.newPage({ viewport: { width, height: 844 } });
      await page.addInitScript(() => localStorage.setItem('mfl.token', 'fake-test-token'));
      let enabled = false, configured = true, posts = 0, birthdayPosts = 0, failing = false;
      await page.route('**/api/v1/**', route => {
        const path = new URL(route.request().url()).pathname;
        let data = {};
        if (path.endsWith('/auth/me')) data = { id: 'test', name: 'Admin', role: 'SUPER_ADMIN', league_id: 'test', permissions: [] };
        if (path.endsWith('/seasons/active')) data = { id: 'test', name: 'Prueba', start_date: '2026-01-01', categories: [], fields: [] };
        if (path.endsWith('/admin/operations')) data = { workerEnabled: enabled, emailApiConfigured: configured, emailProvider: 'brevo', webhookConfigured: true, counts: {}, stalled: 0, recentFailures: [] };
        if (path.endsWith('/process-emails')) {
          posts++;
          if (failing) return route.fulfill({ status: 503, json: { success: false, error: 'Error simulado de procesamiento' } });
        }
        if (path.endsWith('/process-birthdays')) {
          birthdayPosts++;
          if (failing) return route.fulfill({ status: 503, json: { success: false, error: 'Error simulado de cumpleaños' } });
          data = { queued: 2 };
        }
        return route.fulfill({ json: { success: true, data } });
      });
      const open = async () => { await page.goto('http://127.0.0.1:5191/admin/temporada'); await page.getByRole('button', { name: 'Procesar correos pendientes' }).waitFor(); };
      await open();
      const button = page.getByRole('button', { name: 'Procesar correos pendientes' });
      assert.equal(await button.isDisabled(), true);
      assert.equal(await page.getByRole('button', { name: 'Preparar correos de cumpleaños' }).isDisabled(), true);
      await page.getByText(/Configura EMAIL_WORKER_ENABLED=true/).waitFor();
      enabled = true; configured = false;
      await open();
      assert.equal(await button.isDisabled(), true);
      configured = true;
      await open();
      page.once('dialog', dialog => dialog.dismiss());
      await button.click();
      assert.equal(posts, 0);
      page.once('dialog', dialog => dialog.accept());
      await button.click();
      await page.getByText('Procesamiento solicitado. El estado se actualizará automáticamente.').waitFor();
      assert.equal(posts, 1);
      failing = true;
      page.once('dialog', dialog => dialog.accept());
      await button.click();
      await page.getByText('Error simulado de procesamiento').waitFor();
      assert.equal(posts, 2);
      failing = false;
      const birthdays = page.getByRole('button', { name: 'Preparar correos de cumpleaños' });
      page.once('dialog', dialog => dialog.dismiss());
      await birthdays.click();
      assert.equal(birthdayPosts, 0);
      page.once('dialog', dialog => { assert.ok(dialog.message().includes('cola compartida')); return dialog.accept(); });
      await birthdays.click();
      await page.getByRole('status').filter({ hasText: 'Felicitaciones aceptadas para encolar: 2.' }).waitFor();
      assert.equal(birthdayPosts, 1);
      assert.equal(posts, 2);
      failing = true;
      page.once('dialog', dialog => dialog.accept());
      await birthdays.click();
      await page.getByText('Error simulado de cumpleaños').waitFor();
      console.log(`PASS ${width}: pausa, proveedor ausente, cancelacion, confirmacion, solicitud y error; sin envios reales.`);
      await page.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
