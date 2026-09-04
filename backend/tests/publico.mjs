/**
 * LO PÚBLICO: JORNADA Y TABLA SIN SESIÓN.
 *
 * Existe en lugar del aviso por WhatsApp Business API. La API de Meta
 * cobra por mensaje y exige un negocio legalmente constituido con
 * Constancia de Situación Fiscal; los encargados ya están en un grupo de
 * WhatsApp. Lo que faltaba no era un canal sino algo que pegar en el
 * grupo: un enlace que siempre muestre lo vigente.
 *
 * Dos cosas se comprueban aquí, y la segunda es la que importa:
 *
 *  1. Que se pueda leer sin sesión, y que sin id elija la jornada
 *     vigente sola — eso es lo que hace que el enlace se pegue UNA vez y
 *     sirva la temporada entera.
 *  2. Que NO se filtre nada. Los controladores públicos no reutilizan los
 *     autenticados a propósito: esos usan `ro.*` y traen notas internas,
 *     quién generó la jornada y los árbitros asignados. Si alguien
 *     "simplifica" reutilizándolos, estas comprobaciones lo delatan.
 *
 * Usa el año 2040 para que su temporada sea la activa más reciente y la
 * elección de jornada vigente sea determinista.
 *
 * Uso:  node tests/publico.mjs      (con la API arriba)
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
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${API}${path}`, {
    method, headers, body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { json = { raw: text.slice(0, 300) }; }
  return { status: res.status, body: json };
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
    body: { name: `Pública ${sufijo}`, year: 2040, startDate: '2040-09-08',
            registrationDeadline: '2040-09-06', requireApprovalToPlay: true },
  })).body?.data?.id;
  const catId = (await call('POST', `/admin/seasons/${seasonId}/categories`, {
    token: admin, body: { name: 'Varonil' },
  })).body?.data?.id;
  await call('POST', `/admin/seasons/${seasonId}/fields`, { token: admin, body: { name: 'Campo 1' } });

  for (const [nombre, corto] of [['Tiburones', 'TIB'], ['Águilas', 'AGU']]) {
    await call('POST', '/admin/teams', {
      token: admin,
      body: { seasonId, categoryId: catId, name: `${nombre} ${sufijo}`, shortName: corto },
    });
  }

  const j1 = (await call('POST', '/admin/rounds', { token: admin, body: { seasonId } })).body?.data;
  check('Se genera la jornada 1', Boolean(j1?.id), JSON.stringify(j1).slice(0, 150));
  // Con notas internas, para comprobar que NO se publican.
  await call('PUT', `/admin/rounds/${j1.id}`, {
    token: admin, body: { notes: 'NOTA-INTERNA-NO-PUBLICAR' },
  });

  console.log('\n═══ 2. UN BORRADOR NO EXISTE PARA EL PÚBLICO ═══');
  const enBorrador = await call('GET', '/public/round');
  check('Sin jornadas publicadas, responde 404 y no el borrador',
    enBorrador.status === 404 ||
      !JSON.stringify(enBorrador.body).includes(j1.id),
    `${enBorrador.status}`);
  const borradorPorId = await call('GET', `/public/round/${j1.id}`);
  check('Y pedirlo por id tampoco lo entrega', borradorPorId.status === 404,
    `${borradorPorId.status}`);
  const lista = await call('GET', '/public/rounds');
  check('Ni aparece en el calendario público',
    !JSON.stringify(lista.body ?? {}).includes(j1.id));

  console.log('\n═══ 3. PUBLICADA: SE LEE SIN SESIÓN ═══');
  await call('POST', `/admin/rounds/${j1.id}/publish`, { token: admin });

  const publica = await call('GET', '/public/round');
  check('Sin token, responde 200', publica.status === 200, `${publica.status}`);
  const d = publica.body?.data;
  check('Elige la jornada vigente sola, sin id en la ruta', d?.round?.id === j1.id,
    `${d?.round?.id}`);
  check('Con su número y su fecha', d?.round?.number === 1 && Boolean(d?.round?.scheduled_date),
    `${d?.round?.number} / ${d?.round?.scheduled_date}`);
  check('Trae los partidos', (d?.games ?? []).length >= 1, `${(d?.games ?? []).length}`);
  check('Con nombre de los dos equipos',
    Boolean(d?.games?.[0]?.home_team_name && d?.games?.[0]?.away_team_name));
  check('Con hora y campo', Boolean(d?.games?.[0]?.scheduled_time && d?.games?.[0]?.field_name),
    `${d?.games?.[0]?.scheduled_time} / ${d?.games?.[0]?.field_name}`);
  check('Y con la temporada, para el encabezado', Boolean(d?.season?.name));

  check('Pedirla por id da lo mismo',
    (await call('GET', `/public/round/${j1.id}`)).body?.data?.round?.id === j1.id);
  check('El calendario público ya la incluye',
    ((await call('GET', '/public/rounds')).body?.data?.rounds ?? []).some((r) => r.id === j1.id));

  console.log('\n═══ 4. NO SE FILTRA NADA ═══');
  /**
   * La razón por la que estos controladores no reutilizan los
   * autenticados: `getRound` hace `SELECT ro.*` y trae notas internas,
   * `generated_by_name` y los árbitros asignados con nombre y apellido.
   */
  const crudo = JSON.stringify(publica.body);
  check('Sin las notas internas de la jornada',
    !crudo.includes('NOTA-INTERNA-NO-PUBLICAR'));
  check('Sin el campo notes siquiera', !/"notes"/.test(crudo));
  check('Sin quién la generó', !/generated_by/.test(crudo));
  check('Sin los árbitros asignados', !/"referees"/.test(crudo) && !/referee_id/.test(crudo));
  check('Sin datos de jugadores', !/player|jersey|is_eligible|date_of_birth/i.test(crudo));
  check('Sin nada de finanzas', !/fee|payment|amount_cents|inscription/i.test(crudo));
  check('Sin correos ni teléfonos', !/@|"phone"/.test(crudo));
  check('Sin claves de almacenamiento', !/storage_key/.test(crudo));

  // Un token no cambia nada: la ruta pública es pública para todos.
  const conToken = await call('GET', '/public/round', { token: admin });
  check('Con token de administrador devuelve exactamente lo mismo',
    JSON.stringify(conToken.body) === crudo);

  console.log('\n═══ 5. LA TABLA ═══');
  const tabla = await call('GET', '/public/standings');
  check('Se lee sin sesión', tabla.status === 200, `${tabla.status}`);
  check('Agrupada por categoría', Array.isArray(tabla.body?.data?.categories));
  const grupo = (tabla.body?.data?.categories ?? []).find((g) => g.category.id === catId);
  check('Con la categoría de la temporada', Boolean(grupo), `${(tabla.body?.data?.categories ?? []).length} grupos`);
  check('Y los dos equipos en su tabla', (grupo?.rows ?? []).length === 2,
    `${(grupo?.rows ?? []).length}`);
  check('Con posición calculada', (grupo?.rows ?? []).every((f, i) => f.position === i + 1));
  const crudoTabla = JSON.stringify(tabla.body);
  check('Sin filtrar datos de jugadores ni finanzas',
    !/jersey|date_of_birth|amount_cents|storage_key/i.test(crudoTabla));

  console.log('\n═══ 6. LA JORNADA VIGENTE CAMBIA SOLA ═══');
  /**
   * El enlace se pega una vez. Cuando la jornada 1 termina y se publica
   * la 2, el mismo enlace debe mostrar la 2 sin que nadie avise de nada.
   */
  const j2 = (await call('POST', '/admin/rounds', { token: admin, body: { seasonId } })).body?.data;
  await call('POST', `/admin/rounds/${j2.id}/publish`, { token: admin });
  check('Con dos publicadas, sigue mostrando la más próxima',
    (await call('GET', '/public/round')).body?.data?.round?.id === j1.id);

  // Se cierran los partidos de la jornada 1 para que quede terminada.
  const partidosJ1 = (await call('GET', `/rounds/${j1.id}`, { token: admin })).body?.data?.games ?? [];
  for (const p of partidosJ1) {
    await call('POST', `/games/${p.id}/start`, { token: admin });
    await call('POST', `/games/${p.id}/finish`, { token: admin });
  }
  const despues = await call('GET', '/public/round');
  check('Cuando la 1 termina, el MISMO enlace muestra la 2',
    despues.body?.data?.round?.id === j2.id,
    `mostró jornada ${despues.body?.data?.round?.number}`);

  console.log('\n════════════════════════════════════════');
  console.log(`  RESULTADO: ${passed} pasaron · ${failed} fallaron`);
  console.log('════════════════════════════════════════');
  process.exit(failed === 0 ? 0 : 1);
};

run().catch((e) => { console.error(e); process.exit(1); });
