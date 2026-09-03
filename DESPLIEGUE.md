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

Crea las tablas y siembra la liga. Se corre desde tu máquina, **una sola
vez**, y es idempotente: repetirlo no rompe nada.

Primero crea `backend/.env` con la cadena de Neon. Este camino funciona
igual en PowerShell, CMD y bash, y evita pelear con comillas:

```
DATABASE_URL=postgresql://usuario:clave@ep-algo-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require
JWT_SECRET=desarrollo-local-cambiar-en-produccion-1234
FRONTEND_URL=http://localhost:5173
PORT=5000
NODE_ENV=development
```

El archivo está en `.gitignore`, así que no se sube al repositorio.

Luego, **desde la carpeta `backend`** —no desde la raíz, que no tiene
`package.json`—:

```
cd backend
npm install
npm run migrate -- --admin=tu@correo.com --password=TuClaveSegura1 --name="Tu Nombre"
```

Eso crea el esquema, la liga de Cancún, la temporada 2026 con Varonil,
Femenil y Mixto, los dos campos, y tu usuario Super Administrador.

> **Nota para Windows.** No uses `DATABASE_URL="..." npm run migrate`:
> poner una variable delante del comando es sintaxis de bash y PowerShell
> no la tiene. Si prefieres no usar `.env`, en PowerShell sería
> `$env:DATABASE_URL = "..."` en una línea aparte. Y ojo con el `&` de
> `&channel_binding=require`: en PowerShell es un operador reservado y
> parte el comando. Ese parámetro no hace falta — el código ya fuerza SSL.

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

## Variables de entorno, por servicio

Son dos aplicaciones y cada una lee su propio entorno. No se comparten:
poner una variable de la API en Vercel no hace nada, y al revés tampoco.

### En Render — la API

**Obligatorias en producción.** Sin cualquiera de las tres primeras la API
se niega a arrancar y lo dice en el log de despliegue.

| Variable | Valor |
|---|---|
| `DATABASE_URL` | cadena de Neon, la variante con `-pooler` |
| `JWT_SECRET` | lo genera Render solo; no lo escribas a mano |
| `FRONTEND_URL` | la URL de Vercel, exacta |
| `CLOUDINARY_NAME` | de tu cuenta de Cloudinary |
| `CLOUDINARY_API_KEY` | de tu cuenta de Cloudinary |
| `CLOUDINARY_API_SECRET` | de tu cuenta de Cloudinary |

Las de Cloudinary no detienen el arranque, pero son obligatorias de todos
modos: sin ellas los documentos caen en el disco efímero de Render y se
borran en cada despliegue. La API lo advierte en el log.

**Con valor por omisión.** Solo las defines si quieres cambiarlas.

| Variable | Por omisión |
|---|---|
| `NODE_ENV` | `render.yaml` la pone en `production` |
| `PORT` | la inyecta Render |
| `JWT_EXPIRATION` | `8h` — duración de la sesión |
| `JWT_REFRESH_EXPIRATION` | `7d` |

**Opcionales.** Sin ellas el sistema funciona, degradado.

| Variable | Qué se pierde |
|---|---|
| `RESEND_API_KEY` | los correos se escriben en consola en lugar de enviarse |
| `EMAIL_FROM` | remitente de esos correos |

**Solo para desarrollo local.** Alternativa a `DATABASE_URL` si corres un
PostgreSQL en tu máquina: `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`
y `DB_NAME`. Y `PRIVATE_UPLOAD_DIR` / `PUBLIC_UPLOAD_DIR` para mover
dónde se guardan los archivos cuando no hay Cloudinary.

### En Vercel — el frontend

Una sola.

| Variable | Valor |
|---|---|
| `VITE_API_URL` | la URL de Render, **sin** `/api/v1` al final |

Dos cosas que conviene saber de las variables `VITE_*`:

**Se incrustan al compilar, no se leen al ejecutar.** Si cambias la URL de
la API, actualizar la variable no basta: hay que volver a desplegar para
que se recompile el paquete.

**Son públicas.** Quedan dentro del JavaScript que descarga el navegador,
así que cualquiera puede leerlas. Nunca pongas un secreto en una variable
`VITE_*`. Las llaves de Cloudinary, el secreto de sesión y la contraseña
de la base viven en Render precisamente por eso: ahí no salen del
servidor.

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

---

## Problemas que ya se encontraron y su causa

Los tres primeros intentos de despliegue fallaron. Quedan documentados
porque son fáciles de repetir.

### El build de Render falla con `TS5108: moduleResolution=node10 removido`

Dos causas a la vez.

`render.yaml` define `NODE_ENV=production`, y con esa variable presente
`npm ci` **omite las devDependencies** — donde vive TypeScript. Nunca se
instalaba, así que `tsc` resolvía a la versión de la imagen de Render, más
nueva que la del lock, que ya no acepta esa opción. Por eso el build usa
`npm ci --include=dev`.

Y el `tsconfig` pedía `"moduleResolution": "node"` en un paquete
`"type": "module"`. Ahora usa `NodeNext`, que es la semántica real del
runtime.

### El build de Vercel falla con `Cannot find module './pages/admin/...'`

git tenía las rutas con mayúscula (`pages/Admin/`) y el disco en
minúscula. Windows y macOS no distinguen mayúsculas, así que localmente
todo resolvía; Vercel compila en Linux, donde son carpetas distintas.

En Windows git viene con `core.ignorecase` activado y un renombrado que
solo cambia mayúsculas le pasa desapercibido. Para auditarlo hay que
comparar `git ls-files` contra el disco, no mirar el disco: son cosas
distintas.

Si vuelve a pasar, se arregla sacando la ruta del índice y volviendo a
agregarla:

```
git rm -r --cached frontend/src/pages/Admin
git add frontend/src/pages/admin
```

### `npm install` dice que no encuentra `package.json`

Estás en la raíz del repositorio. Hay dos aplicaciones independientes,
`backend` y `frontend`, cada una con su propio `package.json`; en la raíz
no hay ninguno.

### Recargar en `/ingresar` da 404 en Vercel

La aplicación es una SPA: React Router resuelve las rutas en el navegador
sin pedir nada al servidor. Pero al **recargar** en `/ingresar` o
`/admin/validacion`, el navegador hace una petición HTTP real por esa
ruta, y en el servidor no existe ningún archivo ahí — solo existe
`index.html`. Vercel devuelve 404.

Navegar dentro de la app funciona; recargar o abrir un enlace directo, no.
Por eso es fácil no notarlo hasta que alguien comparte una URL.

Se resuelve con `frontend/vercel.json`, que sirve `index.html` para
cualquier ruta y deja que React decida:

```json
{
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

No se come los archivos estáticos. La documentación de Vercel es
explícita: *"precedence is given to the filesystem prior to rewrites
being applied"*. Los assets, el logo y el favicon siguen sirviéndose
directo; la regla solo actúa cuando no hay archivo que coincida.

El mismo archivo define las cabeceras de caché, y ahí hay una asimetría
que importa: los assets compilados llevan un hash en el nombre y se
cachean un año, pero **`index.html` no debe cachearse**. Es el que apunta
a esos assets, y un `index.html` viejo en caché pediría archivos que el
despliegue nuevo ya borró — la app quedaría en blanco sin error visible.

### Render eligió una versión de Node distinta

`engines.node` está en `>=20` para no estorbar a quien desarrolle con
Node 20, y la versión de producción se fija aparte en `.node-version`
(22.11.0), que es lo que lee Render. Sin ese archivo, Render toma la más
nueva que exista: en el primer intento eligió Node 26.8.1.

### La API arranca pero todo devuelve 500

Falta una variable de entorno. Ya no debería ocurrir: en producción la
API valida su configuración al arrancar y **se niega a iniciar** listando
lo que falta y por qué importa. Ese mensaje sale en el log de despliegue
de Render:

```
❌ No se puede arrancar: faltan variables de entorno

  ✗ DATABASE_URL — falta. Cadena de conexión de Neon (usa la variante con -pooler).
  ✗ JWT_SECRET — falta. Secreto para firmar sesiones. Render lo genera solo.
  ✗ FRONTEND_URL — falta. Sin ella CORS bloquea todas las llamadas.
```

Cloudinary y Resend solo advierten, porque degradan la plataforma sin
romperla.

---

## Cómo se verifica un cambio antes de desplegar

La lección de los tres fallos: revisar el código en la máquina de
desarrollo no basta. Windows no distingue mayúsculas, `tsx` no es `tsc`,
y `npm install` no es `npm ci` con `NODE_ENV=production`.

La comprobación que sí sirve reproduce el entorno de despliegue:

```
# Exportar el árbol TAL COMO GIT LO TIENE, no como está el disco
git archive --format=tar HEAD > arbol.tar

# Extraerlo y compilarlo en un sistema sensible a mayúsculas (Linux)
mkdir verificacion && tar -xf arbol.tar -C verificacion

cd verificacion/frontend && npm install && npm run build
cd ../backend && NODE_ENV=production npm install --include=dev && npm run build

# Y correr el JavaScript compilado, no el TypeScript con tsx
npm start
```
