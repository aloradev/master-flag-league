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

## Corrección: montos, borrado de cargos y almacenamiento

### Los montos eran inventados y no se podían cambiar
El seed traía $2,500 de inscripción, que salió de mi cabeza y no de la
liga. Los reales: **$1,000 de inscripción** y **$500 por partido
jugado**.

Y el hueco de fondo: el sistema se negaba a cobrar montos sin
configurar, pero no había pantalla para configurarlos. Solo se podían
cambiar mandando JSON al endpoint genérico de ajustes, que además exige
Super Administrador.

Ahora hay un panel «Cuánto se cobra» en Finanzas, con endpoint propio
(`PUT /finance/settings`) accesible también al Administrador Financiero,
que es quien decide cuánto se cobra. Se reciben pesos y se guardan
centavos, con la misma conversión que los pagos.

### El total depende del torneo, no es un monto fijo
Lo señaló el usuario y el modelo ya lo hacía bien: el arbitraje se cobra
**por partido jugado** —los que descansan no pagan—, así que el total de
la temporada es inscripción + arbitraje × jornadas.

Lo que faltaba era decirlo. Se agregó `rounds_planned` a los ajustes de
competencia y la proyección: «con 10 jornadas planeadas, cada equipo
pagará $6,000». Es la primera pregunta de un encargado al inscribirse, y
se recalcula mientras se teclea, lo que hace evidente un monto mal
capturado antes de guardarlo.

Se distinguen dos cifras: lo **planeado** (para informar al equipo) y lo
**comprometido** (con las jornadas ya publicadas, que es lo único
cobrable hoy).

### Eliminar un cargo, además de cancelarlo
Son dos cosas distintas y las dos hacen falta:

- **Cancelar** es para el cargo que fue real y la liga perdonó. El
  equipo ya lo vio, así que tiene que seguir viéndolo como cancelado.
- **Eliminar** es para el que nunca debió existir: equipo equivocado,
  monto mal capturado, generación repetida. Dejar esas filas como
  CANCELADO para siempre convierte la lista en ruido.

Las dos exigen que no haya ningún pago aplicado. El borrado conserva la
fila completa en la auditoría, así que sigue siendo explicable meses
después; simplemente no estorba en la lista.

Y un **borrado en bloque** de los cargos sin pagos de una generación,
por el error probable: configurar mal el monto, generar los doce cargos
y darse cuenta después. Los pagados se conservan y se informa cuáles.

### El «Error interno del servidor» al subir una foto
Reportado desde la aplicación y reproducido: no era la imagen ni el
código de subida, eran las credenciales de Cloudinary. Con la llave
equivocada, Cloudinary responde 403 y eso llegaba al usuario como un 500
genérico.

Tres defectos alrededor:

1. El driver se activaba con solo `CLOUDINARY_NAME` y
   `CLOUDINARY_API_KEY`, sin el secreto. Con el secreto olvidado, la
   aplicación decía «Almacenaje: cloudinary» y cada subida moría.
2. `validateEnvironment` solo avisaba de `CLOUDINARY_NAME`, así que una
   configuración a medias arrancaba sin decir nada y el fallo aparecía
   media hora después, cuando alguien subía un escudo.
3. El fallo se respondía como «Error interno del servidor», que no dice
   qué revisar.

Ahora: las tres variables o ninguna, una configuración a medias **aborta
el arranque** nombrando la que falta, y un fallo del almacenamiento
responde **502** con el mensaje real. Detalle completo en
`DESPLIEGUE.md`.

### Verificación
641 comprobaciones (`npm run test:all`): 161 del generador, 154 de
Fase 1, 114 de Fase 2, 123 de Fase 4, 56 de edición, 23 de
almacenamiento y 10 de CORS.

Dos defectos más que salieron al probar: las jornadas planeadas se
descartaban en silencio si la temporada no tenía fila de ajustes de
competencia (`UPDATE` sobre cero filas → ahora `UPSERT`), y la prueba
del borrado en bloque pasaba en vacío porque ningún cargo tenía pago.

---

## Movimiento

Solo donde la animación **lleva información**. Nada decorativo, y nada
por encima de 150 ms en el Modo Árbitro, que se usa con una mano, de
prisa y con sol en la pantalla.

- **El marcador cuenta** hasta su nuevo valor, con destello en el lado
  que anotó. Es la única de estas animaciones que existe por una razón
  funcional clara: el cambio puede venir del OTRO árbitro y llegar por
  sondeo, sin que este haya tocado nada. Un 14 que se vuelve 20 sin
  movimiento pasa desapercibido.
- **Respuesta al toque** en todo botón de acción (`mfl-toque`, aplicado
  en el componente `Button`, no página por página). Es la única señal de
  que el dedo dio en el blanco antes de que la red conteste, y en
  celular eso decide si el usuario vuelve a picarle.
- **Las hojas inferiores suben** desde el borde, que es de donde el
  pulgar las invocó, en lugar de aparecer de golpe.
- **Los avisos entran** en lugar de saltar: sin movimiento, el
  desplazamiento del contenido se lee como un error de dibujo.
- **La barra de cobranza crece** al montar, para que la proporción se
  lea en lugar de aparecer ya llena.

### Sin librería
Todo con CSS y Tailwind. `framer-motion` son unos 30 KB comprimidos, y
quien carga esta aplicación es un árbitro con datos móviles en un campo.
El costo real de estas animaciones no llegó a 1 KB.

### `prefers-reduced-motion`
Todo el movimiento vive dentro de `@media (prefers-reduced-motion:
no-preference)`. No es cortesía: hay gente a la que el movimiento le
provoca mareo, y iOS y Android traen el interruptor.

El contador del marcador se anima con estado de React, así que además
consulta la preferencia en JavaScript (`src/lib/motion.ts`) y **salta**
al valor final en lugar de quedarse a medio camino. Verificado con
navegador en los dos modos: con movimiento pasa por los valores
intermedios; con la preferencia activada, a los 120 ms ya muestra el
valor final.

La respuesta al toque es la excepción deliberada: va fuera del bloque
porque no es decoración, y al no tener recorrido no provoca mareo.

---

## Corrección: editar jugadores y equipos

Encontrado usando la aplicación, no leyendo la API: un jugador
registrado no se podía modificar **ni siendo Super Admin**.

`PUT /players/:id` y `PUT /teams/:id` existían desde la Fase 1,
funcionaban, y ninguna pantalla los llamaba nunca. `can_edit` estaba en
los tipos del frontend y no se usaba en ningún lado. Además, en la ficha
del equipo la plantilla no era un enlace: administración veía el nombre
del jugador y no tenía forma de abrirlo.

Las 153 comprobaciones de la Fase 1 recorrían alta → documentos →
validación → elegibilidad. Editar no estaba en ninguna, así que los
endpoints quedaron huérfanos sin que nada lo delatara. **Probar que un
endpoint responde no prueba que alguien pueda llegar a él.**

### Quién cambia qué

La regla anterior bloqueaba la edición COMPLETA de un jugador revisado,
y eso trataba igual dos cosas distintas:

- **Contacto y posición** (teléfono, correo, posición): el encargado los
  mantiene siempre, incluso con el jugador aprobado. No afectan a nada
  de lo que se certificó.
- **Datos certificados** (nombre, apellidos, fecha de nacimiento,
  número): solo administración una vez revisado el registro. Son lo que
  respalda la identificación aprobada; el número va aquí porque está en
  el roster impreso que los árbitros tienen en la mano.

Se comprueba qué **cambia**, no qué llega: el formulario manda todos los
campos en cada guardado, así que rechazar por traerlos impediría
corregir un teléfono.

### La salvaguarda

Cambiar la **fecha de nacimiento** de un jugador aprobado lo devuelve a
revisión y lo deja no elegible. Es el único campo que lo hace, y es
deliberado: en una liga con categorías, aprobar con una fecha y jugar
con otra es el fraude que el sistema de validación existe para evitar.

Los nombres NO devuelven a revisión: corregir un acento o un apellido
mal escrito es lo más común que va a pasar, y sacar a un jugador de la
cancha por eso sería peor que el problema. Queda en la auditoría con el
antes y el después.

La pantalla avisa **antes** de guardar, no después.

### Verificación
56 comprobaciones nuevas en `tests/edicion.mjs`. Con las anteriores: 594
(`npm run test:all`). Una comprobación de la Fase 1 afirmaba la conducta
antigua —mandaba la posición y esperaba 403— y se actualizó para
describir la regla nueva.

Revisión con navegador del camino completo que falló: ficha del equipo →
plantilla → jugador → editar → guardar, con Super Admin y con encargado,
en los dos temas.

---

## FASE 4 — FINANZAS ✅ Completa

### Cargos y pagos separados
El documento de arquitectura contemplaba una sola tabla `payments` con
monto, vencimiento, fecha de pago y estado. Se separó en dos, y es la
decisión que sostiene todo lo demás: en una sola tabla, un equipo que
paga la mitad de su inscripción no cabe en ningún lado —hay que inventar
un registro o sobrescribir el monto— y `status` termina siendo algo que
alguien teclea.

Con cargos y pagos separados, el saldo es una resta y el estado se
deduce: nadie marca "PAGADO", se registra un pago y el estado sigue
solo. Es el mismo principio que sostiene `players.is_eligible` y el
marcador de los partidos.

Un pago va SIEMPRE contra un cargo. Se consideró permitir el abono
suelto —"me dieron mil pesos"— y se descartó: un peso sin concepto
obliga a adivinar a qué se aplicó, y eso es justo lo que se necesita
saber cuando un equipo pregunta qué le falta. Un pago que cubre dos
cargos son dos renglones, que es lo que debería decir el recibo.

### El dinero en centavos enteros
Nada de decimales flotantes ni de NUMERIC convertido con parseFloat:
0.1 + 0.2 no es 0.3 en punto flotante, y 1234.56 × 100 da
123455.99999999999. La conversión de pesos a centavos ocurre en un solo
lugar, en la frontera de la API. La prueba usa cantidades elegidas para
romper el punto flotante y verifica que la suma cuadre al centavo.

### Lo que el sistema calcula y nadie captura
- El saldo y el estado de cada cargo (pendiente, parcial, vencido, pagado).
- El vencimiento de la inscripción: el cierre de registro de la temporada.
- El vencimiento del arbitraje: la fecha de esa jornada.
- A quién cobrarle el arbitraje: solo a los equipos que JUGARON. Es el
  caso que un cobro manual equivoca siempre, porque quien captura mira
  la lista de equipos y no la de partidos.
- El estado de cuenta de cada equipo y las cuentas por cobrar, ordenadas
  por lo vencido: el primer renglón es la primera llamada.
- El balance, separando lo facturado de lo cobrado. Un balance que sume
  lo facturado como si estuviera cobrado hace ver a la liga con dinero
  que no tiene.

### Salvaguardas
- Se niega a generar cargos si el monto está en cero: cobrarle a doce
  equipos una cantidad que nadie configuró es peor que no cobrar.
- Correr un generador dos veces no cobra doble (índices únicos).
- Un sobrepago se rechaza diciendo cuánto falta de verdad: casi siempre
  es un cero de más, y descubrirlo al cerrar la temporada es peor.
- Anular un pago exige un motivo, porque es dinero que alguien entregó.
- Un cargo con pagos aplicados no se puede cancelar.
- Cargos y pagos se anulan, no se borran: la cuenta de la liga tiene que
  poder explicarse completa meses después.
- Mover dinero es solo del Super Administrador y del Administrador
  Financiero. El Administrador Deportivo lee y no toca. El encargado ve
  únicamente el estado de cuenta de SU equipo, y no puede registrar sus
  propios pagos.

### Verificación
537 comprobaciones automáticas: 161 del generador de jornadas, 153 de
Fase 1, 114 de Fase 2, 99 de Fase 4 y 10 de CORS. `npm run test:all`.

Revisión visual con navegador real en los dos temas, a 390 px y 1280 px.
Ahí salió un fallo que ninguna prueba de API detecta: el Administrador
Financiero podía entrar pero quedaba en un bucle de redirecciones,
porque su pantalla de inicio era `/admin` y ese guardia no admite su
rol. Ahora su casa es finanzas y tiene su propia navegación.

---

## Pendiente

### Desplegar en línea
Falta crear la base de datos gratuita y publicar. `render.yaml` y
`DESPLIEGUE.md` ya tienen todo lo demás resuelto.

### FASE 3 — Estadísticas
Rankings de jugadores, MVP acumulado, Power Ranking y récords. La tabla
de posiciones, las rachas y la forma reciente ya están en la Fase 2.

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
