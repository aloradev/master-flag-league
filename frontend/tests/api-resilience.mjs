import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = (await readFile(new URL('../src/lib/api.ts', import.meta.url), 'utf8'))
  .replaceAll('import.meta.env.VITE_API_URL', "''");
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
const { api } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
globalThis.localStorage = { getItem: () => null };
globalThis.fetch = async () => ({ status: 200, ok: true, json: async () => { throw new SyntaxError('HTML'); } });
await assert.rejects(api.get('/public/round'), error => error.status === 502);
globalThis.fetch = async () => { throw new TypeError('Failed to fetch'); };
await assert.rejects(api.get('/public/standings'), error => error.status === 0);
const originalTimeout = globalThis.setTimeout;
globalThis.setTimeout = callback => originalTimeout(callback, 5);
globalThis.fetch = async (_, { signal }) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError'))));
await assert.rejects(api.get('/public/round'), error => error.status === 408);
globalThis.setTimeout = originalTimeout;
console.log('OK: HTML inesperado, error de red y tiempo de espera limitado.');
