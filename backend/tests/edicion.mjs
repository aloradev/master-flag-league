/**
 * Prueba de EDICIÓN de jugadores y equipos.
 *
 * Este archivo existe porque el usuario encontró, usando la aplicación,
 * que un jugador registrado no se podía modificar ni siendo Super Admin.
 * El endpoint `PUT /players/:id` estaba en la API desde la Fase 1,
 * funcionaba, y NINGUNA pantalla lo llamaba nunca. Las 153
 * comprobaciones de la Fase 1 recorrían el alta, los documentos y la
 * validación; editar no estaba en ninguna, así que el endpoint quedó
 * huérfano sin que nada lo delatara.
 *
 * La lección: probar que un endpoint responde no prueba que alguien
 * pueda llegar a él. Estas comprobaciones cubren la regla de quién
 * cambia qué, que es la parte que sí se puede verificar sin navegador.
 *
 * Uso:  node tests/edicion.mjs
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

const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==',
  'base64'
);
const subirDoc = async (token, playerId, tipo) => {
  const form = new FormData();
  form.append('documentType', tipo);
  form.append('file', new Blob([PNG_1PX], { type: 'image/png' }), `${tipo}.png`);
  const res = await fetch(`${API}/players/${playerId}/documents`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form,
  });
  return res.status;
};

const sufijo = Date.now().toString(36).slice(-5);

const run = async () => {
  console.log('\n═══ 1. PREPARACIÓN ═══');

  const admin = (await call('POST', '/auth/login', {
    body: { email: 'ananias.lora@go1.mx', password: 'Cancun2026' },
  })).body?.data?.accessToken;
  check('Super Admin entra', Boolean(admin));
  if (!admin) process.exit(1);

  const temp = await call('POST', '/admin/seasons', {
    token: admin,
    body: { name: `Edición ${sufijo}`, year: 2029, startDate: '2029-09-08',
            registrationDeadline: '2029-09-06', requireApprovalToPlay: true },
  });
  const seasonId = temp.body?.data?.id;
  const catId = (await call('POST', `/admin/seasons/${seasonId}/categories`, {
    token: admin, body: { name: 'Varonil' },
  })).body?.data?.id;
  const equipo = (await call('POST', '/admin/teams', {
    token: admin,
    body: { seasonId, categoryId: catId, name: `Tochodrinks ${sufijo}`, shortName: 'TOC' },
  })).body?.data;
  check('Temporada, categoría y equipo listos', Boolean(seasonId && catId && equipo?.id));

  const mgrCorreo = `mgr.ed.${sufijo}@test.mx`;
  await call('POST', '/admin/users', {
    token: admin,
    body: { email: mgrCorreo, name: 'Encargado', password: 'Prueba2026', role: 'TEAM_MANAGER' },
  });
  const mgrId = (await call('GET', '/admin/users', { token: admin })).body?.data
    ?.find((u) => u.email === mgrCorreo)?.id;
  await call('POST', `/admin/teams/${equipo.id}/managers`, { token: admin, body: { userId: mgrId } });
  const manager = (await call('POST', '/auth/login', {
    body: { email: mgrCorreo, password: 'Prueba2026' },
  })).body?.data?.accessToken;
  check('El encargado entra', Boolean(manager));

  const alta = await call('POST', '/players', {
    token: manager,
    body: { teamId: equipo.id, firstName: 'Alma', lastNamePaternal: 'Ortega',
            dateOfBirth: '1998-04-12', jerseyNumber: 1, position: 'QB', phone: '9981112233' },
  });
  check('Se registra un jugador', alta.status === 201, JSON.stringify(alta.body).slice(0, 150));
  const playerId = alta.body?.data?.id;

  console.log('\n═══ 2. EDICIÓN MIENTRAS EL REGISTRO ESTÁ ABIERTO ═══');

  const ficha1 = await call('GET', `/players/${playerId}`, { token: manager });
  check('La ficha dice que se puede editar', ficha1.body?.data?.can_edit === true,
    `${ficha1.body?.data?.can_edit}`);
  check('Y enumera TODOS los campos como editables',
    (ficha1.body?.data?.editable_fields ?? []).length === 8,
    JSON.stringify(ficha1.body?.data?.editable_fields));

  const dedazo = await call('PUT', `/players/${playerId}`, {
    token: manager, body: { firstName: 'Alma Rosa', lastNamePaternal: 'Ortega Ruiz' },
  });
  check('El encargado corrige el nombre antes de la revisión', dedazo.status === 200,
    JSON.stringify(dedazo.body).slice(0, 200));
  check('La respuesta trae el jugador ya actualizado',
    dedazo.body?.data?.first_name === 'Alma Rosa', dedazo.body?.data?.first_name);
  check('Con el nombre completo rearmado',
    dedazo.body?.data?.full_name === 'Alma Rosa Ortega Ruiz', dedazo.body?.data?.full_name);
  check('Y la elegibilidad recalculada', dedazo.body?.data?.eligibility !== undefined);
  check('Sin devolverlo a revisión: no estaba aprobado',
    dedazo.body?.data?.back_to_review === false, `${dedazo.body?.data?.back_to_review}`);

  console.log('\n═══ 3. NÚMERO DUPLICADO ═══');

  const segundo = await call('POST', '/players', {
    token: manager,
    body: { teamId: equipo.id, firstName: 'Bruno', lastNamePaternal: 'Canul',
            dateOfBirth: '1997-02-02', jerseyNumber: 7 },
  });
  check('Se registra un segundo jugador con el 7', segundo.status === 201);
  const repetido = await call('PUT', `/players/${playerId}`, {
    token: manager, body: { jerseyNumber: 7 },
  });
  check('No se puede poner un número que ya está en el equipo', repetido.status === 409,
    `${repetido.status}`);
  check('Y el mensaje dice cuál', /El número 7 ya está asignado/.test(repetido.body?.error ?? ''),
    repetido.body?.error);

  const suPropio = await call('PUT', `/players/${playerId}`, {
    token: manager, body: { jerseyNumber: 1, position: 'WR' },
  });
  check('Guardar sin cambiar su propio número sí pasa', suPropio.status === 200, `${suPropio.status}`);

  console.log('\n═══ 4. APROBACIÓN Y LO QUE SE CONGELA ═══');

  for (const t of ['PHOTO', 'ID_FRONT', 'ID_BACK']) await subirDoc(manager, playerId, t);
  const aprobar = await call('POST', `/admin/players/${playerId}/review`, {
    token: admin, body: { action: 'APPROVE' },
  });
  check('Administración aprueba al jugador', aprobar.status === 200,
    JSON.stringify(aprobar.body).slice(0, 150));

  const fichaAprobado = await call('GET', `/players/${playerId}`, { token: manager });
  check('Ahora la ficha dice que el encargado NO puede editar todo',
    fichaAprobado.body?.data?.can_edit === false, `${fichaAprobado.body?.data?.can_edit}`);
  const permitidos = fichaAprobado.body?.data?.editable_fields ?? [];
  check('Pero le deja contacto y posición',
    permitidos.length === 3 && ['position', 'phone', 'email'].every((c) => permitidos.includes(c)),
    JSON.stringify(permitidos));
  check('Y NO el nombre ni la fecha de nacimiento',
    !permitidos.includes('firstName') && !permitidos.includes('dateOfBirth'),
    JSON.stringify(permitidos));

  console.log('\n═══ 5. EL ENCARGADO, CON EL JUGADOR YA APROBADO ═══');

  const telefono = await call('PUT', `/players/${playerId}`, {
    token: manager, body: { phone: '9989998877', email: 'alma@test.mx', position: 'RB' },
  });
  check('SÍ puede actualizar teléfono, correo y posición', telefono.status === 200,
    `${telefono.status} ${JSON.stringify(telefono.body).slice(0, 150)}`);
  check('Y el jugador sigue aprobado', telefono.body?.data?.status === 'APPROVED',
    telefono.body?.data?.status);
  check('Y sigue siendo elegible',
    telefono.body?.data?.eligibility?.isEligible === true,
    JSON.stringify(telefono.body?.data?.eligibility?.isEligible));

  /**
   * Aquí está el detalle que importa: el formulario manda TODOS los
   * campos en cada guardado. Si la regla rechazara por traer un campo
   * restringido en lugar de por cambiarlo, el encargado no podría
   * corregir un teléfono nunca.
   */
  const conTodoIgual = await call('PUT', `/players/${playerId}`, {
    token: manager,
    body: {
      firstName: 'Alma Rosa', lastNamePaternal: 'Ortega Ruiz', dateOfBirth: '1998-04-12',
      jerseyNumber: 1, position: 'QB', phone: '9981110000', email: 'alma@test.mx',
    },
  });
  check('Manda todos los campos sin cambiar los restringidos: pasa',
    conTodoIgual.status === 200, `${conTodoIgual.status} ${conTodoIgual.body?.error ?? ''}`);
  check('Y el cambio de posición sí se aplicó',
    conTodoIgual.body?.data?.position === 'QB', conTodoIgual.body?.data?.position);

  const nombreAjeno = await call('PUT', `/players/${playerId}`, {
    token: manager, body: { firstName: 'Otra Persona' },
  });
  check('Cambiar el nombre de un aprobado: rechazado', nombreAjeno.status === 403,
    `${nombreAjeno.status}`);
  check('El mensaje nombra el campo y dice qué SÍ puede',
    /nombre/.test(nombreAjeno.body?.error ?? '') &&
      /Teléfono, correo y posición sí los puedes/.test(nombreAjeno.body?.error ?? ''),
    nombreAjeno.body?.error);

  const fechaAjena = await call('PUT', `/players/${playerId}`, {
    token: manager, body: { dateOfBirth: '2005-01-01' },
  });
  check('Cambiar la fecha de nacimiento: rechazado', fechaAjena.status === 403, `${fechaAjena.status}`);

  const numeroAjeno = await call('PUT', `/players/${playerId}`, {
    token: manager, body: { jerseyNumber: 23 },
  });
  check('Cambiar el número de camiseta: rechazado', numeroAjeno.status === 403,
    `${numeroAjeno.status}`);
  check('Porque el roster impreso ya lo lleva',
    /número de camiseta/.test(numeroAjeno.body?.error ?? ''), numeroAjeno.body?.error);

  const intacto = await call('GET', `/players/${playerId}`, { token: admin });
  check('Nada de eso alteró al jugador',
    intacto.body?.data?.first_name === 'Alma Rosa' &&
      intacto.body?.data?.jersey_number === 1 &&
      (intacto.body?.data?.date_of_birth ?? '').slice(0, 10) === '1998-04-12',
    `${intacto.body?.data?.first_name} #${intacto.body?.data?.jersey_number} ${(intacto.body?.data?.date_of_birth ?? '').slice(0, 10)}`);

  console.log('\n═══ 6. ADMINISTRACIÓN SÍ PUEDE ═══');
  /** Este era el reporte original: "estoy como super admin pero no me deja". */

  const fichaAdmin = await call('GET', `/players/${playerId}`, { token: admin });
  check('Para administración la ficha permite todo',
    fichaAdmin.body?.data?.can_edit === true &&
      (fichaAdmin.body?.data?.editable_fields ?? []).length === 8,
    `can_edit=${fichaAdmin.body?.data?.can_edit}`);

  const correccion = await call('PUT', `/players/${playerId}`, {
    token: admin, body: { lastNamePaternal: 'Ortega', lastNameMaternal: 'Ruiz' },
  });
  check('El Super Admin corrige el apellido de un jugador aprobado',
    correccion.status === 200, `${correccion.status} ${correccion.body?.error ?? ''}`);
  check('Y NO lo devuelve a revisión: corregir un apellido es lo más común',
    correccion.body?.data?.status === 'APPROVED' && correccion.body?.data?.back_to_review === false,
    `${correccion.body?.data?.status}`);
  check('Sigue elegible', correccion.body?.data?.eligibility?.isEligible === true);

  const numeroAdmin = await call('PUT', `/players/${playerId}`, {
    token: admin, body: { jerseyNumber: 12 },
  });
  check('También le cambia el número', numeroAdmin.status === 200,
    `${numeroAdmin.status} ${numeroAdmin.body?.error ?? ''}`);
  check('Y queda registrado', numeroAdmin.body?.data?.jersey_number === 12,
    `${numeroAdmin.body?.data?.jersey_number}`);

  console.log('\n═══ 7. LA FECHA DE NACIMIENTO DEVUELVE A REVISIÓN ═══');
  /**
   * Es el único campo que lo hace, y es la salvaguarda que sostiene todo
   * el sistema de validación: aprobar con una fecha y jugar con otra es
   * el fraude que las categorías por edad invitan.
   */
  const cambioFecha = await call('PUT', `/players/${playerId}`, {
    token: admin, body: { dateOfBirth: '2001-06-30' },
  });
  check('El Super Admin puede cambiar la fecha de nacimiento', cambioFecha.status === 200,
    `${cambioFecha.status}`);
  check('Y el jugador vuelve a PENDING',
    cambioFecha.body?.data?.status === 'PENDING', cambioFecha.body?.data?.status);
  check('Lo avisa en la respuesta', cambioFecha.body?.data?.back_to_review === true);
  check('El mensaje explica por qué',
    /volvió a revisión/.test(cambioFecha.body?.message ?? ''), cambioFecha.body?.message);
  check('Y deja de ser elegible mientras tanto',
    cambioFecha.body?.data?.eligibility?.isEligible === false,
    JSON.stringify(cambioFecha.body?.data?.eligibility?.isEligible));

  // La cola devuelve { total, ready_to_review, awaiting_documents, players }.
  const enCola = await call('GET', `/admin/validation/queue?seasonId=${seasonId}`, { token: admin });
  const enFila = enCola.body?.data?.players ?? [];
  check('Reaparece en la cola de validación',
    enFila.some((p) => p.id === playerId), `${enFila.length} en cola`);
  check('Y con su documentación completa, listo para revisar de nuevo',
    enFila.find((p) => p.id === playerId)?.ready_to_review === true,
    `${enFila.find((p) => p.id === playerId)?.ready_to_review}`);

  const auditoria = await call('GET', '/admin/audit?entityType=player', { token: admin });
  check('La auditoría registra el regreso a revisión como acción propia',
    (auditoria.body?.data ?? []).some(
      (a) => a.entity_id === playerId && a.action === 'UPDATE_PLAYER_BACK_TO_REVIEW'
    ),
    (auditoria.body?.data ?? []).filter((a) => a.entity_id === playerId).map((a) => a.action).join(','));

  console.log('\n═══ 8. ALCANCE ═══');

  const otroEquipo = (await call('POST', '/admin/teams', {
    token: admin,
    body: { seasonId, categoryId: catId, name: `Ajeno ${sufijo}`, shortName: 'AJE' },
  })).body?.data;
  const jugadorAjeno = (await call('POST', '/players', {
    token: admin,
    body: { teamId: otroEquipo.id, firstName: 'Nadie', lastNamePaternal: 'Ajeno',
            dateOfBirth: '1999-09-09', jerseyNumber: 5 },
  })).body?.data;

  const intentaAjeno = await call('PUT', `/players/${jugadorAjeno.id}`, {
    token: manager, body: { phone: '000' },
  });
  check('El encargado NO puede editar un jugador de otro equipo',
    intentaAjeno.status === 403, `${intentaAjeno.status}`);

  const inexistente = await call('PUT', '/players/no_existe', {
    token: admin, body: { phone: '999' },
  });
  check('Un jugador inexistente da 404, no 500', inexistente.status === 404, `${inexistente.status}`);

  const sinCuerpo = await call('PUT', `/players/${playerId}`, { token: admin });
  check('Guardar sin cuerpo no revienta', sinCuerpo.status < 500, `${sinCuerpo.status}`);

  console.log('\n═══ 9. EDICIÓN DE EQUIPO ═══');
  /** PUT /teams/:id existía y ninguna pantalla lo llamaba tampoco. */

  const editaEquipo = await call('PUT', `/teams/${equipo.id}`, {
    token: admin,
    body: { name: `TochoDrinks Queens ${sufijo}`, shortName: 'TDQ',
            colorPrimary: '#e91e63', colorSecondary: '#ffffff' },
  });
  check('Administración corrige el nombre del equipo', editaEquipo.status === 200,
    `${editaEquipo.status} ${JSON.stringify(editaEquipo.body).slice(0, 150)}`);

  const equipoRevisado = await call('GET', `/teams/${equipo.id}`, { token: admin });
  check('El nombre nuevo queda guardado',
    equipoRevisado.body?.data?.name === `TochoDrinks Queens ${sufijo}`,
    equipoRevisado.body?.data?.name);
  check('Y el nombre corto también', equipoRevisado.body?.data?.short_name === 'TDQ',
    equipoRevisado.body?.data?.short_name);
  check('Y los colores', equipoRevisado.body?.data?.color_primary === '#e91e63',
    equipoRevisado.body?.data?.color_primary);

  const elEncargadoEdita = await call('PUT', `/teams/${equipo.id}`, {
    token: manager, body: { name: 'Nombre que puso el encargado' },
  });
  check('El encargado también puede corregir el nombre de SU equipo',
    elEncargadoEdita.status === 200, `${elEncargadoEdita.status}`);

  const elEncargadoSuspende = await call('PUT', `/teams/${equipo.id}`, {
    token: manager, body: { status: 'SUSPENDED' },
  });
  check('Pero NO puede suspenderlo', elEncargadoSuspende.status === 403,
    `${elEncargadoSuspende.status}`);

  const equipoAjeno = await call('PUT', `/teams/${otroEquipo.id}`, {
    token: manager, body: { name: 'Hackeado' },
  });
  check('Ni tocar un equipo ajeno', equipoAjeno.status === 403, `${equipoAjeno.status}`);

  const suspende = await call('PUT', `/teams/${equipo.id}`, {
    token: admin, body: { status: 'SUSPENDED' },
  });
  check('Administración sí suspende', suspende.status === 200, `${suspende.status}`);
  const trasSuspender = await call('GET', `/finance/accounts?seasonId=${seasonId}`, { token: admin });
  check('Un equipo suspendido sale de las cuentas por cobrar',
    !(trasSuspender.body?.data ?? []).some((c) => c.team_id === equipo.id),
    (trasSuspender.body?.data ?? []).map((c) => c.team_name).join(','));

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
