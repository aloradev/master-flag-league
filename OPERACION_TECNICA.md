# Correos, CI y monitoreo

## Activación

1. Desplegar backend y frontend. Esta entrega **sí agrega una migración**:
   `email_jobs`. El arranque de Render aplica `npm run migrate:prod`.
   No se ejecutó esta migración contra Neon durante el desarrollo.
2. Mantener `RESEND_API_KEY` y `EMAIL_FROM` con dominio verificado.
3. Configurar `EMAIL_QUEUE_KEY` como secreto aleatorio estable de al menos
   32 caracteres. Si se omite, se deriva del `JWT_SECRET` existente.
   No cambiar la clave mientras existan mensajes pendientes: no podrán descifrarse.
4. Opcional: `OPERATIONS_WEBHOOK_URL`, una URL HTTPS de un receptor compatible
   con JSON `{text, code, timestamp}`. Verificar con ese receptor que acepte el formato.
   Sin URL, las alertas solo quedan en logs; no se configuró un servicio externo.
5. Super Administración → Configuración de temporada → Estado operativo y correos.

## Entrega de correos

Los correos se guardan cifrados con AES-256-GCM antes de intentar enviarlos.
La cola tiene estados PENDING, PROCESSING, SENT (aceptado por Resend, **no confirmación
de entrega en bandeja**) y FAILED. Al terminar se elimina el contenido cifrado;
se conserva metadata de diagnóstico sin destinatario, contraseña o enlace.

El procesador usa reclamos atómicos `SKIP LOCKED`, leases de dos minutos,
timeout de red de diez segundos y hasta seis intentos. Reintenta errores de red,
429, 5xx y conflictos de idempotencia concurrentes; errores de validación o
autorización quedan fallidos para corregir la configuración.
La misma clave y el mismo contenido se reutilizan en cada intento.
La notificación de publicación de una jornada también se deduplica por destinatario.
Otras llamadas nuevas a envío crean nuevos trabajos: no se promete deduplicación
de todos los eventos de negocio ni atomicidad entre cada cambio de negocio y su correo.

Los trabajos vencen como máximo a las 20 horas. Los enlaces de recuperación solo
se intentan durante 45 minutos; su token sigue venciendo a la hora. Esto mantiene
los reintentos dentro de las [24 horas de idempotencia de Resend](https://resend.com/docs/dashboard/emails/idempotency-keys).
Si falló o venció una recuperación, solicitar un enlace nuevo. No reenviar trabajos
finalizados: su contenido ya fue purgado. Un correo aceptado justo antes de una caída
se reintenta con la misma clave; si el servicio permanece caído hasta vencer, se marca
fallido y puede requerir revisión en Resend aunque el primer envío sí fuera aceptado.

El procesador intenta enviar al encolar, al arrancar y cada cinco minutos por defecto
(`EMAIL_WORKER_INTERVAL_MS`, mínimo 30000). Cada ciclo procesa hasta diez mensajes.
**El intervalo consulta Neon y consume cómputo**; el servicio dormido en Render no ejecuta
temporizadores. No existe garantía de envío mientras Render esté dormido: al despertar
recupera trabajos no vencidos. Para operación continua se necesita un servicio siempre
activo o un ejecutor externo. `EMAIL_WORKER_ENABLED=false` pausa todos los envíos.

## Monitoreo

- Cada petición tiene `X-Request-ID` y log JSON con ruta parametrizada, estado y duración.
  No se registran cuerpos, query strings ni tokens de recuperación en estos logs.
- Errores 5xx, peticiones de más de diez segundos y fallos de correo generan avisos.
- `/health` comprueba el proceso, sin consultar Neon. `/health?db=1` comprueba la base
  y genera aviso si falla. La detección de caída total requiere un monitor **externo**;
  el propio proceso apagado no puede alertar.
- Configurar ese monitor para API y frontend con frecuencia acorde al presupuesto.
  Las consultas profundas mantienen actividad en Neon: no confundir disponibilidad
  del proceso con salud de la base.
- Se limita un aviso por código cada 15 minutos **por proceso**. Los reinicios o varias
  instancias pueden repetir avisos. El receptor externo debe agrupar incidentes si se requiere.
- GET `/api/v1/admin/operations` requiere SUPER_ADMIN y muestra conteos globales,
  fallos recientes y atrasos. POST `/api/v1/admin/operations/process-emails` solicita
  procesamiento sin reactivar trabajos fallidos ni el procesador pausado.

## CI y despliegue

`.github/workflows/ci.yml` compila ambas aplicaciones con Node 24 y ejecuta `test:all`
contra PostgreSQL 16 desechable, sin secretos productivos, Neon ni PGlite. Usa las
credenciales sintéticas ya presentes en los fixtures únicamente en esa base temporal.
Aplica la migración dos veces para comprobar idempotencia. También comprueba dos
procesadores concurrentes de correo contra PostgreSQL con Resend simulado.
Corre en pull requests, push a main/master y de forma manual.
El workflow aún debe ejecutarse en GitHub.

En GitHub, configurar protección de rama y exigir los checks `frontend` y `backend`.
En Render/Vercel, configurar el despliegue para depender de esos checks o desplegar
después de que pasen. **Agregar el workflow no cambia por sí solo esas configuraciones.**

Pruebas nuevas sin base ni envíos reales, después de `npm run build` en backend:

```text
npm run test:email-queue
npm run test:operations
npm run test:transactions
node tests/arbitros-admin.mjs
node tests/playoffs.mjs
```

La suite completa hace escrituras y debe ejecutarse solo en la base de pruebas.
Los tests simulados validan contratos; la concurrencia real se debe validar con
PostgreSQL y varias instancias antes de aumentar el número de workers.
