# Manual de uso — Master Flag League

Los manuales detallados están separados por usuario en la carpeta [manuales](./manuales/README.md). Este archivo conserva una referencia rápida general.

Este manual describe el flujo actual de la aplicación. La liga usa Neon como base de datos en producción; el usuario no necesita instalar ni administrar PGlite.

## Acceso

1. Abre la dirección de la liga.
2. Ingresa correo y contraseña.
3. Si recibiste una contraseña temporal, el sistema te lleva a **Cambiar contraseña** antes de mostrar el resto de la aplicación.
4. En **Recuperar contraseña** solicita un enlace por correo. El enlace es de un solo uso y expira.

La sesión se cierra desde **Salir**. Nunca compartas una contraseña temporal ni un enlace de recuperación.

## Super administrador

Puede administrar toda la liga y la auditoría.

- **Panel:** resumen de validaciones y actividad.
- **Usuarios:** crea cuentas, cambia roles, activa/desactiva usuarios y genera enlaces de acceso.
- **Equipos:** crea y administra equipos, logotipos, plantillas y encargados.
- **Temporada:** configura fechas, aprobación, horario base, categorías, campos y documentos requeridos.
- **Jornadas:** genera una propuesta, revisa descansos y horarios, guarda borradores y publica.
- **Árbitros:** vincula una cuenta con rol Árbitro a la temporada.
- **Finanzas:** cargos, pagos, gastos, honorarios y reportes.
- **Auditoría:** consulta acciones administrativas.

## Administrador deportivo

Usa **Validación** para revisar documentos y aprobar, rechazar o solicitar correcciones. En **Equipos** administra equipos y plantillas. En **Jornadas** genera y publica el calendario; desde cada jornada puede editar campo, hora, notas y árbitros.

No puede crear otro Super administrador ni consultar funciones exclusivas de auditoría.

## Administrador financiero

En **Finanzas** registra cargos, pagos, gastos y honorarios de árbitros. Los estados de cuenta se calculan a partir de cargos menos pagos vigentes; no se marca “pagado” manualmente. También puede consultar jornadas, posiciones y rankings.

## Manager de equipo

1. En **Mi equipo**, selecciona el equipo activo si tienes más de uno.
2. En **Agregar**, registra jugadores.
3. Abre la ficha para completar datos y subir fotografía e identificación.
4. En **Roster**, consulta elegibilidad y plantilla.
5. En **Pagos**, consulta el estado de cuenta de cada equipo asignado.

Un manager puede estar asignado a varios equipos. Al entrar a una pantalla de equipo, confirma el equipo activo en **Mi equipo**; la mejora de persistencia entre todas las rutas queda identificada como siguiente ajuste de experiencia.

## Árbitro

En **Mis partidos** aparecen únicamente los encuentros asignados. Abre un partido para:

- iniciar y cerrar el encuentro;
- registrar touchdown y extras;
- registrar pase completo, recepción y acarreo;
- registrar intercepción, pase defendido y quite de flag;
- elegir MVP ofensivo y defensivo al finalizar.

El roster muestra el semáforo de elegibilidad. Las jugadas anuladas no afectan el marcador ni las estadísticas.

## Jornadas y partidos

El administrador genera una propuesta sin guardarla. Puede cambiar la fecha, recalcular o descartarla. **Guardar como borrador** crea la jornada; **Publicar** la hace visible. En una jornada existente, **Programación y árbitros** permite editar partidos programados.

La base de datos evita que un campo tenga dos partidos a la misma hora, que un equipo juegue dos veces en la misma jornada o que un árbitro sea asignado a partidos simultáneos.

## Posiciones, rankings y perfiles

- **Posiciones:** tabla por categoría y temporada.
- **Rankings:** líderes por touchdowns, yardas, recepciones, pases completos, intercepciones, quite de flags y pases defendidos.
- Selecciona un jugador en el ranking para abrir su perfil público.

Solo cuentan jugadores aprobados, partidos finalizados y eventos no anulados. Los datos se calculan automáticamente; no hay que capturarlos por separado.

## Vista pública

La jornada publicada, la tabla y los perfiles de jugadores aprobados pueden compartirse sin iniciar sesión. Los perfiles nunca muestran documentos, correo, teléfono ni fecha de nacimiento completa.

## Buenas prácticas

- Publica una jornada solo después de revisar fecha, campos y descansos.
- Vincula al árbitro a la temporada antes de asignarlo a un partido.
- Cierra cada partido con sus MVP antes de abandonar el modo árbitro.
- Anula una jugada incorrecta; no intentes compensarla con otra jugada.
- No borres jugadores que ya participaron: usa la baja para conservar el historial.

## Cobertura actual y pendientes

Actualmente están cubiertos: usuarios y roles, managers multi-equipo, equipos, jugadores, documentos, validación, temporadas básicas, jornadas, partidos, árbitros, marcador, posiciones, rankings, perfiles públicos y finanzas básicas.

Pendiente según la arquitectura: MVP automático de toda la liga, top 3 por equipo, Power Ranking, playoffs configurables, historial de campeones, notificaciones reales por WhatsApp/push, recordatorios automáticos de pago y respaldos programados.
