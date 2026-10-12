# Revision UX/UI - 2026-10-12

## Objetivo

Encontrar jornadas, posiciones y personas sin conocer la estructura interna;
entender las acciones antes de ejecutarlas; recuperar errores sin perder contexto.
Se revisaron rutas, marcos publicos/privados, filtros, tabla, registro,
componentes compartidos y configuracion. Esta revision no certifica todos los
formularios administrativos ni sustituye una prueba con usuarios reales.

## Corregido

1. Posiciones: explicacion IFAF desplegable, en lugar de desplazar la tabla fuera
   de la primera pantalla con un bloque largo. El reglamento no cambia.
2. Posiciones: porcentaje visible en columna, resumen movil y PNG. Un equipo
   sin partidos muestra un guion, no un porcentaje ficticio. Presentacion
   redondeada a un decimal; el servidor conserva el calculo completo.
3. Posiciones: categoria filtrable y persistente en enlace/recarga. Conserva
   otros parametros del enlace. Categoria inexistente tiene salida clara.
4. Navegacion: Inicio y Jornada tienen nombres consistentes entre escritorio
   y movil. Favoritos tiene etiqueta visible, no solo un icono.
5. Enlaces inexistentes: pantalla de pagina no encontrada con Inicio/Jornada
   y Mi espacio para usuarios autenticados; no exige iniciar sesion.
6. Portal privado: logo vuelve al inicio publico, coherente con su etiqueta.
7. Registro: orden estable de hooks cuando la sesion se restaura tarde;
   evita que la redireccion hacia inscribir equipo rompa la pantalla.
8. Configuracion: fechas, horario y aprobacion no aparentan ser editables
   para un rol que no puede guardarlos. Altas de categoria/campo tienen
   etiquetas visibles y contenedores adaptables a movil.

## Comprobaciones

- ux-intuitive.cjs: 320/390/768/1280 px, claro/oscuro; filtros, porcentaje,
  explicacion, categoria ausente, recarga, 404, restauracion tardia de sesion,
  menu movil/Escape, regreso publico y configuracion de administrador deportivo.
- public-pages.cjs: Inicio/Jornada/Tabla en siete anchos, contencion,
  teclado, recuperacion de error y descargas individuales.
- public-statistics.cjs: filtros, empates, perfil y regreso, error y reintento
  en 320/390/1280 px con respuestas simuladas.
- share-pagination.cjs: 23 equipos en tres formatos, descarga completa,
  cada fila una sola vez y compartir multiples archivos simulado.
- email-operations-ui.cjs: confirmacion/cancelacion, estados no disponibles
  y errores de configuracion, sin enviar correos.
- TypeScript y compilacion local. Capturas en .qa-artifacts (no versionadas).

## Pendientes En Orden

1. Restablecer datos locales de prueba: la API del preview devolvio 502.
   Perfiles completos, calendario real y recorridos privados necesitan una
   API local aislada, sin utilizar produccion para efectuar operaciones.
2. Probar altas/edicion de jugadores, carga de documentos, pagos y arbitraje
   con datos representativos y roles reales. Revisar perdida de cambios,
   foco de errores, confirmacion de bajas/anulaciones y progreso de cargas.
3. Mejorar descubrimiento en tablas operativas: comprobar si busqueda,
   estados y acciones prioritarias son suficientes con volumen real de datos.
4. Evaluar agrupacion del menu administrativo: muchas secciones en una lista
   y en Mas. Decidir grupos a partir de las tareas habituales del organizador,
   sin renombrar entidades ni ocultar funciones antes de probarlos.
5. Finanzas conserva confirm/prompt nativos para algunas anulaciones.
   Revisar dialogos consistentes con campo de motivo y contexto antes de
   reemplazarlos; preservar validaciones y trazabilidad.
6. Registro persistente del lanzamiento de moneda IFAF sigue pendiente.
   El empate no se resuelve con el orden alfabetico provisional.
7. Prueba real iPhone/Safari, VoiceOver, teclado, zoom y permiso de descargas
   multiples; compartir nativo no queda validado por simular su API.
8. Validacion con cinco personas: encontrar un partido, explicar una posicion,
   guardar un favorito y compartir toda una tabla sin ayuda. Registrar
   errores/tiempos antes de decidir otra ronda de cambios.

No hubo despliegue, envio de correos ni modificaciones en datos de produccion.
