import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { requestTelemetry, operationalAlert } from '../dist/services/operations.service.js';
import { requireRole } from '../dist/middleware/auth.js';

let logs = [];
const originalLog = console.log;
const originalError = console.error;
console.log = (value) => logs.push(value);
console.error = (value) => logs.push(value);
let deliveries = 0;
process.env.OPERATIONS_WEBHOOK_URL = 'https://example.invalid/test';
globalThis.fetch = async () => { deliveries++; return new Response('{}', {status:200}); };
const res = new EventEmitter();
res.locals = {}; res.statusCode = 200;
const headers = {};
res.setHeader = (key, value) => { headers[key] = value; };
let nextCalled = false;
requestTelemetry({ method: 'GET', originalUrl: '/reset/private-token?email=private', route: {path:'/reset/:token'} }, res, () => { nextCalled = true; });
res.emit('finish');
assert.ok(nextCalled);
assert.match(headers['X-Request-ID'], /^[0-9a-f-]{36}$/);
assert.ok(!logs.join('').includes('private'));
assert.equal(JSON.parse(logs[0]).route, '/reset/:token');
await operationalAlert('TEST_INCIDENT');
await operationalAlert('TEST_INCIDENT');
assert.equal(deliveries, 1);
let denied;
requireRole('SUPER_ADMIN')({ user: {role:'TEAM_MANAGER'} }, {
  status(code) { denied = code; return this; }, json() {},
}, () => assert.fail('El manager no debe acceder'));
assert.equal(denied, 403);
let allowed = false;
requireRole('SUPER_ADMIN')({ user: {role:'SUPER_ADMIN'} }, {}, () => { allowed = true; });
assert.ok(allowed);
console.log = originalLog;
console.error = originalError;
console.log('OK: request ID, logs sin tokens, alertas sin duplicación y restricción por rol.');
