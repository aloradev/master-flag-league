import assert from 'node:assert/strict';
import { registrationOpen } from '../dist/utils/registration.js';
assert.equal(registrationOpen('2026-09-20', new Date('2026-09-12T17:00:00Z')), true);
assert.equal(registrationOpen('2026-09-20', new Date('2026-09-21T04:59:59Z')), true);
assert.equal(registrationOpen('2026-09-20', new Date('2026-09-21T05:00:00Z')), false);
assert.equal(registrationOpen(null), true);
console.log('OK: registro abierto durante temporada y cierre inclusivo a medianoche de Cancún.');
