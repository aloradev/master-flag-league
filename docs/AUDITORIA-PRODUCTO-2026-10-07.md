# Master Flag League: auditoria de producto y experiencia

Fecha: 7 de octubre de 2026. Auditoria sin cambios en la aplicacion.

## Alcance y nivel de certeza

Se revisaron PLAN-MEJORAS-WEB.md, el codigo publico y sus componentes compartidos. Se recorrieron Inicio, Jornada, Tabla, Estadisticas, jugador, equipo, partido y Favoritos en Edge automatizado con anchos de 320, 360, 390, 430 y 1280 px, altura de 844 px y datos locales de prueba. Se generaron capturas de las ocho rutas a 390 y 1280 px. Se inspeccionaron visualmente Inicio, jugador, Estadisticas y Comunidad; se contrasto Comunidad en claro y oscuro. Se simularon carga lenta, jugador con imagen rota y equipo inexistente.

La portada publicada respondio HTTP 200 y contiene LeagueLive y navegacion inferior. Eso NO demuestra que todos los cambios locales esten publicados: los archivos compilados local y remoto tienen identificadores distintos y no se compararon todos sus comportamientos. No se hicieron envios a produccion. El repositorio estaba limpio al comenzar esta auditoria, aunque la documentacion mantiene pendiente la validacion del despliegue. No se debe confundir pendiente de validacion con cambios necesariamente sin commit.

Las puntuaciones son juicio experto sobre esta muestra, no resultados de investigacion con usuarios. No se midieron retencion, conversion, Core Web Vitals en campo, ni tiempos de tarea con jugadores. Las pruebas previas documentadas no se presentan como ejecutadas de nuevo. La emulacion de viewport no sustituye Safari/iPhone, Chrome/Android ni navegadores integrados de redes sociales.

Las capturas largas pueden dibujar barras fijas en mitad del documento: ese artefacto no demuestra una superposicion del contenido en uso normal. El fallo anterior de altura de tarjetas permanece corregido en el codigo revisado.

## 1. Resumen ejecutivo

La aplicacion ya tiene una base funcional adecuada. El siguiente avance no es agregar modulos: es hacer mas visible la informacion deportiva, corregir legibilidad y reducir ambiguedades al compartir. La portada sigue priorizando captacion sobre consulta recurrente; la tabla conserva al equipo visible pero no su balance completo; algunas excepciones de estilo de la portada rompen el tema claro.

| Dimension | /10 | Motivo |
| --- | ---: | --- |
| UX | 7 | Recorridos publicos conectados; actividad y acciones principales todavia poco directas. |
| UI | 7 | Componentes operativos consistentes; portada con excepciones de color demostradas. |
| Mobile | 7 | Barra inferior existente y sin overflow global en la muestra; tabla y scroll inicial penalizan consulta. |
| Jerarquia visual | 6 | Promocion antes que actividad; filtros y explicaciones antes que lideres. |
| Legibilidad | 6 | Nombres y cifras principales claros; contraste defectuoso en Comunidad y enlaces de portada. |
| Identidad deportiva | 8 | Escudos, categorias, TD, quite de flags, MVP y resultados aportan identidad real. |
| Marketing | 7 | Existen perfiles y recursos compartibles; acciones fragmentadas y validacion social pendiente. |
| Engagement | 6 | Favoritos y calendario dan motivos para volver; efecto real sobre visitas no medido. |
| Consistencia | 7 | Buen marco compartido; conviven tokens semanticos y colores fijos de campana. |
| Performance percibida | 6 | Cache, actualizaciones y errores acotados; carga textual cambia considerablemente el layout. |

No se demostro un P0 que justifique parar el producto por una rotura general. Si reaparece la superposicion anterior o falla una ruta esencial en produccion, eso si seria un bloqueo P0. Validar el despliegue es una puerta de salida, no una autorizacion para desplegar en esta tarea.

## 2. Mejoras que funcionan: conservar

- Marco publico compartido, navegacion activa y barra inferior con Inicio, Jornada, Tabla, Stats y Jugar. No hace falta agregarla: ya existe.
- Partidos con dos filas, escudos estables, marcador alineado, ganador explicito y guiones para encuentros sin resultado.
- Posicion y equipo fijos en las tablas; mantener esa orientacion al consultar estadisticas secundarias.
- PublicFilters con estado en URL, contador y limpieza que conserva otras preferencias.
- Separacion de errores: un fallo de estadisticas no debe esconder el perfil y scrimmages no debe bloquear Jornada.
- Avisos voluntarios, lectura individual y agrupacion nuevos/leidos. No convertirlos en push por defecto.
- Panel social cerrado inicialmente, formatos y descarga alternativa. Evita que herramientas secundarias dominen la consulta.
- Metricas de partidos oficiales completos, acceso publico sin cuenta y datos privados excluidos. No inventar rankings o logros.
- Correccion de altura de tarjetas y regresion vertical existente. No volver a height:100% para resolver alineacion en contenedores de flujo normal.

### Mapa del sistema y dependencias

| Pieza | Compartida por | Dependencias relevantes |
| --- | --- | --- |
| Marco.tsx | Pantallas publicas | Navegacion, tema, SEO, estado de sesion, observador y contador de avisos. |
| Partido, en Jornada.tsx | Inicio, Jornada, Equipo | Estados deportivos, TeamCrest y CSS publico; cambios afectan varias rutas. |
| LeagueLive | Inicio | Jornada vigente, calendario, ultima jornada finalizada y posiciones. |
| LeagueCommunity | Inicio | Misma clave de consulta de posiciones; estilos propios de campana. |
| PublicFilters | Jornada, Estadisticas | Parametros de URL; no duplicar la logica de limpieza. |
| ShareCard | Partido, jugador, Tabla, Estadisticas | socialCard.ts, formatos, paginacion, blobs y capacidades del dispositivo. |
| BotonCompartir | Encabezados publicos | Hoy es un enlace a WhatsApp, no el menu nativo del sistema. |
| TeamCrest y PlayerAvatar | Tarjetas, perfiles, roster, tablas | Resolucion de URL y estilos; respaldo solo cuando falta URL, no cuando falla. |
| favorites.ts y Favorites.tsx | Marco, perfiles y Favoritos | Almacenamiento local y consultas periodicas de equipos/partidos seguidos. |
| api.ts y ui.tsx | Toda la aplicacion | Tiempo limite, cancelacion, errores, Spinner y EmptyState. |

Las claves de consulta compartidas evitan parte de la duplicacion. Sin embargo, el perfil de jugador carga primero identidad y despues estadisticas; Estadisticas necesita conocer la temporada mediante posiciones antes de pedir rankings. Son dependencias existentes, no evidencia de que haga falta un backend nuevo.

## 3. Problemas actuales por impacto

1. **Legibilidad real en claro.** LeagueCommunity usa tarjetas bg-slate-900 con nombre heredado #10243a del tema claro. Los enlaces de destinos conservan cian #24e5e7, rosa #ff61bd y amarillo #eeff41 sobre superficies claras. El enlace de invitacion tambien conserva un color claro. Evidencia: colores calculados y captura audit-community-light.png. Es un defecto, no una preferencia estetica.
2. **Actividad enterrada en Inicio.** LeagueLive comienza entre y=1012 y y=1026 en moviles; la primera tarjeta, entre y=1291 y y=1325. En escritorio empieza en y=823 y su primera tarjeta en y=1077, con viewport de 844 de alto. Al entrar no se ven partidos aunque existan.
3. **Tabla sin balance completo inicial.** A 390 px: posicion y equipo ocupan x=16..208; JJ 208..264; G 264..320; E 320..376; P 376..432 y DIF 544..600. El contenedor visible termina en x=374. Derrotas y diferencia requieren desplazamiento. A 320 px incluso G queda parcialmente recortada por el contenedor.
4. **Resultados de Inicio sin fecha propia.** LeagueLive combina partidos vigentes y de la ultima jornada finalizada, pero Partido muestra hora/cancha, no fecha. La fecha general pertenece a la jornada vigente. Un resultado anterior puede interpretarse como de la fecha actual. Ademas, recientes se deduplica pero no se ordena explicitamente por finalizacion: no afirmar que son los tres ultimos cronologicamente.
5. **Compartir ambiguo.** El boton superior Compartir siempre va a WhatsApp; Compartir tarjeta abre otro flujo y Compartir imagen depende de capacidades. No son equivalentes. La infraestructura existe; falta clarificar el objetivo de cada accion.
6. **Imagen fallida sin respaldo.** Con URL de avatar inexistente, la imagen termina complete=true y naturalWidth=0; no aparece el respaldo por dorsal/iniciales. TeamCrest tiene el mismo patron sin onError, aunque se reprodujo dinamicamente solo el avatar.
7. **Cambios de layout durante carga.** Con retraso artificial de 1,8 s por peticion, el titulo de la seccion posterior a LeagueLive paso de y=1653 a y=2345 al llegar los datos: unos 692 px. Es una medicion sintetica de desplazamiento, no una puntuacion CLS ni un tiempo real de produccion.
8. **Favoritos poco reconocible antes del primer uso.** Se accede por icono de bandeja, sin etiqueta visible en movil. Es una hipotesis de descubrimiento basada en el signo elegido; necesita prueba con personas. aria-label y tooltip existen, por lo que no es un boton sin nombre accesible.
9. **Lider deportivo relegado por controles.** En Estadisticas, el titulo del ranking empieza en y=492 a 360-430 px y y=568 a 320 px. Sigue dentro de una pantalla alta, pero filtros y explicacion ocupan la parte superior. No se demostro que un jugador tarde mas de cinco segundos; hay que medirlo.
10. **Cierre de validacion pendiente.** HTTP 200 de portada no valida perfiles, migracion de interesados, metadatos iniciales, canonical, crawlers o compartir nativo. Hace falta trazabilidad del artefacto desplegado y una comprobacion de salida.

## 4. Problemas exclusivos de movil

La tabla oculta informacion primaria por ancho, no por falta de datos. No intentar meter POS/EQUIPO/JJ/G/P/DIF completos a 320 px reduciendo todo a letras minusculas: el espacio no alcanza conservando nombres legibles. Es preferible identidad del equipo y una linea compacta de balance, con detalle secundario desplazable.

La portada ocupa mas de una pantalla antes de informar. Jornada tambien dedica resumen, selector, filtros y destacado antes de su tarjeta: esta empieza en y=898 a 390 px y y=954 a 320 px en la muestra. No eliminar los controles; evaluar su prioridad frente al encuentro destacado.

La barra inferior reserva espacio final y sigue siendo suficiente. No reemplazar Jugar por Perfil sin demostrar una necesidad recurrente de cuenta: hoy el uso publico es anonimo y Mi espacio ya atiende sesiones iniciadas.

Riesgo adicional por inspeccion: selectores publicos declaran 13-14 px con mayor especificidad que la regla generica movil de 16 px. Debe comprobarse el zoom al enfocar en iPhone real antes de cambiarlo. No se afirmo su reproduccion en Edge.

## 5. Problemas exclusivos de desktop

El bloque deportivo tampoco entra realmente en el primer viewport de 1280x844. En LeagueLive, una columna larga de partidos junto a pocas filas de posiciones deja espacio vacio; es asimetria de contenido, no un fallo del grid. No estirar las tarjetas para rellenarlo.

En Equipo, los partidos de una lista vertical ocupan unos 992 px de ancho con una altura aproximada de 284 px: consultar varios encuentros requiere mas recorrido del necesario. No es urgente inventar otra tarjeta; estudiar una disposicion de dos columnas reutilizando Partido despues de resolver lectura e Inicio.

## 6. Inicio

**Conservar:** arte y marca, captacion a registro/Busco equipo, LeagueLive, enlaces a equipos, FAQ y acceso a Instagram. La pagina ya informa de Cancún y flag football; no necesita una nueva identidad.

**Corregir:** contraste claro, contexto temporal de resultados, colores fijos y carga que empuja la seccion siguiente.

**Reorganizar conceptualmente:** identidad compacta -> actividad deportiva con prioridad en vivo -> proximos -> resultados fechados -> posiciones -> captacion/comunidad/FAQ. Probar primero acercar LeagueLive y reducir el espacio ocupado por la cabecera de campana, sin borrar promocion ni agregar otro dashboard.

Las tarjetas medidas tienen 284-326 px; el maximo actual de cuatro proximos y tres resultados puede ocupar alrededor de dos mil px solo en tarjetas, antes de posiciones en movil. Ese maximo es del codigo, no la cantidad de partidos observada. Ajustar la cantidad visible solo despues de medir uso; no ocultar informacion arbitrariamente.

Para separar modulos basta encabezado breve, borde y agrupacion. No responder al problema agregando grandes espacios. Los destinos de Jornada/Tabla/Jugar repiten navegacion y llamadas ya presentes: su valor debe contrastarse con el scroll que consumen.

## 7. Partidos

Mantener las dos filas: permiten asociar sin esfuerzo equipo y cifra y toleran mejor nombres largos. El esquema centrado 28-21 puede funcionar en un detalle o imagen social, pero duplicarlo como tarjeta compartida no aporta una mejora demostrada.

En final, la atencion debe ir a equipos y marcador, despues estado/fecha y luego cancha, hora y eventos. En programado, equipos y fecha/hora son la informacion primaria; los guiones no deben dominar. En vivo, etiqueta textual y marcador actual tienen prioridad sin animaciones constantes.

El detalle ya incluye fecha, enlaces, calendario y MVP; no replicar todas esas herramientas en cada tarjeta. El arreglo de fechas de Inicio debe aportar contexto desde la jornada correspondiente, no adivinarlo de la hora. No mezclar un partido sin estadisticas completas con ceros que parezcan rendimiento registrado.

## 8. Tabla

Conservar tabla semantica, caption, cabeceras, region enfocables, filas alternas y forma reciente con letras. La explicacion del orden coincide con los criterios activos revisados en competition.service.ts: victorias, PF, PC, diferencia y enfrentamiento directo. No proponer puntos ni reordenar criterios sin decision deportiva.

Vista inicial movil sugerida: posicion, nombre/escudo, balance JJ/G/P y DIF compactos. Puede ser una segunda linea accesible en la celda del equipo, conservando tabla detallada; elegir un solo patron sin duplicar anuncios ni filas contradictorias. Empates siguen disponibles y deben integrarse cuando existan, no desaparecer del record. PF/PC y forma pueden permanecer como detalle secundario con scroll.

No prometer que seis columnas convencionales cabran a 320 px. Criterio de aceptacion: identificar posicion, equipo, victorias, derrotas y diferencia sin desplazar, con nombres largos y zoom de texto.

## 9. Estadisticas

Las nueve metricas publicas reales son TD, yardas, recepciones, pases completos, intercepciones, quite de flags, pases defendidos y MVP ofensivo/defensivo. Sacks y conversiones no aparecen en el selector revisado. No agregarlas solo porque suenen deportivas: primero verificar que existan captura y contrato de datos.

Ranking ordenado, empates compartidos, enlace al jugador y filtros por categoria/equipo funcionan. No hace falta un grafico decorativo. El primer lugar ya recibe enfasis visual. Acercar el titulo/resultado al control de metrica puede evaluarse sin agregar una nueva tarjeta de lider.

Prueba de usuario propuesta: abrir Stats, localizar quien lidera TD y cambiar a intercepciones; registrar acierto y tiempo, con objetivo de menos de cinco segundos para la primera tarea. No confundir un buen tiempo en fixture de un jugador con una temporada completa. Validar tambien el limite visible de 25 jugadores y la comunicacion del total.

## 10. Jugadores

Ya hay nombre, dorsal, equipo enlazado, foto/respaldo, categoria y temporada. El perfil no es una tabla de base de datos, pero el rendimiento significativo queda repartido: MVP viene despues de todas las metricas y promedios. En la muestra, la ausencia de foto y posicion afecta identidad; no es motivo para fabricar contenido.

Conservar identidad, ofensiva/defensiva y denominador de promedios. Si se reorganiza mas adelante, usar resumen corto de TD, principal metrica defensiva y MVP cerca de identidad, solo con datos completos; detalle debajo. Foto y nombre deben formar una unidad visual sin repetir el H1.

No hay historial individual de partidos ni logros verificados en este componente; no presentarlos como existentes. Una tarjeta de perfil compartible ya existe, pero sin foto en su definicion actual: validar interes real antes de extenderla. Prioridad inmediata de calidad: respaldo de imagen fallida.

## 11. Equipos

Escudo, categoria, temporada, posicion, balance y vistas Proximos/Resultados/Plantilla forman un perfil util y compartible. Publicar solo roster aprobado es correcto. Falta comprobar con equipos reales si orgullo e identidad estan logrados: dos escudos de iniciales en datos demo no responden esa pregunta.

Hoy compartir equipo manda texto/enlace a WhatsApp; no se encontro ShareCard de equipo en Equipo.tsx. No describirla como implementada. Una accion clara para compartir el enlace aporta valor antes que construir otra exportacion.

El logo y el nombre estan separados por la cabecera y el boton Favorito; se puede estudiar esa cohesion despues, sin rehacer el perfil. Mantener las tres vistas y no agregar dashboard de estadisticas si no resuelve una tarea concreta.

## 12. Favoritos y avisos

Persistencia sin cuenta y contador de no leidos son adecuados para la fase actual. Favorito guardado no significa aviso activado ni seguimiento con web cerrada. El texto de la pagina explica ese limite.

El icono de bandeja puede hacer pensar en mensajes; evaluar reconocimiento con cinco jugadores antes de cambiarlo. La pagina vacia ya ofrece Ver equipos. Un mensaje compacto que explique donde guardar puede probarse, pero no un tutorial permanente.

Los jugadores favoritos sirven como acceso rapido, pero FavoriteObserver solo sigue cambios de equipos y partidos: no anunciar avisos de jugador/MVP inexistentes. Los fallos de consultas del observador no se muestran al usuario en ese componente; es un riesgo de interpretacion del silencio, no evidencia de que el contador este roto.

No recomiendo push: primero comprobar uso de favoritos, apertura de avisos y frecuencia de actualizacion de datos. Un aviso oportuno depende de la captura de la liga, no solo del frontend.

## 13. Social Cards

Ya existe compartir archivo nativo en ShareCard, ademas de descarga y vista previa. Desde el panel visible, abrir y descargar/compartir son dos acciones; vista previa agrega una tercera si el usuario la quiere. En perfil o tabla el coste mayor puede ser encontrar el panel al final, no el numero de botones.

BotonCompartir del encabezado es WhatsApp. Recomendacion: separar claramente Compartir enlace de Compartir imagen, reutilizando generador, formatos y alternativa de descarga. No agregar botones independientes para cada red.

Web Share necesita contexto seguro y activacion del usuario; canShare debe comprobar archivos reales. El sistema decide destinos disponibles. No se puede garantizar Instagram, Stories ni publicacion automatica. La generacion asincrona de imagen antes de share puede perder activacion en ciertos dispositivos: riesgo a verificar con generacion lenta, no fallo reproducido aqui. Una imagen preparada antes de un segundo toque de compartir es una alternativa si las pruebas la requieren. Fuentes: [especificacion W3C](https://www.w3.org/TR/web-share/) y [documentacion de share](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/share).

El codigo muestra Compartir imagen si existe navigator.share, pero solo despues verifica soporte de archivos; si no lo hay, descarga. El usuario puede interpretar mal esa sustitucion silenciosa. Debe conservarse la alternativa y explicarse el resultado, no prometer compartir donde no esta disponible.

Pendiente validar en iOS/Android reales: archivo PNG, cancelacion, ausencia de aplicaciones destino, permisos, nombre de archivo y tres formatos. No se compartio contenido a cuentas ni aplicaciones reales durante la auditoria.

## 14. Identidad de Flag Football

La base operativa podria servir a otros deportes, pero quite de flags, touchdowns, MVP ofensivo/defensivo, escudos y categorias ya la diferencian. Fortalecer esa identidad mediante el rendimiento real y vocabulario consistente es mejor que llenar pantallas de balones, yardas decorativas o texturas.

No usar TD como sinonimo automatico de marcador: el detalle puede tener conversiones u otros puntos. No inventar records personales sin comparacion historica. La imagen de Inicio esta identificada como arte promocional; no presentarla como fotografia documental de la liga.

## 15. Marketing

Mayor valor inmediato: resultado compartido al terminar un partido y enlace de perfil/equipo compartido por su protagonista. Despues, lideres y posiciones semanales. Compartir MVP separado solo tiene sentido cuando haya reconocimiento publicado y suficiente uso del flujo existente.

Recorrido aprovechable sin nuevos modulos: publicacion social -> enlace exacto de partido/jugador/equipo -> consulta -> guardar favorito -> volver a Jornada. Los metadatos deben coincidir con el destino y evitar marcadores ficticios o previews de errores.

Hipotesis a medir antes de afirmar crecimiento: proporcion de visitas a resultado que inicia compartir, visitas entrantes a esos enlaces y retorno semanal. No se atribuye una mejora de conversion numerica sin analitica. Conservar registro y Busco equipo, pero no hacer que estorben la consulta frecuente.

## 16. Retencion: MASTER FLAG WEEKLY LOOP

| Momento | Necesidad | Herramienta existente | Condicion para que funcione |
| --- | --- | --- | --- |
| Antes de la jornada | Saber cuando y donde juego | Jornada, equipo, calendario | Horario/cancha publicados y fecha clara. |
| Durante | Consultar marcador | En vivo, detalle y actualizacion periodica | Captura oportuna y estado fiable. |
| Despues | Confirmar resultado | Resultado y tarjeta | Diferenciar marcador final de estadisticas pendientes. |
| Domingo/lunes | Comparar rendimiento | Rankings, perfil, MVP | Estadisticas completas y fecha de publicacion operativa definida. |
| Entre semana | Compartir identidad y rendimiento | Perfil, equipo, enlaces e imagenes | Accion compartible clara y previews correctas. |
| Siguiente jornada | Regresar por proximo encuentro | Favoritos, Jornada y avisos locales | Liga publica siguiente jornada y usuario vuelve a abrir la web. |

El sabado es una hipotesis del calendario planteado, no una regla codificada: el ciclo sigue la fecha real. No hace falta una nueva funcionalidad para arrancarlo. Primero asegurar disciplina de publicacion y que el contenido existente sea encontrable. Medir retorno a siete dias y uso de favoritos cuando exista consentimiento/analitica apropiada.

## Evaluaciones transversales

### Consistencia y colores

Inventario: tarjetas operativas de 8 px, controles de 6 px, botones de campana de 4 px, destinos de 5 px, avatares circulares y badges compactos. La diferencia no es por si misma un defecto. El problema es mezclar colores fijos claros/oscuros en componentes sujetos a tema. Operacion usa bordes de base-300, filas alternas y poco relieve; campana usa gradientes y acentos magenta/amarillo. No eliminar su personalidad, pero evitar usar esos acentos como texto de poco contraste.

Titulos publicos de 24 px movil/32 px escritorio y secciones operativas de 18 px tienen jerarquia mas consistente. La portada conserva titulos grandes y espaciados de 48/80 px por seccion. Las etiquetas de partido llegan a 11-12 px; revisar bajo luz exterior con jugadores, sin declarar ilegible toda etiqueta pequena.

Jerarquia propuesta: neutros para superficie y texto; cian accesible para accion principal; rojo/texto para LIVE; estado final legible sin competir con marcador; verde/rojo para resultado o diferencia cuando corresponda; color de categoria como acento pequeno con nombre textual. Magenta/amarillo de marca no deben asignarse simultaneamente a todas las acciones. No cambiar el significado deportivo de colores solo por uniformidad.

### Performance percibida

Cambiar metrica/equipo en Estadisticas usa datos locales ya cargados; cambiar categoria consulta de nuevo. Cache compartida ayuda al regresar. Jugador y ranking tienen dependencias secuenciales; no prometer que un skeleton reduce la latencia de red. Cargas estructurales suaves pueden reducir desplazamientos sin reservar alturas rigidas para textos dinamicos.

Probar bajo red lenta, cache fria y caliente, desplazamiento ya iniciado y actualizaciones periodicas. Mantener datos anteriores cuando sean validos y avisar si falla actualizacion. Medir antes de decidir precarga o nuevas consultas. No se ejecutaron Lighthouse ni mediciones de campo en esta auditoria.

### Estados vacios y errores

Existen mensajes especificos para temporada, resultados, roster y favoritos; conservarlos. En filtros sin resultados ya hay Limpiar filtros en la franja: evitar otra accion duplicada. Separar ausencia de datos, filtro sin coincidencias, captura pendiente y fallo de conexion. En jugador sin registros se muestran ceros junto al aviso; vigilar que compartir esos ceros no se interprete como rendimiento verificado.

Equipo inexistente produjo un estado estable, pero ofrece solo Reintentar y repite Equipo no encontrado. En un 404 definitivo conviene orientar a Tabla/Estadisticas/Jornada; en un 503, reintentar. La API limita esperas a 30 segundos y devuelve error comprensible. Esa limite no garantiza una experiencia rapida: carga lenta requiere feedback antes.

### Accesibilidad

Puntos positivos por codigo: enlace para saltar, foco visible, nombres de botones iconicos, aria-current, aria-pressed, labels de filtros, region de tabla enfocables, captions, letras de forma deportiva y controles principales de 44 px. No se certifico cumplimiento WCAG completo ni lector de pantalla.

Prioridad comprobada: contraste de nombres de Comunidad y acciones de campana en claro. El objetivo de texto normal es 4,5:1 y texto grande 3:1 segun [W3C: contraste minimo](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html). Hay que medir contra la superficie real, incluidos gradientes; no basta un token sobre blanco de referencia. Revisar tambien enlaces dentro de tablas/roster: la regla de botones de 44 px no les aplica automaticamente. No todos los enlaces de texto necesitan convertirse en botones.

Pendiente: zoom de texto 200%, teclado en paneles y filtros durante carga, lector de pantalla, foco tras cambio de ruta, contraste de todo el tema oscuro y controles en dispositivos tactiles reales.

### Regresiones visuales y pruebas necesarias

Zonas de riesgo: hero con imagen absoluta y offsets grandes; overflow:hidden de campana que puede ocultar fallos; columnas sticky con medidas fijas; listas de chips TD que crecen; nombres de categoria/cancha largos; grid con contenido variable; header sticky y barra inferior fija; logo o avatar remoto que falla. Medidas fijas de escudo, botones y columnas numericas son razonables; no son equivalentes a fijar altura del contenido.

Mantener public-pages.cjs y match-standings-ui.cjs, ampliando solo donde cambie comportamiento. Casos prioritarios: 0/1/maximo de partidos; tres categorias con nombres largos; 320/360/390/430/640/768/1024/1280; claro/oscuro; zoom 200%; logo muy ancho/alto; imagen 404; nombres de 60 caracteres; triple digito; empate/incomparecencia; final con estadisticas pendientes; carga lenta y reintento; llegada de resultados anteriores despues de vigente.

Validar geometria: tarjetas contienen todos sus hijos; hermanos no se cruzan; columnas no invaden; la seccion siguiente empieza fuera de la anterior; ultima accion se puede desplazar por encima de la barra inferior. Overflow global=false no demuestra ausencia de clipping: comprobar tambien ancestros con overflow:hidden. No interpretar overlays intencionales de navegacion ni artefactos de captura larga como fallo de layout.

## Priorizacion: diez recomendaciones, no cincuenta

P0: bloqueo critico demostrado. P1: corregir en la siguiente iteracion. P2: despues de resolver lectura/consulta. P3: exploracion posterior. La validacion de salida se exige antes de publicar aunque no sea una funcionalidad.

| Mejora | Problema | Impacto | Esfuerzo | Riesgo | Prioridad |
| --- | --- | --- | --- | --- | --- |
| 1. Contraste de Inicio por tema | Nombres y enlaces poco legibles en claro | ALTO | BAJO | BAJO | P1 |
| 2. Acercar actividad al entrar | Partidos debajo de mas de una pantalla | ALTO | MEDIO | BAJO | P1 |
| 3. Balance principal movil | P y DIF fuera de vista | ALTO | MEDIO | MEDIO | P1 |
| 4. Fechar resultados en Inicio | Fecha vigente puede atribuirse a resultados anteriores | ALTO | BAJO | BAJO | P1 |
| 5. Aclarar compartir enlace/imagen | WhatsApp y archivo bajo acciones diferentes | ALTO | MEDIO | MEDIO | P1 |
| 6. Respaldo ante imagen fallida | Identidad rota cuando falla URL | MEDIO | BAJO | BAJO | P1 |
| 7. Estabilidad durante carga | Secciones cambian mucho de posicion | MEDIO | MEDIO | MEDIO | P2 |
| 8. Comprobar descubrimiento de favoritos | Bandeja no necesariamente comunica guardados | MEDIO | BAJO | BAJO | P2 |
| 9. Acercar lider a metrica | Controles/contexto antes del resultado | MEDIO | BAJO | BAJO | P2 |
| 10. Cerrar validacion del despliegue | Artefacto y previews no verificados integralmente | ALTO | MEDIO | BAJO | P1 |

No se asigna P0 para exagerar urgencia. No se recomienda push, chat, pagos, fantasy, comentarios ni un rediseño general.

### Quick wins que cumplen el filtro solicitado

Solo cuatro cumplen ALTO impacto, esfuerzo BAJO/MEDIO y riesgo BAJO: contraste de Inicio; acercar actividad mediante cambio acotado de composicion sin variantes nuevas; fechas de resultados; validacion de salida. Tabla y compartir quedan en el TOP 5 por valor, pero no se disfrazan de riesgo bajo: tocan semantica responsive o capacidades del sistema.

## TOP 5 y plan tecnico conceptual

### 1. Corregir contraste del Inicio en tema claro

**Problema:** texto heredado oscuro sobre Comunidad oscura, acentos luminosos sobre superficies claras y enlace de invitacion demasiado claro.

**Solucion:** usar colores semanticos o variantes claras explicitas solo en esos elementos; conservar composicion, dimensiones y acentos decorativos. No cambiar la paleta completa.

**Por que ahora:** es reproducible y afecta acceso a equipos y acciones de crecimiento. Mejora UX y presentacion sin nuevas features.

**Impacto:** ALTO. **Esfuerzo:** BAJO. **Riesgo de regresion:** BAJO, si se limita a campana y se prueban ambos temas.

**Archivos/componentes:** frontend/src/components/LeagueCommunity.tsx; frontend/src/styles.css; revisar Home.tsx solo si hace falta una clase de alcance. Reutilizar tokens de tema y TeamCrest; no crear Card nueva.

**Estado:** ninguno nuevo; conservar preferencia light/dark/system. **Responsive:** los mismos colores deben funcionar en todos los anchos, sin ajustes de altura.

**Validacion/tests:** colores calculados y contraste contra fondos reales, capturas 320-1280 en ambos temas, teclado/foco, navegacion hacia equipo, largo de nombres y sin cambios geometricos. Ampliar notices-consistency-ui.cjs o una regresion enfocada en campana.

**Regresiones posibles:** empeorar oscuro al sobrescribir colores globales; alterar badges/administracion; escudos con color propio. Evitar selectores generales.

### 2. Acercar actividad deportiva al primer viewport

**Problema:** primer partido por debajo de y=1290 en movil; promo ocupa la entrada tambien en desktop.

**Solucion:** conservar identidad y CTAs, pero acercar LeagueLive con cabecera de campana mas compacta u orden acotado de secciones. Elegir una sola composicion en prototipo, no home distinto por usuario ni widgets nuevos.

**Por que ahora:** favorece el uso semanal y hace visible el valor de la liga a quien entra desde redes. La captacion no debe depender de esconder resultados.

**Impacto:** ALTO. **Esfuerzo:** MEDIO. **Riesgo:** BAJO si se mantiene LeagueLive intacto y no se reduce contenido de partidos; aumenta a MEDIO si se crean variantes o se modifica Partido, fuera del alcance recomendado.

**Archivos/componentes:** Home.tsx y CSS de campaign-hero/campaign-section; reutilizar LeagueLive y las acciones existentes.

**Estado:** ninguno nuevo. **Responsive:** altura natural y arte correctamente encuadrado; no imponer un pixel target que rompa al ampliar texto.

**Validacion/tests:** usuario distingue al entrar si hay actividad; en 390x844 el encabezado deportivo y al menos una senal real de partido deben quedar visibles sin sacrificar nombre de marca; comprobar 320, desktop bajo, claro/oscuro, textos largos y maximo de tarjetas. Medir desplazamiento hasta partido y probar tarea consultar mi horario. Regresion public-pages.cjs y compact-public-header.cjs.

**Regresiones posibles:** CTA de registro desaparece, arte se recorta mal, acceso por ancla queda bajo header, tarjetas invaden la siguiente seccion. Mantener prueba vertical y no introducir height:100%.

### 3. Mostrar balance esencial sin scroll en movil

**Problema:** posicion/equipo quedan fijos, pero derrotas y diferencia no se consultan de inmediato.

**Solucion:** resumen compacto del balance y DIF junto a identidad, conservando el detalle tabular de PF/PC/forma. Resolver empates y evitar leer cifras duplicadas por lector de pantalla. No cambiar orden deportivo del servidor.

**Por que ahora:** es una tarea central repetida; el scroll horizontal actual sirve al detalle, no debe ser requisito para el balance basico.

**Impacto:** ALTO. **Esfuerzo:** MEDIO. **Riesgo:** MEDIO por sticky, semantica y exportacion.

**Archivos/componentes:** Tabla.tsx y reglas public-standings de styles.css. Reutilizar TeamCrest, Forma y datos StandingsGroup; mantener ShareCard con columnas completas.

**Estado:** ninguno nuevo si la vista responde al ancho. No agregar un toggle sin necesidad. **Responsive:** resumen a 320-430; tabla detallada desktop; 640/768 como transicion.

**Validacion/tests:** POS/equipo/G/P/DIF visibles sin desplazar; JJ y empate accesibles de forma clara; nombres largos, negativos, tres digitos, zoom 200%, teclado y todas las columnas recuperables. match-standings-ui.cjs debe verificar visibilidad de datos primarios, no solo scrollWidth.

**Regresiones posibles:** valores repetidos, cabeceras desalineadas, sticky tapa resumen, cambios de CSS afectan otras tablas. No tocar competition.service.ts.

### 4. Dar fecha correcta a resultados del Inicio

**Problema:** resumen mezcla jornadas, pero una sola fecha general no identifica los resultados anteriores.

**Solucion:** conservar origen/fecha de cada jornada al formar el resumen y presentar contexto temporal compacto. Definir si reciente significa fecha de jornada, hora programada o finalizacion; usar la que exista en el contrato, sin inventar timestamp de finalizacion.

**Por que ahora:** evita interpretaciones equivocadas y compartir resultados con contexto falso. Es precision de producto, no decoracion.

**Impacto:** ALTO. **Esfuerzo:** BAJO. **Riesgo:** BAJO con contexto solo en Inicio; MEDIO si se altera el contrato comun innecesariamente.

**Archivos/componentes:** LeagueLive.tsx; Home.tsx solo si se reorganiza el bloque. Reutilizar fechaTexto y Partido. Preferir contexto de grupo/envoltura a obligar fecha en toda tarjeta cuando Jornada ya la proporciona.

**Estado:** datos derivados de consultas existentes, sin almacenar una copia adicional. **Responsive:** fecha corta con wrap, sin nueva fila de gran altura.

**Validacion/tests:** vigente futura + anterior finalizada; vigente con algunos finales; misma jornada deduplicada; llegada de respuestas en distinto orden; sin anterior; error del calendario; tres resultados con distinto origen. public-pages.cjs con orden y fecha esperados, ademas de geometria.

**Regresiones posibles:** duplicar juegos, atribuir vigente a anterior, ocultar resultado al fallar consulta secundaria, ordenar por una fecha inexistente.

### 5. Clarificar compartir enlace frente a imagen

**Problema:** Compartir superior significa WhatsApp; compartir nativo de imagen existe mas abajo y puede terminar en descarga.

**Solucion:** acciones con destino claro, reaprovechando BotonCompartir y ShareCard. Enlace nativo donde exista soporte y alternativa copiar/WhatsApp; imagen con capacidad comprobada y descarga explicita cuando corresponda. No enviar a redes automaticamente.

**Por que ahora:** el material deportivo ya esta disponible; hace falta aprovecharlo sin construir un nuevo sistema social.

**Impacto:** ALTO. **Esfuerzo:** MEDIO. **Riesgo:** MEDIO por Safari/Android, activacion y cancelacion.

**Archivos/componentes:** Marco.tsx/BotonCompartir, ShareCard.tsx; consumidores Partido, Player, Tabla, Estadisticas y Equipo. Reutilizar socialCard.ts y downloadFile. No agregar otra renderizacion de PNG.

**Estado:** generacion/error/capacidad ya existen parcialmente; conservar control de doble accion y liberar blobs. Si hace falta preparar archivo antes del toque nativo, mantenerlo invalidado al cambiar metrica, formato o pagina.

**Responsive:** acciones compactas que se envuelven sin desplazar el H1; no desplegar herramientas sociales sobre el contenido principal.

**Validacion/tests:** enlace exacto con filtros cuando corresponda; canShare false; share ausente; cancelacion sin mensaje de error; rechazo por permiso; render lento; filtros cambian durante generacion; descarga de tres formatos. filters-share-ui.cjs e interest-social.cjs, mas iPhone y Android reales. No basta simular navigator.share en escritorio.

**Regresiones posibles:** perder activacion, compartir archivo viejo, impedir descarga, invalidar filtros del enlace o informar exito sin transferencia completada.

## Validacion de salida para cualquier iteracion

Solo despues de autorizar e implementar una mejora: TypeScript, build y pruebas relacionadas; revisar cambios pequenos y limite de alcance. Luego, al autorizar publicacion, comprobar artefacto desplegado, API y migraciones necesarias, rutas profundas anonimas, favoritos, formularios de prueba controlados y metadatos del HTML inicial con crawler. Verificar canonical y cache social; una preview antigua no demuestra necesariamente HTML incorrecto.

No se modificaron componentes, estilos, tests ni configuracion en esta auditoria. Solo se genera este informe y capturas locales. No se desplego, no se hizo commit y no se enviaron solicitudes de jugadores.

## MI RECOMENDACION PARA LA SIGUIENTE ITERACION

**Una sola mejora: corregir el contraste del Inicio en tema claro.**

Es el defecto mas claro y acotado: hoy dificulta leer nombres de equipos y acciones que llevan a partidos, posiciones y participacion. Aporta accesibilidad, confianza y marketing sin tocar contratos, estado deportivo, navegacion ni altura de tarjetas. Tiene mejor combinacion inmediata de impacto, esfuerzo y riesgo que reorganizar toda la entrada o modificar la tabla sticky. Despues de implementarla y validarla, decidir el siguiente punto; no avanzar automaticamente.
