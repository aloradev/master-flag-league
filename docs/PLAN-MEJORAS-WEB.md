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

Correccion posterior de Inicio: retirada la altura porcentual de las tarjetas compartidas, que desbordaban su columna y se superponian con posiciones y la siguiente seccion. La prueba public-pages.cjs reproduce el fallo antes del arreglo y valida despues la contencion vertical, separacion de tarjetas y secciones en 320, 390, 470, 640, 768, 1024 y 1280 px; incluye regresion de Jornada y Tabla. Compilacion y TypeScript aprobados. Lista UI 1 a 8 conservada; correccion local pendiente de publicar.

Commit sugerido: `fix: corrige superposicion de partidos en inicio`

## Iteracion posterior a la auditoria de producto

1. Implementado localmente: contraste de Inicio por tema. Nombres de Comunidad claros sobre tarjetas oscuras, resumen e invitacion legibles en claro, acentos de enlaces promocionales adaptados al fondo, titular amarillo con variante oscura en claro y texto blanco en la franja de categorias clara. Sin cambios de distribucion ni nuevas funciones. Pendiente publicar.
2. Implementado localmente: cabecera de Inicio compacta con Master Flag League como titulo, arte promocional conservado, acceso principal Ver jornada y opciones de inscripcion/Busco equipo visibles. LeagueLive va inmediatamente despues de la identidad; la franja de categorias pasa debajo del bloque deportivo. Se retiran las alturas minimas de 650/780 px y el gran desplazamiento vertical de la imagen; las tarjetas y consultas compartidas no cambian. Pendiente publicar.
3. Implementado localmente: balance compacto JJ/G/E/P/DIF debajo del equipo en la columna fija de la tabla, visible por debajo de 640 px sin desplazamiento horizontal. Posicion, nombre y escudo conservados; empates y diferencia con signo incluidos. Las diez columnas completas siguen accesibles con scroll y mantienen sus cabeceras para lectores de pantalla; el resumen visual no duplica sus anuncios. Escritorio y exportacion social conservan el detalle anterior. Pendiente publicar.
4. Implementado localmente: resultados de Inicio agrupados por jornada de origen, con fecha completa y enlace a su jornada. Orden descendente por fecha de jornada y hora programada; no se inventa una hora de finalizacion. Se conservan tres resultados como maximo, sin duplicados, dando preferencia a los datos de la jornada vigente cuando un partido aparece en ambas consultas. Tarjetas compartidas, tabla y API sin cambios. Pendiente publicar.
5. Implementado localmente: Compartir enlace con copia, WhatsApp y menu nativo si existe; error de copia con URL seleccionable. Compartir imagen separado, con preparacion previa para conservar la activacion del usuario al abrir el menu nativo, comprobacion del archivo real y descarga siempre explicita. Cancelar o no admitir archivos no descarga automaticamente. Imagen preparada y vista previa invalidadas al cambiar datos/formato/pagina o cerrar el panel; se descartan generaciones obsoletas. Pendiente publicar y validar en dispositivos reales.
6. Implementado localmente: PlayerAvatar y TeamCrest sustituyen imagenes fallidas por el respaldo existente (dorsal o iniciales; abreviatura del equipo). Conservan dimensiones, clases y nombre accesible. Cambiar la URL reinicia el estado de fallo, sin reintentos automaticos ni cambios en documentos protegidos. Pendiente publicar.
7. Implementado localmente: Inicio muestra marcadores estructurales de partido y filas de posiciones durante la primera carga, con estado accesible y sin controles ficticios ni animacion. Se reserva una linea de contexto de jornada, no una altura fija de seccion. Los resultados no se anuncian vacios mientras faltan consultas iniciales. Se conserva el contenido ya consultado durante actualizaciones en segundo plano, incluso resultados vacios. Cantidades y nombres desconocidos pueden seguir desplazando contenido; no se promete CLS cero. Pendiente publicar.
8. En validacion: recorrido tecnico de Favoritos comprobado y protocolo para cinco jugadores preparado en docs/VALIDACION-FAVORITOS.md. Sin cambios de icono, acceso ni mensajes hasta obtener evidencia de reconocimiento. Pendientes las sesiones con personas; no se considera completado por aprobar pruebas automatizadas.
9. Implementado localmente: metrica primero en Estadisticas, a ancho completo en movil; categoria y equipo en la siguiente fila y tres controles alineados en escritorio. Explicacion de elegibilidad conservada debajo del ranking y antes de compartir imagen. Calculos, empates, limite de 25, filtros, errores y URL sin cambios. Jerarquia y geometria comprobadas; pendiente medir rapidez con personas y publicar.
10. Validacion parcial realizada en produccion, solo lectura: rutas publicas y fichas reales de jornada/partido/equipo, metadatos iniciales, canonical, 404, exclusion de Favoritos/Ingresar, archivos e imagen OG y navegador en 320/1280 sin overflow global ni errores JS. Informe docs/VALIDACION-DESPLIEGUE-2026-10-07.md. Pendiente acreditar commit del deployment, perfil real de jugador, compartir/vistas previas en dispositivos, formularios y migraciones controladas. Archivos publicados distintos de dist local; no demuestra por si solo una version antigua. No se desplego.

Pruebas del punto 1: TypeScript y build aprobados. Nueva prueba frontend/tests/home-contrast.cjs: contraste de textos revisados, extremos de fondos degradados, geometria estable entre temas, enlaces a equipos y ausencia de overflow global en 320, 360, 390, 430, 640, 768, 1024 y 1280 px, claro/oscuro. Capturas de Comunidad revisadas en ambos temas. Regresion public-pages.cjs aprobada para Inicio/Jornada/Tabla, incluida contencion vertical, en siete anchos. Esto no certifica el contraste de toda la aplicacion ni sustituye pruebas en dispositivos reales.

Commit sugerido para el punto 1: `fix: mejora contraste del inicio en tema claro`

Pruebas del punto 2: TypeScript y build aprobados. Nueva prueba frontend/tests/home-entry.cjs en 320, 360, 390, 430, 640, 768, 1024 y 1280 px, claro/oscuro: marca y primer equipo visibles al entrar con viewport de 844 px, imagen cargada, enlaces a Jornada/registro/Busco equipo, controles tactiles, siete partidos, contencion de tarjetas y secciones. Casos adicionales en 320/1280: vacio, solo resultados, error/reintento, carga bloqueada, nombres largos, texto de cabecera ampliado y pantallas de poca altura. Primer partido en el fixture entre 536 y 596 px segun ancho, frente a aproximadamente 1290-1325 px moviles medidos en la auditoria con otros datos; las cifras dependen del contenido. No se promete mostrar el partido completo en cualquier telefono o con texto ampliado.

Regresion del punto 2: home-contrast.cjs, public-pages.cjs y compact-public-header.cjs; contraste, navegacion, encabezados y contencion vertical conservados. Capturas moviles y de escritorio revisadas en ambos temas. No sustituye la validacion en dispositivos reales ni en produccion.

Commit sugerido para el punto 2: `style: acerca la actividad de la liga al inicio`

Pruebas del punto 3: TypeScript y build aprobados. match-standings-ui.cjs ampliado a 320, 360, 390, 430, 640, 768, 1024 y 1280 px, claro/oscuro; prueba falla antes del cambio por ausencia del balance y pasa despues. Valida resumen dentro de la columna visible, empates, diferencias negativas/cero/positivas, cifras de tres digitos, nombres largos, texto de balance ampliado en 320 px, columnas fijas al desplazar, cinco resultados visibles al final del scroll, teclado, enlaces y seis estados de partido. Vistas previas 1080x1080, 1080x1350 y 1080x1920 y descarga PNG de posiciones aprobadas. Capturas de tabla con datos de demostracion y exportacion revisadas. Regresion public-pages.cjs aprobada para Inicio/Jornada/Tabla, incluida contencion vertical. Pendiente lector de pantalla y dispositivos reales.

Commit sugerido para el punto 3: `style: muestra balance esencial en la tabla movil`

Pruebas del punto 4: TypeScript y build aprobados. Nueva prueba home-results.cjs en 320, 360, 390, 430, 640, 768, 1024 y 1280 px, claro/oscuro: fecha ISO sin desplazamiento de dia, jornada correcta, orden por fecha/hora, limite de tres, incomparecencia, hora desconocida, duplicados y preferencia del dato vigente. Casos adicionales en 320/1280: misma jornada en ambas consultas, sin anterior, vacio, fallo de calendario o resultados con reintento, fallo de jornada vigente sin perder los anteriores y respuestas en distinto orden. Agrupacion semantica, texto largo, contencion vertical y ausencia de overflow comprobadas. Capturas revisadas en ambos temas. Regresion public-pages.cjs y home-entry.cjs aprobada; se ajustaron sus fixtures para que la jornada anterior tenga identidad y fecha propias.

Commit sugerido para el punto 4: `fix: identifica la jornada y fecha de resultados en inicio`

Pruebas del punto 5: TypeScript y build aprobados. Nueva sharing-ui.cjs en 320, 390 y 1280 px, claro/oscuro: copia de URL con parametros, alternativa manual ante permisos bloqueados, menu nativo simulado con activacion del usuario, preparacion sin envio, archivos PNG en tres formatos, cancelacion, error, falta de APIs, archivos incompatibles, descarga explicita y generacion obsoleta al cerrar. Capturas revisadas. Regresion filters-share-ui.cjs aprobada en 320/390/640/1280 y ambos temas; public-statistics.cjs, public-player-round.cjs y public-team-match.cjs aprobadas. Las APIs nativas se simulan: no certifica el comportamiento de Android/iOS ni publica automaticamente en redes.

Commit sugerido para el punto 5: `feat: distingue compartir enlaces e imagenes`

Regresion adicional del punto 5: compact-public-header.cjs aprobada en 320/390/640/1280, ambos temas y con sesion. La primera ejecucion se interrumpio al renovar la compilacion servida; se repitio completa sobre el artefacto final estable.

Pruebas del punto 6: TypeScript y build aprobados. Nueva identity-images.cjs en 320/390/1280, claro/oscuro: URL 404, PNG corrupto, URL ausente, dorsal cero, iniciales, nombres accesibles, dimensiones conservadas, recuperacion al cambiar URL sin recargar el documento y ausencia de bucles de peticiones. Service worker bloqueado solo en la prueba para controlar las respuestas simuladas. Capturas revisadas. Regresion public-team-match.cjs y public-player-round.cjs: equipo, plantilla, perfiles, partidos, jornadas y exportacion PNG. Pendiente dispositivos reales y produccion.

Commit sugerido para el punto 6: `fix: muestra respaldo cuando fallan avatares y escudos`

Pruebas del punto 7: TypeScript y build aprobados. Nueva home-loading.cjs en 320/390/640/1280, claro/oscuro, con respuestas retenidas: estados accesibles, ausencia de vacio prematuro, sin controles falsos ni overflow, error/reintento y datos conservados durante actualizacion. En fixture sintetico de un partido, el desplazamiento de Resultados recientes se reduce de 233-253 px con carga textual a 32-52 px con marcadores; se compara el mismo contenido y viewport. No es una medicion CLS ni representa todos los volumenes de datos. Capturas de carga revisadas. Regresion home-entry.cjs y home-results.cjs en ocho anchos y ambos temas, y public-pages.cjs en siete anchos; contencion vertical, fechas, errores, recuperacion y navegacion conservadas. Cambio acotado a LeagueLive/Inicio, no al Spinner global ni al resto de rutas.

Commit sugerido para el punto 7: `style: reduce saltos de contenido durante la carga de inicio`

Trabajo del punto 8: nueva favorites-discovery.cjs en 320/360/390/430/640/768/1024/1280, ambos temas: primer acceso sin cuenta, recorrido real con Tab/Enter, area tactil de 44 px, nombre accesible y estado activo, vacio con acceso a equipos, guardar jugador, regresar desde Inicio, recuperar tras recarga, quitar y avisos desactivados por defecto. Capturas revisadas. Regresion favorites-metadata.cjs para guardados de equipo/jugador/partido, avisos, lectura/borrado, sincronizacion entre pestanas y almacenamiento bloqueado/corrupto. Solo documentacion y pruebas; sin cambios de aplicacion ni nuevo build requerido. Esto comprueba funcionamiento, no que una persona reconozca el icono.

Commit sugerido para el punto 8: `test: valida recorrido de favoritos y prepara prueba con jugadores`

Pruebas del punto 9: TypeScript y build aprobados. Nueva statistics-priority.cjs en 320/360/390/430/640/768/1024/1280 y ambos temas: orden de controles, 44 px, primer nombre visible en viewport de 844 px con fixture corto, nueve metricas, empates 1/1/3, parametros conservados, nombres largos y texto de nombre ampliado en 320 px, sin overflow. El titulo aparece 80-100 px antes en movil y 40-60 px en anchos mayores al comparar el mismo layout con la explicacion encima o debajo. No equivale a un tiempo humano de busqueda ni asegura visibilidad con cualquier contenido/altura. Capturas revisadas; public-statistics.cjs aprobada para filtros, vacio, error/reintento y enlaces. Regresion filters-share-ui.cjs para filtros y vistas previas.

Validacion humana pendiente del punto 9: con jugadores nuevos, abrir Estadisticas sin explicar los controles y pedir identificar nombre y valor del lider en una metrica indicada, despues en una categoria/equipo. Registrar tiempo desde datos visibles, exito sin ayuda, errores y empates identificados; separar latencia de red del tiempo de busqueda. Comparar versiones equivalentes con personas distintas para evitar aprendizaje. No afirmar que encuentran al lider en cinco segundos hasta medirlo; cinco participantes sirven como exploracion, no como estimacion poblacional.

Commit sugerido para el punto 9: `style: prioriza metrica y lideres en estadisticas`

Trabajo del punto 10: nueva deployed-readonly.cjs y tres ejecuciones sobre el sitio publicado. La final espera contenido de fichas e Inicio cargado y registra cabeceras de indexacion; diez rutas publicas HTTP 200, una privada HTTP 200 con noindex por cabecera y una inexistente HTTP 404 con noindex. Catorce recorridos de navegador en 320/1280 sin overflow global ni errores JS detectados. No se enviaron formularios ni se comprobo el esquema de base de datos. Solo pruebas y documentacion, sin cambios de aplicacion ni nuevo build requerido.

Commit sugerido para el punto 10: `test: documenta validacion de solo lectura del sitio publicado`

Estado: puntos 1 a 7 y 9 implementados localmente. Punto 8 pendiente de prueba con cinco jugadores; punto 9 pendiente de medir rapidez con personas. Punto 10 parcialmente comprobado, con pendientes explicitados en el informe de despliegue; no se declara el sitio completamente validado ni todos los cambios publicados.

## Mejoras adicionales de orientacion

Lista independiente de la iteracion anterior, autorizadas 1 a 6.

1. Implementado localmente: enlaces inexistentes con salida contextual. Equipo 404 ofrece Ver equipos, jugador 404 Ver estadisticas, partido/jornada explicita 404 Ver jornada. Jornada vigente sin publicar ofrece Ver equipos, sin enlazar a si misma. Errores temporales y de conexion conservan Reintentar. En jornada explicita fallida, los scrimmages disponibles ya no ocultan el aviso del enlace inexistente; se conservan debajo. No cambia la respuesta HTTP del servidor ni el funcionamiento de las fichas cargadas.
2. Implementado localmente: ultima consulta correcta con fecha/hora de Cancun en Inicio, Jornada, Tabla, Estadisticas, Partido, Equipo y jugador (perfil y estadisticas separados). No es fecha de captura ni certifica que los datos deportivos sean recientes. Las consultas en curso y fallidas se distinguen sin sustituir la hora anterior; reintento cuando hay datos guardados. Tabla conserva la clasificacion ante un error de actualizacion. Avisos existentes de captura pendiente conservados.
3. Implementado localmente: categoria y equipo junto al titulo de ranking, vinculados semanticamente a la seccion. El contexto se conserva al cambiar metrica/recargar y se incluye en enlace compartido y subtitulo de imagen. Identificadores desconocidos se muestran como Categoria/Equipo no disponible, nunca como todos. Calculos, empates y filtros sin cambios.
4. Implementado localmente para las seis pantallas deportivas: texto al 200% simulado, teclado en compartir enlace/imagen, foco visible y salto al contenido. Se corrigen nombres/etiquetas del marcador, columnas de estadisticas individuales adaptadas a em, etiquetas de metricas, altura de selectores proporcional al texto, filtros de Estadisticas apilables y navegacion/reserva inferior que crecen con el texto. La ultima accion puede desplazarse por encima de la barra movil. No constituye certificacion WCAG de toda la aplicacion; pendiente zoom nativo, lector de pantalla y telefonos reales.
5. Implementado localmente: posiciones por entrada del historial (hasta 100 en la sesion de la aplicacion), restauracion al volver/avanzar y espera de cambios de altura durante hasta cinco segundos. Se interrumpe ante rueda, toque o teclado para respetar la navegacion del usuario. Los filtros, metrica, agrupacion y pestaña existentes siguen en la URL; cambiar filtros no envia al inicio. Paginas nuevas mantienen el salto al inicio y foco en contenido. No guarda posiciones tras cerrar/recargar la aplicacion ni garantiza restauracion con cargas superiores a cinco segundos.
6. Implementado localmente: Jornada usa las mismas etiquetas y estados de ETIQUETA_PARTIDO que las tarjetas compartidas por Inicio y la ficha Partido. Filtros explicitos para cancelado e incomparecencia; Final ya no agrupa silenciosamente incomparecencias. Partido cancelado tiene titulo propio. Programado, pospuesto y cancelado no muestran estadisticas pendientes de captura ni eventos antiguos como actividad actual; final con captura pendiente y datos provisionales en vivo mantienen sus avisos diferenciados. Sin cambiar estados ni reglas del servidor.

Pruebas adicionales 1 y 3: TypeScript y build aprobados. Nueva recovery-ranking-context.cjs en 320/390/640/1280, ambos temas: salidas 404 de cuatro fichas, destino y acceso con teclado, controles de 44 px, recuperacion de 503 y fallo de conexion, vigente sin publicar, error explicito junto a scrimmages, contexto de ranking con filtros/desconocidos/nombres largos, enlace compartido, recarga y limpieza sin perder metrica ni parametros ajenos. Capturas de 404 y ranking revisadas. Regresion public-statistics.cjs, public-team-match.cjs, public-player-round.cjs, filters-share-ui.cjs y statistics-priority.cjs; incluye vistas previas PNG y empates. Pendiente publicar y validar con personas/dispositivos reales.

Commit sugerido para adicionales 1 y 3: `fix: orienta enlaces inexistentes y aclara alcance de rankings`

Pruebas adicionales 2 y 4: TypeScript y build aprobados. freshness-accessibility.cjs en 320/390/1280, claro/oscuro: reloj controlado para consulta caducada, regreso a Tabla, peticion retenida, 503 con datos conservados y hora sin cambio, reintento correcto con nueva hora. Seis rutas con tipografia y altura de linea duplicadas: overflow global, recorte vertical de controles, filtros apilados, paneles con Enter/Tab, foco visible, salto al contenido y ultima accion accesible. Esto simula aumento de texto, no zoom nativo del navegador. Capturas revisadas. Regresion public-pages.cjs, public-team-match.cjs, filters-share-ui.cjs, statistics-priority.cjs y home-loading.cjs; se corrige en esta ultima la espera de consultas independientes tras un error inicial.

Commit sugerido para adicionales 2 y 4: `fix: aclara vigencia de datos y mejora texto ampliado`

Pruebas adicionales 5 y 6: TypeScript y build aprobados. navigation-status.cjs en 320/390/1280: volver/avanzar desde jugador, plantilla y desplazamiento restaurados, equipo/metrica/parametro ajeno y posicion del ranking conservados; filtros cancelado e incomparecencia disponibles y conservados al recargar junto a agrupacion. Seis estados en ficha, sin marcador ficticio ni captura pendiente para partidos no disputados y sin overflow. Regresion filters-share-ui.cjs y public-team-match.cjs aprobada. Las pruebas son de navegador automatizado, no equivalen a validacion en telefonos reales.

Commit sugerido para adicionales 5 y 6: `fix: restaura contexto de navegacion y unifica estados deportivos`

Estado adicional: 1 a 6 implementados localmente. Se mantienen los pendientes de validacion de la iteracion anterior, zoom nativo, lectores de pantalla y telefonos reales. Sin despliegue.

## Validacion disponible sin dispositivo real

2026-10-07: aprobadas api-resilience.mjs (respuesta HTML inesperada, red y tiempo limite), temporary-access.mjs (vencimiento temporal independiente de la sesion normal) y metadata-server.mjs (HTML inicial, Open Graph, canonical, escape, imagenes y errores HTTP). Pruebas aisladas, sin modificar produccion.

public-pages.cjs ampliada y aprobada en 320/390/470/640/768/1024/1280 px para Inicio, Jornada y Tabla: salto al contenido por Enter, entrada con Tab y retorno con Shift+Tab, recuperacion tras error, contenido y contencion visual sin overflow ni errores JavaScript detectados. Datos ficticios interceptados en el navegador; no valida disponibilidad de la API real ni constituye una auditoria completa de accesibilidad. Servidor de vista previa limitado a 127.0.0.1:5191, no expuesto a la red.

Pendientes: Safari en iPhone real, zoom nativo, lector de pantalla, prueba con jugadores y publicacion controlada. No se marcan completados por estas pruebas automatizadas.

Commit sugerido: `test: amplia comprobaciones de teclado y documenta validacion local`

## Procesamiento manual de correos

Implementado localmente en Temporada y categorias, panel Estado operativo y correos (solo Super Administracion): boton existente de procesamiento con confirmacion del alcance global, bloqueo si worker/proveedor estan deshabilitados o el estado fallo, aviso de EMAIL_WORKER_ENABLED=true y reinicio del backend, actualizacion manual del estado. Corregidos campos de proveedor segun la API actual; ya no muestra Resend fijo. No activa variables de entorno desde el navegador, no encola cumpleanos por separado ni evita controles del servidor.

TypeScript y build aprobados. email-operations-ui.cjs aprobada en 390/1280: worker pausado, proveedor no configurado, cancelacion sin POST, confirmacion, respuesta correcta y error 503. Todas las solicitudes interceptadas; sin envios reales ni despliegue.

Commit sugerido: `fix: confirma procesamiento manual y corrige estado de correos`

Boton adicional Preparar correos de cumpleanos: usa exclusivamente POST /admin/operations/process-birthdays, confirma fecha UTC y alcance de todas las ligas, muestra queued como solicitudes aceptadas (no entregas ni destinatarios unicos) y errores. Bloqueado si falta worker/proveedor y durante procesamiento manual concurrente. La cola de envio sigue compartida; la confirmacion advierte que el worker puede enviar otros pendientes. El servicio actual no comprueba consentimiento; pendiente corregir antes de uso en produccion. Sin modificar backend ni enviar correos reales. Build y TypeScript aprobados; email-operations-ui.cjs ampliada y aprobada en 390/1280 para cancelacion, endpoint separado sin llamar process-emails, conteo y fallo 503 de cumpleanos.

Commit sugerido: `feat: agrega accion de felicitaciones de cumpleanos en configuracion`

Criterio de cumpleanos actualizado por solicitud: registros sin baja y con correo no vacio reciben felicitacion independientemente del estado. APPROVED recibe solo felicitacion; cualquier otro estado incluye recordatorio de revisar con manager/administracion lo pendiente para completar la aprobacion. Se conserva fecha UTC, clave diaria y vencimiento. El pie ya no afirma consentimiento inexistente ni ofrece una opcion de baja no implementada. Esta actualizacion sustituye el criterio anterior de solo aprobados; no implementa preferencias de correo. Confirmacion del boton ajustada. Backend compilado y birthday-greetings.mjs aprobada para cinco estados con transporte simulado; sin envios reales.

Commit sugerido: `feat: felicita cumpleanos y recuerda registros sin aprobar`

## Dependencias de seguridad antes de produccion

2026-10-07: backend/package-lock.json actualizado dentro de los rangos existentes, sin force ni cambios de version mayor: multer 2.4.0, sharp 0.35.5 (librsvg 2.63.2) y proxy-addr 2.0.8, transitiva de Express. npm audit final: cero vulnerabilidades conocidas reportadas. No garantiza ausencia de todos los problemas de seguridad.

Build aprobado. security-dependencies.mjs nueva: derivados WebP, dimensiones, imagen invalida, proxy de un salto, carga multipart en memoria y limite de archivo. audit-fixes.mjs aprobada. almacenamiento.mjs: 72 comprobaciones aprobadas tras aislar variables Cloudinary del .env local y desactivar worker. onboarding-isolated.mjs aprobada con PostgreSQL temporal: integracion 162 comprobaciones incluyendo autenticacion, documentos privados, fotos con EXIF, rechazo de imagen danada y logos; tambien competicion, edicion, publico (31 comprobaciones) y multi-liga. Fixture de integracion corregido: su fecha fija de cierre de registro habia vencido e impedia crear al jugador de prueba de imagen.

Limitaciones: ejecutado en Windows, no en el Linux de Render ni contra Cloudinary real. npm aviso que no pudo retirar un binario antiguo bloqueado; procesos nuevos cargan Sharp corregido. Reiniciar instancias locales antiguas antes de usarlas. Durante competicion se observo aviso no fatal de auditoria por identificador mayor a varchar(36); pendiente revisar aparte. No se ejecutaron migraciones en produccion, envios reales, commit ni despliegue.

Commit sugerido: `fix: actualiza dependencias vulnerables y valida regresiones del backend`

## Continuacion 3, 4 y 5 (2026-10-09)

3. Mejoras locales: avisos de filtros atomicos y con nombre de contexto para tecnologias de asistencia; resumen accesible de metrica, alcance y cantidad de resultados en Estadisticas; margen de desplazamiento de controles frente a barras fijas. TypeScript y build aprobados. public-pages.cjs ampliada y aprobada en siete anchos para Inicio/Jornada/Tabla: semantica del aviso de filtros, margen CSS, salto al contenido, Tab/Shift+Tab y regresiones. No certifica foco siempre visible con cualquier altura, zoom nativo ni comportamiento con VoiceOver. Pendiente prueba real.
4. Protocolo con jugadores preparado en docs/VALIDACION-PRE-PRODUCCION.md: cuatro tareas, cinco participantes sugeridos, registro anonimo de tiempos/exito/errores. Sin participantes ni resultados; pendiente ejecucion humana.
5. Lista de publicacion y reversion preparada en el mismo documento. No hay autorizacion explicita de despliegue; no se publico ni se enviaron correos. Pendiente Linux/Render, servicios externos y comprobacion posterior al despliegue acordado.

Commit sugerido: `feat: mejora avisos accesibles y prepara validacion de produccion`

## Criterio deportivo de posiciones

Implementado localmente por acuerdo: equipos con PJ>0 primero; menos derrotas, mas victorias, enfrentamiento directo por record solo cuando el grupo original empatado en PG/PP tiene dos equipos de la misma categoria, menos PC, mas PF. DIF y puntos de competicion no ordenan. Sin partidos al final en orden alfabetico de presentacion. Ranking numerado por categoria; el calculo compartido alimenta Inicio, tablas, perfiles y seeds de playoffs. Equipos activos oficiales, resultados oficiales finalizados/incomparecencias de temporada regular; exclusions existentes sin cambios.

Empates deportivos restantes llevan tiebreak_pending; el orden alfabetico es provisional y la tabla publica/administrativa lo indica. Generacion de playoffs bloqueada mientras exista empate pendiente en la categoria. No hay sorteo automatico ni pantalla para registrar su resultado: pendiente implementar resolucion administrativa antes de usar playoffs con empates. Empates de marcador siguen contados como E, sin inventar un porcentaje ni nuevos puntos.

Referencia de orden: https://nflflag.com/events/rules, Tournament Play Format 5 (regional 2026-2027). La exclusion inicial de PJ=0 es adaptacion MFL, no regla universal atribuida a NFL FLAG. Configuracion antigua tiebreakers no gobierna este criterio acordado.

Backend/frontend compilados. standings-criteria.mjs aprobada: PJ=0, derrotas, victorias, PC/PF, directo entre dos, triple sin directo, sorteo pendiente y numeracion por categoria; transporte SQL simulado sin datos reales. Regresion visual public-pages.cjs en siete anchos. Pendiente validar contra jornadas reales que proporcionara el usuario. Aviso de Node 20.18.2 inferior al minimo de Vite: usar runtime soportado para despliegue. Sin publicacion ni cambios en base real.

Commit sugerido: `fix: aplica criterio MFL de posiciones y señala desempates pendientes`

Explicacion de tabla y PNG: textos compartidos para criterio actual (menos derrotas primero), significado de PJ/JJ, PG/JG, empates, PP/JP, PC, PF y DIF; posiciones provisionales y equipos sin jugar. En sitio se distingue jornada de partido y se informa temporada regular oficial. Tabla publica incluye las tres leyendas en cada PNG cuadrado/publicacion/historia, con capacidad reducida para reservar espacio. Asterisco junto a posicion si hay sorteo pendiente. Tabla administrativa usa las mismas leyendas. No se cambia de nuevo el calculo a victorias ni porcentaje sin acuerdo explicito. Compilacion y pruebas de generacion de PNG en tres formatos aprobadas; solicitudes simuladas, sin publicaciones en redes.

Commit sugerido: `feat: explica criterios y columnas en tablas e imagenes compartidas`

Explicacion simplificada: texto profesional con menos abreviaturas para criterio, puntos recibidos/anotados y ejemplo de 1-0 por encima de 1-1. Sitio aclara que los puntos se comparan despues del record; leyenda compartida tambien actualiza PNG y tabla administrativa. Sin cambiar calculos. TypeScript/build aprobados.

Decision posterior del organizador: no existe moneda ni sorteo. El empate restante queda pendiente de resolucion de la liga, con posicion provisional y bloqueo de generacion de playoffs. Esta decision sustituye las referencias anteriores a sorteo; leyenda del sitio/PNG y mensaje del servidor actualizados. No cambia el orden deportivo ni incorpora un mecanismo para registrar/aplicar una resolucion administrativa: ese flujo sigue pendiente.

Commit sugerido: `fix: aclara que los desempates finales los resuelve la liga`

## Posiciones basadas en IFAF (decision vigente)

Sustituye el criterio anterior NFL FLAG por autorizacion del organizador. Base: porcentaje (G + E/2) / JJ. Desempates IFAF 3-1-4 y AR: porcentaje, DIF y PF entre empatados si todos se enfrentaron; despues DIF total y PF total. Cada paso divide grupos y el siguiente recalcula sobre los equipos aun empatados. No se usa mas victorias ni menos derrotas como paso adicional. Sin partidos al final (adaptacion MFL).

Referencia verificada: IFAF Flag Football Rules 2023, https://daff.dk/wp-content/uploads/2023/06/IFAF-Flag-rules-2023.pdf, paginas 19 y 41. MFL sustituye expresamente la moneda por resolucion de la liga; no se presenta esta adaptacion como regla literal IFAF. Empates restantes provisionales y playoffs bloqueados; pendiente pantalla para registrar/aplicar la resolucion administrativa.

Explicacion compartida en tabla publica, administrativa y PNG actualizada, incluida formula y ejemplo 100% frente a 50%. Jornadas 1/2 Mixto: Depredadores, Furia Nocturna, Alphas, Tochodrink, Bacardiacos, Aztecas. Se asume Aztecas/Aztecos como un equipo para este ejemplo; no se importaron datos reales.

Lista: calculo IFAF implementado; explicaciones implementadas; pruebas automaticas de porcentaje, empates, directo de dos/tres, subgrupos, DIF/PF, jornadas 1/2 y ranking por categoria aprobadas; backend/frontend compilados. Pendiente validacion humana del reglamento de temporada y resolucion administrativa. Sin despliegue ni cambios en base real.

Commit sugerido: `feat: aplica clasificacion IFAF y actualiza leyendas de posiciones`

## IFAF sin sustituir el ultimo desempate

Decision posterior del organizador: conservar el lanzamiento de moneda IFAF, no resolucion de la liga. Sustituye expresamente la adaptacion descrita arriba. Explicaciones del sitio, administracion y PNG indican porcentaje, porcentaje/DIF/PF entre empatados cuando todos se enfrentaron, DIF/PF totales y moneda. No cambian las posiciones deportivas de jornadas 1/2.

El empate deportivo restante se marca como lanzamiento de moneda pendiente, con posicion provisional; no se lanza una moneda aleatoria en cada consulta. Playoffs conserva bloqueo con mensaje actualizado. Pendiente implementar registro persistente del resultado del lanzamiento desde administracion; esta entrega no permite aplicar ese resultado.

Pruebas de calculo IFAF y estabilidad del empate aprobadas; compilaciones backend/frontend aprobadas. Lista vigente: calculo y explicacion completados; registro de moneda pendiente; despliegue no realizado.

Commit sugerido: `fix: conserva desempate IFAF por moneda y actualiza explicacion`

## Imagenes compartidas de varias paginas (2026-10-12)

Corregido el flujo de exportacion: el generador ya dividia tablas largas, pero Descargar tarjeta solo guardaba la pagina seleccionada. Se conserva esa descarga individual y se agrega Descargar todas (N), con un PNG numerado por pagina. Preparar/Compartir imagenes incluye todas las paginas del formato elegido, no solo la seleccionada. Vista previa conserva selector de pagina. Se respetan invalidacion al cambiar datos/formato/pagina o cerrar panel y compatibilidad del dispositivo para compartir archivos.

Prueba share-pagination.cjs aprobada con 23 equipos: 5 paginas cuadradas, 3 de publicacion y 2 de historia; verifica descargas PNG, numero de pagina, cada equipo exactamente una vez, vista previa final y compartir todos los archivos (API nativa simulada). Ultima imagen cuadrada inspeccionada visualmente: filas, leyendas IFAF y pie sin solapamiento. TypeScript y build aprobados. La descarga multiple puede requerir permiso del navegador; descarga individual sigue disponible. Compartir nativo real en iPhone queda pendiente, no se certifica con la simulacion.

Lista: exportacion completa y pruebas locales completadas; permiso de descargas multiples/compartir real en dispositivo pendiente; sin despliegue.

Commit sugerido: `fix: descarga y comparte todas las paginas de tablas largas`

## Revision UX/UI transversal (2026-10-12)

Lista y cobertura detalladas en docs/AUDITORIA-UX-UI.md. Completados: tabla mas directa con explicacion plegable, filtro persistente de categoria y porcentaje visible en sitio/PNG; nombres de navegacion consistentes y favoritos con etiqueta; pagina 404 con salidas claras; logo privado al inicio publico; registro estable durante restauracion de sesion; configuracion no editable cuando no puede guardarse y etiquetas de altas.

Pruebas locales con respuestas simuladas: ux-intuitive, public-pages, public-statistics, share-pagination y email-operations-ui; compilacion TypeScript/Vite. La API local devolvio 502: pendientes recorridos completos con datos reales de prueba en perfiles, finanzas, plantillas y arbitraje. No se declara toda la aplicacion validada. Pendientes priorizados en auditoria, incluyendo iPhone real, usuarios reales y registro de moneda. Sin despliegue ni correos.

Commit sugerido: `feat: simplifica navegacion y posiciones y corrige fricciones de registro`
