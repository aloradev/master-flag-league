# Plan de mejoras web

Actualizado: 6 de octubre de 2026.

1. Implementado localmente: carga de Jornada y Tabla con espera limitada a 30 segundos, errores comprensibles y reintento. Jornada funciona aunque falle la consulta de scrimmages. Pendiente comprobar el despliegue actualizado.
2. Implementado localmente: inicio con partidos en vivo y proximos, resultados de la ultima jornada terminada y resumen de posiciones por categoria. Pendiente publicar.
3. Implementado localmente: barra inferior movil con Inicio, Jornada, Tabla, Stats y Jugar; estados activos, navegacion de escritorio y espacio seguro inferior. Los perfiles de jugadores conservan la navegacion publica. Pendiente publicar.
4. Implementado localmente: /estadisticas sin cuenta, filtros de categoria, equipo y nueve metricas; enlaces compartibles, posiciones empatadas y acceso a perfiles. Usa el acceso publico existente y solo datos de partidos oficiales con estadisticas completas. Pendiente publicar.
5. Implementado localmente: pagina de partido con marcador por estado, ganador, fecha y sede, enlaces a equipos y jornada, estadisticas individuales del encuentro, MVP publicados, touchdowns, calendario y tarjeta PNG. Pendiente publicar frontend y API.
6. Implementado localmente: /equipos/:id con escudo, posicion y balance de temporada, plantilla aprobada, resultados y proximos encuentros; enlaces desde inicio, tabla y partidos. El acceso publico excluye datos de encargados, jugadores pendientes, jornadas en borrador y scrimmages. Pendiente publicar frontend y API.
7. Implementado localmente: perfil con identidad deportiva, dorsal, posicion, enlace al equipo, estadisticas ofensivas y defensivas, promedios por partido con estadisticas, reconocimientos MVP y tarjeta PNG. Los fallos de estadisticas permiten reintentar sin ocultar el perfil. Pendiente publicar frontend; usa los datos publicos de la API de mejoras anteriores.
8. Implementado localmente: jornada con fecha, horario, canchas, resumen, selector de jornadas publicadas, filtros de categoria/cancha/estado, agrupacion por horario/categoria/cancha y encuentro en vivo o proximo destacado. Enlaces compartidos conservan jornada y filtros. Los touchdowns suman cantidades y los partidos programados no muestran un falso 0-0. Pendiente publicar frontend.
9. Pendiente: recorrido Quiero jugar / Busco equipo.
10. Pendiente: imagenes para redes sociales.
11. Pendiente: titulos, descripciones y vistas previas por pagina.
12. Pendiente: favoritos y avisos.

## Verificacion de produccion

El 6 de octubre la version publicada contiene la direccion correcta de la API de Render y GET /api/v1/public/round respondio con datos reales. No se confirmo una configuracion incorrecta de Vercel. Los cambios evitan esperas indefinidas y separan la carga de la jornada de la consulta secundaria de scrimmages; no eliminan posibles interrupciones del proveedor.

## Pruebas

- Compilacion de produccion y comprobacion de TypeScript.
- Cliente API: respuesta HTML inesperada, fallo de red y tiempo de espera agotado.
- Regresion de acceso temporal y cierre de sesion.
- Navegador: inicio, jornada y tabla en 390 y 1280 px, resultados anteriores, fallo de scrimmages y recuperacion tras error. Datos simulados para pruebas reproducibles.
- Integracion: inicio, jornada y tabla cargan datos reales de la API publicada desde el navegador local.

Para revisar contra la API remota en desarrollo, definir `API_PROXY_TARGET=https://mfl-api.onrender.com` y dejar `VITE_API_URL` vacio. El proxy de desarrollo evita el bloqueo de origen local; la configuracion de produccion no cambia.

Pruebas de mejoras 3 y 4: acceso anonimo, navegacion publica y perfiles, filtros, enlaces compartidos, empates, registros vacios, errores y reintento en 320, 390 y 1280 px. Regresion de inicio, jornada y tabla en 390 y 1280 px.

Commit sugerido para mejoras 3 y 4: `feat: agrega navegacion movil y estadisticas publicas`

Pruebas de mejoras 5 y 6: API HTTP con PostgreSQL temporal en memoria, permisos publicos, campos privados excluidos, plantilla aprobada, jornadas en borrador, scrimmages, cantidades de jugadas y anulaciones, estadisticas pendientes y MVP. Navegador en 320, 390 y 1280 px con la API local: plantilla y perfiles, resultados, marcador, calendario ICS, tarjeta PNG, estados en vivo y pendientes, errores y reintento. Capturas revisadas sin desbordamientos.

Ejecutar `node tests/public-team-match.mjs` desde backend despues de compilar. Para una vista previa aislada con datos de prueba: `node tests/public-team-match.mjs --preview`; abre el puerto 5190 y sirve frontend/dist. Las pruebas de navegador estan en frontend/tests/public-team-match.cjs.

Commit sugerido para mejoras 5 y 6: `feat: mejora partidos y agrega perfiles publicos de equipos`

Pruebas de mejoras 7 y 8: compilacion y TypeScript; navegador en 320, 390 y 1280 px, perfil con API local temporal, promedios, MVP, descarga PNG, enlace al equipo, error independiente de estadisticas, reintento y ausencia de datos. Jornada con filtros combinados, agrupacion, cambio de jornada, persistencia de filtros, enlaces compartidos, incomparecencias, cantidades de touchdowns y horarios sin marcador. Capturas revisadas sin desbordamientos. Regresion de Inicio, Jornada, Tabla, Estadisticas, equipos y partidos.

Prueba nueva: `node tests/public-player-round.cjs` desde frontend, con QA_PLAYWRIGHT_PATH configurado y la vista previa aislada del backend en el puerto 5190.

Commit sugerido para mejoras 7 y 8: `feat: renueva perfiles de jugadores y organiza jornadas publicas`
