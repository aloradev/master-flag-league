/**
 * Prueba de integración del flujo completo de FASE 1.
 * Recorre el camino real: admin crea equipo y manager → manager registra
 * jugador y sube documentos → admin valida → el jugador queda elegible.
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

const call = async (method, path, { token, body, form } = {}) => {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers['Content-Type'] = 'application/json';

  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: form ?? (body ? JSON.stringify(body) : undefined),
  });

  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text.slice(0, 200) };
  }
  return { status: res.status, body: json, headers: res.headers };
};

// PNG de 1x1 px: sirve como fotografía e identificación de prueba.
const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==',
  'base64'
);

const uploadDoc = async (token, playerId, documentType, buffer = PNG_1PX, mime = 'image/png') => {
  const form = new FormData();
  form.append('documentType', documentType);
  form.append('file', new Blob([buffer], { type: mime }), `${documentType.toLowerCase()}.png`);
  const res = await fetch(`${API}/players/${playerId}/documents`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  return { status: res.status, body: await res.json().catch(() => null) };
};

const run = async () => {
  console.log('\n═══ 1. AUTENTICACIÓN ═══');

  const badLogin = await call('POST', '/auth/login', {
    body: { email: 'ananias.lora@go1.mx', password: 'incorrecta' },
  });
  check('Rechaza contraseña incorrecta', badLogin.status === 401);
  check(
    'No revela si el correo existe',
    badLogin.body.error === 'Credenciales incorrectas',
    badLogin.body.error
  );

  const login = await call('POST', '/auth/login', {
    body: { email: 'ananias.lora@go1.mx', password: 'Cancun2026' },
  });
  check('Login de Super Admin', login.status === 200, JSON.stringify(login.body).slice(0, 120));
  const adminToken = login.body?.data?.accessToken;
  check('Devuelve access token', Boolean(adminToken));
  check('Devuelve el rol', login.body?.data?.user?.role === 'SUPER_ADMIN');
  check('Devuelve permisos del rol', Boolean(login.body?.data?.user?.permissions?.players));

  const noAuth = await call('GET', '/players');
  check('Bloquea acceso sin token', noAuth.status === 401);

  const badToken = await call('GET', '/players', { token: 'token.falso.aqui' });
  check('Bloquea token inválido', badToken.status === 401);

  console.log('\n═══ 2. TEMPORADA Y CATÁLOGOS ═══');

  const season = await call('GET', '/seasons/active', { token: adminToken });
  check('Temporada activa encontrada', season.status === 200);
  check('Inicia el 12 de septiembre de 2026',
    String(season.body?.data?.start_date).startsWith('2026-09-12'),
    String(season.body?.data?.start_date));
  check('Tiene 3 categorías', season.body?.data?.categories?.length === 3);
  check('Tiene 2 campos', season.body?.data?.fields?.length === 2);
  check('Exige aprobación para jugar', season.body?.data?.require_approval_to_play === true);

  const seasonId = season.body?.data?.id;
  const varonil = season.body?.data?.categories?.find((c) => c.slug === 'varonil');

  console.log('\n═══ 3. EQUIPOS Y MANAGERS ═══');

  const team = await call('POST', '/admin/teams', {
    token: adminToken,
    body: {
      seasonId,
      categoryId: varonil?.id,
      name: 'Sharks',
      shortName: 'SHK',
      colorPrimary: '#0ea5e9',
    },
  });
  check('Crea equipo Sharks', team.status === 201, JSON.stringify(team.body).slice(0, 150));
  const sharksId = team.body?.data?.id;

  const team2 = await call('POST', '/admin/teams', {
    token: adminToken,
    body: { seasonId, categoryId: varonil?.id, name: 'Eagles', colorPrimary: '#16a34a' },
  });
  check('Crea equipo Eagles', team2.status === 201);
  const eaglesId = team2.body?.data?.id;

  const badCategory = await call('POST', '/admin/teams', {
    token: adminToken,
    body: { seasonId, categoryId: 'cat_inexistente', name: 'Fantasma' },
  });
  check('Rechaza categoría que no pertenece a la temporada', badCategory.status === 400);

  const manager = await call('POST', '/admin/users', {
    token: adminToken,
    body: { email: 'manager.sharks@test.mx', name: 'Carlos Manager', role: 'TEAM_MANAGER' },
  });
  check('Crea usuario manager', manager.status === 201);
  const tempPassword = manager.body?.data?.temporaryPassword;
  check('Genera contraseña temporal', Boolean(tempPassword));

  const manager2 = await call('POST', '/admin/users', {
    token: adminToken,
    body: { email: 'manager.eagles@test.mx', name: 'Luis Manager', role: 'TEAM_MANAGER' },
  });
  const tempPassword2 = manager2.body?.data?.temporaryPassword;

  const assign = await call('POST', `/admin/teams/${sharksId}/managers`, {
    token: adminToken,
    body: { userId: manager.body?.data?.id },
  });
  check('Asigna manager a Sharks', assign.status === 201, JSON.stringify(assign.body).slice(0, 120));

  await call('POST', `/admin/teams/${eaglesId}/managers`, {
    token: adminToken,
    body: { userId: manager2.body?.data?.id },
  });

  const wrongRole = await call('POST', `/admin/teams/${sharksId}/managers`, {
    token: adminToken,
    body: { userId: login.body?.data?.user?.id },
  });
  check('Rechaza asignar a alguien sin rol de manager', wrongRole.status === 400);

  console.log('\n═══ 4. ALCANCE DEL MANAGER ═══');

  const mgrLogin = await call('POST', '/auth/login', {
    body: { email: 'manager.sharks@test.mx', password: tempPassword },
  });
  check('Manager inicia sesión con contraseña temporal', mgrLogin.status === 200);
  check('Se le exige cambiar la contraseña',
    mgrLogin.body?.data?.user?.mustChangePassword === true);
  const mgrToken = mgrLogin.body?.data?.accessToken;

  const mgr2Login = await call('POST', '/auth/login', {
    body: { email: 'manager.eagles@test.mx', password: tempPassword2 },
  });
  const mgr2Token = mgr2Login.body?.data?.accessToken;

  const mgrTeams = await call('GET', '/teams', { token: mgrToken });
  check('El manager solo ve su equipo', mgrTeams.body?.data?.length === 1,
    `vio ${mgrTeams.body?.data?.length}`);
  check('Y es el equipo correcto', mgrTeams.body?.data?.[0]?.id === sharksId);

  const adminTeams = await call('GET', '/teams', { token: adminToken });
  check('El admin ve los dos equipos', adminTeams.body?.data?.length === 2);

  const crossTeam = await call('GET', `/teams/${eaglesId}`, { token: mgrToken });
  check('Bloquea acceso al equipo de otro manager', crossTeam.status === 403,
    `status ${crossTeam.status}`);

  console.log('\n═══ 5. REGISTRO DE JUGADOR ═══');

  const player = await call('POST', '/players', {
    token: mgrToken,
    body: {
      teamId: sharksId,
      firstName: 'Juan',
      lastNamePaternal: 'Pérez',
      lastNameMaternal: 'López',
      dateOfBirth: '1998-04-12',
      jerseyNumber: 7,
      position: 'WR',
    },
  });
  check('Manager registra jugador', player.status === 201,
    JSON.stringify(player.body).slice(0, 150));
  const playerId = player.body?.data?.id;
  check('Queda en estado PENDING', player.body?.data?.status === 'PENDING');
  check('NO es elegible al registrarse', player.body?.data?.eligibility?.isEligible === false);
  check('El motivo señala documentación faltante',
    /[Dd]ocumentación incompleta/.test(player.body?.data?.eligibility?.reason ?? ''),
    player.body?.data?.eligibility?.reason);

  const dupJersey = await call('POST', '/players', {
    token: mgrToken,
    body: {
      teamId: sharksId,
      firstName: 'Otro',
      lastNamePaternal: 'Jugador',
      dateOfBirth: '2000-01-01',
      jerseyNumber: 7,
    },
  });
  check('Rechaza número de jersey duplicado', dupJersey.status === 409);

  const crossCreate = await call('POST', '/players', {
    token: mgr2Token,
    body: {
      teamId: sharksId,
      firstName: 'Intruso',
      lastNamePaternal: 'Ajeno',
      dateOfBirth: '2000-01-01',
    },
  });
  check('Bloquea registrar jugador en equipo ajeno', crossCreate.status === 403);

  const missingFields = await call('POST', '/players', {
    token: mgrToken,
    body: { teamId: sharksId, firstName: 'Sin' },
  });
  check('Exige campos obligatorios', missingFields.status === 400);

  console.log('\n═══ 6. DOCUMENTOS ═══');

  const badType = await uploadDoc(mgrToken, playerId, 'PASAPORTE');
  check('Rechaza tipo de documento inválido', badType.status === 400);

  const badMime = await uploadDoc(
    mgrToken, playerId, 'PHOTO', Buffer.from('no soy imagen'), 'text/plain'
  );
  check('Rechaza formato no permitido (text/plain)', badMime.status === 400,
    badMime.body?.error);

  const photo = await uploadDoc(mgrToken, playerId, 'PHOTO');
  check('Sube fotografía', photo.status === 201, JSON.stringify(photo.body).slice(0, 150));
  check('Sigue NO elegible con un solo documento',
    photo.body?.data?.eligibility?.isEligible === false);

  const idFront = await uploadDoc(mgrToken, playerId, 'ID_FRONT');
  check('Sube identificación frente', idFront.status === 201);
  check('Falta el reverso y lo dice',
    /reverso/.test(idFront.body?.data?.eligibility?.reason ?? ''),
    idFront.body?.data?.eligibility?.reason);

  const idBack = await uploadDoc(mgrToken, playerId, 'ID_BACK');
  check('Sube identificación reverso', idBack.status === 201);
  check('Con documentación completa sigue NO elegible (falta aprobación)',
    idBack.body?.data?.eligibility?.isEligible === false);
  check('Ahora el motivo es la revisión pendiente',
    /[Pp]endiente de revisión/.test(idBack.body?.data?.eligibility?.reason ?? ''),
    idBack.body?.data?.eligibility?.reason);

  const docId = photo.body?.data?.id;
  const idDocId = idFront.body?.data?.id;
  const docPublic = await fetch(`http://localhost:5000/api/v1/documents/${docId}/file`);
  check('El documento NO se sirve sin sesión', docPublic.status === 401);

  const docCross = await call('GET', `/documents/${docId}/file`, { token: mgr2Token });
  check('Un manager ajeno NO puede ver el documento', docCross.status === 403);

  const docOwn = await fetch(`http://localhost:5000/api/v1/documents/${docId}/file`, {
    headers: { Authorization: `Bearer ${mgrToken}` },
  });
  check('El manager dueño sí lo ve', docOwn.status === 200);
  check('Se sirve sin caché', /no-store/.test(docOwn.headers.get('cache-control') ?? ''),
    docOwn.headers.get('cache-control'));

  // Abrir una identificación (no una foto) debe quedar auditado.
  await fetch(`http://localhost:5000/api/v1/documents/${idDocId}/file`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });

  console.log('\n═══ 7. VALIDACIÓN ADMINISTRATIVA ═══');

  const mgrApprove = await call('POST', `/admin/players/${playerId}/review`, {
    token: mgrToken,
    body: { action: 'APPROVE' },
  });
  check('El manager NO puede aprobar a sus propios jugadores', mgrApprove.status === 403,
    `status ${mgrApprove.status}`);

  const queue = await call('GET', '/admin/validation/queue', { token: adminToken });
  check('La cola de validación lista al jugador', queue.body?.data?.total >= 1);
  check('Lo marca listo para revisar', queue.body?.data?.ready_to_review >= 1);
  check('Incluye sus documentos', queue.body?.data?.players?.[0]?.documents?.length === 3);

  const noReason = await call('POST', `/admin/players/${playerId}/review`, {
    token: adminToken,
    body: { action: 'REQUEST_CORRECTION' },
  });
  check('Exige motivo al pedir corrección', noReason.status === 400);

  const correction = await call('POST', `/admin/players/${playerId}/review`, {
    token: adminToken,
    body: {
      action: 'REQUEST_CORRECTION',
      reason: 'La identificación no es legible. Favor de volver a cargarla.',
    },
  });
  check('Solicita corrección con motivo', correction.status === 200);
  check('Queda en CORRECTIONS_REQUIRED',
    correction.body?.data?.status === 'CORRECTIONS_REQUIRED');

  const reupload = await uploadDoc(mgrToken, playerId, 'ID_BACK');
  check('El manager vuelve a subir el documento', reupload.status === 201);
  check('Se guarda como versión 2', reupload.body?.data?.version === 2);

  const afterReupload = await call('GET', `/players/${playerId}`, { token: mgrToken });
  check('Regresa automáticamente a PENDING', afterReupload.body?.data?.status === 'PENDING',
    afterReupload.body?.data?.status);

  const history = await call('GET', `/players/${playerId}/documents/history`, { token: mgrToken });
  check('El historial conserva la versión anterior',
    history.body?.data?.filter((d) => d.document_type === 'ID_BACK').length === 2);

  const approve = await call('POST', `/admin/players/${playerId}/review`, {
    token: adminToken,
    body: { action: 'APPROVE' },
  });
  check('El admin aprueba', approve.status === 200, JSON.stringify(approve.body).slice(0, 150));
  check('Queda APPROVED', approve.body?.data?.status === 'APPROVED');
  check('AHORA SÍ es elegible', approve.body?.data?.eligibility?.isEligible === true);
  check('Sin motivo de bloqueo', approve.body?.data?.eligibility?.reason === null);

  console.log('\n═══ 8. APROBACIÓN INCOMPLETA (no debe permitirse) ═══');

  const p2 = await call('POST', '/players', {
    token: mgrToken,
    body: {
      teamId: sharksId,
      firstName: 'Carlos',
      lastNamePaternal: 'López',
      dateOfBirth: '1999-06-01',
      jerseyNumber: 12,
    },
  });
  const player2Id = p2.body?.data?.id;
  await uploadDoc(mgrToken, player2Id, 'PHOTO');

  const earlyApprove = await call('POST', `/admin/players/${player2Id}/review`, {
    token: adminToken,
    body: { action: 'APPROVE' },
  });
  check('NO permite aprobar sin documentación completa', earlyApprove.status === 400,
    `status ${earlyApprove.status}`);
  check('Y dice exactamente qué falta',
    (earlyApprove.body?.details?.missingDocuments ?? []).length === 2,
    JSON.stringify(earlyApprove.body?.details));

  console.log('\n═══ 9. VISTA DEL ÁRBITRO ═══');

  const referee = await call('POST', '/admin/users', {
    token: adminToken,
    body: { email: 'arbitro1@test.mx', name: 'Miguel Árbitro', role: 'REFEREE' },
  });
  const refLogin = await call('POST', '/auth/login', {
    body: { email: 'arbitro1@test.mx', password: referee.body?.data?.temporaryPassword },
  });
  const refToken = refLogin.body?.data?.accessToken;

  const eligibility = await call('GET', `/teams/${sharksId}/eligibility`, { token: refToken });
  check('El árbitro consulta la elegibilidad del equipo', eligibility.status === 200);
  check('Ve 1 elegible de 2', eligibility.body?.data?.eligible_count === 1 &&
    eligibility.body?.data?.total === 2,
    `${eligibility.body?.data?.eligible_count}/${eligibility.body?.data?.total}`);

  const refPlayers = eligibility.body?.data?.players ?? [];
  const juan = refPlayers.find((p) => p.jersey_number === 7);
  const carlos = refPlayers.find((p) => p.jersey_number === 12);
  check('#7 Juan Pérez aparece elegible', juan?.is_eligible === true);
  check('#12 Carlos López aparece NO elegible', carlos?.is_eligible === false);
  check('El árbitro NO recibe documentos',
    !JSON.stringify(eligibility.body).includes('documents'));
  check('El árbitro NO ve datos sensibles',
    !JSON.stringify(eligibility.body).includes('date_of_birth'));

  const refDoc = await call('GET', `/documents/${docId}/file`, { token: refToken });
  check('El árbitro NO puede abrir documentos', refDoc.status === 403,
    `status ${refDoc.status}`);

  const refQueue = await call('GET', '/admin/validation/queue', { token: refToken });
  check('El árbitro NO accede a la cola de validación', refQueue.status === 403);

  console.log('\n═══ 10. PERFIL PÚBLICO ═══');

  const publicProfile = await fetch(`${API}/public/players/${playerId}`);
  const publicBody = await publicProfile.json();
  check('El perfil público es accesible sin sesión', publicProfile.status === 200);
  check('Muestra el nombre', publicBody?.data?.full_name === 'Juan Pérez López');
  check('Muestra número y equipo', publicBody?.data?.jersey_number === 7 &&
    publicBody?.data?.team_name === 'Sharks');
  const publicText = JSON.stringify(publicBody);
  check('NO expone fecha de nacimiento completa', !publicText.includes('1998-04-12'));
  check('NO expone teléfono ni email', !publicText.includes('phone') &&
    !publicText.includes('"email"'));
  check('NO expone documentos', !publicText.includes('ID_FRONT') &&
    !publicText.includes('storage_key'));

  const publicPending = await fetch(`${API}/public/players/${player2Id}`);
  check('Un jugador no aprobado no tiene perfil público', publicPending.status === 404);

  console.log('\n═══ 11. PORTAL DEL MANAGER ═══');

  const myTeam = await call('GET', `/teams/${sharksId}`, { token: mgrToken });
  check('El manager ve el resumen de su equipo', myTeam.status === 200);
  const summary = myTeam.body?.data?.registration_summary;
  check('Resumen calculado: 2 jugadores', summary?.total === 2, JSON.stringify(summary));
  check('Resumen calculado: 1 elegible', summary?.eligible === 1);
  check('Resumen calculado: 1 pendiente', summary?.pending === 1);

  const editApproved = await call('PUT', `/players/${playerId}`, {
    token: mgrToken,
    body: { position: 'QB' },
  });
  check('El manager NO edita a un jugador ya aprobado', editApproved.status === 403,
    `status ${editApproved.status}`);

  const editPending = await call('PUT', `/players/${player2Id}`, {
    token: mgrToken,
    body: { position: 'RB' },
  });
  check('Sí edita a uno pendiente', editPending.status === 200);

  console.log('\n═══ 12. AUDITORÍA ═══');

  const auditLog = await call('GET', '/admin/audit?limit=100', { token: adminToken });
  check('El Super Admin consulta la auditoría', auditLog.status === 200);
  const actions = (auditLog.body?.data ?? []).map((l) => l.action);
  check('Registró la creación del equipo', actions.includes('CREATE_TEAM'));
  check('Registró el registro del jugador', actions.includes('CREATE_PLAYER'));
  check('Registró la subida de documentos', actions.includes('UPLOAD_DOCUMENT'));
  check('Registró la aprobación', actions.includes('REVIEW_PLAYER_APPROVE'));
  check('Registró la solicitud de corrección',
    actions.includes('REVIEW_PLAYER_REQUEST_CORRECTION'));
  check('Registró quién vio una identificación', actions.includes('VIEW_DOCUMENT'));
  const viewLog = (auditLog.body?.data ?? []).find((l) => l.action === 'VIEW_DOCUMENT');
  check('El registro de vista dice qué documento fue',
    viewLog?.new_value?.documentType === 'ID_FRONT',
    JSON.stringify(viewLog?.new_value));
  check('Las fotos NO inundan la auditoría (decisión deliberada)',
    (auditLog.body?.data ?? []).filter(
      (l) => l.action === 'VIEW_DOCUMENT' && l.new_value?.documentType === 'PHOTO'
    ).length === 0);

  const approveLog = (auditLog.body?.data ?? []).find(
    (l) => l.action === 'REVIEW_PLAYER_APPROVE'
  );
  check('La auditoría guarda valor anterior y nuevo',
    approveLog?.old_value?.status === 'PENDING' && approveLog?.new_value?.status === 'APPROVED',
    JSON.stringify({ old: approveLog?.old_value, new: approveLog?.new_value }));
  check('La auditoría identifica al usuario',
    approveLog?.user_email === 'ananias.lora@go1.mx');

  const mgrAudit = await call('GET', '/admin/audit', { token: mgrToken });
  check('Un manager NO accede a la auditoría', mgrAudit.status === 403);

  console.log('\n═══ 13. CAMBIO DE CONTRASEÑA ═══');

  const weak = await call('POST', '/auth/change-password', {
    token: mgrToken,
    body: { currentPassword: tempPassword, newPassword: 'abc' },
  });
  check('Rechaza contraseña débil', weak.status === 400);

  const wrongCurrent = await call('POST', '/auth/change-password', {
    token: mgrToken,
    body: { currentPassword: 'noEsLaMia1', newPassword: 'Sharks2026' },
  });
  check('Exige la contraseña actual correcta', wrongCurrent.status === 401);

  const changed = await call('POST', '/auth/change-password', {
    token: mgrToken,
    body: { currentPassword: tempPassword, newPassword: 'Sharks2026' },
  });
  check('Cambia la contraseña', changed.status === 200);

  const reLogin = await call('POST', '/auth/login', {
    body: { email: 'manager.sharks@test.mx', password: 'Sharks2026' },
  });
  check('Entra con la contraseña nueva', reLogin.status === 200);
  check('Ya no se le exige cambiarla',
    reLogin.body?.data?.user?.mustChangePassword === false);

  const oldPassword = await call('POST', '/auth/login', {
    body: { email: 'manager.sharks@test.mx', password: tempPassword },
  });
  check('La contraseña anterior ya no sirve', oldPassword.status === 401);

  console.log(`\n${'═'.repeat(52)}`);
  console.log(`  RESULTADO: ${passed} pasaron · ${failed} fallaron`);
  console.log('═'.repeat(52));
  if (failures.length) {
    console.log('\nFallos:');
    failures.forEach((f) => console.log(`  ✗ ${f}`));
  }
  process.exit(failed > 0 ? 1 : 0);
};

run().catch((err) => {
  console.error('\nError inesperado en la prueba:', err);
  process.exit(1);
});
