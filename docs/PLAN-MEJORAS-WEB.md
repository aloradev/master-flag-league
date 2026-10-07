# Plan de mejoras web

Actualizado: 7 de octubre de 2026.

1. Implementado localmente: carga de Jornada y Tabla con espera limitada a 30 segundos, errores comprensibles y reintento. Jornada funciona aunque falle la consulta de scrimmages. Pendiente comprobar el despliegue actualizado.
2. Implementado localmente: inicio con partidos en vivo y proximos, resultados de la ultima jornada terminada y resumen de posiciones por categoria. Pendiente publicar.
3. Implementado localmente: barra inferior movil con Inicio, Jornada, Tabla, Stats y Jugar; estados activos, navegacion de escritorio y espacio seguro inferior. Los perfiles de jugadores conservan la navegacion publica. Pendiente publicar.
4. Implementado localmente: /estadisticas sin cuenta, filtros de categoria, equipo y nueve metricas; enlaces compartibles, posiciones empatadas y acceso a perfiles. Usa el acceso publico existente y solo datos de partidos oficiales con estadisticas completas. Pendiente publicar.
5. Implementado localmente: pagina de partido con marcador por estado, ganador, fecha y sede, enlaces a equipos y jornada, estadisticas individuales del encuentro, MVP publicados, touchdowns, calendario y tarjeta PNG. Pendiente publicar frontend y API.
6. Implementado localmente: /equipos/:id con escudo, posicion y balance de temporada, plantilla aprobada, resultados y proximos encuentros; enlaces desde inicio, tabla y partidos. El acceso publico excluye datos de encargados, jugadores pendientes, jornadas en borrador y scrimmages. Pendiente publicar frontend y API.
7. Implementado localmente: perfil con identidad deportiva, dorsal, posicion, enlace al equipo, estadisticas ofensivas y defensivas, promedios por partido con estadisticas, reconocimientos MVP y tarjeta PNG. Los fallos de estadisticas permiten reintentar sin ocultar el perfil. Pendiente publicar frontend; usa los datos publicos de la API de mejoras anteriores.
8. Implementado localmente: jornada con fecha, horario, canchas, resumen, selector de jornadas publicadas, filtros de categoria/cancha/estado, agrupacion por horario/categoria/cancha y encuentro en vivo o proximo destacado. Enlaces compartidos conservan jornada y filtros. Los touchdowns suman cantidades y los partidos programados no muestran un falso 0-0. Pendiente publicar frontend.
9. Implementado localmente: /jugar con solicitud Busco equipo, consentimiento, validacion, confirmacion y reintentos sin duplicados. Bandeja privada /admin/interesados con contactos y estados, acceso administrativo y aislamiento por liga. Pendiente publicar frontend, API y migracion de base de datos.
10. Implementado localmente: tarjetas PNG para partidos, jugadores, posiciones y lideres; formatos cuadrado, vertical e historia, vista previa, descarga y compartir cuando el dispositivo lo permite. Incluyen identidad de equipos, paginacion y ajuste de textos largos. Pendiente publicar frontend.
11. Implementado localmente: titulos y descripciones por pagina, canonical sin parametros, Open Graph y Twitter con imagen; equipos, jugadores y partidos usan identidad y resultados publicos. Funcion de Vercel entrega metadatos en el HTML inicial sin depender de JavaScript, con escape HTML, imagenes seguras, espera limitada y respuestas 404/503 sin indexar fallos. Sitemap, robots y exclusion de rutas privadas. Pendiente desplegar frontend y verificar las vistas previas en produccion.
12. Implementado localmente: favoritos de equipos, jugadores y partidos sin cuenta, persistencia local y sincronizacion entre pestanas. Avisos voluntarios dentro de la web para cambios de horario/cancha, inicio y resultados de equipos y partidos seguidos; lectura, borrado, silencio y control de duplicados. No envia push ni avisos con la pagina cerrada; no sincroniza dispositivos. Pendiente publicar frontend.

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

Pruebas de mejoras 9 y 10: API con PostgreSQL temporal, consentimiento obligatorio, solicitudes idempotentes, limites por correo, permisos administrativos y aislamiento por liga. Navegador en 320, 390 y 1280 px: envio real a la API local, gestion de estados, vistas previas y descargas PNG en 1080x1080, 1080x1350 y 1080x1920, tablas paginadas y ausencia de desbordamientos. Imagenes descargadas revisadas visualmente. Datos de prueba, sin enviar solicitudes a produccion.

Prueba nueva: `node tests/interest-social.cjs` desde frontend, con QA_PLAYWRIGHT_PATH configurado. Vista previa aislada en el puerto 5191 mediante QA_PREVIEW_PORT=5191 al iniciar la prueba del backend con --preview.

Commit sugerido para mejoras 9 y 10: `feat: agrega busqueda de equipo y tarjetas para redes sociales`

Pruebas de mejoras 11 y 12: HTML inicial de la funcion de Vercel con API simulada, titulos, Open Graph, canonical, estados programados sin falso marcador, escape HTML, imagenes seguras y errores 404/503. Navegador con API local en 320, 390 y 1280 px: favoritos persistentes, avisos de inicio/resultado/horario, ausencia de avisos iniciales y duplicados, desactivacion/reactivacion, lectura y borrado, sincronizacion entre pestanas, metadatos privados sin tokens, almacenamiento corrupto o bloqueado y ausencia de desbordamientos. Capturas revisadas. Pendiente comprobar el enrutamiento de Vercel y el cache de las plataformas sociales despues del despliegue.

Pruebas nuevas desde frontend: `node tests/metadata-server.mjs` despues de compilar y `node tests/favorites-metadata.cjs` con QA_PLAYWRIGHT_PATH configurado y la API temporal en el puerto 5191.

Regresion aprobada: Inicio, Jornada, Tabla, Estadisticas, equipos, partidos, jugadores, solicitudes y tarjetas sociales. Compilacion de produccion y TypeScript aprobados. La funcion de metadatos utiliza VITE_API_URL en Vercel (misma direccion de la API que el cliente; por defecto https://mfl-api.onrender.com), y solo consulta endpoints publicos.

Commit sugerido para mejoras 11 y 12: `feat: agrega metadatos sociales favoritos y avisos locales`

Estado de la lista: mejoras 1 a 12 implementadas localmente. Queda pendiente el despliegue y la comprobacion final en produccion; favoritos y avisos son locales, no un sistema push.

## Segunda pasada UI

1. Implementado localmente: encabezados publicos compactos, titulos de 24 px en movil y 32 px en escritorio, menor espacio vertical y separador discreto. Se conserva el H1 y los metadatos; Compartir queda junto al titulo y se adapta al espacio disponible. La portada conserva su composicion.
2. Implementado localmente: Favoritos integrado como icono en la barra superior, sin fila adicional, con area tactil de 44 px, etiqueta accesible, tooltip, estado activo y contador de ancho fijo. Muestra 9+ cuando hay mas de nueve avisos, conservando el total para lectores de pantalla. Identidad abreviada MFL en movil y nombre completo en escritorio.
3. Implementado localmente: tarjetas de partido compartidas por Inicio, Jornada y equipos con filas de local/visitante, escudos de tamano fijo, nombres completos y marcadores alineados. Hora y cancha mantienen su ubicacion e indican datos por confirmar. En vivo se distingue por texto y borde; los finales identifican al ganador y los partidos sin marcador muestran guiones, no ceros ficticios. Pendiente publicar.
4. Implementado localmente: posiciones en una tabla responsive por categoria, con posicion y equipo fijos durante el desplazamiento horizontal. Cifras alineadas, PF/PC visibles en todos los tamanos mediante desplazamiento, filas alternas, nombres completos, cabeceras semanticas y ultimos resultados legibles con letras y etiquetas accesibles. La tabla es accesible por teclado y no desplaza horizontalmente toda la pagina. Pendiente publicar.
5. Implementado localmente: filtros de Jornada y Estadisticas agrupados en una franja compacta, con contador de filtros activos y Limpiar filtros. La limpieza conserva la jornada y agrupacion, o la estadistica elegida, ademas de otros parametros del enlace. Controles tactiles de 44 px y disposicion de dos columnas en movil. Pendiente publicar.
6. Implementado localmente: tarjetas sociales dentro de un panel Compartir tarjeta cerrado por defecto, con formato, paginacion, vista previa, descarga y compartir imagen en el mismo lugar. Teclado y apertura/cierre nativos; se libera la vista previa al cerrar y se invalida cuando cambian los datos. El enlace directo de compartir a WhatsApp se conserva. Pendiente publicar.
7. Implementado localmente: avisos con tipo e icono para resultados, en vivo, horario/cancha y estado; grupos Sin leer y Leidos, contador, mayor contraste en nuevos y lectura individual por boton o al abrir el partido. Se conservan lectura masiva, borrado y avisos antiguos sin tipo. Las fechas invalidas del almacenamiento se descartan sin romper la pantalla. Pendiente publicar.
8. Implementado localmente: consistencia de pantallas publicas mediante radios de 6/8 px, botones y controles de al menos 44 px, titulos de seccion y espaciados alineados, enlaces y estados de carga/vacio/error uniformes. Tema claro/oscuro, portada y administracion conservan su identidad; las reglas se limitan al marco publico. Pendiente publicar.

Pruebas UI 1 y 2: compilacion, TypeScript y navegador en 320, 390, 640 y 1280 px, tema claro y oscuro, paginas publicas y portada, contador con 30 avisos, lectura y desaparicion del contador, acceso por teclado, enlaces, titulos largos y sesion iniciada. Comprobaciones de altura de la barra, areas tactiles, ausencia de solapamientos y desbordamientos. Capturas en .qa-artifacts; prueba nueva frontend/tests/compact-public-header.cjs.

Regresion aprobada: Inicio, Jornada, Tabla, Estadisticas, equipos, partidos, perfiles, enlaces para compartir, tarjetas PNG, favoritos y avisos. Pendiente publicar estos ajustes visuales.

Commit sugerido para UI 1 y 2: `style: compacta encabezados publicos e integra favoritos`

Pruebas UI 3 y 4: compilacion y TypeScript; navegador en 320, 390, 640 y 1280 px, claro/oscuro, seis estados de partido, nombres largos, marcadores de tres cifras y escudos iguales. Tablas con cifras positivas/negativas, posicion y equipo fijos, ultimos cinco resultados completamente visibles al desplazar, acceso por teclado y enlaces a equipos. Capturas revisadas. Prueba nueva frontend/tests/match-standings-ui.cjs.

Regresion UI 3 y 4 aprobada: Inicio, Jornada, Tabla, Estadisticas, equipos, perfiles, partidos, solicitudes, tarjetas PNG y cabeceras compactas con y sin sesion. Se actualizo la comprobacion del marcador pendiente para validar los dos guiones del nuevo diseno. Se conservaron los cambios locales de UI 1 y 2.

Commit sugerido para UI 3 y 4: `style: unifica partidos y mejora tablas moviles`

Pruebas UI 5 y 6: compilacion y TypeScript; navegador en 320, 390, 640 y 1280 px, claro/oscuro, contador de uno a tres filtros, limpieza desde resultados vacios, persistencia de enlaces al recargar y conservacion de agrupacion/metrica. Paneles cerrados inicialmente, apertura por teclado, limpieza e invalidacion de vistas previas e imagenes cuadradas de partidos, jugadores, posiciones y lideres. Prueba nueva frontend/tests/filters-share-ui.cjs. Las pruebas de tarjetas existentes abren ahora el panel antes de descargar.

Regresion UI 5 y 6 aprobada: Inicio, Jornada, Tabla, Estadisticas, equipos, partidos, perfiles, solicitudes, tres formatos PNG y paginacion, cabeceras compactas y tablas con columnas fijas. Capturas revisadas; sin desbordamientos detectados. Se conservaron los cambios locales anteriores. Pendiente publicar.

Commit sugerido para UI 5 y 6: `style: ordena filtros y agrupa opciones de compartir`

Pruebas UI 7 y 8: compilacion y TypeScript; navegador en 320, 390, 640 y 1280 px, claro/oscuro, tipos de aviso y compatibilidad con antiguos, grupos nuevos/leidos, lectura individual, lectura al navegar, contador, persistencia, lectura masiva y borrado. Almacenamiento bloqueado y fecha invalida sin falsa confirmacion. Nombres largos, radios, areas tactiles, error de API y reintento. Prueba nueva frontend/tests/notices-consistency-ui.cjs; la prueba existente de favoritos comprueba tambien los tipos generados al cambiar un partido.

Regresion UI 7 y 8 aprobada: favoritos y sincronizacion entre pestanas, Inicio, Jornada, Tabla, Estadisticas, equipos, partidos, perfiles, solicitudes, formatos PNG y paginacion, cabeceras con/sin sesion, columnas fijas, filtros y panel de compartir. Capturas claras/oscuras revisadas; sin desbordamientos detectados. Cambios locales anteriores conservados.

Commit sugerido para UI 7 y 8: `style: jerarquiza avisos y unifica la interfaz publica`

Estado de la segunda pasada UI: mejoras 1 a 8 implementadas localmente; pendiente desplegar y comprobar en produccion.
