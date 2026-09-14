# Mejoras para operar una temporada en curso

1. [x] Captura de resultados históricos sin roster completo, con fuente, corrección auditada y posiciones automáticas.
2. [x] Flujo independiente de resultado y estadísticas para partidos históricos, con publicación al completar.
3. [x] Captura y corrección de estadísticas históricas después del cierre, con permisos e historial.
4. [ ] Visibilidad de inscripciones abiertas, equipos y jugadores pendientes durante la temporada.
5. [ ] Control de partidos pendientes, descansos e incorporaciones tardías por equipo.
6. [ ] Propuestas de calendario que incorporen equipos nuevos respetando lo ya programado y jugado.
7. [ ] Captura rápida de totales por jugador desde el acta, sin duplicar eventos ni puntos.
8. [ ] Panel de pendientes administrativos.

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
