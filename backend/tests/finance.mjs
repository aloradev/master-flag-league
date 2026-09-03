/**
 * Prueba de integración de FASE 4 — Finanzas.
 *
 * El foco es la aritmética del dinero y el alcance por rol. Un centavo
 * perdido en una suma es un reclamo que no se puede explicar, así que
 * varias comprobaciones usan cantidades con centavos raros a propósito.
 *
 * Corre contra la API COMPILADA (dist/) y crea su propia temporada, así
 * que no depende de en qué orden se ejecute.
 *
 * Uso:  node tests/finance.mjs
 */
const API = 'http://localhost:5000/api/v1';

let passed = 0;
let failed = 0;
const failures = [];

const check = (name, condition, detail = '') => {
  if (condition) { passed += 1; console.log(`  ✓ ${name}`); }
  else {
    failed += 1;
    failures.push(`${name}${detail ? ` → ${detail}` : ''}`);
    console.log(`  ✗ ${name}${detail ? ` → ${detail}` : ''}`);
  }
};

const call = async (method, path, { token, body } = {}) => {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${API}${path}`, {
    method, headers, body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { json = { raw: text.slice(0, 300) }; }
  return { status: res.status, body: json };
};

const sufijo = Date.now().toString(36).slice(-5);
const pesos = (c) => (c / 100).toFixed(2);

const run = async () => {
  console.log('\n═══ 1. PREPARACIÓN ═══');

  const login = await call('POST', '/auth/login', {
    body: { email: 'ananias.lora@go1.mx', password: 'Cancun2026' },
  });
  const admin = login.body?.data?.accessToken;
  check('Super Admin entra', Boolean(admin));
  if (!admin) process.exit(1);

  const temp = await call('POST', '/admin/seasons', {
    token: admin,
    body: {
      name: `Finanzas ${sufijo}`, year: 2028,
      startDate: '2028-09-09', registrationDeadline: '2028-09-07',
      defaultStartTime: '19:00', requireApprovalToPlay: false,
    },
  });
  check('Se crea una temporada propia', temp.status === 201, JSON.stringify(temp.body).slice(0, 150));
  const seasonId = temp.body?.data?.id;
  if (!seasonId) process.exit(1);

  const cat = await call('POST', `/admin/seasons/${seasonId}/categories`, {
    token: admin, body: { name: 'Varonil' },
  });
  const categoryId = cat.body?.data?.id;
  for (const n of ['Campo 1', 'Campo 2']) {
    await call('POST', `/admin/seasons/${seasonId}/fields`, { token: admin, body: { name: n } });
  }

  const equipos = [];
  for (const n of ['Alfa', 'Beta', 'Gama', 'Delta']) {
    const r = await call('POST', '/admin/teams', {
      token: admin,
      body: { seasonId, categoryId, name: `${n} ${sufijo}`, shortName: n.slice(0, 3).toUpperCase() },
    });
    if (r.status === 201) equipos.push(r.body.data);
  }
  check('Cuatro equipos inscritos', equipos.length === 4, `${equipos.length}`);

  console.log('\n═══ 2. SIN MONTO CONFIGURADO NO SE COBRA ═══');

  const sinMonto = await call('POST', '/finance/fees/generate-inscription', {
    token: admin, body: { seasonId },
  });
  check('Se niega a generar cargos con el monto en cero', sinMonto.status === 400, `${sinMonto.status}`);
  check('Y dice qué configurar',
    /monto de inscripción está en cero/i.test(sinMonto.body?.error ?? ''), sinMonto.body?.error);

  const conf = await call('PUT', `/admin/seasons/${seasonId}/settings/finance`, {
    token: admin,
    body: { value: { currency: 'MXN', inscription_cents: 250000, round_fee_cents: 50000, referee_fee_cents: 25000 } },
  });
  check('Se configuran los montos', conf.status === 200, JSON.stringify(conf.body).slice(0, 150));

  console.log('\n═══ 3. GENERAR LOS CARGOS DE INSCRIPCIÓN ═══');

  const gen = await call('POST', '/finance/fees/generate-inscription', {
    token: admin, body: { seasonId },
  });
  check('Se generan los cargos', gen.status === 200, JSON.stringify(gen.body).slice(0, 200));
  const g = gen.body?.data;
  check('Uno por equipo: 4 cargos', g?.created === 4, `${g?.created}`);
  check('Suman $10,000.00', g?.total_cents === 1000000, `$${pesos(g?.total_cents ?? 0)}`);
  check('El vencimiento sale del cierre de registro, no se teclea',
    g?.due_date === '2028-09-07', g?.due_date);

  const otraVez = await call('POST', '/finance/fees/generate-inscription', {
    token: admin, body: { seasonId },
  });
  check('Correrlo otra vez NO cobra doble',
    otraVez.body?.data?.created === 0 && otraVez.body?.data?.skipped === 4,
    `creó ${otraVez.body?.data?.created}, saltó ${otraVez.body?.data?.skipped}`);

  const cargos = await call('GET', `/finance/fees?seasonId=${seasonId}`, { token: admin });
  check('Siguen siendo 4 cargos', (cargos.body?.data ?? []).length === 4,
    `${(cargos.body?.data ?? []).length}`);
  const c1 = cargos.body.data.find((x) => x.team_id === equipos[0].id);
  check('Nace PENDING, sin nada pagado', c1?.status === 'PENDING' && c1?.paid_cents === 0, c1?.status);
  check('Con el saldo completo', c1?.balance_cents === 250000, `${c1?.balance_cents}`);
  check('Y su concepto en español', c1?.concept_label === 'Inscripción', c1?.concept_label);

  console.log('\n═══ 4. PAGO PARCIAL: EL ESTADO SE DEDUCE ═══');

  const parcial = await call('POST', '/finance/payments', {
    token: admin,
    body: { feeId: c1.id, amount: 1000, paidOn: '2028-08-01', method: 'TRANSFER', reference: 'SPEI-001' },
  });
  check('Se registra un abono de $1,000', parcial.status === 201, JSON.stringify(parcial.body).slice(0, 200));
  check('Convierte pesos a centavos exactos', parcial.body?.data?.amount_cents === 100000,
    `${parcial.body?.data?.amount_cents}`);
  const trasParcial = parcial.body?.data?.fee;
  check('El cargo pasa a PARCIAL sin que nadie lo marque', trasParcial?.status === 'PARTIAL',
    trasParcial?.status);
  check('El saldo baja a $1,500', trasParcial?.balance_cents === 150000,
    `$${pesos(trasParcial?.balance_cents ?? 0)}`);

  console.log('\n═══ 5. SOBREPAGO: SE RECHAZA CON EL DATO ÚTIL ═══');

  const sobre = await call('POST', '/finance/payments', {
    token: admin, body: { feeId: c1.id, amount: 2000 },
  });
  check('Rechaza un pago que excede el saldo', sobre.status === 400, `${sobre.status}`);
  check('Y dice exactamente cuánto falta',
    /le faltan \$1500\.00/.test(sobre.body?.error ?? ''), sobre.body?.error);

  const cero = await call('POST', '/finance/payments', { token: admin, body: { feeId: c1.id, amount: 0 } });
  check('Rechaza un pago de cero', cero.status === 400, `${cero.status}`);
  const negativo = await call('POST', '/finance/payments', { token: admin, body: { feeId: c1.id, amount: -500 } });
  check('Rechaza un pago negativo', negativo.status === 400, `${negativo.status}`);
  const letras = await call('POST', '/finance/payments', { token: admin, body: { feeId: c1.id, amount: 'mil' } });
  check('Rechaza una cantidad que no es número', letras.status === 400, `${letras.status}`);

  console.log('\n═══ 6. CENTAVOS: NADA SE PIERDE EN EL CAMINO ═══');
  /**
   * Estas cantidades están elegidas para romper el punto flotante:
   * 0.1 + 0.2 !== 0.3, y 1234.56 * 100 da 123455.99999999999 en coma
   * flotante. Si en algún punto alguien usara parseFloat o NUMERIC sin
   * cuidado, aquí faltaría un centavo.
   */
  const c2 = cargos.body.data.find((x) => x.team_id === equipos[1].id);
  const trozos = [1234.56, 0.1, 0.2, 0.03, 999.99, 15.62];
  const esperado = 123456 + 10 + 20 + 3 + 99999 + 1562;
  let sumaDevuelta = 0;
  let todosOk = true;
  for (const t of trozos) {
    const r = await call('POST', '/finance/payments', { token: admin, body: { feeId: c2.id, amount: t } });
    if (r.status !== 201) { todosOk = false; break; }
    sumaDevuelta += r.body.data.amount_cents;
  }
  check('Los seis abonos con centavos entran', todosOk);
  check('La suma en centavos es exacta', sumaDevuelta === esperado, `${sumaDevuelta} vs ${esperado}`);

  const revisado = (await call('GET', `/finance/fees?seasonId=${seasonId}`, { token: admin }))
    .body.data.find((x) => x.id === c2.id);
  check('La base devuelve la misma suma, al centavo',
    revisado?.paid_cents === esperado, `${revisado?.paid_cents} vs ${esperado}`);
  check('Y el saldo cuadra exactamente',
    revisado?.balance_cents === 250000 - esperado,
    `${revisado?.balance_cents} vs ${250000 - esperado}`);

  console.log('\n═══ 7. LIQUIDAR Y ANULAR ═══');

  const resto = await call('POST', '/finance/payments', {
    token: admin, body: { feeId: c1.id, amount: 1500, method: 'CASH' },
  });
  check('Se liquida el resto', resto.status === 201);
  check('El cargo queda PAGADO', resto.body?.data?.fee?.status === 'PAID',
    resto.body?.data?.fee?.status);
  check('Con saldo cero', resto.body?.data?.fee?.balance_cents === 0,
    `${resto.body?.data?.fee?.balance_cents}`);

  const yaPagado = await call('POST', '/finance/payments', { token: admin, body: { feeId: c1.id, amount: 1 } });
  check('No se puede pagar un cargo ya liquidado', yaPagado.status === 409, `${yaPagado.status}`);

  const sinMotivo = await call('POST', `/finance/payments/${resto.body.data.id}/void`, { token: admin });
  check('Anular un pago SIN motivo se rechaza', sinMotivo.status === 400, `${sinMotivo.status}`);
  check('Porque es dinero que alguien entregó',
    /exige un motivo/i.test(sinMotivo.body?.error ?? ''), sinMotivo.body?.error);

  const anulado = await call('POST', `/finance/payments/${resto.body.data.id}/void`, {
    token: admin, body: { reason: 'El cheque se devolvió' },
  });
  check('Con motivo sí se anula', anulado.status === 200);
  check('Y el cargo vuelve a deber $1,500',
    anulado.body?.data?.fee?.balance_cents === 150000,
    `$${pesos(anulado.body?.data?.fee?.balance_cents ?? 0)}`);
  check('Volviendo a PARCIAL', anulado.body?.data?.fee?.status === 'PARTIAL',
    anulado.body?.data?.fee?.status);

  const historial = await call('GET', `/finance/payments?teamId=${equipos[0].id}`, { token: admin });
  const elAnulado = (historial.body?.data ?? []).find((p) => p.id === resto.body.data.id);
  check('El pago anulado NO se borró del historial', Boolean(elAnulado));
  check('Queda marcado, con su motivo',
    Boolean(elAnulado?.voided_at) && elAnulado?.void_reason === 'El cheque se devolvió',
    elAnulado?.void_reason);

  console.log('\n═══ 8. CANCELAR UN CARGO ═══');

  const conPagos = await call('POST', `/finance/fees/${c2.id}/cancel`, {
    token: admin, body: { reason: 'error' },
  });
  check('No se cancela un cargo que ya tiene pagos', conPagos.status === 409, `${conPagos.status}`);
  check('Y dice cuánto hay aplicado',
    /ya tiene .* pagados/i.test(conPagos.body?.error ?? ''), conPagos.body?.error);

  const multa = await call('POST', '/finance/fees', {
    token: admin,
    body: { teamId: equipos[2].id, concept: 'FINE', description: 'Alineación indebida',
            amount: 500, dueDate: '2028-09-20' },
  });
  check('Se crea una multa a mano', multa.status === 201, JSON.stringify(multa.body).slice(0, 150));
  const cancelada = await call('POST', `/finance/fees/${multa.body.data.id}/cancel`, {
    token: admin, body: { reason: 'Se resolvió a favor del equipo' },
  });
  check('Un cargo sin pagos sí se cancela', cancelada.status === 200);
  const trasCancelar = (await call('GET', `/finance/fees?seasonId=${seasonId}`, { token: admin }))
    .body.data.find((x) => x.id === multa.body.data.id);
  check('Queda CANCELLED, no borrado', trasCancelar?.status === 'CANCELLED', trasCancelar?.status);
  check('Y deja de sumar al saldo', trasCancelar?.balance_cents === 0, `${trasCancelar?.balance_cents}`);

  const dobleInscripcion = await call('POST', '/finance/fees', {
    token: admin,
    body: { teamId: equipos[0].id, concept: 'INSCRIPTION', amount: 2500, dueDate: '2028-09-07' },
  });
  check('No se puede crear una segunda inscripción al mismo equipo',
    dobleInscripcion.status === 409, `${dobleInscripcion.status}`);

  console.log('\n═══ 9. VENCIDO ═══');

  const vencido = await call('POST', '/finance/fees', {
    token: admin,
    body: { teamId: equipos[3].id, concept: 'OTHER', description: 'Cargo del año pasado',
            amount: 300, dueDate: '2020-01-15' },
  });
  check('Se crea un cargo con fecha pasada', vencido.status === 201);
  const elVencido = (await call('GET', `/finance/fees?seasonId=${seasonId}`, { token: admin }))
    .body.data.find((x) => x.id === vencido.body.data.id);
  check('El sistema lo marca VENCIDO solo', elVencido?.status === 'OVERDUE', elVencido?.status);

  const pendientes = await call('GET', `/finance/fees?seasonId=${seasonId}&pending=1`, { token: admin });
  const estados = new Set((pendientes.body?.data ?? []).map((f) => f.status));
  check('El filtro de pendientes excluye pagados y cancelados',
    !estados.has('PAID') && !estados.has('CANCELLED'), [...estados].join(','));

  console.log('\n═══ 10. CARGOS DE JORNADA: SOLO QUIEN JUEGA ═══');

  const j = await call('POST', '/admin/rounds', { token: admin, body: { seasonId } });
  check('Se genera una jornada', j.status === 201, JSON.stringify(j.body).slice(0, 150));
  const roundId = j.body?.data?.id;

  const enBorrador = await call('POST', `/finance/fees/generate-round/${roundId}`, { token: admin });
  check('No se cobra una jornada en borrador', enBorrador.status === 400, `${enBorrador.status}`);
  check('Porque todavía puede cambiar',
    /publícala antes de cobrarla/i.test(enBorrador.body?.error ?? ''), enBorrador.body?.error);

  // Se cancela un partido para que dos equipos NO jueguen esa noche: es el
  // caso que un cobro manual equivoca siempre, porque quien captura mira
  // la lista de equipos y no la de partidos.
  const partidos = j.body.data.games;
  await call('PUT', `/admin/games/${partidos[1].id}`, { token: admin, body: { status: 'CANCELLED' } });
  await call('POST', `/admin/rounds/${roundId}/publish`, { token: admin });

  const cobroJornada = await call('POST', `/finance/fees/generate-round/${roundId}`, { token: admin });
  check('Se cobra el arbitraje de la jornada', cobroJornada.status === 200,
    JSON.stringify(cobroJornada.body).slice(0, 200));
  check('Solo a los 2 equipos que SÍ juegan, no a los 4',
    cobroJornada.body?.data?.created === 2, `${cobroJornada.body?.data?.created}`);
  check('El vencimiento es la fecha de la jornada',
    cobroJornada.body?.data?.due_date === String(j.body.data.scheduled_date).slice(0, 10),
    `${cobroJornada.body?.data?.due_date} vs ${String(j.body.data.scheduled_date).slice(0, 10)}`);

  const jugaron = [partidos[0].home_team_id, partidos[0].away_team_id];
  const cargosJornada = (await call('GET', `/finance/fees?seasonId=${seasonId}&concept=ROUND`, { token: admin }))
    .body.data;
  check('Y son exactamente los equipos de ese partido',
    cargosJornada.length === 2 && cargosJornada.every((f) => jugaron.includes(f.team_id)),
    cargosJornada.map((f) => f.team_name).join(', '));
  check('Con el número de jornada en la descripción',
    cargosJornada.every((f) => /Arbitraje jornada 1/.test(f.description ?? '')),
    cargosJornada[0]?.description);

  const cobrarDosVeces = await call('POST', `/finance/fees/generate-round/${roundId}`, { token: admin });
  check('Cobrar la misma jornada otra vez no duplica',
    cobrarDosVeces.body?.data?.created === 0 && cobrarDosVeces.body?.data?.skipped === 2,
    `creó ${cobrarDosVeces.body?.data?.created}`);

  console.log('\n═══ 11. GASTOS Y PAGO A ÁRBITROS ═══');

  const arb = await call('POST', '/admin/referees', {
    token: admin, body: { seasonId, name: 'Ricardo Solís' },
  });
  const gasto = await call('POST', '/finance/expenses', {
    token: admin,
    body: { seasonId, category: 'REFEREES', description: 'Arbitraje jornada 1',
            amount: 250, spentOn: '2028-09-09', roundId, refereeId: arb.body?.data?.id },
  });
  check('Se registra el pago al árbitro como gasto', gasto.status === 201,
    JSON.stringify(gasto.body).slice(0, 150));
  check('En centavos exactos', gasto.body?.data?.amount_cents === 25000,
    `${gasto.body?.data?.amount_cents}`);

  const rentaCampo = await call('POST', '/finance/expenses', {
    token: admin,
    body: { seasonId, category: 'FIELDS', description: 'Renta de los dos campos', amount: 1800 },
  });
  check('Y la renta de campos', rentaCampo.status === 201);

  const categoriaMala = await call('POST', '/finance/expenses', {
    token: admin, body: { seasonId, category: 'CERVEZAS', description: 'x', amount: 100 },
  });
  check('Rechaza una categoría que no existe', categoriaMala.status === 400, `${categoriaMala.status}`);

  const gastos = await call('GET', `/finance/expenses?seasonId=${seasonId}`, { token: admin });
  check('Se listan los dos gastos', (gastos.body?.data ?? []).length === 2,
    `${(gastos.body?.data ?? []).length}`);
  check('Con la categoría en español',
    gastos.body.data.some((e) => e.category_label === 'Arbitraje'),
    gastos.body.data.map((e) => e.category_label).join(','));
  check('Y el nombre del árbitro',
    gastos.body.data.some((e) => e.referee_name === 'Ricardo Solís'));

  console.log('\n═══ 12. BALANCE: LO FACTURADO NO ES LO COBRADO ═══');

  const bal = await call('GET', `/finance/balance?seasonId=${seasonId}`, { token: admin });
  check('El balance se consulta', bal.status === 200, JSON.stringify(bal.body).slice(0, 150));
  const b = bal.body?.data;

  // Cargos vigentes: 4 inscripciones (10 000) + 1 vencido (300) + 2 jornadas (1 000) = 11 300
  check('Lo facturado suma $11,300', b?.expected_cents === 1130000, `$${pesos(b?.expected_cents ?? 0)}`);
  const esperadoIngreso = 100000 + esperado;
  check('Lo cobrado de verdad es menor y exacto', b?.income_cents === esperadoIngreso,
    `$${pesos(b?.income_cents ?? 0)} vs $${pesos(esperadoIngreso)}`);
  check('Por cobrar = facturado − cobrado',
    b?.receivable_cents === 1130000 - esperadoIngreso, `$${pesos(b?.receivable_cents ?? 0)}`);
  check('Los gastos suman $2,050', b?.expenses_cents === 205000, `$${pesos(b?.expenses_cents ?? 0)}`);
  check('El neto es cobrado − gastos, no facturado − gastos',
    b?.net_cents === esperadoIngreso - 205000, `$${pesos(b?.net_cents ?? 0)}`);
  check('Trae el porcentaje de cobranza',
    typeof b?.collection_rate === 'number' && b.collection_rate > 0, `${b?.collection_rate}%`);
  check('Desglosado por concepto', (b?.by_concept ?? []).length >= 3,
    (b?.by_concept ?? []).map((x) => x.label).join(', '));
  check('Y por categoría de gasto', (b?.by_expense_category ?? []).length === 2,
    (b?.by_expense_category ?? []).map((x) => x.label).join(', '));
  const elArbitro = (b?.referees ?? []).find((r) => r.name === 'Ricardo Solís');
  check('Y lo pagado a cada árbitro', elArbitro?.paid_cents === 25000, `${elArbitro?.paid_cents}`);

  console.log('\n═══ 13. CUENTAS POR COBRAR ═══');

  const cuentas = await call('GET', `/finance/accounts?seasonId=${seasonId}`, { token: admin });
  check('Se consultan las cuentas', cuentas.status === 200);
  const filas = cuentas.body?.data ?? [];
  check('Aparecen los 4 equipos', filas.length === 4, `${filas.length}`);
  check('Ordenadas por lo vencido primero: a quién hay que llamar',
    filas[0]?.overdue_cents >= (filas[1]?.overdue_cents ?? 0),
    filas.map((f) => `${f.team_name}:${f.overdue_cents}`).join(' '));
  const conVencido = filas.find((f) => f.team_id === equipos[3].id);
  check('El equipo con el cargo viejo sale VENCIDO', conVencido?.status === 'OVERDUE',
    conVencido?.status);
  check('Con el monto vencido exacto', conVencido?.overdue_cents === 30000,
    `$${pesos(conVencido?.overdue_cents ?? 0)}`);
  check('Todos los equipos traen su saldo, aunque sea cero',
    filas.every((f) => typeof f.balance_cents === 'number'));

  const estadoCuenta = await call('GET', `/finance/teams/${equipos[0].id}/statement`, { token: admin });
  check('El estado de cuenta de un equipo se consulta', estadoCuenta.status === 200);
  check('Trae sus cargos', (estadoCuenta.body?.data?.fees ?? []).length >= 1);
  check('Sus pagos, incluido el anulado',
    (estadoCuenta.body?.data?.payments ?? []).length >= 2,
    `${(estadoCuenta.body?.data?.payments ?? []).length}`);
  /**
   * El saldo del resumen debe cuadrar con la suma de los cargos, no con
   * una cantidad fija: la primera versión esperaba $1,500 y fallaba
   * porque el generador le pudo asignar a ese equipo el cargo de
   * arbitraje de la jornada. Esperar un número concreto habría obligado
   * a fijar el emparejamiento, y lo que de verdad importa es que el
   * encabezado no contradiga al detalle que tiene debajo.
   */
  const detalle = estadoCuenta.body?.data?.fees ?? [];
  const sumaDetalle = detalle
    .filter((f) => f.status !== 'CANCELLED')
    .reduce((t, f) => t + f.balance_cents, 0);
  check('El resumen cuadra con la suma de los cargos, al centavo',
    estadoCuenta.body?.data?.summary?.balance_cents === sumaDetalle,
    `resumen $${pesos(estadoCuenta.body?.data?.summary?.balance_cents ?? 0)} vs ` +
      `detalle $${pesos(sumaDetalle)}`);
  check('Y lo cobrado del resumen cuadra con lo cobrado del detalle',
    estadoCuenta.body?.data?.summary?.paid_cents ===
      detalle.filter((f) => f.status !== 'CANCELLED').reduce((t, f) => t + f.paid_cents, 0),
    `${estadoCuenta.body?.data?.summary?.paid_cents}`);

  console.log('\n═══ 14. ALCANCE POR ROL ═══');

  const mgrCorreo = `mgr.fin.${sufijo}@test.mx`;
  await call('POST', '/admin/users', {
    token: admin,
    body: { email: mgrCorreo, name: 'Encargado Alfa', password: 'Prueba2026', role: 'TEAM_MANAGER' },
  });
  const mgrId = (await call('GET', '/admin/users', { token: admin })).body?.data
    ?.find((u) => u.email === mgrCorreo)?.id;
  await call('POST', `/admin/teams/${equipos[0].id}/managers`, { token: admin, body: { userId: mgrId } });
  const manager = (await call('POST', '/auth/login', {
    body: { email: mgrCorreo, password: 'Prueba2026' },
  })).body?.data?.accessToken;
  check('El encargado entra', Boolean(manager));

  const susCargos = await call('GET', `/finance/fees?seasonId=${seasonId}`, { token: manager });
  check('El encargado ve SOLO los cargos de su equipo',
    (susCargos.body?.data ?? []).length >= 1 &&
      (susCargos.body?.data ?? []).every((f) => f.team_id === equipos[0].id),
    `${(susCargos.body?.data ?? []).length} cargos de ` +
      [...new Set((susCargos.body?.data ?? []).map((f) => f.team_name))].join(','));

  const ajeno = await call('GET', `/finance/fees?seasonId=${seasonId}&teamId=${equipos[1].id}`, {
    token: manager,
  });
  check('Pidiendo otro equipo por la URL: 403', ajeno.status === 403, `${ajeno.status}`);

  const estadoAjeno = await call('GET', `/finance/teams/${equipos[1].id}/statement`, { token: manager });
  check('Ni el estado de cuenta de otro equipo', estadoAjeno.status === 403, `${estadoAjeno.status}`);

  const suEstado = await call('GET', `/finance/teams/${equipos[0].id}/statement`, { token: manager });
  check('El suyo sí', suEstado.status === 200, `${suEstado.status}`);

  const balanceAjeno = await call('GET', `/finance/balance?seasonId=${seasonId}`, { token: manager });
  check('El balance de la liga NO es para el encargado', balanceAjeno.status === 403,
    `${balanceAjeno.status}`);
  const gastosAjenos = await call('GET', `/finance/expenses?seasonId=${seasonId}`, { token: manager });
  check('Ni los gastos de la liga', gastosAjenos.status === 403, `${gastosAjenos.status}`);

  const pagoDelManager = await call('POST', '/finance/payments', {
    token: manager, body: { feeId: c1.id, amount: 100 },
  });
  check('Un encargado NO puede registrar su propio pago', pagoDelManager.status === 403,
    `${pagoDelManager.status}`);

  // El Administrador Deportivo lee, pero no mueve dinero.
  const depCorreo = `dep.${sufijo}@test.mx`;
  await call('POST', '/admin/users', {
    token: admin,
    body: { email: depCorreo, name: 'Admin Deportivo', password: 'Prueba2026', role: 'SPORTS_ADMIN' },
  });
  const deportivo = (await call('POST', '/auth/login', {
    body: { email: depCorreo, password: 'Prueba2026' },
  })).body?.data?.accessToken;
  const leeBalance = await call('GET', `/finance/balance?seasonId=${seasonId}`, { token: deportivo });
  check('El Administrador Deportivo sí puede LEER el balance', leeBalance.status === 200,
    `${leeBalance.status}`);
  const escribePago = await call('POST', '/finance/payments', {
    token: deportivo, body: { feeId: c1.id, amount: 100 },
  });
  check('Pero NO puede registrar pagos', escribePago.status === 403, `${escribePago.status}`);

  // Y el Administrador Financiero sí.
  const finCorreo = `fin.${sufijo}@test.mx`;
  await call('POST', '/admin/users', {
    token: admin,
    body: { email: finCorreo, name: 'Tesorera', password: 'Prueba2026', role: 'FINANCE_ADMIN' },
  });
  const tesorera = (await call('POST', '/auth/login', {
    body: { email: finCorreo, password: 'Prueba2026' },
  })).body?.data?.accessToken;
  check('El Administrador Financiero entra', Boolean(tesorera));
  const suPago = await call('POST', '/finance/payments', {
    token: tesorera, body: { feeId: c1.id, amount: 100, method: 'CASH' },
  });
  check('Y sí puede registrar un pago', suPago.status === 201,
    `${suPago.status} ${JSON.stringify(suPago.body).slice(0, 120)}`);

  console.log('\n═══ 15. PETICIONES SIN CUERPO ═══');
  const sinCuerpo = [
    ['POST', '/finance/fees', admin],
    ['POST', `/finance/fees/${c1.id}/cancel`, admin],
    ['POST', '/finance/fees/generate-inscription', admin],
    ['POST', '/finance/payments', admin],
    ['POST', `/finance/payments/${suPago.body?.data?.id ?? 'x'}/void`, admin],
    ['POST', '/finance/expenses', admin],
    ['POST', `/finance/expenses/${gasto.body?.data?.id}/void`, admin],
  ];
  const quinientos = [];
  for (const [m, ruta, token] of sinCuerpo) {
    const r = await call(m, ruta, { token });
    if (r.status >= 500) quinientos.push(`${m} ${ruta} → ${r.status}`);
  }
  check(`Ninguno de los ${sinCuerpo.length} endpoints devuelve 500 sin cuerpo`,
    quinientos.length === 0, quinientos.join(' | '));

  console.log('\n════════════════════════════════════════════════════');
  console.log(`  RESULTADO: ${passed} pasaron · ${failed} fallaron`);
  console.log('════════════════════════════════════════════════════');
  if (failed) {
    console.log('\nFallos:');
    failures.forEach((f) => console.log(`  · ${f}`));
  }
  process.exit(failed === 0 ? 0 : 1);
};

run().catch((e) => {
  console.error('\n💥 La prueba se rompió:', e);
  process.exit(1);
});
