/**
 * RESTABLECER CONTRASEÑA.
 *
 * Pedido usando la aplicación: "agrega una forma en la que ellos puedan
 * resetear su contraseña de forma fácil". Antes solo administración podía
 * reponerla, entregando una temporal a mano — un cuello de botella con
 * veinte encargados y una jornada el sábado.
 *
 * Lo que se comprueba no es que el flujo "funcione", sino las decisiones
 * que lo hacen seguro y usable:
 *
 *  · La respuesta de "olvidé mi contraseña" es idéntica exista o no el
 *    correo. Si distinguiera, cualquiera podría averiguar quién pertenece
 *    a la liga probando direcciones.
 *  · El token vale UNA vez y una hora.
 *  · Una contraseña que no cumple los requisitos NO gasta el token: si lo
 *    gastara, un dedazo dejaría a la persona sin enlace.
 *  · Generar el enlace de administración NO cambia la contraseña actual.
 *    La temporal sí, y por eso deja fuera a quien no leyó el mensaje.
 *  · En la base vive el hash del token, nunca el token.
 *
 * La última sección cubre otra cosa del mismo tema: el freno de intentos
 * del ingreso. Va al final a propósito — deja el contador por origen con
 * una docena de fallos apuntados, y así no estorba a las suites que
 * corren después.
 *
 * Uso:  node tests/recuperacion.mjs      (con la API arriba)
 */
import pg from 'pg';

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

const tokenDe = (url) => new URL(url).searchParams.get('token');
const sufijo = Date.now().toString(36).slice(-5);

const run = async () => {
  console.log('\n═══ 1. PREPARACIÓN ═══');

  const admin = (await call('POST', '/auth/login', {
    body: { email: 'ananias.lora@go1.mx', password: 'Cancun2026' },
  })).body?.data?.accessToken;
  check('Super Admin entra', Boolean(admin));
  if (!admin) process.exit(1);

  const correo = `rec.${sufijo}@test.mx`;
  const CLAVE_VIEJA = 'Vieja2026';
  await call('POST', '/admin/users', {
    token: admin,
    body: { email: correo, name: 'Encargado Rec', password: CLAVE_VIEJA, role: 'TEAM_MANAGER' },
  });
  const usuarios = (await call('GET', '/admin/users', { token: admin })).body?.data ?? [];
  const userId = usuarios.find((u) => u.email === correo)?.id;
  check('Usuario de prueba creado', Boolean(userId));

  const entra = async (clave) =>
    (await call('POST', '/auth/login', { body: { email: correo, password: clave } })).status;
  check('Y entra con su contraseña', await entra(CLAVE_VIEJA) === 200);

  console.log('\n═══ 2. "OLVIDÉ MI CONTRASEÑA" NO REVELA QUIÉN ESTÁ REGISTRADO ═══');

  const existente = await call('POST', '/auth/forgot-password', { body: { email: correo } });
  const inventado = await call('POST', '/auth/forgot-password', {
    body: { email: `nadie.${sufijo}@test.mx` },
  });
  check('Con un correo real responde 200', existente.status === 200, `${existente.status}`);
  check('Con uno inventado también', inventado.status === 200, `${inventado.status}`);
  check('Y el mensaje es EXACTAMENTE el mismo',
    existente.body?.message === inventado.body?.message,
    `"${existente.body?.message}" vs "${inventado.body?.message}"`);
  check('Hablando en condicional, no afirmando que exista',
    /Si ese correo/i.test(existente.body?.message ?? ''), existente.body?.message);
  check('Sin devolver el enlace ni el token en la respuesta',
    !/token|restablecer\?/i.test(JSON.stringify(existente.body)),
    JSON.stringify(existente.body).slice(0, 120));

  // Express 5: sin cuerpo, req.body es undefined.
  const sinCuerpo = await call('POST', '/auth/forgot-password', {});
  check('Sin cuerpo no revienta: responde 200 igual', sinCuerpo.status === 200, `${sinCuerpo.status}`);
  const sinCorreo = await call('POST', '/auth/forgot-password', { body: {} });
  check('Sin el campo correo, lo mismo', sinCorreo.status === 200, `${sinCorreo.status}`);

  console.log('\n═══ 3. EL ENLACE DE ADMINISTRACIÓN ═══');

  const generado = await call('POST', `/admin/users/${userId}/reset-link`, { token: admin });
  check('Administración genera el enlace', generado.status === 200,
    JSON.stringify(generado.body).slice(0, 200));
  const url = generado.body?.data?.url;
  check('Que apunta a /restablecer con un token', /\/restablecer\?token=/.test(url ?? ''), url);
  check('Y dice cuándo vence', Boolean(generado.body?.data?.expires_at));
  check('El token es largo: no se adivina',
    (tokenDe(url) ?? '').length >= 40, `${(tokenDe(url) ?? '').length} caracteres`);

  check('Generar el enlace NO cambia la contraseña actual', await entra(CLAVE_VIEJA) === 200);

  const desdeManager = (await call('POST', '/auth/login', {
    body: { email: correo, password: CLAVE_VIEJA },
  })).body?.data?.accessToken;
  const ajeno = await call('POST', `/admin/users/${userId}/reset-link`, { token: desdeManager });
  check('Un encargado NO puede generar enlaces', ajeno.status === 403, `${ajeno.status}`);
  const anonimo = await call('POST', `/admin/users/${userId}/reset-link`);
  check('Y sin sesión tampoco', anonimo.status === 401, `${anonimo.status}`);

  console.log('\n═══ 4. EL TOKEN SE COMPRUEBA ANTES DE PEDIR NADA ═══');

  const bueno = tokenDe(url);
  const revision = await call('GET', `/auth/reset-password/${bueno}`);
  check('Un token válido se reporta válido', revision.body?.data?.valid === true);
  const basura = await call('GET', '/auth/reset-password/esto-no-es-un-token-de-verdad');
  check('Uno inventado se reporta inválido', basura.body?.data?.valid === false);
  check('Sin filtrar de quién era ni por qué falló',
    !/correo|email|@|usuario/i.test(JSON.stringify(basura.body)),
    JSON.stringify(basura.body));
  check('Comprobar NO gasta el token',
    (await call('GET', `/auth/reset-password/${bueno}`)).body?.data?.valid === true);

  console.log('\n═══ 5. UNA CONTRASEÑA INVÁLIDA NO GASTA EL ENLACE ═══');
  /**
   * Si un dedazo gastara el token, la persona se quedaría sin enlace y
   * tendría que pedir otro — justo cuando está intentando entrar.
   */
  const floja = await call('POST', '/auth/reset-password', {
    body: { token: bueno, password: 'corta' },
  });
  check('Rechaza la contraseña floja', floja.status === 400, `${floja.status}`);
  check('Diciendo qué le falta',
    (floja.body?.details ?? []).length > 0, JSON.stringify(floja.body?.details));
  check('Y el enlace sigue sirviendo',
    (await call('GET', `/auth/reset-password/${bueno}`)).body?.data?.valid === true);

  console.log('\n═══ 6. EL CAMBIO, Y EL TOKEN DE UN SOLO USO ═══');

  const CLAVE_NUEVA = 'Nueva2026';
  const cambio = await call('POST', '/auth/reset-password', {
    body: { token: bueno, password: CLAVE_NUEVA },
  });
  check('La contraseña se cambia', cambio.status === 200, JSON.stringify(cambio.body).slice(0, 200));
  check('Se entra con la nueva', await entra(CLAVE_NUEVA) === 200);
  check('Y la vieja ya no sirve', await entra(CLAVE_VIEJA) === 401);

  const repetido = await call('POST', '/auth/reset-password', {
    body: { token: bueno, password: 'OtraMas2026' },
  });
  check('El mismo enlace no sirve dos veces', repetido.status === 400, `${repetido.status}`);
  check('Explicando que hay que pedir otro',
    /venció|se usó|nuevo/i.test(repetido.body?.error ?? ''), repetido.body?.error);
  check('Y la contraseña no cambió con el segundo intento',
    await entra(CLAVE_NUEVA) === 200);
  check('Ya marcado como inválido al comprobarlo',
    (await call('GET', `/auth/reset-password/${bueno}`)).body?.data?.valid === false);

  console.log('\n═══ 7. PEDIR UNO NUEVO INVALIDA EL ANTERIOR ═══');
  /**
   * Si alguien toca el botón dos veces y llegan dos correos, solo el
   * último debe servir: si no, un enlace viejo interceptado seguiría
   * abriendo la cuenta.
   */
  const primero = tokenDe((await call('POST', `/admin/users/${userId}/reset-link`, { token: admin }))
    .body?.data?.url);
  const segundo = tokenDe((await call('POST', `/admin/users/${userId}/reset-link`, { token: admin }))
    .body?.data?.url);
  check('Los dos enlaces son distintos', primero !== segundo);
  check('El primero deja de valer',
    (await call('GET', `/auth/reset-password/${primero}`)).body?.data?.valid === false);
  check('Y el segundo sí vale',
    (await call('GET', `/auth/reset-password/${segundo}`)).body?.data?.valid === true);

  console.log('\n═══ 8. CUENTA DESACTIVADA ═══');
  await call('PUT', `/admin/users/${userId}`, { token: admin, body: { active: false } });
  const desactivado = await call('POST', `/admin/users/${userId}/reset-link`, { token: admin });
  check('No se genera enlace para una cuenta desactivada',
    desactivado.status === 400, `${desactivado.status}`);
  check('Diciendo que hay que activarla primero',
    /activ/i.test(desactivado.body?.error ?? ''), desactivado.body?.error);
  check('Y un enlace que ya existía deja de valer',
    (await call('GET', `/auth/reset-password/${segundo}`)).body?.data?.valid === false);
  await call('PUT', `/admin/users/${userId}`, { token: admin, body: { active: true } });

  console.log('\n═══ 9. LA BASE NO GUARDA EL TOKEN, NI LOS VIEJOS SIRVEN ═══');
  const cliente = new pg.Client({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'x',
    database: process.env.DB_NAME || 'mfl',
  });
  let conBase = false;
  try { await cliente.connect(); conBase = true; }
  catch (e) { console.log(`  ⚠️  Sin acceso directo a la base: ${e.message}`); }

  if (conBase) {
    const vigente = tokenDe((await call('POST', `/admin/users/${userId}/reset-link`, { token: admin }))
      .body?.data?.url);

    const guardado = await cliente.query(
      'SELECT token_hash FROM password_resets WHERE user_id = $1 AND used_at IS NULL',
      [userId]
    );
    const hashes = guardado.rows.map((r) => r.token_hash);
    check('Solo hay un token vigente', hashes.length === 1, `${hashes.length}`);
    check('La base NO guarda el token en claro',
      !hashes.includes(vigente), hashes[0]?.slice(0, 16));
    check('Guarda un SHA-256 hexadecimal', /^[0-9a-f]{64}$/.test(hashes[0] ?? ''), hashes[0]);

    // Envejecer el token: una hora y un minuto atrás.
    await cliente.query(
      `UPDATE password_resets SET expires_at = NOW() - INTERVAL '1 minute'
       WHERE user_id = $1 AND used_at IS NULL`,
      [userId]
    );
    check('Un enlace vencido se reporta inválido',
      (await call('GET', `/auth/reset-password/${vigente}`)).body?.data?.valid === false);
    const conVencido = await call('POST', '/auth/reset-password', {
      body: { token: vigente, password: 'Vencida2026' },
    });
    check('Y no cambia la contraseña', conVencido.status === 400, `${conVencido.status}`);
    check('La contraseña sigue siendo la que se puso', await entra(CLAVE_NUEVA) === 200);

    await cliente.end();
  }

  console.log('\n═══ 10. EL FRENO DEL INGRESO ═══');
  /**
   * `/auth/login` es público y la política de contraseña admite ocho
   * caracteres con una letra y un número: probar contraseñas contra el
   * correo de un encargado era gratis y sin tope.
   *
   * Primero el servicio por separado, que es donde vive la decisión que
   * importa —contar solo fallos y limpiarlos al entrar— y se puede
   * comprobar a fondo sin gastar intentos reales.
   */
  {
    const { estaFrenado, registrarFallo, limpiarFallos, demasiadosIntentos, reiniciarFreno } =
      await import('../dist/services/freno.service.js');
    reiniciarFreno();

    check('Una clave nueva no está frenada', estaFrenado('x', 3) === false);
    registrarFallo('x');
    registrarFallo('x');
    check('Con fallos por debajo del tope, sigue pasando', estaFrenado('x', 3) === false);
    registrarFallo('x');
    check('Al alcanzar el tope, frena', estaFrenado('x', 3) === true);

    check('Mirar si está frenado NO cuenta como intento',
      estaFrenado('x', 3) === true && estaFrenado('x', 4) === false);

    limpiarFallos('x');
    check('Entrar bien borra los fallos de ese correo', estaFrenado('x', 3) === false);

    // `demasiadosIntentos` sí cuenta cada llamada: es para pedir correos.
    reiniciarFreno();
    check('demasiadosIntentos cuenta el primer intento', demasiadosIntentos('y', 2) === false);
    check('Y el segundo', demasiadosIntentos('y', 2) === false);
    check('Y frena el tercero', demasiadosIntentos('y', 2) === true);
    check('Sin dejar de frenar al insistir', demasiadosIntentos('y', 2) === true);
    reiniciarFreno();
  }

  /**
   * Y ahora contra la API de verdad. Se usa un correo de un solo uso: el
   * tope por correo es de 10 fallos en 15 minutos.
   */
  {
    const victima = `freno.${sufijo}@test.mx`;
    const fallar = () =>
      call('POST', '/auth/login', { body: { email: victima, password: 'MalaClave1' } });

    let estados = [];
    for (let i = 0; i < 11; i += 1) estados.push((await fallar()).status);

    check('Los primeros intentos fallidos responden 401',
      estados.slice(0, 10).every((s) => s === 401),
      estados.slice(0, 10).join(','));
    check('Y el que pasa del tope responde 429, no 401',
      estados[10] === 429, `${estados[10]}`);

    const frenado = await fallar();
    check('El mensaje dice qué hacer, sin revelar si la cuenta existe',
      /Demasiados intentos/i.test(frenado.body?.error ?? '') &&
        !/no existe|no registrado/i.test(frenado.body?.error ?? ''),
      frenado.body?.error);
    check('Y ofrece la salida buena',
      /Olvidé mi contraseña/i.test(frenado.body?.error ?? ''), frenado.body?.error);

    /**
     * Lo que separa un freno de una forma de dejar a alguien fuera: la
     * cuenta que sí existe y tiene su contraseña buena sigue entrando,
     * aunque este mismo origen acumule una docena de fallos.
     */
    const entraIgual = await call('POST', '/auth/login', {
      body: { email: correo, password: CLAVE_NUEVA },
    });
    check('Una cuenta real con su contraseña sigue entrando',
      entraIgual.status === 200, `${entraIgual.status}`);
  }

  console.log('\n════════════════════════════════════════');
  console.log(`  RESULTADO: ${passed} pasaron · ${failed} fallaron`);
  console.log('════════════════════════════════════════');
  process.exit(failed === 0 ? 0 : 1);
};

run().catch((e) => { console.error(e); process.exit(1); });
