# Despliegue — Master Flag League

Todo el stack corre en planes gratuitos. Costo: **$0**.

## 1. Base de datos y API (Render)

1. Sube este repositorio a GitHub.
2. En [render.com](https://render.com): **New → Blueprint**, conecta el repo.
   Render lee `render.yaml` y crea la base de datos y la API juntas.
3. En el servicio `mfl-api`, define `FRONTEND_URL` con la URL de Vercel
   (paso 2). Puede quedar pendiente hasta tener esa URL.
4. Corre las migraciones una sola vez, desde el Shell del servicio:

   ```bash
   npm run migrate -- --admin=tu@correo.com --password=TuClaveSegura1 --name="Tu Nombre"
   ```

   Esto crea las tablas, la liga de Cancún, la temporada 2026 con sus tres
   categorías y dos campos, y tu usuario Super Administrador.

## 2. Frontend (Vercel)

1. En [vercel.com](https://vercel.com): **Add New → Project**, importa el repo.
2. Configuración:
   - Root Directory: `frontend`
   - Framework Preset: Vite
   - Variable de entorno: `VITE_API_URL` = la URL de la API en Render
     (por ejemplo `https://mfl-api.onrender.com`, **sin** `/api/v1` al final).
3. Copia la URL que te dé Vercel y ponla en `FRONTEND_URL` en Render.
   Si no coincide, el navegador bloqueará las llamadas por CORS.

## 3. Detalle del plan gratuito de Render

La API se duerme tras 15 minutos sin tráfico y la primera petición
después tarda ~30 segundos en responder. Para una liga que opera los
sábados esto se nota justo cuando alguien entra.

Dos formas de evitarlo:

- Un monitor gratuito (por ejemplo [uptime-robot](https://uptimerobot.com))
  que consulte `https://tu-api.onrender.com/health` cada 14 minutos.
- Subir al plan de $7/mes cuando la liga lo amerite.

## 4. Almacenamiento de documentos

Sin credenciales de Cloudinary la API guarda los archivos en su propio
disco. **En Render el disco del plan gratuito es efímero: los archivos se
borran en cada despliegue.** Para producción hay que crear una cuenta
gratuita en [cloudinary.com](https://cloudinary.com) (25 GB) y definir
`CLOUDINARY_NAME`, `CLOUDINARY_API_KEY` y `CLOUDINARY_API_SECRET`.

El código sube los documentos como recursos `private`, así que no quedan
accesibles públicamente aunque alguien adivine la URL.

## 5. Correo

Sin `RESEND_API_KEY` las notificaciones se registran en consola en lugar
de enviarse; nada falla. Para activarlas: cuenta gratuita en
[resend.com](https://resend.com) (2,500 correos al mes), verificar el
dominio y definir `RESEND_API_KEY` y `EMAIL_FROM`.

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

Requiere un PostgreSQL local, o apuntar `DATABASE_URL` a la base de Render.

Pruebas de integración (con la API corriendo):

```bash
cd backend && npm test
```
