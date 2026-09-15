# Mejoras para operar una temporada en curso

1. [x] Captura de resultados históricos sin roster completo, con fuente, corrección auditada y posiciones automáticas.
2. [x] Flujo independiente de resultado y estadísticas para partidos históricos, con publicación al completar.
3. [x] Captura y corrección de estadísticas históricas después del cierre, con permisos e historial.
4. [x] Visibilidad de inscripciones abiertas, equipos y jugadores pendientes durante la temporada.
5. [x] Control de partidos pendientes, descansos e incorporaciones tardías por equipo.
6. [x] Propuestas de calendario que incorporen equipos nuevos respetando lo ya programado y jugado.
7. [x] Captura rápida de totales por jugador desde el acta, sin duplicar eventos ni puntos.
8. [x] Panel de pendientes administrativos.

## Primera entrega

Se usa la jornada manual existente y se captura el resultado en el partido publicado.
Incluye migración idempotente, validaciones de fecha, estado, liga y rol, auditoría
transaccional y protección del marcador contra recálculos de jugadas.
Prueba aislada: `npm run build --prefix backend` y
`npm run test:historical-results --prefix backend`.

Los cambios deben desplegarse con la migración de base de datos correspondiente.
No se han aplicado a producción desde esta tarea.

## Segunda entrega

Captura administrativa por jugada, anulación con motivo, MVP, conciliación de puntos
y transición pendiente/completa con reapertura. Las estadísticas pendientes se
excluyen de rankings; las posiciones y el marcador histórico se conservan.
La ruta de anulación del modo árbitro no puede saltarse este flujo.
La prueba histórica incluye estos escenarios y rollback ante fallo de auditoría.
La captura por totales por jugador permanece como mejora posterior.

## Tercera entrega

Panel de inscripciones con filtros, equipos sin plantilla o encargado activo,
motivos por jugador y enlaces a los registros. Consultas limitadas a la liga del
administrador. La lista de equipos se limita a la temporada activa.
Se puede quitar explícitamente la fecha de cierre; omitirla en una actualización
conserva su valor. Prueba: `npm run test:registration-progress --prefix backend`.
No requiere otra migración además de la incorporada en la primera entrega.

## Cuarta entrega

Seguimiento por equipo dentro de Jornadas, con estados por encuentro y jornada,
filtros por categoría, pendientes e incorporaciones. Fecha deportiva explícita,
editable por administración con motivo y auditoría transaccional. No se infiere
la incorporación a partir de `created_at` ni se modifican posiciones.
Incluye nueva columna idempotente `teams.competition_start_date`; aplicar migraciones
al desplegar. Prueba: `npm run test:team-progress --prefix backend`.
La fecha es informativa en esta entrega; su integración al generador es el paso 6.

## Quinta entrega

El generador filtra equipos por fecha de incorporación, toma como reservas los
partidos y descansos ya guardados (incluidos borradores), evita colisiones de equipo,
campo y hora, y vuelve a validar al guardar/publicar. Los equipos nuevos reciben
rivales no enfrentados cuando hay capacidad. La fecha cambiada en la propuesta
requiere recalcular. Prueba: `npm run test:generator-entry --prefix backend`.
Migración adicional: `teams.competition_start_date` ya incluida en entregas previas.

## Sexta entrega

La captura administrativa ofrece hasta 200 filas con selección de equipo, jugador,
estadística, cantidad y yardas acumuladas, más revisión previa. Los totales sustituyen
el grupo seleccionado y preservan los demás; cero permite retirarlo. Se almacenan
como registros agregados identificados en el historial, sin inventar jugadas individuales.
Los rankings suman cantidades y yardas acumuladas. La operación valida el marcador
incluyendo las anotaciones existentes, exige una revisión vigente y registra auditoría
y recibo de reintento en una transacción. Requiere aplicar la migración de quantity,
capture_source y game_stat_batches antes de publicar backend y frontend juntos.
Las pruebas de resultados históricos cubren sustitución, reintentos, publicación,
yardas acumuladas y rollback por fallo de auditoría.

## Séptima entrega

El inicio de administración reúne resultados atrasados, estadísticas incompletas,
partidos pospuestos, asignaciones sin árbitro principal habilitado y registros por
revisar o completar. Los partidos con varios avisos se muestran una sola vez en Todos.
Incluye filtros, actualización automática cada minuto y actualización manual.
Los accesos abren la jornada y el partido, o la cola de validación filtrada por equipo.
El panel está limitado a la temporada elegida y liga del administrador; incluye
partidos oficiales publicados, también playoffs. Excluye borradores, cancelaciones,
scrimmages y jugadores dados de baja. No requiere una nueva migración.
Prueba: `npm run test:admin-pending --prefix backend`.
