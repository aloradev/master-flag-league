# Estado del proyecto

**Master Flag League** — Liga de Flag Football de Cancún, Quintana Roo
Actualizado: 2 de septiembre de 2026

---

## FASE 1 — CORE ✅ Completa

Autenticación, roles, equipos, jugadores, documentación y validación.
Verificada con **126 pruebas de integración** sobre PostgreSQL 16, más
revisión de la interfaz en navegador real a 390px y 1280px.

### El concepto central: elegibilidad calculada

Un jugador es elegible cuando cumple **dos** condiciones, y el sistema
las evalúa solo:

```
is_eligible = (status = APPROVED) AND (documentación requerida completa)
```

Nunca se captura a mano. Se recalcula al registrar un jugador, al subir o
reemplazar un documento, al resolver una revisión y al cambiar la
configuración de documentos de la temporada. El árbitro solo ve
🟢 Elegible o 🔴 No elegible, sin abrir un solo documento.

### Lo que ya funciona

**Acceso y roles**
- Ingreso con JWT; el mensaje de error no revela si un correo existe
- Contraseña temporal al crear un usuario, con cambio obligatorio al entrar
- Seis roles con permisos declarados: Super Admin, Admin Deportivo,
  Admin Financiero, Manager de Equipo, Árbitro y Público
- Un manager solo alcanza la información de sus equipos, en toda la API

**Registro de jugadores**
- El manager captura los datos y sube fotografía e identificación
  (frente y reverso); en celular el campo abre la cámara
- Número de jersey único por equipo
- El registro se cierra en la fecha configurada; después solo
  administración puede dar de alta
- El manager edita mientras el registro esté pendiente o en corrección,
  no después

**Documentación**
- Formatos y tamaño máximo configurables por temporada
- Los archivos nunca son públicos: la base guarda una clave opaca y el
  archivo se sirve solo por un endpoint que valida sesión y equipo
- Cada consulta a una identificación queda auditada
- Al reemplazar un documento la versión anterior se conserva

**Validación administrativa**
- Cola ordenada por antigüedad, con los documentos a la vista
- Aprobar, rechazar o pedir corrección; el motivo es obligatorio en los
  dos últimos, con motivos frecuentes a un toque
- No se puede aprobar un registro incompleto: la API responde qué falta
- Al corregir un documento el jugador vuelve solo a la cola
- Notificación por correo al manager en cada cambio

**Administración**
- Usuarios: alta, rol, activación, restablecer contraseña
- Equipos: alta, colores, asignación de hasta dos encargados
- Temporada: fechas, cierre de registro, horario base, categorías,
  campos, documentación requerida
- Auditoría de solo lectura con el valor anterior y el nuevo
- Roster oficial imprimible, con líneas de firma

---

## FASE 2 — COMPETENCIA ✅ Completa

### Generador de jornadas
Calcula la PRÓXIMA jornada a partir del historial, no un calendario fijo
de temporada: un calendario fijo se rompe con la primera inscripción
tardía o el primer partido pospuesto.

El emparejamiento es de peso máximo, por programación dinámica sobre
máscaras de bits, en lugar de voraz. Un voraz deja descansos evitables
—con 6 equipos puede formar 2 partidos donde caben 3— y a un equipo se
le explica mal que descansó porque el algoritmo eligió mal.

Reparte también el horario y el campo buscando que nadie cierre la noche
siempre, y decide quién es local según quién lo ha sido menos.

La capacidad de la noche sale de (campos × horarios de esa jornada). Si
los partidos posibles no caben, descansan primero los equipos que MENOS
han descansado, y el aviso dice cuántos horarios harían falta:

> Caben 6 partidos (2 campos × 3 horarios) y se pueden jugar 9.
> 3 partidos quedan fuera y 6 equipos descansan por falta de espacio.
> Agregar un horario libera 2 partidos.

### Propuesta antes de guardar
El botón "Generar próxima jornada" NO escribe en la base. El
administrador ve los enfrentamientos, los horarios, los campos y quién
descansa —con el motivo— antes de que exista una sola fila; si no le
gusta, recalcula y no queda basura que borrar. Guardar la deja en
borrador, que solo ve administración; publicar la hace visible y la
empieza a contar para el historial del generador.

### Modo Árbitro
Diseñado para una mano, de pie, con sol en la pantalla: el marcador
ocupa la mitad de arriba y las jugadas frecuentes son botones grandes.
Touchdown abre una rejilla de números de camiseta —el árbitro vio un
número, no una cara— con el semáforo en el propio botón: verde tocable,
rojo bloqueado con el motivo. El rechazo pasa antes del toque, no como
un error después.

Los dos árbitros se sincronizan por sondeo cada 4 segundos pidiendo solo
lo que cambió desde la última vez. Se eligió sondeo y no WebSocket
porque el plan gratuito duerme el proceso y la conexión persistente se
cae igual; un sondeo perdido no interrumpe nada, el siguiente trae lo
que faltó.

"Deshacer" anula, no borra: al terminar el partido se puede reconstruir
qué pasó y quién lo corrigió, que es lo que se pregunta cuando un
marcador queda en duda.

### El semáforo como regla
Si la temporada exige aprobación, un jugador no elegible NO puede
registrar jugadas. Deja de ser un adorno de la pantalla y se convierte
en la regla que sostiene toda la validación de la Fase 1.

### Lo que el sistema calcula y nadie captura
- El marcador, sumando los eventos vigentes.
- La tabla de posiciones, en cada consulta. No se guarda: una copia se
  desincroniza en cuanto se corrige el marcador de una jornada anterior.
- La racha y la forma de los últimos cinco partidos.
- La fecha de la próxima jornada (una semana después de la anterior).
- El paso de la jornada a "en curso" con el primer partido que arranca,
  y a "terminada" cuando ya no queda ninguno pendiente.
- Los descansos y su motivo.

### Verificación
436 comprobaciones automáticas: 161 del generador, 153 de Fase 1, 112 de
Fase 2 y 10 de CORS. `npm run test:all` en `backend/`.

Las de Fase 2 corren contra la API compilada, no contra el código
fuente. Se comprobó además que Fase 1 y Fase 2 pasan seguidas sobre la
misma base y que Fase 2 se puede repetir sin limpiarla.

Del generador se probaron cuatro mutaciones deliberadas para confirmar
que las pruebas saben fallar. Una pasaba las 157 comprobaciones
originales, así que se agregó la sección que cierra ese hueco.

Revisión visual con navegador real en los dos temas, a 390 px y 1280 px,
incluida la comprobación de que ninguna tabla desborda la pantalla del
celular.

---

## Pendiente

### Desplegar en línea
Falta crear la base de datos gratuita y publicar. `render.yaml` y
`DESPLIEGUE.md` ya tienen todo lo demás resuelto.

### FASE 3 — Estadísticas
Rankings de jugadores, MVP acumulado, Power Ranking y récords. La tabla
de posiciones, las rachas y la forma reciente ya están en la Fase 2.

### FASE 4 — Finanzas
Inscripciones, pagos, cuentas por cobrar, ingresos, gastos y reportes.

### FASE 5 — Experiencia
Centro de jornada, perfiles públicos, tarjetas digitales, comunicados
y notificaciones por WhatsApp y push.

### FASE 6 — Playoffs e historia
Brackets configurables, campeones, Hall of Fame e historial.

---

## Cómo correr el proyecto

Ver `DESPLIEGUE.md`. En resumen:

```bash
cd backend  && npm install && npm run migrate -- --admin=tu@correo.com --password=TuClave1 && npm run dev
cd frontend && npm install && npm run dev
```

Pruebas, con la API arriba:

```bash
cd backend && npm test
```

---

## Estructura

```
master-flag-league/
├── backend/                    API REST — Node 20+, Express 5, PostgreSQL
│   ├── src/
│   │   ├── config/             conexión y transacciones
│   │   ├── controllers/        auth, users, seasons, teams, players,
│   │   │                       documents, validation, audit
│   │   ├── middleware/         sesión, roles, alcance por equipo, errores
│   │   ├── services/           elegibilidad, almacenamiento,
│   │   │                       notificaciones, auditoría
│   │   ├── db/                 esquema, datos base y runner de migraciones
│   │   └── routes/             mapa completo de la API
│   └── tests/integration.mjs   126 verificaciones del flujo real
│
├── frontend/                   React 19, Tailwind 4, mobile-first
│   └── src/
│       ├── lib/                cliente de API y tipos
│       ├── store/              sesión
│       ├── components/         diseño, semáforos, documentos protegidos
│       └── pages/              ingreso, manager, administración, roster
│
├── render.yaml                 despliegue de API y base en un paso
├── DESPLIEGUE.md               guía de publicación
├── ARQUITECTURA_MFL.md         diseño completo del sistema
└── ESTADO.md                   este archivo
```
