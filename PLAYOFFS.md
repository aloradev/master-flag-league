# Playoffs

## Activación

Publicar backend y frontend juntos. La migración agrega `playoffs`, `playoff_games`
y `rounds.playoff_id`. El arranque definido en render.yaml ejecuta
`npm run migrate:prod && npm run start`. No se ha ejecutado contra Neon en esta tarea.

## Operación

1. Administración entra a Playoffs y elige categoría y 4, 6, 8, 10 o 12 equipos.
2. Clasifican los primeros de la tabla regular con al menos un partido registrado.
   La siembra se congela al crear. Los mejor clasificados reciben pases directos.
3. Indica fecha y hora y pulsa Programar primera fase.
4. En Jornadas asigna campos, ajusta horarios y asigna árbitros. Publica la fase.
5. Los árbitros registran y finalizan los partidos; un empate requiere desempate
   en cancha antes del cierre.
6. Administración indica la fecha siguiente y pulsa Avanzar ganadores.
7. Después de la final pulsa Confirmar campeón. Historial conserva la llave,
   campeón y los MVP de la final (no se presentan como MVP de todo el torneo).

Los resultados de playoffs no suman en la tabla regular. Una fase avanzada
queda protegida contra anulación de jugadas. No hay edición de siembra ni
reinicio automático del bracket.

Prueba local sin base: `cd backend`, `npm run build`, `node tests/playoffs.mjs`.
