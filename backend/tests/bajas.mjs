/**
 * BAJA DE JUGADORES.
 *
 * Este archivo existe por un reporte hecho usando la aplicación: "el
 * super admin o manager debería poder eliminar jugadora por si no está
 * jugando ya". No había ningún endpoint para eso.
 *
 * Lo que se comprueba aquí no es que el borrado "funcione", sino las dos
 * decisiones que lo hacen correcto:
 *
 *  · Un jugador que NUNCA jugó se borra de verdad, con sus documentos:
 *    es un alta equivocada y no hay historia que conservar, pero sí
 *    datos personales que no tiene sentido guardar.
 *  · Un jugador que YA jugó se marca de baja. Borrarlo dejaría sus
 *    anotaciones sin autor y cambiaría hacia atrás los partidos ya
 *    jugados.
 *
 * Y en los dos casos: el dorsal se libera, y el jugador desaparece de
 * plantillas, listas, conteos y de la cola de validación —lo que obligó
 * a tocar dieciocho consultas—.
 *
 * Uso:  node tests/bajas.mjs      (con la API arriba)
 */
const API = 'http://localhost:5000/api/v1';

let passed = 0;
let failed = 0;
const check = (name, condition, detail = '') => {
  if (condition) { passed += 1; console.log(`  ✓ ${name}`); }
  else { failed += 1; console.log(`  ✗ ${name}${detail ? ` → ${detail}` : ''}`); }
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

  const seasonId = (await call('POST', '/admin/seasons', {
    token: admin,
    body: { name: `Bajas ${sufijo}`, year: 2031, startDate: '2031-09-06',
            registrationDeadline: '2031-09-04', requireApprovalToPlay: true },
  })).body?.data?.id;
  const catId = (await call('POST', `/admin/seasons/${seasonId}/categories`, {
    token: admin, body: { name: 'Varonil' },
  })).body?.data?.id;
  await call('POST', `/admin/seasons/${seasonId}/fields`, { token: admin, body: { name: 'Campo 1' } });

  const crearEquipo = async (nombre, corto) =>
    (await call('POST', '/admin/teams', {
      token: admin, body: { seasonId, categoryId: catId, name: `${nombre} ${sufijo}`, shortName: corto },
    })).body?.data;

  const local = await crearEquipo('Tiburones', 'TIB');
  const visita = await crearEquipo('Águilas', 'AGU');
  check('Temporada, categoría y dos equipos listos', Boolean(seasonId && catId && local?.id && visita?.id));

  const mgrCorreo = `mgr.baja.${sufijo}@test.mx`;
  await call('POST', '/admin/users', {
    token: admin,
    body: { email: mgrCorreo, name: 'Encargado', password: 'Prueba2026', role: 'TEAM_MANAGER' },
  });
  const usuarios = (await call('GET', '/admin/users', { token: admin })).body?.data ?? [];
  const mgrId = usuarios.find((u) => u.email === mgrCorreo)?.id;
  await call('POST', `/admin/teams/${local.id}/managers`, { token: admin, body: { userId: mgrId } });
  const manager = (await call('POST', '/auth/login', {
    body: { email: mgrCorreo, password: 'Prueba2026' },
  })).body?.data?.accessToken;
  check('El encargado entra', Boolean(manager));

  // Un segundo encargado, para el equipo contrario.
  const otroCorreo = `mgr.otro.${sufijo}@test.mx`;
  await call('POST', '/admin/users', {
    token: admin,
    body: { email: otroCorreo, name: 'Ajeno', password: 'Prueba2026', role: 'TEAM_MANAGER' },
  });
  const otroId = ((await call('GET', '/admin/users', { token: admin })).body?.data ?? [])
    .find((u) => u.email === otroCorreo)?.id;
  await call('POST', `/admin/teams/${visita.id}/managers`, { token: admin, body: { userId: otroId } });
  const ajeno = (await call('POST', '/auth/login', {
    body: { email: otroCorreo, password: 'Prueba2026' },
  })).body?.data?.accessToken;

  const alta = async (token, teamId, nombre, jersey) =>
    (await call('POST', '/players', {
      token,
      body: { teamId, firstName: nombre, lastNamePaternal: 'Pérez',
              dateOfBirth: '1996-05-05', jerseyNumber: jersey },
    })).body?.data?.id;

  const nunca = await alta(manager, local.id, 'Nunca', 10);
  const jugo = await alta(manager, local.id, 'Jugó', 11);
  const testigo = await alta(manager, local.id, 'Testigo', 12);
  const rival = await alta(ajeno, visita.id, 'Rival', 20);
  check('Cuatro jugadores registrados', Boolean(nunca && jugo && testigo && rival));

  console.log('\n═══ 2. EL MOTIVO ES OBLIGATORIO ═══');
  /**
   * Por lo mismo que en un rechazo: sin motivo, el registro de auditoría
   * no sirve para reconstruir qué pasó ni quién lo decidió.
   */
  const sinMotivo = await call('DELETE', `/players/${nunca}`, { token: manager });
  check('Sin cuerpo no se da de baja', sinMotivo.status === 400, `${sinMotivo.status}`);
  const motivoCorto = await call('DELETE', `/players/${nunca}`, { token: manager, body: { reason: 'x' } });
  check('Un motivo de un carácter tampoco', motivoCorto.status === 400, `${motivoCorto.status}`);
  check('Y el mensaje dice qué falta',
    /motivo/i.test(motivoCorto.body?.error ?? ''), motivoCorto.body?.error);

  console.log('\n═══ 3. QUIÉN PUEDE ═══');
  const sinSesion = await call('DELETE', `/players/${nunca}`, { body: { reason: 'Se fue' } });
  check('Sin sesión: 401', sinSesion.status === 401, `${sinSesion.status}`);
  const deOtroEquipo = await call('DELETE', `/players/${rival}`, {
    token: manager, body: { reason: 'Se fue' },
  });
  check('Un encargado NO puede dar de baja a un jugador de otro equipo',
    deOtroEquipo.status === 403 || deOtroEquipo.status === 404, `${deOtroEquipo.status}`);
  const sigueVivo = await call('GET', `/players/${rival}`, { token: ajeno });
  check('Y el jugador ajeno sigue en su equipo', sigueVivo.status === 200, `${sigueVivo.status}`);

  console.log('\n═══ 4. NUNCA JUGÓ: BORRADO REAL ═══');
  /**
   * Con documentos subidos, para comprobar que también se van: son
   * identificaciones oficiales, no miniaturas.
   */
  await subirDoc(manager, nunca, 'PHOTO');
  await subirDoc(manager, nunca, 'ID_FRONT');
  const conDocs = await call('GET', `/players/${nunca}`, { token: manager });
  check('El jugador tiene documentos antes de borrarlo',
    (conDocs.body?.data?.documents ?? []).length === 2,
    `${(conDocs.body?.data?.documents ?? []).length}`);

  const borrado = await call('DELETE', `/players/${nunca}`, {
    token: manager, body: { reason: 'Registro equivocado' },
  });
  check('Se da de baja', borrado.status === 200, JSON.stringify(borrado.body).slice(0, 200));
  check('Y el servidor decide BORRARLO, no marcarlo',
    borrado.body?.data?.modo === 'borrado', borrado.body?.data?.modo);
  check('Diciendo por qué', /[Nn]unca jugó/.test(borrado.body?.message ?? ''), borrado.body?.message);

  const yaNo = await call('GET', `/players/${nunca}`, { token: manager });
  check('La ficha ya no existe', yaNo.status === 404, `${yaNo.status}`);

  console.log('\n═══ 5. EL DORSAL QUEDA LIBRE ═══');
  /**
   * Con la restricción de tabla original, el número de quien se fue
   * quedaba bloqueado toda la temporada aunque nadie lo usara.
   */
  const reusa = await call('POST', '/players', {
    token: manager,
    body: { teamId: local.id, firstName: 'Nueva', lastNamePaternal: 'Recluta',
            dateOfBirth: '2000-01-01', jerseyNumber: 10 },
  });
  check('El número 10 se puede volver a asignar', reusa.status === 201,
    JSON.stringify(reusa.body).slice(0, 200));
  const recluta = reusa.body?.data?.id;

  console.log('\n═══ 6. YA JUGÓ: SE CONSERVA EL HISTORIAL ═══');

  // `POST /admin/rounds` calcula los enfrentamientos y los guarda: no
  // hay que teclear ni la fecha ni quién juega contra quién.
  const creada = await call('POST', '/admin/rounds', { token: admin, body: { seasonId } });
  check('Se genera la jornada', creada.status === 201, JSON.stringify(creada.body).slice(0, 250));
  const jornada = creada.body?.data;
  await call('POST', `/admin/rounds/${jornada.id}/publish`, { token: admin });

  const partido = (jornada?.games ?? [])[0];
  check('Hay un partido', Boolean(partido?.id), JSON.stringify(jornada?.games ?? []).slice(0, 200));

  // Para anotar hay que ser elegible: documentación completa y aprobada.
  for (const tipo of ['PHOTO', 'ID_FRONT', 'ID_BACK']) await subirDoc(manager, jugo, tipo);
  const aprobado = await call('POST', `/admin/players/${jugo}/review`, {
    token: admin, body: { action: 'APPROVE' },
  });
  check('El jugador queda aprobado y elegible', aprobado.status === 200,
    JSON.stringify(aprobado.body).slice(0, 200));

  const anotacion = await call('POST', `/games/${partido.id}/events`, {
    token: admin,
    body: { eventType: 'TOUCHDOWN', teamId: local.id, playerId: jugo, quarter: 1 },
  });
  check('El jugador anota un touchdown', anotacion.status === 201,
    JSON.stringify(anotacion.body).slice(0, 200));

  const marcadorAntes = (await call('GET', `/games/${partido.id}`, { token: admin }))
    .body?.data?.home_score;

  const baja = await call('DELETE', `/players/${jugo}`, {
    token: admin, body: { reason: 'Dejó el equipo' },
  });
  check('Se da de baja', baja.status === 200, JSON.stringify(baja.body).slice(0, 200));
  check('Y el servidor decide MARCARLO, no borrarlo',
    baja.body?.data?.modo === 'baja', baja.body?.data?.modo);
  check('Diciendo que conserva el historial',
    /historial/.test(baja.body?.message ?? ''), baja.body?.message);

  const marcadorDespues = (await call('GET', `/games/${partido.id}`, { token: admin }))
    .body?.data?.home_score;
  check('El marcador del partido ya jugado NO cambia',
    marcadorAntes === marcadorDespues && marcadorAntes === 6,
    `antes ${marcadorAntes}, después ${marcadorDespues}`);

  const ficha = (await call('GET', `/games/${partido.id}`, { token: admin })).body?.data;
  const bitacora = ficha?.events ?? [];
  check('Y su anotación sigue en la bitácora',
    bitacora.some((e) => e.event_type === 'TOUCHDOWN'),
    `${bitacora.length} eventos: ${JSON.stringify(Object.keys(ficha ?? {}))}`);
  check('Conservando a quién se le atribuye',
    bitacora.some((e) => e.player_id === jugo),
    JSON.stringify(bitacora[0] ?? {}).slice(0, 200));

  console.log('\n═══ 7. DESAPARECE DE TODAS PARTES ═══');
  /**
   * La parte que obligó a revisar dieciocho consultas: si el jugador se
   * queda en una sola lista, el encargado lo ve "eliminado" en una
   * pantalla y presente en otra.
   */
  const idsDeBaja = [jugo];

  const roster = (await call('GET', `/teams/${local.id}`, { token: admin })).body?.data?.roster ?? [];
  check('Fuera del roster del equipo',
    !roster.some((p) => idsDeBaja.includes(p.id)), `${roster.length} en roster`);
  check('Y los que siguen sí están',
    roster.some((p) => p.id === testigo) && roster.some((p) => p.id === recluta),
    `${roster.map((p) => p.jersey_number).join(',')}`);

  const lista = (await call('GET', '/players', { token: admin })).body?.data ?? [];
  check('Fuera de la lista de jugadores', !lista.some((p) => idsDeBaja.includes(p.id)));

  const elegibilidad = (await call('GET', `/teams/${local.id}/eligibility`, { token: admin }))
    .body?.data?.players ?? [];
  check('Fuera de la vista del árbitro', !elegibilidad.some((p) => idsDeBaja.includes(p.id)));

  const cola = (await call('GET', '/admin/validation/queue', { token: admin }))
    .body?.data?.players ?? [];
  check('Fuera de la cola de validación', !cola.some((p) => idsDeBaja.includes(p.id)));

  const equipos = (await call('GET', '/teams', { token: admin })).body?.data ?? [];
  const elLocal = equipos.find((t) => t.id === local.id);
  check('El conteo del equipo no lo cuenta',
    Number(elLocal?.players_total) === roster.length,
    `contador ${elLocal?.players_total}, roster ${roster.length}`);

  const plantilla = (await call('GET', `/games/${partido.id}`, { token: admin }))
    .body?.data?.home_roster ?? [];
  check('Fuera de la plantilla del Modo Árbitro',
    !plantilla.some((p) => idsDeBaja.includes(p.id)), `${plantilla.length} en plantilla`);

  console.log('\n═══ 8. UN JUGADOR DE BAJA YA NO PUEDE ANOTAR ═══');
  const intento = await call('POST', `/games/${partido.id}/events`, {
    token: admin,
    body: { eventType: 'TOUCHDOWN', teamId: local.id, playerId: jugo, quarter: 2 },
  });
  check('La API rechaza registrarle una jugada nueva',
    intento.status === 404, `${intento.status}`);

  const dosVeces = await call('DELETE', `/players/${jugo}`, {
    token: admin, body: { reason: 'Otra vez' },
  });
  check('Y no se puede dar de baja dos veces', dosVeces.status === 404, `${dosVeces.status}`);

  console.log('\n════════════════════════════════════════');
  console.log(`  RESULTADO: ${passed} pasaron · ${failed} fallaron`);
  console.log('════════════════════════════════════════');
  process.exit(failed === 0 ? 0 : 1);
};

run().catch((e) => { console.error(e); process.exit(1); });
