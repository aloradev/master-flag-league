# Plan de mejoras web

Actualizado: 6 de octubre de 2026.

1. Implementado localmente: carga de Jornada y Tabla con espera limitada a 30 segundos, errores comprensibles y reintento. Jornada funciona aunque falle la consulta de scrimmages. Pendiente comprobar el despliegue actualizado.
2. Implementado localmente: inicio con partidos en vivo y proximos, resultados de la ultima jornada terminada y resumen de posiciones por categoria. Pendiente publicar.
3. Pendiente: navegacion publica en celular.
4. Pendiente: estadisticas y lideres publicos.
5. Pendiente: mejorar la pagina de cada partido.
6. Pendiente: perfiles publicos de equipos.
7. Pendiente: mejorar los perfiles de jugadores.
8. Pendiente: organizar la jornada como evento.
9. Pendiente: recorrido Quiero jugar / Busco equipo.
10. Pendiente: imagenes para redes sociales.
11. Pendiente: titulos, descripciones y vistas previas por pagina.
12. Pendiente: favoritos y avisos.

## Verificacion de produccion

El 6 de octubre la version publicada contiene la direccion correcta de la API de Render y GET /api/v1/public/round respondio con datos reales. No se confirmo una configuracion incorrecta de Vercel. Los cambios evitan esperas indefinidas y separan la carga de la jornada de la consulta secundaria de scrimmages; no eliminan posibles interrupciones del proveedor.

## Pruebas

- Compilacion de produccion y comprobacion de TypeScript.
- Cliente API: respuesta HTML inesperada, fallo de red y tiempo de espera agotado.
- Regresion de acceso temporal y cierre de sesion.
- Navegador: inicio, jornada y tabla en 390 y 1280 px, resultados anteriores, fallo de scrimmages y recuperacion tras error. Datos simulados para pruebas reproducibles.
- Integracion: inicio, jornada y tabla cargan datos reales de la API publicada desde el navegador local.

Para revisar contra la API remota en desarrollo, definir `API_PROXY_TARGET=https://mfl-api.onrender.com` y dejar `VITE_API_URL` vacio. El proxy de desarrollo evita el bloqueo de origen local; la configuracion de produccion no cambia.

Commit sugerido: `fix: estabiliza consultas publicas y muestra actividad de la liga en inicio`
