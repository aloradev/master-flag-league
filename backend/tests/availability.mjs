import assert from 'node:assert/strict';
import { proponerJornada, historialVacio } from '../dist/lib/fixture.js';
const input = { roundNumber: 1, scheduledDate: '2040-01-01',
  categories: [{ id:'c', name:'Mixto', teams:[{id:'a',name:'A'},{id:'b',name:'B'}] }],
  fields:[{id:'f',name:'Campo'}], slots:['19:00','20:00'], history:historialVacio() };
assert.equal(proponerJornada({...input,earliestTimes:{a:'20:00'}}).games[0].time,'20:00');
const unavailable = proponerJornada({...input,earliestTimes:{b:'21:00'}});
assert.equal(unavailable.games[0].time,null);
assert.ok(unavailable.warnings.some(w=>w.includes('Sin horario compatible')));

const h = historialVacio();
h.porHorario.a = { '19:00': 3 };
h.porHorario.b = { '19:00': 2 };
assert.equal(proponerJornada({...input,history:h}).games[0].time,'20:00');

const h2 = historialVacio();
h2.porHorario.a = { '19:00': 3, '20:00': 1 };
h2.porHorario.b = { '19:00': 1, '20:00': 3 };
assert.equal(proponerJornada({...input,history:h2}).games[0].time,'19:00');

console.log('Disponibilidad, historial de horarios y conflicto explícito: correcto.');
