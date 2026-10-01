# Ampliación MFL — 30 de septiembre de 2026

## Integración

Se conserva React/Express/PostgreSQL, la autenticación y los permisos existentes. No hay tablas nuevas, duplicación de torneos ni cambios al esquema.

- `/`: portada pública con captación de equipos, pasos de inscripción, preguntas frecuentes e invitación por WhatsApp/copia de enlace. La invitación usa el dominio donde se abre la web; para campañas usar el sitio publicado, nunca localhost.
- `/registro`: cuenta autónoma con rol TEAM_MANAGER fijado por el servidor. Correo normalizado, política de contraseña y límite de intentos. El registro no permite adjudicarse equipos existentes ni roles administrativos.
- `/equipo/nuevo`: inscripción a temporada activa y categoría existente. Se crea el equipo y la relación con el encargado en la misma transacción, con auditoría. Repetir la solicitud devuelve el equipo propio ya creado. Un nombre equivalente en la misma temporada/categoría impide crear otro equipo.
- Los equipos existentes mantienen sus IDs, plantillas, documentos y partidos. La vinculación de un nuevo encargado a un equipo existente usa la administración actual: no se entrega acceso por conocer el nombre del equipo.
- `/jornadas`: calendario compartido, filtro por equipo propio, descansos filtrados y actualización cada 30 segundos mientras la vista está activa. El administrador conserva su editor de jornadas, horarios, campos y partidos. Los borradores siguen ocultos a encargados.
- Navegación móvil: calendario como acceso principal para encargados; acceso al calendario compartido desde administración.
- Se mantienen las páginas públicas de partidos/resultados y posiciones. Metadatos HTML actualizados para presentar la liga al compartir enlaces. No se han enviado invitaciones ni publicado anuncios.

## Datos y plan de migración

La migración de esta entrega es solo de aplicación: **cero DDL y cero DML sobre los registros existentes**. No ejecutar `migrate` ni `seed` para activar estos cambios. Backend y frontend pueden desplegarse juntos; conviene subir primero el backend que añade las rutas. Para revertir basta regresar ambos al código anterior, conservando cualquier cuenta/equipo creado después del despliegue.

Antes de arrancar la vista local se respaldó `.pglite` (972 archivos, comparación SHA256 archivo por archivo). Esa base local no contenía tablas MFL. La configuración real apunta a Neon; se verificó mediante consultas de solo lectura: 9 equipos, 14 jugadores, 1 temporada y 0 partidos.

Se obtuvo además una instantánea consistente de **28 tablas de Neon**, en una transacción REPEATABLE READ READ ONLY, con manifiesto, conteos, SHA256 y el SQL del esquema actual:

`.qa-artifacts/backups/mfl-data-2026-09-30T19-02-27-292Z/`

Se verificó el hash y se restauraron las 28 tablas en PGlite en memoria, respetando dependencias: todos los conteos coinciden. Este respaldo incluye datos sensibles y permanece en el directorio ignorado por Git. No subirlo a un repositorio ni compartirlo públicamente. Es un respaldo de datos de MFL, no un volcado de roles/objetos externos de PostgreSQL ni de archivos de Cloudinary/almacenamiento.

El script existente `scripts/respaldo.mjs` sigue siendo el respaldo completo con pg_dump, compresión y cifrado. En este equipo pg_dump no está disponible; por eso se creó y comprobó la instantánea de datos alternativa. Antes de un despliegue futuro, actualizar el respaldo desde el entorno correspondiente. No restaurar sobre producción para probarlo.

Desde `backend`, con el código compilado:

```powershell
node scripts/snapshot-data.mjs
node tests/snapshot-check.mjs ../.qa-artifacts/backups/<directorio-generado>
```

La comprobación restaura únicamente en memoria y nunca escribe en Neon.

## Validación

- Backend: `npm run build` correcto.
- Frontend: `npm run build` correcto. El Node local 20.18.2 produce un aviso de Vite; el entorno recomendado es Node 20.19+ o 22.12+.
- `node tests/onboarding-isolated.mjs`: base efímera y almacenamiento temporal, sin correo externo. Registro, rol fijo, duplicados, inscripción repetida, propiedad del equipo, bloqueo de cambios de estado, categoría inválida y cierre de inscripciones.
- Regresión en la misma base aislada: integración 162/162, competencia 114/114, edición 56/56 y público 31/31 (363 comprobaciones).
- Dos expectativas antiguas de competencia actualizadas al contrato existente: `field_slots` obligatorio y error 400 para asignación duplicada de roles de árbitros.
- Lectura real: opciones de inscripción y posiciones devuelven 200. La jornada devuelve 404 porque aún no existen partidos/jornadas; no se crearon datos de prueba en Neon.
- Revisión visual de portada y formulario a 390 × 844; formulario conectado a la liga existente.

No se ha desplegado ni publicado esta entrega. La vista de desarrollo usa el backend local conectado a la base configurada; las acciones de escritura hechas por una persona en esa vista afectan esa base. Los trabajadores de correo se dejaron desactivados en esta ejecución de desarrollo.

## Mejoras de experiencia y difusión

- Resumen del encargado con próximo partido, documentos faltantes, jugadores habilitados, saldo y siguiente acción. El avance se calcula desde registros guardados y se recupera al volver a entrar; no guarda formularios sin enviar.
- Calendario semanal con filtros de categoría y equipo, actualización periódica, enlace a mapa cuando existe dirección y descarga ICS con horario de Cancún. El archivo descargado es una copia, no una suscripción sincronizada.
- Panel administrativo incluye equipos sin plantilla o con jugadores pendientes de habilitar.
- Portada muestra los equipos y escudos reales disponibles. No se inventaron fotografías ni testimonios.
- Tarjetas PNG 1080 × 1350 para posiciones y partidos, divididas en páginas cuando corresponde, con marca, fecha de captura y enlace. Descargar no publica automáticamente en redes.
- Nuevo endpoint de avance protegido por pertenencia al equipo y liga. Estas mejoras no requieren migración ni escrituras sobre los datos existentes.

## Flujo integral y soporte multi-liga

- El alta de equipo separa temporada y categoría, exige una elección explícita y confirma dónde quedará la plantilla.
- Al registrar un jugador se muestra el equipo y la categoría heredada; después de guardar ofrece subir documentos, agregar otro miembro o volver a la plantilla.
- El correo del alta se conserva al pasar al acceso y el retorno lleva directamente a la inscripción del equipo.
- Solo `SUPER_ADMIN` ve `/admin/ligas`. Puede crear una liga con su primera temporada y categorías iniciales, y cambiar el contexto administrativo sin mezclar datos.
- La liga nueva recibe la configuración documental base. Después se ajusta desde “Temporada y categorías”.
- Las consultas públicas conservan Cancún como liga predeterminada (`PUBLIC_LEAGUE_SLUG`, con respaldo `cancun`) y aceptan `?liga=<slug>` para consultar otra liga sin elegir por accidente la temporada más reciente de otro tenant.

Validación adicional: avance y aislamiento de equipos dentro del entorno efímero; 363 regresiones correctas; suite de pendientes administrativos correcta; pruebas ICS de zona horaria, escape, fechas inválidas y plegado UTF-8 correctas. Compilaciones frontend y backend correctas.
