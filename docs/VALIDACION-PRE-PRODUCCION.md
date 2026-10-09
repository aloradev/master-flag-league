# Validacion antes de produccion

## Accesibilidad

Estado: mejoras locales y pruebas automatizadas; validacion humana pendiente.

En Safari/iPhone con VoiceOver y en escritorio con lector de pantalla, comprobar Inicio, Jornada, Tabla, Estadisticas y perfiles. Sin ayuda: identificar el titulo, recorrer enlaces, activar favoritos, modificar filtros y compartir. Confirmar que se anuncian el nombre del control, su estado y resultados sin repeticiones continuas. Verificar salto al contenido, Tab/Shift+Tab y ausencia de trampas.

Con zoom nativo al 200% y 400%, comprobar controles visibles, texto legible, contenido sin perdida y foco no oculto por cabecera/barra inferior. El aumento de texto simulado y la emulacion movil no sustituyen esta prueba. Registrar dispositivo, navegador, lector, version, ruta, pasos y captura de cada fallo.

## Prueba con jugadores

Estado: protocolo preparado, sin participantes ni resultados registrados.

Convocar cinco jugadores que no hayan recibido instrucciones sobre la interfaz. No usar datos sensibles en capturas. Pedir consentimiento para registrar observaciones; no grabar sin permiso.

1. Encontrar el siguiente partido de su equipo y decir hora y cancha.
2. Identificar al lider de una metrica indicada y su valor; repetir filtrando categoria/equipo.
3. Guardar un favorito, abrir su perfil y regresar conservando contexto.
4. Compartir el enlace de un partido y distinguir un resultado final de estadisticas pendientes.

Por tarea registrar tiempo desde datos visibles, exito sin ayuda, errores, ayuda solicitada y comentario del participante. No explicar los controles durante la tarea. Separar espera de red de tiempo de busqueda. Cinco personas son exploracion cualitativa, no una estimacion poblacional. No declarar metas de rapidez cumplidas sin medirlas.

| Participante anonimo | Dispositivo | Tarea | Segundos | Exito sin ayuda | Errores y observaciones |
| --- | --- | --- | --- | --- | --- |
| Pendiente | Pendiente | Pendiente | Sin medir | Sin medir | Sin ejecutar |

## Publicacion controlada

Estado: preparada, sin autorizacion de despliegue en esta solicitud.

Antes de publicar: revisar el diff/commit exacto, confirmar auditoria npm actual, compilar y ejecutar pruebas aisladas. Confirmar versiones de Node y dependencias en el Linux del despliegue. Revisar cambios de esquema y respaldo si corresponde. No usar pruebas que escriban en la base real.

Tras autorizacion explicita: desplegar el commit acordado y registrar identificador del despliegue. Comprobar /health, rutas publicas, login, documentos privados y derivados de imagen con una cuenta/datos de prueba autorizados. No enviar correos ni pulsar los botones de procesamiento como prueba inocua: pueden enviar pendientes de todas las ligas.

En correos revisar worker y proveedor configurados, fecha UTC de cumpleanos y estados PENDING/PROCESSING/SENT/FAILED. SENT significa aceptado por el proveedor, no entrega. Para probar entrega solicitar autorizacion y destinatario de prueba por separado.

Si falla: conservar evidencia, evaluar compatibilidad del esquema antes de revertir y volver al despliegue anterior acordado. No declarar produccion validada solo porque /health responde 200.
