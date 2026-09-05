import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

// Ejecuta el cliente real con transporte simulado, sin credenciales ni servidor.
const source = (await readFile(new URL('../src/lib/api.ts', import.meta.url), 'utf8'))
  .replaceAll('import.meta.env.VITE_API_URL', "''");
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
const { api, temporaryApi, setUnauthorizedHandler } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
globalThis.localStorage = { getItem: () => 'admin-session' };
let loggedOut = false;
setUnauthorizedHandler(() => { loggedOut = true; });
let authorization;
globalThis.fetch = async (_, options) => {
  authorization = options.headers.Authorization;
  return { status: 200, ok: true, json: async () => ({ success: true, data: { id: 'game' } }) };
};
assert.equal((await temporaryApi('private-link').get('/games/game')).id, 'game');
assert.equal(authorization, 'Bearer private-link');
await api.get('/auth/me');
assert.equal(authorization, 'Bearer admin-session');
globalThis.fetch = async () => ({ status: 401 });
await assert.rejects(temporaryApi('expired').post('/games/game/start'), /enlace temporal/);
assert.equal(loggedOut, false);
await assert.rejects(api.get('/auth/me'), /sesión expiró/);
assert.equal(loggedOut, true);
console.log('✓ Acceso temporal independiente; vencimiento no cierra la sesión normal.');
