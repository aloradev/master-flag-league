import assert from 'node:assert/strict';
import { proponerJornada, historialVacio } from '../dist/lib/fixture.js';
const input = { roundNumber: 1, scheduledDate: '2040-01-01',
  categories: [{ id:'c', name:'Mixto', teams:[{id:'a',name:'A'},{id:'b',name:'B'}] }],
  fields:[{id:'f',name:'Campo'}], slots:['19:00','20:00'], history:historialVacio() };
assert.equal(proponerJornada({...input,earliestTimes:{a:'20:00'}}).games[0].time,'20:00');
const unavailable = proponerJornada({...input,earliestTimes:{b:'21:00'}});
assert.equal(unavailable.games[0].time,null);
assert.ok(unavailable.warnings.some(w=>w.includes('Sin horario compatible')));
console.log('Disponibilidad respetada y conflicto explícito: correcto.');
