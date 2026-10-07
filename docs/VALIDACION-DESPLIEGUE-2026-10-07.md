# Validacion publicada - 2026-10-07

Estado: comprobacion parcial aprobada, cierre de despliegue pendiente.
Sitio: https://master-flag-league.vercel.app
Ultima ejecucion: 2026-10-07 20:47 UTC (15:47 Cancun).
Referencia local inspeccionada: commit 5c2410e.

## Alcance

Revision de solo lectura con Edge y peticiones HTTP sin cuenta. No se desplego,
no se cambiaron datos, no se enviaron formularios ni se iniciaron sesiones.
Prueba repetible: frontend/tests/deployed-readonly.cjs.
Evidencia local ignorada por Git: .qa-artifacts/deployed-readonly.json y capturas
de Inicio en 320 y 1280 px. El JSON registra estados, metadatos iniciales,
archivos, hashes, rutas publicas descubiertas y limites; no representa un PASS
automatico integral. Revisar sus errores y respuestas antes de aprobar una salida.

## Comprobado

- HTTP 200 en Inicio, Jornada, Tabla, Estadisticas, Jugar, Registro y Favoritos.
- Enlaces directos reales a jornada, partido y equipo con HTTP 200 y metadatos
  especificos en el HTML inicial, sin depender de ejecutar React para obtenerlos.
- Canonical y og:url de esas rutas sin el parametro de prueba origen=revision.
- Partido con marcador final en titulo y descripcion social de estado/fecha/cancha.
- Favoritos con noindex, nofollow tanto en meta como cabecera, y Cache-Control no-store.
- Ingresar con X-Robots-Tag noindex, nofollow. Su HTML inicial es el shell generico
  con canonical de Inicio; no se interpreta como falta de exclusion de indexacion.
- Partido inexistente de prueba con HTTP 404 y noindex, nofollow, no falso 200.
- API publica de jornada, posiciones y estadisticas responde HTTP 200.
- JS/CSS principales e imagen OG de Inicio responden 200 con tipos adecuados.
- Navegador en 320/1280: Inicio, Tabla, Estadisticas, Favoritos y tres rutas reales
  profundas; contenido cargado en las fichas, sin errores JavaScript ni overflow
  horizontal global detectados. Compartir enlace esta presente en las fichas.
- Capturas de Inicio revisadas; resultados con jornada de origen y secciones separadas.
- Estadisticas publicada presenta el orden Estadistica, Categoria, Equipo en ambos
  anchos; evidencia puntual del ajuste 9, no certificacion de todo el artefacto.

## Identidad del Artefacto

Archivos publicados observados:

- JS: index-DFGehgF0.js, SHA-256
  4c98d5e4300b6714e3a25808747d3c1a2aecb6de7822704e77011500747d25a4
- CSS: index-DduZ5L2U.css, SHA-256
  d4e21d24312903f0378e0dc848e237703a87326c086c0ee711b0aab02f56b601

Los nombres no coinciden con dist local. No hay archivos locales de esos nombres
para una comparacion de hashes identicos. Esto NO demuestra que falten cambios:
variables de compilacion, dependencias o configuracion pueden producir archivos
distintos con el mismo codigo. Tampoco demuestra que 5c2410e este desplegado.
Falta vincular el deployment activo de Vercel a su commit y configuracion de build.

## Pendientes Para Cerrar

1. Confirmar en Vercel el commit del deployment activo y las variables/build usados;
   contrastar con la referencia deseada. Esta tarea no autoriza un nuevo despliegue.
2. Validar una ruta de jugador publicado. No se descubrio un jugador desde rankings
   ni las primeras tres plantillas publicas; no se crearon jugadores para probarlo.
3. Comprobar compartir enlace/archivo en Android e iPhone reales y las vistas previas
   efectivas en WhatsApp/redes. HTML correcto no certifica una cache social actualizada.
4. Validar formularios y migraciones en entorno controlado con autorizacion explicita;
   un HTTP 200 de la API no verifica el esquema ni el recorrido de envio.
5. Repetir sobre el artefacto confirmado las regresiones criticas, temas y estados
   que aqui solo se simularon localmente; no se certifican todos los cambios 1-9.

El HTML inicial de Inicio conserva titulo/descripcion promocionales distintos del
generador local de metadatos. No se modifica a ciegas: comprobar primero la identidad
del deployment y si la ruta raiz sirve el shell estatico o la funcion prevista.
La ausencia de meta robots en Inicio no equivale por si sola a un bloqueo de indexacion.

Puntos 8 y 9 mantienen sus validaciones con personas pendientes, independientes del despliegue.
