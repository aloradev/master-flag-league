# Validacion de descubrimiento de Favoritos

Estado: pendiente de sesiones con personas. No hay resultados de participantes.
Relacionado: punto 8 de PLAN-MEJORAS-WEB.md y auditoria de producto.

## Objetivo

Comprobar si un jugador nuevo identifica como guardados el acceso de bandeja
de la cabecera, sin recibir una pista. La accesibilidad y el recorrido tecnico
se prueban por separado: un selector automatizado con nombre Favoritos ya sabe
que buscar y no puede medir reconocimiento humano.

## Preparacion

- Cinco jugadores que no hayan usado Favoritos; preferentemente sus telefonos.
- Usar la misma version del sitio, con datos de demostracion o un entorno de prueba.
- Abrir Inicio sin sesion, sin favoritos ni avisos. No borrar datos personales:
  usar un perfil de navegador de prueba, con almacenamiento disponible.
- Registrar ancho, navegador, version/fecha del sitio y experiencia previa.
- No explicar el icono ni mostrar esta guia al participante. No grabar sin permiso.
- Un moderador toma tiempos y notas anonimas P1-P5; sin nombres ni contactos.

## Tareas Sin Pistas

Leer una tarea a la vez, sin nombrar el icono ni indicar su posicion.

1. Desde Inicio: "Busca donde consultarias equipos, jugadores o partidos que
   hubieras guardado para volver a verlos". Parar a los 30 segundos si no lo encuentra.
2. Abrir el perfil de demostracion indicado: "Guarda este jugador para volver
   a encontrarlo otro dia". Parar a los 45 segundos si no lo consigue.
3. Volver a Inicio: "Abre de nuevo el jugador que acabas de guardar, usando lo
   que guardaste". Parar a los 30 segundos si no lo consigue.
4. "Si cierras la web, que esperas que pase con los avisos? Y si abres el sitio
   en otro telefono?" Registrar la respuesta antes de mostrar Favoritos y avisos.

Al terminar preguntar: "Antes de abrirlo, que pensabas que significaba ese icono?"
Solo entonces explicar el funcionamiento real: guardados locales al dispositivo;
avisos opcionales de equipos/partidos mientras se visita la web, no push ni avisos
de rendimiento de jugadores.

Si se ayuda, registrar el intento como asistido, no como exito sin pistas.

## Registro

Duplicar una fila por participante. Guion = no medido, nunca cero.

| ID | Dispositivo/ancho | T1 segundos y primer toque | T1 sin ayuda | T2 sin ayuda | T3 segundos/sin ayuda | Interpretacion del icono | Expectativas de avisos/dispositivo | Ayudas/observaciones |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| P1 | - | - | - | - | - | - | - | - |
| P2 | - | - | - | - | - | - | - | - |
| P3 | - | - | - | - | - | - | - | - |
| P4 | - | - | - | - | - | - | - | - |
| P5 | - | - | - | - | - | - | - | - |

## Decision Previa a Cambiar UI

Umbral operativo exploratorio, no evidencia estadistica poblacional:

- Conservar el acceso si al menos 4/5 completan T1 y T3 sin ayuda en 30 s y no
  se repite una confusion importante. Registrar igualmente tiempos y dudas.
- Si 2 o mas fallan o interpretan la bandeja como mensajes, preparar una sola
  variante pequena (simbolo de guardados o etiqueta visible), sin cambiar la
  navegacion inferior. Probarla con cinco personas nuevas y las mismas tareas.
- No atribuir a un icono problemas de almacenamiento, carga, nombres o avisos;
  registrar por separado esas causas y resolver solo las comprobadas.
- Si el problema es la expectativa de push/sincronizacion, revisar el mensaje
  correspondiente; no agregar push, cuentas obligatorias ni nuevas funciones.

## Evidencia Tecnica Complementaria

frontend/tests/favorites-discovery.cjs comprueba acceso inicial por teclado,
estado vacio, guardado y regreso desde Inicio, persistencia, avisos desactivados
por defecto, nombre accesible, foco, area tactil y overflow en ambos temas.
favorites-metadata.cjs cubre avisos, sincronizacion entre pestanas y errores.
Estas pruebas no sustituyen las cinco sesiones ni permiten cerrar la validacion humana.
