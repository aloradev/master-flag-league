# Jornadas de competición y rosters

## Programar el sábado

1. En **Playoffs**, elige la temporada. Crea la clasificación de cada categoría con 3, 4, 6, 8, 10 o 12 equipos. La siembra utiliza los resultados de temporada regular y conserva los pases directos.
2. Selecciona la fecha. La opción **Compartir jornada de competición de esta fecha** reutiliza una jornada abierta. También puedes seleccionar una jornada por número o crear una separada.
3. Revisa los cruces, la hora de Cancún y la cancha de cada partido. Marca las categorías que quieras incluir. En **Agregar partido regular o amistoso a la jornada**, selecciona el tipo, la categoría y los equipos registrados y agrégalos a la vista previa.
4. Revisa la vista previa y pulsa **Guardar programación conjunta**. Si hay un conflicto en un partido, el servidor revierte el lote completo. Las jornadas nuevas quedan en borrador. En **Jornadas** puedes asignar árbitros y publicar una vez que cada partido tenga cancha y hora. Agregar partidos a una jornada publicada los hace visibles de inmediato.
5. Para reunir partidos que ya se habían creado en jornadas distintas, selecciona como destino la fecha y la jornada correctas, indica la hora y cancha y pulsa **Aplicar fecha, hora y cancha** en el partido. Conserva su identificador. El traslado individual se admite para la fase vigente y partidos sin historial de juego.
6. Al terminar los cruces, avanza ganadores. La final requiere desempate en cancha para confirmar campeón. Las estadísticas del amistoso se consultan en el partido. La tabla regular utiliza únicamente partidos regulares.

## Descartar

**Descartar partido** afecta un cruce. **Descartar playoff** afecta la llave seleccionada, incluso si comparte jornada con otras categorías. Se registra el motivo. Un partido descartado sin historial puede reprogramarse para completar la llave. Un cruce del que depende otra fase exige revisar la llave completa. Para anular resultados o estadísticas se requiere confirmación explícita del superadministrador. Los marcadores, las jugadas y la auditoría se conservan.

## Completar plantillas

En **Administración → Equipos**, filtra por temporada y categoría y abre el equipo. **Registrar jugador** crea el expediente sin requerir cuenta. Usa la búsqueda por nombre para asociar una identidad existente o reincorporar una baja. La ficha permite editar datos, completar fotos y tramitar bajas. La aprobación y la elegibilidad siguen las reglas de la temporada. Para **Vincular cuenta de acceso**, verifica al titular y su correo de cuenta registrada. La vinculación conserva sus permisos.

## Migración y despliegue

1. En un entorno de pruebas, genera un respaldo de la base y verifica su restauración en una base separada. El proyecto incluye `npm run respaldo -- --solo-local` en `backend`.
2. Compila el backend con `npm run build` y ejecuta `npm run migrate:prod` con la conexión del entorno de pruebas. La migración mantiene los identificadores de partidos y registros de roster. Crea una identidad deportiva para cada registro previo y conserva la pertenencia de cada jugador a su temporada. Las jornadas antiguas conservan sus fechas y sus números.
3. Publica ese backend y una compilación del frontend en el mismo entorno. Usa una versión de Node compatible con Vite, como Node 22.12 o posterior de la rama 22. Comprueba un sábado con categorías distintas y un amistoso, los permisos de un encargado y el roster público después de aprobar al jugador.
4. Para recuperar el estado previo a una puesta en producción, conserva la versión anterior de la aplicación y el respaldo previo. Restaura el respaldo en una instancia separada y revisa cualquier captura posterior antes de conmutar la conexión.

## Pruebas locales

Desde `backend`, ejecuta `npm run build`, `node tests/playoffs.mjs` y `node tests/event-rosters.mjs`. La última prueba crea una base efímera con PGlite, aplica el esquema, ejecuta controladores y verifica la programación, el descarte, los permisos de anulación, las estadísticas y la conservación de identidades entre temporadas.
