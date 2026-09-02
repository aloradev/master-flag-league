# Despliegue — Master Flag League Cancún

Base de datos en **Neon**, API en **Render**, frontend en **Vercel**,
documentos en **Cloudinary**. Costo: **$0**.

## Por qué la base va en Neon y no en Render

La Postgres gratuita de Render permite **una sola por workspace** y
**caduca 30 días después de crearse**, con 14 de gracia antes de
borrarla. Una temporada dura meses: la base moriría a mitad del torneo
con los rosters y la documentación validada dentro.

El plan gratuito de Neon no tiene ese reloj: 0.5 GB de almacenamiento y
~400 horas de cómputo al mes, y exceder los límites suspende
operaciones, no borra datos. Para esta liga sobra, porque la base solo
guarda texto — las imágenes viven en Cloudinary.

---

## 1. Repositorio en GitHub

Render y Vercel despliegan desde un repositorio, no desde tu disco.

Crea el repo en [github.com/new](https://github.com/new) como
**privado** y **vacío**: sin README, sin .gitignore, sin licencia. Si
dejas que GitHub cree un README, el remoto nace con un commit que tu
historia local no tiene, las historias divergen y el primer push se
rechaza.

```bash
git branch -M main
git remote add origin https://github.com/TU-USUARIO/master-flag-league.git
git push -u origin main
```

GitHub no acepta la contraseña de tu cuenta desde 2021. Genera un token
en [github.com/settings/tokens](https://github.com/settings/tokens)
(Fine-grained, permiso **Contents: Read and write**) y úsalo como
contraseña.

## 2. Base de datos en Neon

En [neon.com](https://neon.com), crea un proyecto:

- **Name:** `master-flag-league`
- **Postgres version:** 16 o superior
- **Region:** la más cercana a Cancún (`us-east-1`)

Copia la cadena de conexión y **usa la variante con pooler** — la que
incluye `-pooler` en el host. Con la directa, cada petición abre su
propia conexión y una API que duerme y despierta agota el límite.

Debe verse así:

```
postgresql://usuario:clave@ep-algo-123456-pooler.us-east-1.aws.neon.tech/neondb?sslmode=require
```

## 3. API en Render

En [render.com](https://render.com): **New → Blueprint**, conecta el
repo. Lee `render.yaml` y crea el servicio `mfl-api`.

Te va a pedir las variables marcadas como `sync: false`. Llena por ahora:

| Variable | Valor |
|---|---|
| `DATABASE_URL` | la cadena con pooler del paso 2 |
| `FRONTEND_URL` | déjala vacía; se llena en el paso 5 |

`JWT_SECRET` lo genera Render solo — no lo escribas a mano.

Cuando termine el despliegue, copia la URL del servicio
(`https://mfl-api.onrender.com`).

## 4. Migraciones

Crea las tablas y siembra la liga. Desde tu máquina, con
`backend/.env` apuntando a Neon:

```bash
cd backend
npm install
DATABASE_URL="tu-cadena-de-neon" npm run migrate -- \
  --admin=tu@correo.com --password=TuClaveSegura1 --name="Tu Nombre"
```

Eso crea el esquema, la liga de Cancún, la temporada 2026 con Varonil,
Femenil y Mixto, los dos campos, y tu usuario Super Administrador.

Se corre **una sola vez**; es idempotente, así que repetirlo no rompe
nada.

## 5. Frontend en Vercel

En [vercel.com](https://vercel.com): **Add New → Project**, importa el
mismo repo.

- **Root Directory:** `frontend`
- **Framework Preset:** Vite (lo detecta solo)
- **Variable:** `VITE_API_URL` = la URL de Render, **sin** `/api/v1`

Copia la URL que te da Vercel y **vuelve a Render** a poner
`FRONTEND_URL` con ese valor.

Ese ida y vuelta es obligatorio: el frontend necesita saber dónde está
la API, y la API necesita saber cuál es el frontend para permitirle
llamadas. Si `FRONTEND_URL` no coincide exactamente, el navegador
bloquea todo por CORS y el login parece muerto sin decir por qué.

## 6. Cloudinary — no es opcional

El disco del plan gratuito de Render es **efímero**: se borra en cada
despliegue. Sin Cloudinary, las identificaciones de tus jugadores
desaparecen la próxima vez que subas un cambio. En un sistema cuyo
propósito es guardar esa documentación, eso es pérdida de datos.

Cuenta gratuita en [cloudinary.com](https://cloudinary.com) — 25 GB — y
tres variables en Render:

```
CLOUDINARY_NAME
CLOUDINARY_API_KEY
CLOUDINARY_API_SECRET
```

El código ya sube los documentos como recursos `private` y los avatares
como públicos; solo faltan las llaves.

## 7. Resend — opcional

Sin `RESEND_API_KEY` las notificaciones se registran en consola en lugar
de enviarse y nada falla. Pero los managers no se enteran de que
rechazaste un documento, y te los vas a encontrar por WhatsApp.

2,500 correos al mes gratis en [resend.com](https://resend.com);
requiere verificar un dominio. Variables: `RESEND_API_KEY` y
`EMAIL_FROM`.

---

## Los dos arranques en frío

| Servicio | Cuándo duerme | Cuánto tarda en despertar |
|---|---|---|
| API (Render) | 15 min sin tráfico | ~30 s |
| Base (Neon) | 5 min sin consultas | ~0.5 s |

El de Render es el que se nota. Un sábado de jornada, el primer árbitro
que abra la app va a esperar medio minuto y va a pensar que no funciona.

**Cuidado con la solución obvia.** Render da 750 horas de instancia
gratuitas al mes compartidas por todo el workspace; un monitor que
consulte cada 14 minutos mantiene el servicio despierto 24/7 y consume
~720 de esas 750. Si tienes otro servicio gratuito ahí, te pasas y
Render suspende todos hasta el mes siguiente.

Si decides monitorear, apunta a `/health` **sin** parámetros. El
chequeo de base de datos es opt-in (`/health?db=1`) justamente para
esto: un ping que tocara la base despertaría Neon ~100 veces al día, y
cada despertar cuesta 5 minutos mínimos de cómputo — unas 260 horas
mensuales gastadas en no hacer nada.

La alternativa honesta: **$7/mes** por el plan pago de Render elimina
el problema completo. Para una liga que cobra inscripciones, es poco.

---

## Verificación

```bash
# 1. La API responde
curl https://tu-api.onrender.com/health

# 2. La API llega a Neon
curl "https://tu-api.onrender.com/health?db=1"
# → {"status":"OK","database":"connected","storage":"cloudinary"}

# 3. La temporada quedó sembrada
curl -X POST https://tu-api.onrender.com/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"tu@correo.com","password":"TuClaveSegura1"}'
```

Si `storage` dice `local` en lugar de `cloudinary`, faltan las llaves
del paso 6 y los documentos se están guardando en disco efímero.

Luego abre la URL de Vercel e ingresa. Deberías ver el panel con la
temporada 2026, tres categorías y dos campos.

---

## Desarrollo local

```bash
# API
cd backend
npm install
cp .env.example .env        # ajustar credenciales de PostgreSQL
npm run migrate -- --admin=tu@correo.com --password=TuClave1
npm run dev                 # http://localhost:5000

# Frontend
cd frontend
npm install
npm run dev                 # http://localhost:5173
```

Requiere un PostgreSQL local, o apuntar `DATABASE_URL` a Neon — que es
lo más simple, porque entonces no hay nada que instalar.

Pruebas de integración, con la API corriendo:

```bash
cd backend && npm test      # 153 verificaciones
```
