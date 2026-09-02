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

## Pendiente

### Desplegar en línea
Falta crear la base de datos gratuita y publicar. `render.yaml` y
`DESPLIEGUE.md` ya tienen todo lo demás resuelto.

### FASE 2 — Competencia
Jornadas, generador de enfrentamientos con descansos balanceados,
campos y horarios con detección de conflictos, asignación de árbitros,
partidos y Modo Árbitro móvil con sincronización entre dos árbitros.

### FASE 3 — Estadísticas
Tabla de posiciones, rankings, MVP, Power Ranking, rachas y récords.

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
