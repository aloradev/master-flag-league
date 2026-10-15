/**
 * Pruebas del generador de jornadas.
 *
 * Se prueba el módulo puro, sin base de datos, simulando temporadas
 * completas y comprobando propiedades en lugar de resultados concretos:
 * "nadie repite rival mientras le quede alguien nuevo" se sostiene con
 * cualquier número de equipos, mientras que un calendario esperado a mano
 * solo se sostiene con el número de equipos que se usó al escribirlo.
 *
 * Uso:  node tests/fixture.mjs      (requiere `npm run build` antes)
 */
import { proponerJornada, pairKey, historialVacio } from '../dist/lib/fixture.js';

let pasaron = 0;
let fallaron = 0;
const fallos = [];

const check = (ok, etiqueta, detalle) => {
  if (ok) pasaron++;
  else {
    fallaron++;
    fallos.push(etiqueta + (detalle ? ` — ${detalle}` : ''));
  }
  console.log(`  ${ok ? '✓' : '✗'} ${etiqueta}${!ok && detalle ? `  → ${detalle}` : ''}`);
};

const equipos = (prefijo, n) =>
  Array.from({ length: n }, (_, i) => ({ id: `${prefijo}${i + 1}`, name: `${prefijo.toUpperCase()}-${i + 1}` }));

const campos = (n) => Array.from({ length: n }, (_, i) => ({ id: `f${i + 1}`, name: `Campo ${i + 1}` }));

/** Aplica una propuesta al historial, como haría la base al publicarla. */
const aplicar = (h, p) => {
  const sube = (mapa, clave) => (mapa[clave] = (mapa[clave] ?? 0) + 1);
  const sube2 = (mapa, a, b) => {
    mapa[a] = mapa[a] ?? {};
    mapa[a][b] = (mapa[a][b] ?? 0) + 1;
  };
  for (const g of p.games) {
    sube(h.vecesEnfrentados, pairKey(g.homeTeamId, g.awayTeamId));
    sube(h.comoLocal, g.homeTeamId);
    sube(h.comoVisitante, g.awayTeamId);
    if (g.time) {
      sube2(h.porHorario, g.homeTeamId, g.time);
      sube2(h.porHorario, g.awayTeamId, g.time);
    }
    if (g.fieldId) {
      sube2(h.porCampo, g.homeTeamId, g.fieldId);
      sube2(h.porCampo, g.awayTeamId, g.fieldId);
    }
  }
  for (const b of p.byes) sube(h.descansos, b.teamId);
  return h;
};

/** Corre `jornadas` jornadas seguidas y devuelve todas las propuestas. */
const simular = ({ categories, fields, slots, jornadas }) => {
  const h = historialVacio();
  const propuestas = [];
  for (let n = 1; n <= jornadas; n++) {
    const p = proponerJornada({
      roundNumber: n,
      scheduledDate: `2026-09-${String(11 + n).padStart(2, '0')}`,
      categories,
      fields,
      slots,
      history: h,
    });
    propuestas.push(p);
    aplicar(h, p);
  }
  return { propuestas, historial: h };
};

/** Comprobaciones que deben valer en CUALQUIER jornada. */
const invariantesDeJornada = (p, etiqueta) => {
  const vistos = new Map();
  let equipoRepetido = null;
  for (const g of p.games) {
    for (const id of [g.homeTeamId, g.awayTeamId]) {
      if (vistos.has(id)) equipoRepetido = id;
      vistos.set(id, true);
    }
  }
  check(equipoRepetido === null, `${etiqueta}: ningún equipo juega dos veces`, equipoRepetido ?? '');

  const huecos = new Set();
  let huecoRepetido = null;
  for (const g of p.games) {
    if (!g.fieldId || !g.time) continue;
    const k = `${g.fieldId}@${g.time}`;
    if (huecos.has(k)) huecoRepetido = k;
    huecos.add(k);
  }
  check(huecoRepetido === null, `${etiqueta}: ningún campo tiene dos partidos a la vez`, huecoRepetido ?? '');

  const sinHueco = p.games.filter((g) => !g.fieldId || !g.time).length;
  check(sinHueco === 0, `${etiqueta}: todo partido tiene campo y hora`, sinHueco ? `${sinHueco} sin asignar` : '');

  check(p.games.length <= p.capacity, `${etiqueta}: no se exceden los ${p.capacity} espacios de la noche`,
    `propuso ${p.games.length}`);

  const dobleDescanso = p.byes.length !== new Set(p.byes.map((b) => b.teamId)).size;
  check(!dobleDescanso, `${etiqueta}: ningún equipo aparece dos veces en descansos`);

  const jugandoYDescansando = p.byes.filter((b) => vistos.has(b.teamId)).map((b) => b.teamId);
  check(jugandoYDescansando.length === 0, `${etiqueta}: nadie juega y descansa a la vez`,
    jugandoYDescansando.join(', '));
};

// ══════════════════════════════════════════════════════════════
console.log('\n═══ 1. VUELTA COMPLETA CON NÚMERO PAR DE EQUIPOS ═══');
// 4 equipos en una categoría, capacidad de sobra: en 3 jornadas todos
// deben haberse enfrentado con todos, exactamente una vez.
{
  const cat = [{ id: 'c1', name: 'Varonil', teams: equipos('a', 4) }];
  const { propuestas, historial } = simular({
    categories: cat, fields: campos(2), slots: ['19:00', '20:00'], jornadas: 3,
  });

  propuestas.forEach((p, i) => invariantesDeJornada(p, `J${i + 1}`));

  const totalPartidos = propuestas.reduce((n, p) => n + p.games.length, 0);
  check(totalPartidos === 6, '3 jornadas × 2 partidos = 6 enfrentamientos', `fueron ${totalPartidos}`);

  const pares = Object.entries(historial.vecesEnfrentados);
  check(pares.length === 6, 'los 6 pares posibles se jugaron', `fueron ${pares.length}`);
  const repetido = pares.filter(([, n]) => n !== 1);
  check(repetido.length === 0, 'ninguno se repitió en la primera vuelta',
    repetido.map(([k, n]) => `${k}×${n}`).join(' '));

  const totalDescansos = propuestas.reduce((n, p) => n + p.byes.length, 0);
  check(totalDescansos === 0, 'con equipos pares nadie descansa', `hubo ${totalDescansos}`);
}

// ══════════════════════════════════════════════════════════════
console.log('\n═══ 2. DESCANSOS CON NÚMERO IMPAR DE EQUIPOS ═══');
// 5 equipos: cada jornada sobra uno. En 5 jornadas cada equipo debe
// haber descansado EXACTAMENTE una vez, y verse con los otros cuatro.
{
  const cat = [{ id: 'c1', name: 'Varonil', teams: equipos('a', 5) }];
  const { propuestas, historial } = simular({
    categories: cat, fields: campos(2), slots: ['19:00', '20:00'], jornadas: 5,
  });

  propuestas.forEach((p, i) => invariantesDeJornada(p, `J${i + 1}`));

  const porJornada = propuestas.map((p) => p.games.length);
  check(porJornada.every((n) => n === 2), 'cada jornada tiene 2 partidos', porJornada.join(','));

  const descansos = Object.values(historial.descansos);
  check(descansos.length === 5, 'los 5 equipos descansaron', `${descansos.length}`);
  check(descansos.every((n) => n === 1), 'cada uno descansó exactamente una vez', descansos.join(','));

  const pares = Object.entries(historial.vecesEnfrentados);
  check(pares.length === 10, 'los 10 pares posibles se jugaron', `${pares.length}`);
  check(pares.every(([, n]) => n === 1), 'ninguno se repitió');

  const motivos = new Set(propuestas.flatMap((p) => p.byes.map((b) => b.reason)));
  check(motivos.size === 1 && motivos.has('ODD_TEAMS'), 'el motivo es "sobra uno", no falta de espacio',
    [...motivos].join(','));
}

// ══════════════════════════════════════════════════════════════
console.log('\n═══ 3. DE 2 A 16 EQUIPOS, VUELTA COMPLETA ═══');
// La propiedad que importa: con cualquier número de equipos, una vuelta
// completa se cierra sin repetir a nadie y con descansos parejos.
{
  let todoBien = true;
  const problemas = [];
  for (let T = 2; T <= 16; T++) {
    const cat = [{ id: 'c1', name: 'Cat', teams: equipos('a', T) }];
    // Suficiente capacidad para no forzar descansos por espacio.
    const jornadas = T % 2 === 0 ? T - 1 : T;
    const { propuestas, historial } = simular({
      categories: cat, fields: campos(Math.ceil(T / 2)), slots: ['19:00'], jornadas,
    });

    const paresEsperados = (T * (T - 1)) / 2;
    const pares = Object.entries(historial.vecesEnfrentados);
    if (pares.length !== paresEsperados) problemas.push(`T=${T}: ${pares.length}/${paresEsperados} pares`);
    if (pares.some(([, n]) => n !== 1)) problemas.push(`T=${T}: hay pares repetidos`);

    const d = Object.values(historial.descansos);
    const maxD = d.length ? Math.max(...d) : 0;
    const minD = T % 2 === 1 ? Math.min(...d) : 0;
    if (T % 2 === 1 && (maxD !== 1 || minD !== 1)) problemas.push(`T=${T}: descansos ${d.join(',')}`);
    if (T % 2 === 0 && maxD !== 0) problemas.push(`T=${T}: descansos con equipos pares`);

    for (const p of propuestas) {
      const ids = p.games.flatMap((g) => [g.homeTeamId, g.awayTeamId]);
      if (ids.length !== new Set(ids).size) problemas.push(`T=${T}: equipo repetido en una jornada`);
      if (p.games.length !== Math.floor(T / 2)) {
        problemas.push(`T=${T}: jornada con ${p.games.length} partidos, esperaba ${Math.floor(T / 2)}`);
      }
    }
  }
  todoBien = problemas.length === 0;
  check(todoBien, 'de 2 a 16 equipos: vuelta completa, sin repetir, descansos parejos',
    problemas.slice(0, 4).join(' | '));
}

// ══════════════════════════════════════════════════════════════
console.log('\n═══ 4. BALANCE DE LOCAL Y VISITANTE ═══');
{
  const problemas = [];
  for (const T of [4, 6, 8, 10]) {
    const cat = [{ id: 'c1', name: 'Cat', teams: equipos('a', T) }];
    const { historial } = simular({
      categories: cat, fields: campos(T / 2), slots: ['19:00'], jornadas: T - 1,
    });
    for (const t of cat[0].teams) {
      const l = historial.comoLocal[t.id] ?? 0;
      const v = historial.comoVisitante[t.id] ?? 0;
      if (Math.abs(l - v) > 1) problemas.push(`T=${T} ${t.id}: ${l}L/${v}V`);
    }
  }
  check(problemas.length === 0, 'nadie termina la vuelta con más de un partido de diferencia entre local y visitante',
    problemas.slice(0, 5).join(' '));
}

// ══════════════════════════════════════════════════════════════
console.log('\n═══ 5. LA NOCHE REAL: 2 CAMPOS × 3 HORARIOS ═══');
// El caso de la liga: 3 categorías, 2 campos, 3 horarios = 6 espacios.
// Con 4 equipos por categoría son 6 partidos: entra justo.
{
  const cats = [
    { id: 'cv', name: 'Varonil', teams: equipos('v', 4) },
    { id: 'cf', name: 'Femenil', teams: equipos('f', 4) },
    { id: 'cm', name: 'Mixto', teams: equipos('m', 4) },
  ];
  const { propuestas } = simular({
    categories: cats, fields: campos(2), slots: ['19:00', '20:00', '21:00'], jornadas: 3,
  });

  propuestas.forEach((p, i) => invariantesDeJornada(p, `J${i + 1}`));
  const cuentas = propuestas.map((p) => p.games.length);
  check(cuentas.every((n) => n === 6), 'las 3 jornadas llenan los 6 espacios', cuentas.join(','));
  const descansos = propuestas.reduce((n, p) => n + p.byes.length, 0);
  check(descansos === 0, 'nadie descansa: los partidos caben exactos', `${descansos}`);
  const avisos = propuestas.flatMap((p) => p.warnings);
  check(avisos.length === 0, 'sin avisos que resolver', avisos.slice(0, 2).join(' | '));
}

// ══════════════════════════════════════════════════════════════
console.log('\n═══ 6. NO CABEN: LA CAPACIDAD FUERZA DESCANSOS ═══');
// 3 categorías de 6 equipos = 9 partidos posibles, pero solo 6 espacios.
// Deben quedar 6 partidos, 6 equipos descansando por espacio, y el aviso
// debe decir cuántos horarios harían falta.
{
  const cats = [
    { id: 'cv', name: 'Varonil', teams: equipos('v', 6) },
    { id: 'cf', name: 'Femenil', teams: equipos('f', 6) },
    { id: 'cm', name: 'Mixto', teams: equipos('m', 6) },
  ];
  const { propuestas, historial } = simular({
    categories: cats, fields: campos(2), slots: ['19:00', '20:00', '21:00'], jornadas: 10,
  });

  propuestas.forEach((p, i) => invariantesDeJornada(p, `J${i + 1}`));

  const p1 = propuestas[0];
  check(p1.games.length === 6, 'la primera jornada usa los 6 espacios', `${p1.games.length}`);
  const porEspacio = p1.byes.filter((b) => b.reason === 'CAPACITY');
  check(porEspacio.length === 6, '6 equipos descansan por falta de espacio', `${porEspacio.length}`);
  const aviso = p1.warnings.find((w) => w.includes('Agregar un horario'));
  check(Boolean(aviso), 'el aviso explica qué hacer', aviso ?? 'no hay aviso');
  if (aviso) console.log(`      «${aviso}»`);

  // Lo importante a la larga: el descanso forzado debe ROTAR.
  const d = Object.values(historial.descansos);
  const spread = Math.max(...d) - Math.min(...d);
  check(spread <= 1, `tras 10 jornadas los descansos siguen parejos (diferencia ${spread})`,
    `min ${Math.min(...d)} max ${Math.max(...d)}`);
}

// ══════════════════════════════════════════════════════════════
console.log('\n═══ 7. ROTACIÓN DE HORARIO Y CAMPO ═══');
// Nadie debe cerrar la noche siempre.
{
  const cats = [
    { id: 'cv', name: 'Varonil', teams: equipos('v', 4) },
    { id: 'cf', name: 'Femenil', teams: equipos('f', 4) },
  ];
  const { historial } = simular({
    categories: cats, fields: campos(2), slots: ['19:00', '20:00', '21:00'], jornadas: 6,
  });

  const problemas = [];
  for (const [equipo, horarios] of Object.entries(historial.porHorario)) {
    const usos = Object.values(horarios);
    const max = Math.max(...usos);
    const total = usos.reduce((a, b) => a + b, 0);
    // Con 6 jornadas y 3 horarios, dos veces el mismo horario es normal;
    // cuatro de seis significaría que no está rotando.
    if (max > Math.ceil(total / 2)) problemas.push(`${equipo}: ${JSON.stringify(horarios)}`);
  }
  check(problemas.length === 0, 'ningún equipo repite el mismo horario más de la mitad de las jornadas',
    problemas.slice(0, 3).join(' '));

  const camposProblemas = [];
  for (const [equipo, cs] of Object.entries(historial.porCampo)) {
    const usos = Object.values(cs);
    const total = usos.reduce((a, b) => a + b, 0);
    if (Math.max(...usos) > Math.ceil(total * 0.75)) camposProblemas.push(`${equipo}: ${JSON.stringify(cs)}`);
  }
  check(camposProblemas.length === 0, 'el uso de campos está repartido', camposProblemas.slice(0, 3).join(' '));
}

// ══════════════════════════════════════════════════════════════
console.log('\n═══ 8. CASOS BORDE ═══');
{
  const vacio = proponerJornada({
    roundNumber: 1, scheduledDate: '2026-09-12', categories: [],
    fields: campos(2), slots: ['19:00'], history: historialVacio(),
  });
  check(vacio.games.length === 0 && vacio.byes.length === 0, 'sin categorías no propone nada');

  const unSolo = proponerJornada({
    roundNumber: 1, scheduledDate: '2026-09-12',
    categories: [{ id: 'c', name: 'Varonil', teams: equipos('a', 1) }],
    fields: campos(2), slots: ['19:00'], history: historialVacio(),
  });
  check(unSolo.games.length === 0, 'un equipo solo no genera partido');
  check(unSolo.byes.length === 1 && unSolo.warnings.some((w) => w.includes('un solo equipo')),
    'y se avisa por qué');

  const sinCampos = proponerJornada({
    roundNumber: 1, scheduledDate: '2026-09-12',
    categories: [{ id: 'c', name: 'Varonil', teams: equipos('a', 4) }],
    fields: [], slots: ['19:00'], history: historialVacio(),
  });
  check(sinCampos.games.length === 0 && sinCampos.warnings.some((w) => w.includes('campos activos')),
    'sin campos no se puede programar y lo dice');

  const sinHorarios = proponerJornada({
    roundNumber: 1, scheduledDate: '2026-09-12',
    categories: [{ id: 'c', name: 'Varonil', teams: equipos('a', 4) }],
    fields: campos(2), slots: [], history: historialVacio(),
  });
  check(sinHorarios.warnings.some((w) => w.includes('horarios definidos')),
    'sin horarios avisa antes de proponer nada');

  const dos = proponerJornada({
    roundNumber: 1, scheduledDate: '2026-09-12',
    categories: [{ id: 'c', name: 'Varonil', teams: equipos('a', 2) }],
    fields: campos(2), slots: ['19:00'], history: historialVacio(),
  });
  check(dos.games.length === 1, 'dos equipos generan un partido');
}

// ══════════════════════════════════════════════════════════════
console.log('\n═══ 9. SEGUNDA VUELTA ═══');
// Al cerrarse la primera vuelta debe empezar la segunda, no bloquearse.
{
  const cat = [{ id: 'c1', name: 'Varonil', teams: equipos('a', 4) }];
  const { propuestas, historial } = simular({
    categories: cat, fields: campos(2), slots: ['19:00'], jornadas: 6,
  });

  const vuelta1 = propuestas.slice(0, 3).flatMap((p) => p.games);
  const vuelta2 = propuestas.slice(3).flatMap((p) => p.games);
  check(vuelta1.every((g) => g.meeting === 1), 'las 3 primeras jornadas son primera vuelta');
  check(vuelta2.length === 6 && vuelta2.every((g) => g.meeting === 2),
    'las 3 siguientes son segunda vuelta, no se repite antes de tiempo',
    vuelta2.map((g) => g.meeting).join(','));
  const pares = Object.values(historial.vecesEnfrentados);
  check(pares.every((n) => n === 2), 'cada par se vio exactamente dos veces', pares.join(','));
  check(propuestas[3].warnings.some((w) => w.includes('primera vuelta ya está completa')),
    'la jornada 4 avisa que empieza la segunda vuelta');
}

// ══════════════════════════════════════════════════════════════
console.log('\n═══ 10. TOPE DE REPETICIONES: NADIE VE AL MISMO RIVAL TRES VECES ═══');
/**
 * Este caso existe porque una mutación deliberada del generador —quitar
 * el tope de encuentros previos y dejar solo la preferencia— pasaba las
 * 157 comprobaciones anteriores. La razón: en un emparejamiento donde
 * todos juegan, la suma de descansos es la misma para cualquier
 * combinación, así que solo pesaba el número de encuentros previos, y
 * minimizar la SUMA no es lo mismo que acotar el MÁXIMO.
 *
 * Aquí las tres combinaciones posibles suman lo mismo (2), pero una de
 * ellas junta por TERCERA vez a un par que ya se vio dos veces mientras
 * otros solo se vieron una. Esa es la que hay que descartar.
 */
{
  const teams = equipos('a', 4);
  const h = historialVacio();
  const marcar = (a, b, n) => (h.vecesEnfrentados[pairKey(a, b)] = n);
  marcar('a1', 'a2', 2);
  marcar('a1', 'a3', 1);
  marcar('a1', 'a4', 1);
  marcar('a2', 'a3', 1);
  marcar('a2', 'a4', 1);
  marcar('a3', 'a4', 0);

  const p = proponerJornada({
    roundNumber: 7, scheduledDate: '2026-10-24',
    categories: [{ id: 'c1', name: 'Varonil', teams }],
    fields: campos(2), slots: ['19:00'], history: h,
  });

  check(p.games.length === 2, 'propone los 2 partidos posibles', `${p.games.length}`);

  const parElegido = p.games.map((g) => pairKey(g.homeTeamId, g.awayTeamId));
  const repiteTerceraVez = parElegido.includes(pairKey('a1', 'a2'));
  check(!repiteTerceraVez, 'NO vuelve a juntar al par que ya se vio dos veces',
    repiteTerceraVez ? `eligió ${parElegido.join(' y ')}` : '');

  const maxEncuentros = Math.max(...p.games.map((g) => g.meeting));
  check(maxEncuentros === 2, 'ningún partido de la jornada es el tercer encuentro de ese par',
    `el máximo fue el encuentro ${maxEncuentros}`);
  console.log(`      eligió: ${p.games.map((g) => `${g.homeTeamId}-${g.awayTeamId} (encuentro ${g.meeting})`).join(', ')}`);
}

// El mismo tope, sostenido a lo largo de una temporada larga: tras 12
// jornadas con 4 equipos ningún par debe llevar más vueltas que otro.
{
  const cat = [{ id: 'c1', name: 'Varonil', teams: equipos('a', 4) }];
  const { historial } = simular({
    categories: cat, fields: campos(2), slots: ['19:00'], jornadas: 12,
  });
  const cuentas = Object.values(historial.vecesEnfrentados);
  const spread = Math.max(...cuentas) - Math.min(...cuentas);
  check(spread === 0, 'tras 12 jornadas los 6 pares llevan el mismo número de encuentros',
    `min ${Math.min(...cuentas)} max ${Math.max(...cuentas)} → ${cuentas.join(',')}`);
}

{
  const input = { roundNumber: 1, scheduledDate: '2026-10-15',
    categories: [{ id: 'c', name: 'Mixta', teams: equipos('a', 4) }],
    fields: campos(1), slots: ['19:00', '20:00'], history: historialVacio() };
  const first = proponerJornada(input);
  const next = proponerJornada({ ...input, previousGames: first.games });
  check(next.games.every(g => first.games.find(old => old.homeTeamId === g.homeTeamId)?.time !== g.time), 'recalcular cambia horarios conservando rivales');
  check(new Set(next.games.map(g => g.fieldId + ':' + g.time)).size === next.games.length, 'recalcular no duplica espacios');
  const restricted = { ...input, categories: [{ ...input.categories[0], teams: equipos('a', 2) }], earliestTimes: { a1: '20:00' } };
  const only = proponerJornada(restricted);
  const same = proponerJornada({ ...restricted, previousGames: only.games });
  check(same.games[0].time === '20:00', 'recalcular respeta disponibilidad del equipo');
  check(same.warnings.some(w => w.includes('No se encontró otra distribución')), 'avisa cuando no hay alternativa');
  const fieldsOnly = { ...restricted, fields: campos(2) };
  const before = proponerJornada(fieldsOnly);
  const after = proponerJornada({ ...fieldsOnly, previousGames: before.games });
  check(after.games[0].time === '20:00' && after.games[0].fieldId !== before.games[0].fieldId, 'cambia campo si la hora es única');
}

console.log('\n════════════════════════════════════════════════════');
console.log(`  RESULTADO: ${pasaron} pasaron · ${fallaron} fallaron`);
console.log('════════════════════════════════════════════════════');
if (fallaron) {
  console.log('\nFallos:');
  fallos.forEach((f) => console.log(`  · ${f}`));
}
process.exit(fallaron === 0 ? 0 : 1);
