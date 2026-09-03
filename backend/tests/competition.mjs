/**
 * Prueba de integración de FASE 2 — Competencia.
 *
 * Recorre el camino real de una jornada: administración propone, ajusta,
 * asigna árbitros y publica → el árbitro abre su partido, registra
 * jugadas, deshace una y cierra con MVP → la tabla de posiciones refleja
 * el resultado sin que nadie la haya tocado.
 *
 * Corre contra la API COMPILADA (dist/), no contra el código fuente.
 * Uso:  node tests/competition.mjs
 */
const API = 'http://localhost:5000/api/v1';

let passed = 0;
let failed = 0;
const failures = [];

const check = (name, condition, detail = '') => {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${name}`);
  } else {
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
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { json = { raw: text.slice(0, 300) }; }
  return { status: res.status, body: json };
};

const ADMIN = { email: 'ananias.lora@go1.mx', password: 'Cancun2026' };
const sufijo = Date.now().toString(36).slice(-5);

const run = async () => {
  // ══════════════════════════════════════════════════════════════
  console.log('\n═══ 1. PREPARACIÓN ═══');

  const login = await call('POST', '/auth/login', { body: ADMIN });
  check('Administrador entra', login.status === 200, JSON.stringify(login.body).slice(0, 120));
  const admin = login.body?.data?.accessToken;
  if (!admin) { console.log('Sin sesión no se puede seguir.'); process.exit(1); }

  /**
   * La prueba crea SU PROPIA temporada en lugar de usar la activa del
   * seed.
   *
   * La primera versión daba por hecho que la base estaba virgen —3
   * categorías, 2 campos, 12 equipos— y bastaba correr antes la prueba de
   * Fase 1, que agrega una categoría y un campo, para que nueve
   * comprobaciones fallaran sin que nada estuviera roto. Una prueba que
   * solo pasa en condiciones de laboratorio no dice si el sistema
   * funciona; dice en qué orden hay que correrla.
   */
  const nuevaTemporada = await call('POST', '/admin/seasons', {
    token: admin,
    body: {
      name: `Temporada Prueba ${sufijo}`,
      year: 2027,
      startDate: '2027-09-11',
      defaultStartTime: '19:00',
      requireApprovalToPlay: true,
    },
  });
  check('Se crea una temporada propia para la prueba', nuevaTemporada.status === 201,
    JSON.stringify(nuevaTemporada.body).slice(0, 200));
  const seasonId = nuevaTemporada.body?.data?.id;
  if (!seasonId) { console.log('Sin temporada no se puede seguir.'); process.exit(1); }

  const categorias = [];
  for (const nombre of ['Varonil', 'Femenil', 'Mixto']) {
    const c = await call('POST', `/admin/seasons/${seasonId}/categories`, {
      token: admin, body: { name: nombre },
    });
    if (c.status === 201) categorias.push(c.body.data);
  }
  check('Con sus 3 categorías', categorias.length === 3, `${categorias.length}`);

  const campos = [];
  for (const nombre of ['Campo 1', 'Campo 2']) {
    const f = await call('POST', `/admin/seasons/${seasonId}/fields`, {
      token: admin, body: { name: nombre },
    });
    if (f.status === 201) campos.push(f.body.data);
  }
  check('Y sus 2 campos', campos.length === 2, `${campos.length}`);

  // Los horarios de la temporada nueva: sin ajuste propio, el generador
  // usa los de la liga. Se fijan explícitamente para que la capacidad de
  // la noche sea la de la liga real: 2 campos × 3 horarios = 6.
  const horariosPuestos = await call('PUT', `/admin/seasons/${seasonId}/settings/game_times`, {
    token: admin, body: { value: { slots: ['19:00', '20:00', '21:00'] } },
  });
  check('Con 3 horarios configurados', horariosPuestos.status === 200,
    JSON.stringify(horariosPuestos.body).slice(0, 150));

  const slotsLeidos = await call('GET', `/seasons/${seasonId}/slots`, { token: admin });
  check('Que la API devuelve tal cual', (slotsLeidos.body?.data?.slots ?? []).length === 3,
    JSON.stringify(slotsLeidos.body?.data));

  const CAPACIDAD = campos.length * 3;
  const season = { id: seasonId, start_date: '2027-09-11', categories: categorias, fields: campos };

  // 4 equipos por categoría → 6 partidos, que es justo la capacidad de
  // la noche (2 campos × 3 horarios).
  const equipos = {};
  for (const cat of categorias) {
    equipos[cat.id] = [];
    for (let i = 1; i <= 4; i++) {
      const r = await call('POST', '/admin/teams', {
        token: admin,
        body: {
          seasonId,
          categoryId: cat.id,
          name: `${cat.name} ${sufijo}-${i}`,
          shortName: `${cat.name.slice(0, 3).toUpperCase()}${i}`,
        },
      });
      if (r.status === 201) equipos[cat.id].push(r.body.data);
    }
  }
  const totalEquipos = Object.values(equipos).flat().length;
  check('Se crearon 12 equipos (4 por categoría)', totalEquipos === 12, `${totalEquipos}`);

  // ══════════════════════════════════════════════════════════════
  console.log('\n═══ 2. PROPUESTA DE JORNADA ═══');

  const propuesta = await call('POST', '/admin/rounds/propose', {
    token: admin,
    body: { seasonId },
  });
  check('La propuesta se calcula', propuesta.status === 200, JSON.stringify(propuesta.body).slice(0, 200));
  const p = propuesta.body?.data;
  check(`Propone ${CAPACIDAD} partidos: los espacios de la noche`, p?.games?.length === CAPACIDAD,
    `${p?.games?.length}`);
  check('Nadie descansa: los partidos caben exactos', p?.byes?.length === 0, `${p?.byes?.length}`);
  check('Informa la capacidad calculada', p?.capacity === CAPACIDAD, `${p?.capacity}`);
  check('La fecha sale del arranque de la temporada, no se teclea',
    p?.scheduledDate === season.start_date, `${p?.scheduledDate} vs ${season.start_date}`);
  check('Todo partido lleva campo y hora', p?.games?.every((g) => g.fieldId && g.time));
  const horas = new Set(p?.games?.map((g) => g.time));
  check('Usa los 3 horarios configurados', horas.size === 3, [...horas].join(','));

  const sinRepetir = new Set(p.games.flatMap((g) => [g.homeTeamId, g.awayTeamId]));
  check('Ningún equipo aparece dos veces', sinRepetir.size === 12, `${sinRepetir.size}`);

  const antesDeGuardar = await call('GET', `/rounds?seasonId=${seasonId}`, { token: admin });
  const cuantasAntes = (antesDeGuardar.body?.data ?? []).length;

  const proponerOtraVez = await call('POST', '/admin/rounds/propose', {
    token: admin, body: { seasonId },
  });
  const cuantasDespues = ((await call('GET', `/rounds?seasonId=${seasonId}`, { token: admin }))
    .body?.data ?? []).length;
  check('Proponer NO guarda nada: se puede recalcular sin dejar basura',
    proponerOtraVez.status === 200 && cuantasAntes === cuantasDespues,
    `${cuantasAntes} → ${cuantasDespues}`);

  // ══════════════════════════════════════════════════════════════
  console.log('\n═══ 3. BORRADOR Y VISIBILIDAD ═══');

  const creada = await call('POST', '/admin/rounds', {
    token: admin, body: { seasonId },
  });
  check('La jornada se guarda como borrador', creada.status === 201, JSON.stringify(creada.body).slice(0, 200));
  const round = creada.body?.data;
  check('Queda en DRAFT', round?.status === 'DRAFT', round?.status);
  check('Es la jornada 1', round?.number === 1, `${round?.number}`);
  check(`Guardó los ${CAPACIDAD} partidos`, round?.games?.length === CAPACIDAD, `${round?.games?.length}`);
  const roundId = round.id;

  // Un encargado de equipo no debe ver un calendario que aún puede cambiar.
  const managerCorreo = `mgr.${sufijo}@test.mx`;
  await call('POST', '/admin/users', {
    token: admin,
    body: {
      email: managerCorreo, name: 'Encargado Prueba', password: 'Prueba2026',
      role: 'TEAM_MANAGER',
    },
  });
  // Se le asigna un equipo, como en la vida real: un encargado sin equipo
  // no probaría nada del alcance por equipo.
  const mgrId = (await call('GET', '/admin/users', { token: admin })).body?.data
    ?.find((u) => u.email === managerCorreo)?.id;
  const asignarEquipo = await call('POST', `/admin/teams/${equipos[categorias[0].id][0].id}/managers`, {
    token: admin, body: { userId: mgrId },
  });
  check('Se asigna el encargado a su equipo', asignarEquipo.status === 200 || asignarEquipo.status === 201,
    `${asignarEquipo.status} ${JSON.stringify(asignarEquipo.body).slice(0, 120)}`);

  const mgrLogin = await call('POST', '/auth/login', {
    body: { email: managerCorreo, password: 'Prueba2026' },
  });
  const manager = mgrLogin.body?.data?.accessToken;
  check('El encargado entra', Boolean(manager), JSON.stringify(mgrLogin.body).slice(0, 150));

  const listaManager = await call('GET', `/rounds?seasonId=${seasonId}`, { token: manager });
  check('El encargado NO ve jornadas en borrador',
    (listaManager.body?.data ?? []).every((r) => r.status !== 'DRAFT'),
    JSON.stringify(listaManager.body?.data?.map((r) => r.status)));
  const detalleManager = await call('GET', `/rounds/${roundId}`, { token: manager });
  check('Ni entrando por el id directo', detalleManager.status === 404, `${detalleManager.status}`);
  const juegosManager = await call('GET', `/games?roundId=${roundId}`, { token: manager });
  check('Ni los partidos de esa jornada', (juegosManager.body?.data ?? []).length === 0,
    `${(juegosManager.body?.data ?? []).length}`);

  // ══════════════════════════════════════════════════════════════
  console.log('\n═══ 4. AJUSTE MANUAL ═══');

  const partidos = round.games;
  const g1 = partidos[0];
  const g2 = partidos.find((x) => x.scheduled_time !== g1.scheduled_time && x.field_id === g1.field_id);

  const choqueCampo = await call('PUT', `/admin/games/${g2.id}`, {
    token: admin, body: { scheduledTime: g1.scheduled_time },
  });
  check('Rechaza mover un partido a un campo ya ocupado a esa hora',
    choqueCampo.status === 409, `${choqueCampo.status} ${choqueCampo.body?.error ?? ''}`);
  check('Y lo explica en español', /campo ya tiene un partido/i.test(choqueCampo.body?.error ?? ''),
    choqueCampo.body?.error);

  const otroDeLaMismaCat = partidos.find(
    (x) => x.category_id === g1.category_id && x.id !== g1.id
  );
  const choqueEquipo = await call('PUT', `/admin/games/${otroDeLaMismaCat.id}`, {
    token: admin, body: { homeTeamId: g1.home_team_id },
  });
  check('Rechaza duplicar un equipo en la jornada',
    choqueEquipo.status === 409, `${choqueEquipo.status} ${choqueEquipo.body?.error ?? ''}`);

  const cambioNotas = await call('PUT', `/admin/games/${g1.id}`, {
    token: admin, body: { notes: 'Partido inaugural' },
  });
  check('Un ajuste válido sí pasa', cambioNotas.status === 200);

  // ══════════════════════════════════════════════════════════════
  console.log('\n═══ 5. ÁRBITROS ═══');

  const refCorreo = `arb.${sufijo}@test.mx`;
  const refUser = await call('POST', '/admin/users', {
    token: admin,
    body: { email: refCorreo, name: 'Árbitro Prueba', password: 'Arbitro2026', role: 'REFEREE' },
  });
  check('Se crea el usuario árbitro', refUser.status === 201, JSON.stringify(refUser.body).slice(0, 150));

  const ref1 = await call('POST', '/admin/referees', {
    token: admin,
    body: { seasonId, name: 'Árbitro Prueba', userId: refUser.body?.data?.id, certified: true },
  });
  const ref2 = await call('POST', '/admin/referees', {
    token: admin, body: { seasonId, name: 'Árbitro Dos' },
  });
  check('Se registran dos árbitros', ref1.status === 201 && ref2.status === 201);

  const asignar = await call('POST', `/admin/games/${g1.id}/referees`, {
    token: admin,
    body: {
      assignments: [
        { refereeId: ref1.body.data.id, role: 'PRINCIPAL' },
        { refereeId: ref2.body.data.id, role: 'AUXILIAR' },
      ],
    },
  });
  check('Se asignan principal y auxiliar', asignar.status === 200 && asignar.body?.data?.length === 2,
    JSON.stringify(asignar.body).slice(0, 200));

  const dosPrincipales = await call('POST', `/admin/games/${g1.id}/referees`, {
    token: admin,
    body: {
      assignments: [
        { refereeId: ref1.body.data.id, role: 'PRINCIPAL' },
        { refereeId: ref2.body.data.id, role: 'PRINCIPAL' },
      ],
    },
  });
  check('Rechaza dos árbitros principales en el mismo partido',
    dosPrincipales.status === 409, `${dosPrincipales.status}`);

  // Vuelve a dejarlo bien y prueba el choque de horario.
  await call('POST', `/admin/games/${g1.id}/referees`, {
    token: admin,
    body: {
      assignments: [
        { refereeId: ref1.body.data.id, role: 'PRINCIPAL' },
        { refereeId: ref2.body.data.id, role: 'AUXILIAR' },
      ],
    },
  });

  const aLaMismaHora = partidos.find(
    (x) => x.scheduled_time === g1.scheduled_time && x.id !== g1.id
  );
  const choqueArbitro = await call('POST', `/admin/games/${aLaMismaHora.id}/referees`, {
    token: admin, body: { assignments: [{ refereeId: ref1.body.data.id, role: 'PRINCIPAL' }] },
  });
  check('Rechaza al árbitro que ya tiene partido a esa hora',
    choqueArbitro.status === 409, `${choqueArbitro.status} ${choqueArbitro.body?.error ?? ''}`);
  check('El mensaje dice a qué hora y en qué campo',
    /ya tiene partido a las \d{2}:\d{2}/.test(choqueArbitro.body?.error ?? ''),
    choqueArbitro.body?.error);

  // ══════════════════════════════════════════════════════════════
  console.log('\n═══ 6. PUBLICACIÓN ═══');

  const sinCampo = await call('PUT', `/admin/games/${aLaMismaHora.id}`, {
    token: admin, body: { status: 'CANCELLED' },
  });
  check('Un partido se puede cancelar', sinCampo.status === 200);

  const publicar = await call('POST', `/admin/rounds/${roundId}/publish`, { token: admin });
  check('La jornada se publica', publicar.status === 200, JSON.stringify(publicar.body).slice(0, 200));
  check('Queda en PUBLISHED', publicar.body?.data?.status === 'PUBLISHED', publicar.body?.data?.status);
  check('Registra cuándo se publicó', Boolean(publicar.body?.data?.published_at));

  const republicar = await call('POST', `/admin/rounds/${roundId}/publish`, { token: admin });
  check('No se puede publicar dos veces', republicar.status === 409, `${republicar.status}`);

  const borrarPublicada = await call('DELETE', `/admin/rounds/${roundId}`, { token: admin });
  check('Una jornada publicada no se borra', borrarPublicada.status === 409, `${borrarPublicada.status}`);
  check('Y el mensaje dice qué hacer en su lugar',
    /se cancela, no se borra/i.test(borrarPublicada.body?.error ?? ''), borrarPublicada.body?.error);

  const ahoraSiVe = await call('GET', `/rounds/${roundId}`, { token: manager });
  check('Publicada, el encargado ya la ve', ahoraSiVe.status === 200, `${ahoraSiVe.status}`);
  check('Con sus partidos', (ahoraSiVe.body?.data?.games ?? []).length === CAPACIDAD,
    `${(ahoraSiVe.body?.data?.games ?? []).length}`);

  // ══════════════════════════════════════════════════════════════
  console.log('\n═══ 7. MODO ÁRBITRO ═══');

  const arbLogin = await call('POST', '/auth/login', {
    body: { email: refCorreo, password: 'Arbitro2026' },
  });
  const arbitro = arbLogin.body?.data?.accessToken;
  check('El árbitro entra', Boolean(arbitro), JSON.stringify(arbLogin.body).slice(0, 150));

  const mios = await call('GET', '/games/mine', { token: arbitro });
  check('Ve solo su partido asignado, sin buscarlo',
    mios.status === 200 && mios.body?.data?.length === 1, `${mios.body?.data?.length}`);
  check('Con el nombre del rival y el campo',
    Boolean(mios.body?.data?.[0]?.home_team_name && mios.body?.data?.[0]?.field_name));

  const detalle = await call('GET', `/games/${g1.id}`, { token: arbitro });
  check('Abre el partido', detalle.status === 200);
  const d = detalle.body?.data;
  check('Trae las dos plantillas',
    (d?.rosters?.home?.length ?? 0) >= 0 && d?.rosters?.away !== undefined);
  check('Trae el catálogo de jugadas para dibujar los botones',
    Boolean(d?.plays?.TOUCHDOWN) && d.plays.TOUCHDOWN.points === 6);
  const camposDePlantilla = Object.keys(d?.rosters?.home?.[0] ?? {});
  check('La plantilla del árbitro NO expone documentos',
    !camposDePlantilla.some((k) => /document|storage|id_front|id_back/i.test(k)),
    camposDePlantilla.join(','));

  const ajeno = partidos.find((x) => x.id !== g1.id && x.status !== 'CANCELLED');
  const registrarAjeno = await call('POST', `/games/${ajeno.id}/events`, {
    token: arbitro,
    body: { eventType: 'TOUCHDOWN', teamId: ajeno.home_team_id },
  });
  check('Un árbitro NO puede registrar en un partido que no le asignaron',
    registrarAjeno.status === 403, `${registrarAjeno.status}`);
  check('Y el mensaje lo dice claro',
    /no estás asignado/i.test(registrarAjeno.body?.error ?? ''), registrarAjeno.body?.error);

  const arrancar = await call('POST', `/games/${g1.id}/start`, { token: arbitro });
  check('Arranca el partido', arrancar.status === 200 && arrancar.body?.data?.status === 'LIVE',
    arrancar.body?.data?.status);

  const arrancarOtraVez = await call('POST', `/games/${g1.id}/start`, { token: arbitro });
  check('Si el otro árbitro ya lo arrancó, no es un error',
    arrancarOtraVez.status === 200 && arrancarOtraVez.body?.already_started === true,
    `${arrancarOtraVez.status}`);

  const jornadaEnCurso = await call('GET', `/rounds/${roundId}`, { token: admin });
  check('La jornada pasa sola a "en curso"', jornadaEnCurso.body?.data?.status === 'IN_PROGRESS',
    jornadaEnCurso.body?.data?.status);

  // ══════════════════════════════════════════════════════════════
  console.log('\n═══ 8. JUGADAS Y MARCADOR CALCULADO ═══');

  const td1 = await call('POST', `/games/${g1.id}/events`, {
    token: arbitro, body: { eventType: 'TOUCHDOWN', teamId: g1.home_team_id, quarter: 1 },
  });
  check('Registra un touchdown sin jugador señalado… ',
    td1.status === 400, `${td1.status}`);
  check('…porque el touchdown exige decir quién anotó',
    /necesita señalar al jugador/i.test(td1.body?.error ?? ''), td1.body?.error);

  const safety = await call('POST', `/games/${g1.id}/events`, {
    token: arbitro, body: { eventType: 'SAFETY', teamId: g1.home_team_id, quarter: 1 },
  });
  check('El safety sí se registra sin jugador', safety.status === 201, JSON.stringify(safety.body).slice(0, 150));
  check('Y vale 2 puntos', safety.body?.data?.points === 2, `${safety.body?.data?.points}`);
  check('El marcador se devuelve calculado',
    safety.body?.data?.score?.home === 2 && safety.body?.data?.score?.away === 0,
    JSON.stringify(safety.body?.data?.score));

  const inventada = await call('POST', `/games/${g1.id}/events`, {
    token: arbitro, body: { eventType: 'CHILENA', teamId: g1.home_team_id },
  });
  check('Rechaza una jugada que no existe en el catálogo', inventada.status === 400, `${inventada.status}`);

  const equipoAjeno = Object.values(equipos).flat()
    .find((t) => t.id !== g1.home_team_id && t.id !== g1.away_team_id);
  const otroEquipo = await call('POST', `/games/${g1.id}/events`, {
    token: arbitro, body: { eventType: 'SAFETY', teamId: equipoAjeno.id },
  });
  check('Rechaza anotar a un equipo que no juega ese partido', otroEquipo.status === 400, `${otroEquipo.status}`);

  const safety2 = await call('POST', `/games/${g1.id}/events`, {
    token: arbitro, body: { eventType: 'SAFETY', teamId: g1.away_team_id, quarter: 2 },
  });
  check('Anota también el visitante',
    safety2.body?.data?.score?.home === 2 && safety2.body?.data?.score?.away === 2,
    JSON.stringify(safety2.body?.data?.score));

  // ══════════════════════════════════════════════════════════════
  console.log('\n═══ 9. EL SEMÁFORO COMO REGLA, NO COMO ADORNO ═══');

  // Un jugador recién registrado está PENDING y sin documentos: no elegible.
  const nuevoJugador = await call('POST', '/players', {
    token: admin,
    body: {
      teamId: g1.home_team_id,
      firstName: 'No', lastNamePaternal: 'Elegible', jerseyNumber: 99,
      dateOfBirth: '1995-05-05',
    },
  });
  check('Se registra un jugador nuevo', nuevoJugador.status === 201,
    JSON.stringify(nuevoJugador.body).slice(0, 150));
  const jugadorId = nuevoJugador.body?.data?.id;
  check('Y nace NO elegible', nuevoJugador.body?.data?.eligibility?.isEligible === false,
    JSON.stringify(nuevoJugador.body?.data?.eligibility));
  check('Con el motivo ya calculado, sin que nadie lo escriba',
    /Documentación incompleta/.test(nuevoJugador.body?.data?.eligibility?.reason ?? ''),
    nuevoJugador.body?.data?.eligibility?.reason);

  const conNoElegible = await call('POST', `/games/${g1.id}/events`, {
    token: arbitro,
    body: { eventType: 'TOUCHDOWN', teamId: g1.home_team_id, playerId: jugadorId, quarter: 2 },
  });
  check('El sistema RECHAZA la jugada de un jugador no elegible',
    conNoElegible.status === 409, `${conNoElegible.status}`);
  check('Y el mensaje dice el nombre y el motivo',
    /No Elegible/.test(conNoElegible.body?.error ?? '') &&
    /document|revisión|elegible/i.test(conNoElegible.body?.error ?? ''),
    conNoElegible.body?.error);

  const marcadorIntacto = await call('GET', `/games/${g1.id}/live`, { token: arbitro });
  check('El marcador no cambió con la jugada rechazada',
    marcadorIntacto.body?.data?.home_score === 2, `${marcadorIntacto.body?.data?.home_score}`);

  // ══════════════════════════════════════════════════════════════
  console.log('\n═══ 10. SINCRONIZACIÓN ENTRE DOS ÁRBITROS ═══');

  const antes = await call('GET', `/games/${g1.id}/live`, { token: arbitro });
  const reloj = antes.body?.data?.server_time;
  check('El endpoint en vivo devuelve la hora del servidor', Boolean(reloj), `${reloj}`);
  const cuantosAntes = (antes.body?.data?.changes ?? []).length;
  // Van dos safeties registrados. El touchdown sin jugador y el del
  // jugador no elegible se rechazaron, así que no dejaron evento: por eso
  // son 2 y no 4, y esa es justamente la garantía que interesa.
  check('Sin "since" devuelve el historial completo', cuantosAntes === 2, `${cuantosAntes}`);
  check('Una jugada rechazada no deja rastro en el historial',
    !(antes.body?.data?.changes ?? []).some((e) => e.event_type === 'TOUCHDOWN'));

  // El administrador (el "segundo árbitro") registra desde otro aparato.
  await new Promise((r) => setTimeout(r, 1100));
  const desdeOtro = await call('POST', `/games/${g1.id}/events`, {
    token: admin, body: { eventType: 'SAFETY', teamId: g1.home_team_id, quarter: 2 },
  });
  check('El segundo árbitro registra desde otro aparato', desdeOtro.status === 201);

  const delta = await call('GET', `/games/${g1.id}/live?since=${encodeURIComponent(reloj)}`, {
    token: arbitro,
  });
  check('Con "since" solo llega lo que cambió',
    (delta.body?.data?.changes ?? []).length === 1, `${(delta.body?.data?.changes ?? []).length}`);
  check('El primer árbitro ve el marcador actualizado',
    delta.body?.data?.home_score === 4, `${delta.body?.data?.home_score}`);
  check('Y quién lo registró',
    delta.body?.data?.changes?.[0]?.recorded_by_name === 'Ananias Lora',
    delta.body?.data?.changes?.[0]?.recorded_by_name);

  // ══════════════════════════════════════════════════════════════
  console.log('\n═══ 11. DESHACER ═══');

  const paraDeshacer = delta.body.data.changes[0].id;
  const deshacer = await call('POST', `/games/${g1.id}/events/${paraDeshacer}/void`, { token: arbitro });
  check('Se deshace la última jugada', deshacer.status === 200);
  check('El marcador baja', deshacer.body?.data?.score?.home === 2,
    JSON.stringify(deshacer.body?.data?.score));

  const otraVez = await call('POST', `/games/${g1.id}/events/${paraDeshacer}/void`, { token: arbitro });
  check('Deshacer dos veces no rompe nada', otraVez.status === 200 && otraVez.body?.data?.already_voided);

  const historial = await call('GET', `/games/${g1.id}`, { token: arbitro });
  const anulado = historial.body?.data?.events?.find((e) => e.id === paraDeshacer);
  check('La jugada anulada NO se borró del historial', Boolean(anulado), 'no aparece');
  check('Queda marcada como anulada, con hora', Boolean(anulado?.voided_at));

  // ══════════════════════════════════════════════════════════════
  console.log('\n═══ 12. CIERRE Y MVP ═══');

  const jugadorElegible = historial.body?.data?.rosters?.home?.find((x) => x.is_eligible);
  const mvpAjeno = await call('POST', `/games/${g1.id}/finish`, {
    token: arbitro, body: { mvpOffensivePlayerId: 'no_existe' },
  });
  check('Rechaza un MVP que no existe', mvpAjeno.status === 404, `${mvpAjeno.status}`);

  const cerrar = await call('POST', `/games/${g1.id}/finish`, {
    token: arbitro,
    body: {
      mvpOffensivePlayerId: jugadorElegible?.id ?? null,
      notes: 'Partido cerrado en prueba',
    },
  });
  check('El árbitro cierra el partido', cerrar.status === 200, JSON.stringify(cerrar.body).slice(0, 200));
  check('Queda FINISHED', cerrar.body?.data?.status === 'FINISHED', cerrar.body?.data?.status);
  check('Con el marcador calculado de los eventos vigentes',
    cerrar.body?.data?.home_score === 2 && cerrar.body?.data?.away_score === 2,
    `${cerrar.body?.data?.home_score}-${cerrar.body?.data?.away_score}`);

  const cerrarOtraVez = await call('POST', `/games/${g1.id}/finish`, { token: arbitro });
  check('Cerrar dos veces no es un error', cerrarOtraVez.status === 200 && cerrarOtraVez.body?.already_finished);

  const registrarTarde = await call('POST', `/games/${g1.id}/events`, {
    token: arbitro, body: { eventType: 'SAFETY', teamId: g1.home_team_id },
  });
  check('No se registra en un partido ya cerrado', registrarTarde.status === 409, `${registrarTarde.status}`);

  const editarCerrado = await call('PUT', `/admin/games/${g1.id}`, {
    token: admin, body: { notes: 'otra cosa' },
  });
  check('Ni administración edita un partido cerrado', editarCerrado.status === 409, `${editarCerrado.status}`);

  // ══════════════════════════════════════════════════════════════
  console.log('\n═══ 13. INCOMPARECENCIA ═══');

  const otroVivo = partidos.find((x) => x.id !== g1.id && x.status !== 'CANCELLED' && x.id !== aLaMismaHora?.id);
  const wo = await call('POST', `/admin/games/${otroVivo.id}/walkover`, {
    token: admin, body: { winnerTeamId: otroVivo.home_team_id, reason: 'No se presentó el visitante' },
  });
  check('Se declara ganador por incomparecencia', wo.status === 200, JSON.stringify(wo.body).slice(0, 200));
  check('El marcador lo pone el reglamento, no el campo',
    wo.body?.data?.home_score === 20 && wo.body?.data?.away_score === 0,
    `${wo.body?.data?.home_score}-${wo.body?.data?.away_score}`);

  const woAjeno = await call('POST', `/admin/games/${partidos[2].id}/walkover`, {
    token: admin, body: { winnerTeamId: equipoAjeno.id },
  });
  check('El ganador debe ser uno de los dos equipos', woAjeno.status === 400, `${woAjeno.status}`);

  // ══════════════════════════════════════════════════════════════
  console.log('\n═══ 14. TABLA DE POSICIONES CALCULADA ═══');

  const tabla = await call('GET', `/standings?seasonId=${seasonId}`, { token: manager });
  check('La tabla se consulta sin ser administrador', tabla.status === 200, `${tabla.status}`);
  const grupos = tabla.body?.data ?? [];
  check('Viene separada por categoría', grupos.length === categorias.length, `${grupos.length}`);

  const todasLasFilas = grupos.flatMap((x) => x.rows);
  check('Aparecen los 12 equipos de la prueba', todasLasFilas.length === 12, `${todasLasFilas.length}`);

  const empate = todasLasFilas.filter((f) => f.played === 1 && f.draws === 1);
  check('El 2-2 se registró como empate para los dos equipos', empate.length === 2, `${empate.length}`);
  check('Y les dio 1 punto a cada uno', empate.every((f) => f.points === 1),
    empate.map((f) => f.points).join(','));

  const ganadorWO = todasLasFilas.find((f) => f.team_id === otroVivo.home_team_id);
  check('El ganador por incomparecencia suma 3 puntos', ganadorWO?.points === 3, `${ganadorWO?.points}`);
  check('Con diferencia de +20', ganadorWO?.point_diff === 20, `${ganadorWO?.point_diff}`);
  check('Y racha G1', ganadorWO?.streak === 'G1', ganadorWO?.streak);
  check('Y forma reciente', JSON.stringify(ganadorWO?.form) === '["W"]', JSON.stringify(ganadorWO?.form));

  const suCategoria = grupos.find((x) => x.category.id === otroVivo.category_id);
  check('El ganador va primero en su categoría',
    suCategoria?.rows?.[0]?.team_id === otroVivo.home_team_id, suCategoria?.rows?.[0]?.team_name);
  check('Las posiciones van de 1 en adelante, sin huecos',
    suCategoria?.rows?.every((f, i) => f.position === i + 1));

  const sinJugar = todasLasFilas.filter((f) => f.played === 0);
  check('Los equipos que no han jugado aparecen en 0, no ausentes',
    sinJugar.length > 0 && sinJugar.every((f) => f.points === 0 && f.streak === '—'),
    `${sinJugar.length}`);

  const porCategoria = await call('GET',
    `/standings?seasonId=${seasonId}&categoryId=${categorias[0].id}`, { token: manager });
  check('Se puede pedir una sola categoría', (porCategoria.body?.data ?? []).length === 1,
    `${(porCategoria.body?.data ?? []).length}`);

  // ══════════════════════════════════════════════════════════════
  console.log('\n═══ 15. EL HISTORIAL ALIMENTA LA SIGUIENTE JORNADA ═══');

  const j2 = await call('POST', '/admin/rounds/propose', {
    token: admin, body: { seasonId },
  });
  check('Se propone la jornada 2', j2.status === 200 && j2.body?.data?.roundNumber === 2,
    `${j2.body?.data?.roundNumber}`);
  check('La fecha es una semana después',
    j2.body?.data?.scheduledDate ===
      new Date(new Date(round.scheduled_date).getTime() + 7 * 864e5).toISOString().slice(0, 10),
    j2.body?.data?.scheduledDate);

  const parJ1 = `${g1.home_team_id}|${g1.away_team_id}`.split('|').sort().join('|');
  const paresJ2 = (j2.body?.data?.games ?? []).map((g) =>
    [g.homeTeamId, g.awayTeamId].sort().join('|'));
  check('No repite un enfrentamiento que ya se jugó', !paresJ2.includes(parJ1),
    `${parJ1} está en la jornada 2`);
  check('Todos los enfrentamientos son primeros encuentros',
    (j2.body?.data?.games ?? []).every((g) => g.meeting === 1),
    (j2.body?.data?.games ?? []).map((g) => g.meeting).join(','));

  /**
  * El partido cancelado no debe contar como jugado. Comprobarlo pidiendo
  * que ese par reaparezca en la jornada 2 sería una prueba mal hecha: con
  * 4 equipos hay tres emparejamientos válidos y el generador puede elegir
  * cualquiera. Lo que sí es exigible es que esos dos equipos sigan con
  * cero partidos jugados, y que si el par se propone, sea primer
  * encuentro.
  */
  const canceladoPar = [aLaMismaHora.home_team_id, aLaMismaHora.away_team_id].sort().join('|');
  const filasCanceladas = todasLasFilas.filter((f) =>
    [aLaMismaHora.home_team_id, aLaMismaHora.away_team_id].includes(f.team_id));
  check('Los equipos del partido cancelado siguen con 0 jugados',
    filasCanceladas.length === 2 && filasCanceladas.every((f) => f.played === 0),
    filasCanceladas.map((f) => `${f.team_name}:${f.played}`).join(' '));
  const propuestoDeNuevo = (j2.body?.data?.games ?? []).find(
    (g) => [g.homeTeamId, g.awayTeamId].sort().join('|') === canceladoPar);
  check('Si el par cancelado se vuelve a proponer, es primer encuentro',
    !propuestoDeNuevo || propuestoDeNuevo.meeting === 1,
    `meeting=${propuestoDeNuevo?.meeting}`);

  // ══════════════════════════════════════════════════════════════
  console.log('\n═══ 16. PETICIONES SIN CUERPO ═══');
  /**
   * Esta sección existe porque la prueba encontró un 500 real: en
   * Express 5 `req.body` es undefined cuando la petición no trae cuerpo
   * —a diferencia de Express 4, que lo dejaba en {}— y desestructurarlo
   * revienta. La Fase 1 usaba `req.body ?? {}` en todas partes por esta
   * razón; los controladores nuevos no, y varios endpoints caían con un
   * error de servidor donde debían responder con un mensaje.
   *
   * Un 500 es lo peor que puede pasar aquí: el árbitro solo ve "error del
   * servidor" y no tiene forma de saber qué le faltó.
   */
  const sinCuerpo = [
    ['POST', `/games/${otroVivo.id}/start`, arbitro],
    ['POST', '/admin/rounds/propose', admin],
    ['POST', '/admin/rounds', admin],
    ['PUT', `/admin/rounds/${roundId}`, admin],
    ['POST', `/admin/rounds/${roundId}/cancel`, admin],
    ['POST', `/admin/games/${partidos[2].id}/referees`, admin],
    ['POST', `/admin/games/${partidos[2].id}/walkover`, admin],
    ['POST', '/admin/referees', admin],
    ['POST', `/games/${partidos[2].id}/events`, admin],
    ['POST', `/games/${g1.id}/finish`, admin],
    ['PUT', `/admin/games/${partidos[2].id}`, admin],
  ];

  let quinientos = [];
  for (const [metodo, ruta, token] of sinCuerpo) {
    const r = await call(metodo, ruta, { token });
    if (r.status >= 500) quinientos.push(`${metodo} ${ruta} → ${r.status}`);
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
