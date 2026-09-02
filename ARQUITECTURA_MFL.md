# Master Flag League - Arquitectura de Sistema Integral

**Documento de Análisis Arquitectónico**  
**Versión:** 1.0  
**Fecha:** 2 de Septiembre de 2026  
**Proyecto:** Master Flag League - Cancún, Quintana Roo, México

---

## 🎯 RESUMEN EJECUTIVO

### Visión
Crear el **"Sistema Operativo"** de una liga deportiva de Flag Football que centralice **completamente** la operación de la liga desde registro de jugadores hasta playoffs, con automatización radical, diseño premium y mobile-first.

### Estadísticas del Proyecto

```
📊 ALCANCE:
├─ Usuarios: 4 roles principales (SuperAdmin, SportAdmin, Manager, Referee)
├─ Entidades: 25+ tablas en base de datos
├─ Funcionalidades: 80+ pantallas/vistas
├─ Automatizaciones: 10+ flujos automáticos
└─ Integraciones: Email, almacenamiento de documentos, pagos (opcional)

⏱️ TIMELINE:
├─ Fase 1 (CORE): 2-3 semanas
├─ Fase 2 (COMPETENCIA): 2-3 semanas
├─ Fase 3 (ESTADÍSTICAS): 1-2 semanas
├─ Fase 4 (FINANZAS): 1 semana
├─ Fase 5 (EXPERIENCIA): 1-2 semanas
├─ Fase 6 (PLAYOFFS): 1 semana
└─ TOTAL: 8-14 semanas de desarrollo

💰 COSTO:
├─ Backend/Frontend/DB: Render.com (GRATIS)
├─ Almacenamiento: Cloudinary (GRATIS - 25GB/mes)
├─ Email: Resend.com (GRATIS - 2,500/mes)
├─ Versionado: GitHub (GRATIS)
└─ TOTAL: $0 USD

👥 USUARIOS ESPERADOS:
├─ Managers: 2 por equipo (aprox 12-20 equipos = 24-40)
├─ Árbitros: 3-5
├─ Administradores: 2-3
├─ Jugadores: 150-300
└─ Público: Visitantes

⚙️ TECNOLOGÍA:
├─ Frontend: React + TypeScript + TailwindCSS
├─ Backend: Node.js + Express + PostgreSQL
├─ Almacenamiento: Cloudinary
├─ Email: Resend
└─ Deploy: Vercel (Frontend) + Render (Backend)
```

### Diferenciadores Clave

```
✨ FUNCIONALIDADES ÚNICAS:
├─ 🟢 Validación de Elegibilidad: Los árbitros ven instantáneamente
│   si un jugador está aprobado o no (✅ ELEGIBLE / ❌ NO ELEGIBLE)
│
├─ 🔄 Sincronización en Tiempo Real: Dos árbitros registran en
│   partidos simultáneamente y se sincronizan automáticamente
│
├─ 🤖 Automatización Radical: Tabla, rankings, power ranking,
│   estadísticas... TODO se calcula automáticamente
│
├─ 📱 Modo Árbitro Mobile-First: Interfaz EXTREMADAMENTE sencilla
│   (botones grandes, sin distracciones)
│
├─ 📊 Inteligencia de Datos: Genera automáticamente insights,
│   rachas, récords, cambios de posición
│
├─ 🎬 Generador de Jornadas: Crea automáticamente la próxima
│   jornada considerando histórico, descansos, balance
│
├─ 💾 Documentación Segura: Sistema de validación de documentos
│   (fotos + ID) con aprobación de admin
│
└─ 🏆 Preparado para Crecer: Arquitectura lista para múltiples
   ligas, ciudades, categorías, deportes
```

### Números Clave

```
NÚMERO DE PANTALLAS: 45+
├─ Públicas (sin login): 8
├─ Manager: 12
├─ Árbitro: 3
├─ Admin: 20+
└─ Compartidas: 2

FLUJOS PRINCIPALES: 12+
├─ Registro de jugador
├─ Validación de documentos
├─ Generación de jornada
├─ Modo árbitro
├─ Visión de resultados
├─ Actualización de tabla
├─ Rankings
├─ MVP
├─ Pagos
├─ Playoffs
├─ Comunicados
└─ Y más...

AUTOMATIZACIONES: 15+
├─ Después de cada partido
├─ Después de cada jornada
├─ Validación de documentos
├─ Notificaciones programadas
├─ Cálculos de tabla
├─ Generación de rankings
├─ Power ranking
├─ Recordes
└─ Y más...
```

---

## TABLA DE CONTENIDOS

1. [Visión General](#visión-general)
2. [Principios de Diseño](#principios-de-diseño)
3. [Arquitectura General del Sistema](#arquitectura-general-del-sistema)
4. [Estructura de Base de Datos](#estructura-de-base-de-datos)
5. [Roles y Permisos](#roles-y-permisos)
6. [Flujos de Usuario](#flujos-de-usuario)
7. [Mapa de Páginas](#mapa-de-páginas)
8. [Algoritmos Clave](#algoritmos-clave)
9. [Sistema de Estadísticas](#sistema-de-estadísticas)
10. [Automatizaciones](#automatizaciones)
11. [Seguridad y Privacidad](#seguridad-y-privacidad)
12. [Plan de Desarrollo](#plan-de-desarrollo)

---

## VISIÓN GENERAL

**Objetivo Principal:**  
Crear el "Sistema Operativo" de una liga deportiva de Flag Football que centralice toda la operación: desde registro de jugadores hasta playoffs, automatizando cálculos y proporcionando una experiencia premium, mobile-first y escalable.

**Valores Fundamentales:**
- ✅ **Automatización:** Si se puede calcular, no se captura manualmente
- ✅ **Centralización:** Un solo lugar para toda la información
- ✅ **Escalabilidad:** Arquitectura preparada para múltiples ligas y ciudades
- ✅ **Mobile-First:** Optimizado especialmente para dispositivos móviles
- ✅ **Seguridad:** Control estricto de datos sensibles
- ✅ **Usabilidad:** Experiencia intuitiva para cada rol

---

## PRINCIPIOS DE DISEÑO

### 1. Automatización Radical
```
Si el sistema PUEDE calcularlo → El usuario NO lo captura manualmente

Ejemplos:
- Tabla de posiciones: Calculada automáticamente después de cada partido
- Rankings: Generados en tiempo real según estadísticas
- Descansos: Distribuidos automáticamente según algoritmo
- Enfrentamientos: Generados considerando histórico y balance
- Estadísticas acumuladas: Sumadas automáticamente
```

### 2. Separación de Información
```
├── PÚBLICA (Perfiles, rankings, resultados, tarjetas)
├── PRIVADA (Manager - información de su equipo)
└── SENSIBLE (Documentos de identificación - solo admin)
```

### 3. Validación en Cadena
```
Registro del Jugador
    ↓
Carga de Documentos
    ↓
Revisión Administrativa
    ↓
Estado de Elegibilidad
    ↓
Disponibilidad en Partidos
```

### 4. Sincronización en Tiempo Real
```
Árbitro 1 registra TD
    ↓
Sistema actualiza
    ↓
Árbitro 2 ve el cambio
    ↓
Base de datos sincronizada
```

---

## ARQUITECTURA GENERAL DEL SISTEMA

### Stack Tecnológico Recomendado (100% GRATUITO)

```
FRONTEND:
├── React/TypeScript (UI Responsiva)
├── TailwindCSS + DaisyUI (Diseño Premium)
├── React Query (State Management)
├── Zustand (Global State)
└── Vite (Build Tool)
└─ DEPLOY: Vercel (gratuito)

BACKEND:
├── Node.js + Express (API REST)
├── TypeScript
├── PostgreSQL (Base de Datos)
├── JWT (Autenticación)
└── Multer (Gestión de Archivos)
└─ DEPLOY: Render.com (gratuito, servidor dormido con inactividad)

STORAGE:
├── Cloudinary (Plan Gratuito: 25 GB/mes)
│   └─ 25 imágenes/videos por mes ilimitado
│   └─ Transformaciones automáticas
│   └─ CDN incluido
│   └─ URL firmadas automáticas
│   └─ Control de acceso integrado
│
├── O Alternativa: Railway + PostgreSQL
│   └─ Railway.app tiene plan gratuito
│   └─ 5 GB almacenamiento
│   └─ Suficiente para fase inicial
│
└─ Base de Datos: PostgreSQL en Railway.app (GRATUITO)
   └─ 5 GB almacenamiento
   └─ Base de datos relacional completa
   └─ Backups automáticos

INFRAESTRUCTURA:
├── GitHub (Control de versiones - GRATIS)
├── GitHub Actions (CI/CD - GRATIS)
├── Render.com (Backend - Plan Gratuito)
│   ├─ 1 servidor Node.js gratuito
│   ├─ Duerme con inactividad (aceptable para fase inicial)
│   └─ PostgreSQL incluido
│
├── Vercel (Frontend - GRATIS)
│   └─ Despliegue automático desde GitHub
│
└─ Email: Resend.com (2500 emails/mes GRATIS)
   └─ Ideal para notificaciones
```

**PRESUPUESTO TOTAL: $0 USD**

Con esta configuración puedes lanzar y mantener la plataforma completamente gratis durante la fase inicial y mientras crece la liga.

### Infraestructura Gratuita Detallada

```
CAPA FRONTEND (VERCEL - GRATIS)
├─ React SPA deployada automáticamente
├─ CDN global incluido
├─ Dominio custom posible
├─ SSL/HTTPS automático
├─ Límites generosos: 100 GB/mes bandwidth
└─ Build y deploy ilimitado desde GitHub

CAPA BACKEND (RENDER.COM - PLAN GRATUITO)
├─ Node.js + Express
├─ 1 servidor gratuito (duerme en inactividad)
├─ PostgreSQL gratuito incluido
├─ Ambiente variables incluido
├─ Deploy automático desde GitHub
└─ Limitación: Se pone en standby después de 15 min sin requests
   └─ SOLUCIÓN: Usar cronómetro simple (cron job) para hacer ping cada 14 minutos

CAPA BASE DE DATOS (POSTGRESQL EN RENDER)
├─ 5 GB almacenamiento
├─ Backups automáticos
├─ Suficiente para: ~100K jugadores + histórico
└─ Escalable si crece (migraciones futuras a otras plataformas)

ALMACENAMIENTO DE DOCUMENTOS (CLOUDINARY)
├─ Plan Gratuito:
│  ├─ 25 GB almacenamiento/mes
│  ├─ Transformaciones automáticas (resize, crop, format)
│  ├─ CDN global
│  ├─ URLs firmadas automáticas
│  ├─ Control de acceso integrado
│  └─ Perfecto para fotos + documentos
│
└─ Ventajas sobre Railway:
   ├─ Especializado en imágenes
   ├─ Transformaciones automáticas
   ├─ No ocupa espacio de DB
   └─ Mejor para archivos grandes

EMAIL (RESEND.COM)
├─ 2,500 emails/mes GRATIS
├─ Perfecto para:
│  ├─ Notificaciones de registro
│  ├─ Alertas de jugadores
│  ├─ Recordatorios de partidos
│  ├─ Notificaciones de pagos
│  └─ Comunicados de la liga
│
├─ Integración simple (SDK de Resend)
└─ Opción fallback: SendGrid (100 emails/día GRATIS)

MONITOREO Y LOGS (RAILWAY/RENDER INCLUIDOS)
├─ Logs incluidos en plataforma
├─ Alertas básicas
└─ Suficiente para diagnóstico

ALTERNATIVA PARA ACTIVIDAD CONSTANTE:
Si el servidor gratis de Render causa problemas por dormirse:
├─ Usar uptime robot (gratuito) para hacer ping cada 14 minutos
├─ O: Migrar solo backend a: Replit, Glitch (también gratis)
└─ O: Monetizar después y pasar a hosting pago
```

### Comparativa de Opciones Gratuitas

```
OPCIÓN A: Render.com + Cloudinary (RECOMENDADO)
├─ Ventajas:
│  ├─ Todo en un lugar (frontend + backend + DB)
│  ├─ Fácil de mantener
│  ├─ Deploy automático
│  └─ Escalable
├─ Limitaciones:
│  ├─ Backend duerme con inactividad (sin requests)
│  └─ Solución: Uptime monitor (ping cada 14 min)
└─ Costo: $0

OPCIÓN B: Railway (TODO)
├─ Ventajas:
│  ├─ PostgreSQL gratuito
│  ├─ Node.js gratuito
│  ├─ Storage gratuito
│  └─ Interfaz intuitiva
├─ Limitaciones:
│  ├─ $5/mes después del período gratuito (puede suficiente)
│  ├─ Menos especialización en imágenes
│  └─ Storage limitado (5 GB)
└─ Costo: $0 inicial, $5/mes después

OPCIÓN C: Vercel + Railway + Cloudinary (HÍBRIDA)
├─ Frontend: Vercel (GRATIS)
├─ Backend: Railway (GRATIS inicial)
├─ Storage: Cloudinary (GRATIS)
├─ Ventajas:
│  ├─ Mejor rendimiento general
│  ├─ Frontend super optimizado
│  └─ Separación clara de responsabilidades
└─ Costo: $0 inicial, posible $5-10/mes después

RECOMENDACIÓN:
╔═══════════════════════════════════════════╗
║ OPCIÓN A: Render + Cloudinary            ║
║ ✅ Más simple                             ║
║ ✅ Todo integrado                        ║
║ ✅ Deploy fácil                          ║
║ ✅ Suficiente para la liga inicial       ║
║ ✅ Escalable                             ║
║ 💰 Costo: $0 USD                         ║
╚═══════════════════════════════════════════╝
```

### Arquitectura de Aplicación

```
┌─────────────────────────────────────────────────────────┐
│                     APLICACIÓN WEB                      │
│  (React - Mobile First, Premium Design, Responsive)    │
└──────────┬──────────────────────────────────────────────┘
           │
┌──────────▼────────────────────────────────────────────┐
│                    API REST (Express)                   │
│  ├─ /auth (Autenticación y JWT)                        │
│  ├─ /admin (Gestión administrativa)                    │
│  ├─ /teams (Equipos y managers)                        │
│  ├─ /players (Jugadores y validación)                  │
│  ├─ /documents (Gestión de documentos)                 │
│  ├─ /games (Partidos y modo árbitro)                   │
│  ├─ /rounds (Jornadas y generador)                     │
│  ├─ /statistics (Cálculos y rankings)                  │
│  ├─ /finances (Ingresos y gastos)                      │
│  ├─ /playoffs (Sistema de playoffs)                    │
│  ├─ /notifications (Sistema de notificaciones)         │
│  └─ /audit (Registro de cambios)                       │
└──────────┬────────────────────────────────────────────┘
           │
┌──────────▼────────────────────────────────────────────┐
│                  BASE DE DATOS (PostgreSQL)            │
│  ├─ Tablas de Core                                     │
│  ├─ Tablas de Competencia                              │
│  ├─ Tablas de Estadísticas                             │
│  ├─ Tablas de Finanzas                                 │
│  └─ Tablas de Auditoría                                │
└─────────────────────────────────────────────────────────┘
           │
┌──────────▼────────────────────────────────────────────┐
│            SERVICIOS EXTERNOS                          │
│  ├─ Almacenamiento de Documentos (S3/Cloudinary)      │
│  ├─ Email (SendGrid/Nodemailer)                        │
│  ├─ SMS/WhatsApp (Twilio)                              │
│  ├─ Push Notifications (Firebase)                      │
│  └─ Autenticación Opcional (OAuth - Google/GitHub)     │
└─────────────────────────────────────────────────────────┘
```

---

## ESTRUCTURA DE BASE DE DATOS

### Diagrama ER (Entidad-Relación)

```
┌─────────────┐
│    Users    │────┐
├─────────────┤    │
│ id (PK)     │    └──────────────┐
│ email       │                   │
│ password    │                   │
│ name        │                   │
│ role_id (FK)│                   │
│ active      │                   │
│ created_at  │                   │
└─────────────┘                   │
                                   │
                    ┌──────────────▼──────────────┐
                    │       Roles                 │
                    ├─────────────────────────────┤
                    │ id (PK)                     │
                    │ name (SUPER_ADMIN, etc)    │
                    │ permissions (JSON)          │
                    └─────────────────────────────┘

┌──────────────────┐
│    Seasons       │
├──────────────────┤
│ id (PK)          │
│ name             │
│ year             │
│ start_date       │
│ end_date         │
│ status           │
│ league_id (FK)   │
└──────────────────┘

┌──────────────────┐
│   Categories     │
├──────────────────┤
│ id (PK)          │
│ name (M/F/Mix)   │
│ season_id (FK)   │
│ color            │
└──────────────────┘

┌─────────────────────────────────┐
│         Teams                   │
├─────────────────────────────────┤
│ id (PK)                         │
│ name                            │
│ logo_url                        │
│ color_primary, color_secondary  │
│ season_id (FK)                  │
│ category_id (FK)                │
│ status (ACTIVE, SUSPENDED, etc) │
│ created_at                      │
└────────┬────────────────────────┘
         │
    ┌────▼──────────────────────┐
    │    TeamUsers              │
    ├───────────────────────────┤
    │ id (PK)                   │
    │ team_id (FK)              │
    │ user_id (FK)              │
    │ role (MANAGER, etc)       │
    │ joined_at                 │
    └───────────────────────────┘

┌──────────────────────────────────────┐
│         Players                      │
├──────────────────────────────────────┤
│ id (PK)                              │
│ team_id (FK)                         │
│ season_id (FK)                       │
│ category_id (FK)                     │
│ first_name, last_name_paternal, etc  │
│ date_of_birth                        │
│ jersey_number                        │
│ position                             │
│ photo_url                            │
│ phone, email                         │
│ status (PENDING, APPROVED, etc)      │
│ elegibility_status (ELIGIBLE/NOT)    │
│ registered_by_user_id (FK)           │
│ approved_by_user_id (FK)             │
│ created_at, updated_at               │
└──────────┬───────────────────────────┘
           │
    ┌──────▼──────────────────────────┐
    │   PlayerDocuments                │
    ├──────────────────────────────────┤
    │ id (PK)                          │
    │ player_id (FK)                   │
    │ document_type (PHOTO, ID_FRONT)  │
    │ file_url                         │
    │ file_size                        │
    │ uploaded_at                      │
    │ uploaded_by_user_id (FK)         │
    └──────────────────────────────────┘
           │
    ┌──────▼──────────────────────────┐
    │   PlayerApprovals                │
    ├──────────────────────────────────┤
    │ id (PK)                          │
    │ player_id (FK)                   │
    │ status (PENDING, APPROVED, etc)  │
    │ notes                            │
    │ reviewed_by_user_id (FK)         │
    │ reviewed_at                      │
    │ reason_if_rejected               │
    └──────────────────────────────────┘

┌──────────────────────────────┐
│    Fields (Campos)           │
├──────────────────────────────┤
│ id (PK)                      │
│ name (Campo 1, 2, etc)       │
│ season_id (FK)               │
│ capacity                     │
│ location                     │
│ status                       │
└──────────────────────────────┘

┌──────────────────────────────────┐
│    Referees (Árbitros)           │
├──────────────────────────────────┤
│ id (PK)                          │
│ user_id (FK)                     │
│ season_id (FK)                   │
│ name                             │
│ badge_number                     │
│ status (ACTIVE, INACTIVE, etc)   │
│ certified                        │
│ games_assigned                   │
└──────────────────────────────────┘

┌────────────────────────────────┐
│    Rounds (Jornadas)           │
├────────────────────────────────┤
│ id (PK)                        │
│ season_id (FK)                 │
│ round_number                   │
│ scheduled_date                 │
│ status (SCHEDULED, ONGOING, etc)│
│ generated_by_user_id (FK)      │
│ created_at                     │
└────────┬───────────────────────┘
         │
    ┌────▼──────────────────────────┐
    │      Games (Partidos)          │
    ├───────────────────────────────┤
    │ id (PK)                       │
    │ round_id (FK)                 │
    │ season_id (FK)                │
    │ category_id (FK)              │
    │ home_team_id (FK)             │
    │ away_team_id (FK)             │
    │ field_id (FK)                 │
    │ scheduled_time                │
    │ referee1_id (FK)              │
    │ referee2_id (FK)              │
    │ status (SCHEDULED, LIVE, etc) │
    │ home_score, away_score        │
    │ mvp_offensive_player_id (FK)  │
    │ mvp_defensive_player_id (FK)  │
    │ started_at, ended_at          │
    │ final_reviewed_by_user_id (FK)│
    └───────────┬────────────────────┘
                │
        ┌───────▼────────────────────────┐
        │    GameEvents                  │
        ├────────────────────────────────┤
        │ id (PK)                        │
        │ game_id (FK)                   │
        │ team_id (FK)                   │
        │ player_id (FK)                 │
        │ event_type (TD, SACK, etc)     │
        │ quarter                        │
        │ time                           │
        │ yards                          │
        │ recorded_by_ref_id (FK)        │
        │ timestamp                      │
        └────────────────────────────────┘
                │
        ┌───────▼────────────────────────┐
        │    GameStats                   │
        ├────────────────────────────────┤
        │ id (PK)                        │
        │ game_id (FK)                   │
        │ team_id (FK)                   │
        │ stat_type                      │
        │ value                          │
        │ created_at                     │
        └────────────────────────────────┘
                │
        ┌───────▼────────────────────────┐
        │    PlayerStats                 │
        ├────────────────────────────────┤
        │ id (PK)                        │
        │ player_id (FK)                 │
        │ game_id (FK)                   │
        │ stat_type (TD, RECEPTIONS, etc)│
        │ value                          │
        │ timestamp                      │
        └────────────────────────────────┘

┌──────────────────────────────┐
│    Standings (Posiciones)    │
├──────────────────────────────┤
│ id (PK)                      │
│ season_id (FK)               │
│ category_id (FK)             │
│ team_id (FK)                 │
│ played                       │
│ wins, losses, ties           │
│ points_for, points_against   │
│ difference                   │
│ points                       │
│ streak                       │
│ last_updated                 │
└──────────────────────────────┘

┌──────────────────────────────┐
│    Awards (MVPs, Premios)    │
├──────────────────────────────┤
│ id (PK)                      │
│ season_id (FK)               │
│ round_id (FK)                │
│ category_id (FK)             │
│ player_id (FK)               │
│ award_type                   │
│ (MVP_OFFENSIVE, etc)         │
│ assigned_by_user_id (FK)     │
│ assigned_at                  │
└──────────────────────────────┘

┌──────────────────────────────┐
│    Payments (Pagos)          │
├──────────────────────────────┤
│ id (PK)                      │
│ team_id (FK)                 │
│ season_id (FK)               │
│ amount                       │
│ due_date                     │
│ paid_date                    │
│ status (PENDING, PAID, etc)  │
│ payment_method               │
│ notes                        │
│ recorded_by_user_id (FK)     │
│ created_at                   │
└──────────────────────────────┘

┌──────────────────────────────┐
│    Expenses (Gastos)         │
├──────────────────────────────┤
│ id (PK)                      │
│ season_id (FK)               │
│ expense_type                 │
│ amount                       │
│ date                         │
│ description                  │
│ recorded_by_user_id (FK)     │
│ created_at                   │
└──────────────────────────────┘

┌──────────────────────────────┐
│    AuditLogs (Auditoría)     │
├──────────────────────────────┤
│ id (PK)                      │
│ user_id (FK)                 │
│ action                       │
│ entity_type                  │
│ entity_id                    │
│ old_value (JSON)             │
│ new_value (JSON)             │
│ timestamp                    │
│ ip_address                   │
└──────────────────────────────┘

┌──────────────────────────────┐
│    Playoffs (Playoffs)       │
├──────────────────────────────┤
│ id (PK)                      │
│ season_id (FK)               │
│ category_id (FK)             │
│ status                       │
│ round_name                   │
│ team1_id (FK)                │
│ team2_id (FK)                │
│ winner_id (FK)               │
│ scheduled_date               │
│ final_score                  │
│ game_id (FK)                 │
└──────────────────────────────┘

┌──────────────────────────────┐
│    Champions (Campeones)     │
├──────────────────────────────┤
│ id (PK)                      │
│ season_id (FK)               │
│ category_id (FK)             │
│ champion_team_id (FK)        │
│ runner_up_team_id (FK)       │
│ third_place_team_id (FK)     │
│ created_at                   │
└──────────────────────────────┘

┌──────────────────────────────────┐
│    Notifications                 │
├──────────────────────────────────┤
│ id (PK)                          │
│ user_id (FK)                     │
│ type (EMAIL, SMS, PUSH)          │
│ subject                          │
│ message                          │
│ related_entity_type              │
│ related_entity_id                │
│ read                             │
│ sent_at                          │
│ scheduled_for                    │
└──────────────────────────────────┘

┌──────────────────────────────┐
│    Announcements             │
├──────────────────────────────┤
│ id (PK)                      │
│ season_id (FK)               │
│ title                        │
│ content                      │
│ type (NEWS, ALERT, etc)      │
│ created_by_user_id (FK)      │
│ published_at                 │
│ expires_at                   │
│ visibility (PUBLIC, etc)     │
└──────────────────────────────┘
```

### Índices Críticos

```sql
-- Performance
CREATE INDEX idx_players_team ON players(team_id);
CREATE INDEX idx_players_season ON players(season_id);
CREATE INDEX idx_players_status ON players(status);
CREATE INDEX idx_games_round ON games(round_id);
CREATE INDEX idx_games_season ON games(season_id);
CREATE INDEX idx_game_events_game ON game_events(game_id);
CREATE INDEX idx_player_stats_player ON player_stats(player_id);
CREATE INDEX idx_standings_season ON standings(season_id);
CREATE INDEX idx_audit_user ON audit_logs(user_id);
CREATE INDEX idx_audit_timestamp ON audit_logs(timestamp);
```

---

## ROLES Y PERMISOS

### 1. SUPER ADMINISTRADOR

```json
{
  "role": "SUPER_ADMIN",
  "permissions": {
    "seasons": ["create", "read", "update", "delete"],
    "categories": ["create", "read", "update", "delete"],
    "teams": ["create", "read", "update", "delete", "suspend"],
    "players": ["create", "read", "update", "delete", "approve", "reject"],
    "documents": ["read", "validate", "delete"],
    "games": ["create", "read", "update", "delete", "finalize", "modify_score"],
    "rounds": ["create", "read", "update", "delete", "generate"],
    "fields": ["create", "read", "update", "delete"],
    "referees": ["create", "read", "update", "delete", "assign"],
    "statistics": ["read", "recalculate"],
    "finances": ["create", "read", "update", "delete"],
    "awards": ["assign"],
    "playoffs": ["create", "manage"],
    "announcements": ["create", "publish"],
    "users": ["create", "read", "update", "delete", "assign_role"],
    "audit_logs": ["read"],
    "configuration": ["manage"]
  }
}
```

### 2. ADMINISTRADOR DEPORTIVO

```json
{
  "role": "SPORTS_ADMIN",
  "permissions": {
    "teams": ["read", "update"],
    "players": ["read", "update", "approve", "reject"],
    "documents": ["read", "validate"],
    "games": ["create", "read", "update", "finalize"],
    "rounds": ["read", "generate", "manage"],
    "fields": ["read", "manage"],
    "referees": ["read", "assign"],
    "statistics": ["read", "update"],
    "announcements": ["create", "publish"]
  }
}
```

### 3. ADMINISTRADOR FINANCIERO

```json
{
  "role": "FINANCE_ADMIN",
  "permissions": {
    "finances": ["create", "read", "update", "delete"],
    "payments": ["read", "update"],
    "reports": ["generate"]
  }
}
```

### 4. MANAGER / ENCARGADO DE EQUIPO

```json
{
  "role": "TEAM_MANAGER",
  "scope": "own_team_only",
  "permissions": {
    "players": ["create", "read", "update_own"],
    "documents": ["upload", "read_own"],
    "team_info": ["read", "update"],
    "roster": ["read", "view"],
    "statistics": ["read"],
    "calendar": ["read"],
    "results": ["read"],
    "payments": ["read"],
    "announcements": ["read"]
  },
  "restrictions": {
    "cannot_approve_own_players": true,
    "cannot_modify_official_results": true,
    "cannot_view_other_teams": true
  }
}
```

### 5. ÁRBITRO

```json
{
  "role": "REFEREE",
  "permissions": {
    "games_assigned": ["read", "record_events", "record_stats", "select_mvp"],
    "game_details": ["read"],
    "standings": ["read"],
    "announcements": ["read"]
  },
  "restrictions": {
    "can_only_edit_assigned_games": true,
    "cannot_finalize_game": false
  }
}
```

### 6. PÚBLICO / USUARIO REGISTRADO

```json
{
  "role": "PUBLIC_USER",
  "permissions": {
    "standings": ["read"],
    "results": ["read"],
    "schedules": ["read"],
    "public_profiles": ["read"],
    "rankings": ["read"],
    "announcements": ["read"]
  },
  "restrictions": {
    "cannot_view_private_documents": true,
    "cannot_view_emails": true,
    "cannot_view_phone_numbers": true
  }
}
```

---

## FLUJOS DE USUARIO

### FLUJO 1: REGISTRO DE JUGADOR (Manager)

```
1. Manager entra a "Mi Equipo"
   ├─ Ve resumen de equipo
   ├─ Ve estado de jugadores
   └─ Opción "Agregar Jugador"

2. Formulario de Registro
   ├─ Nombre, apellidos
   ├─ Fecha de nacimiento
   ├─ Número de jersey
   ├─ Posición (WR, RB, DEF, etc)
   └─ Botón: Continuar

3. Carga de Documentos
   ├─ Fotografía
   ├─ Identificación Frente
   ├─ Identificación Reverso
   └─ Botón: Guardar

4. Sistema
   ├─ Valida que todos los campos requeridos estén completos
   ├─ Guarda en estado: PENDING_REVIEW
   ├─ Notifica al admin
   └─ Manager ve: "Pendiente de Revisión ⏳"

5. Admin revisa
   ├─ Ve foto y documentos
   ├─ Verifica legibilidad
   └─ Aprueba o solicita corrección

6. Manager recibe notificación
   ├─ Si APROBADO → Jugador está ELEGIBLE ✅
   ├─ Si RECHAZADO → Ve motivo y puede subir nuevos docs
   └─ Si CORRECCIÓN → Puede actualizar documentos

7. Cuando está APROBADO
   ├─ Estado visual: 🟢 ELEGIBLE
   ├─ Aparece en ROSTER OFICIAL
   └─ Puede jugar en partidos
```

### FLUJO 2: VALIDACIÓN DE JUGADORES (Admin)

```
1. Admin entra a "Validación de Jugadores"
   └─ Ve lista de PENDING_REVIEW

2. Admin selecciona un jugador
   ├─ Ve foto (grande)
   ├─ Información personal
   ├─ Equipo y categoría
   ├─ Número de jersey
   ├─ Identificación frente (preview)
   ├─ Identificación reverso (preview)
   └─ Botones:
       ├─ ✅ APROBAR
       ├─ 🔙 SOLICITAR CORRECCIÓN
       └─ ❌ RECHAZAR

3. Si RECHAZA
   ├─ Campo: "Motivo de rechazo"
   ├─ Ejemplo: "La foto de identificación no es legible"
   └─ Botón: Enviar

4. Si SOLICITA CORRECCIÓN
   ├─ Campo: "¿Qué debe corregir?"
   ├─ Ejemplo: "Por favor, subir identificación reverso"
   └─ Botón: Enviar

5. Sistema
   ├─ Actualiza estado del jugador
   ├─ Notifica al manager
   ├─ Log: Quién, cuándo, qué cambio

6. Manager recibe notificación
   ├─ Lee el motivo
   ├─ Sube nuevos documentos
   └─ Admin revisa de nuevo
```

### FLUJO 3: PARTIDA EN VIVO (Árbitro)

```
1. Árbitro entra a "Mis Partidos Asignados"
   ├─ Ve lista de partidos del día
   └─ Selecciona partido

2. Interfaz de Árbitro (MODO ÁRBITRO)
   ├─ Pantalla completa
   ├─ Diseño: EXTREMADAMENTE SENCILLO
   ├─ Muestra:
   │   ├─ SHARKS 0
   │   ├─ EAGLES 0
   │   ├─ CAMPO 1
   │   ├─ 7:00 PM
   │   └─ Árbitro 1 (Yo) / Árbitro 2 (Nombre)
   │
   └─ Botones Grandes (Touch-Friendly)
       ├─ + TD SHARKS
       ├─ + TD EAGLES
       ├─ Estadísticas (colapsa panel inferior)
       └─ ⚙️ Opciones

3. Si presiona "Estadísticas"
   ├─ Selecciona EQUIPO
   ├─ Selecciona JUGADOR (con número visible)
   ├─ **INDICADOR: 🟢 ELEGIBLE o 🔴 NO ELEGIBLE**
   ├─ Selecciona ACCIÓN:
   │   ├─ Pase Completo
   │   ├─ Recepción
   │   ├─ Yardas
   │   ├─ TD
   │   ├─ Rush
   │   ├─ Intercepción
   │   ├─ Tackle
   │   ├─ Sack
   │   └─ Pase Defendido
   │
   └─ Botón: ✓ Registrar

4. Sistema sincroniza en TIEMPO REAL
   ├─ Árbitro 1 registra
   ├─ Árbitro 2 lo ve inmediatamente
   └─ Base de datos actualizada

5. Árbitro puede
   ├─ Ver resumen de cuarto
   ├─ Deshacer última jugada
   └─ Cambiar marcador si es necesario

6. Árbitro selecciona MVP
   ├─ MVP Ofensivo
   ├─ MVP Defensivo
   └─ Botón: Confirmar

7. Árbitro finaliza
   ├─ Revisa resumen final
   ├─ Confirma marcador
   ├─ Botón: FINALIZAR PARTIDO
   └─ Sistema actualiza:
       ├─ Tabla
       ├─ Rankings
       ├─ Estadísticas
       └─ Power Ranking
```

### FLUJO 4: GENERACIÓN DE JORNADA (Admin)

```
1. Admin en "Gestión de Jornadas"
   └─ Botón: "GENERAR PRÓXIMA JORNADA"

2. Sistema calcula automáticamente
   ├─ Cantidad de equipos
   ├─ Categorías
   ├─ Enfrentamientos previos
   ├─ Partidos jugados por cada equipo
   ├─ Distribución de descansos
   ├─ Balance de campos
   ├─ Horarios disponibles
   ├─ Árbitros disponibles
   └─ Genera PROPUESTA

3. Admin ve PROPUESTA
   ├─ Lista de partidos
   ├─ Equipos vs Equipos
   ├─ Horarios
   ├─ Campos
   ├─ Árbitros asignados
   ├─ Equipos con descanso
   └─ Botones:
       ├─ ✅ PUBLICAR (si aprueba)
       ├─ 🔧 AJUSTAR MANUAL (si necesita cambiar)
       └─ ❌ CANCELAR

4. Si AJUSTA MANUAL
   ├─ Puede cambiar:
   │   ├─ Horarios
   │   ├─ Campos
   │   ├─ Árbitros
   │   └─ Equipos en descanso
   └─ Vuelve a proponer

5. Si PUBLICA
   ├─ Sistema guarda jornada
   ├─ Calcula cambios en tabla (proyectado)
   ├─ Notifica a managers
   ├─ Notifica a árbitros
   └─ Publica en calendario público
```

---

## MAPA DE PÁGINAS

### ESTRUCTURA GENERAL

```
📱 MOBILE / DESKTOP

├─ 🔐 AUTENTICACIÓN
│  ├─ Login
│  ├─ Registro
│  ├─ Recuperar Contraseña
│  └─ Verificar Email
│
├─ 👤 PERFIL PÚBLICO (Sin login)
│  ├─ / Inicio
│  ├─ /standings Tabla de Posiciones
│  ├─ /rankings Leaderboards
│  ├─ /schedule Calendario
│  ├─ /results Resultados
│  ├─ /players/:id Perfil Jugador
│  ├─ /teams/:id Perfil Equipo
│  ├─ /announcements Comunicados
│  └─ /hall-of-fame Hall de la Fama
│
├─ 🏋️ DASHBOARD MANAGER (Team Manager)
│  ├─ /manager Dashboard Principal
│  │  ├─ Resumen de equipo
│  │  ├─ Próximo partido
│  │  ├─ Estado de jugadores
│  │  ├─ Alertas pendientes
│  │  └─ Pagos pendientes
│  │
│  ├─ /manager/team Mi Equipo
│  │  ├─ Información del equipo
│  │  ├─ Logo y colores
│  │  ├─ Managers
│  │  └─ Contacto
│  │
│  ├─ /manager/players Mis Jugadores
│  │  ├─ Lista de jugadores
│  │  ├─ Estado de cada uno (✅ Aprobado, ⏳ Pendiente, ❌ Corrección)
│  │  ├─ Filtro por estado
│  │  └─ Botón: + AGREGAR JUGADOR
│  │
│  ├─ /manager/players/add Agregar Jugador
│  │  ├─ Formulario
│  │  ├─ Carga de fotos
│  │  ├─ Carga de documentos
│  │  └─ Botón: Guardar
│  │
│  ├─ /manager/players/:id Detalle Jugador
│  │  ├─ Información personal
│  │  ├─ Documentos (estado de cada uno)
│  │  ├─ Historial de cambios
│  │  ├─ Motivo de rechazo (si aplica)
│  │  └─ Botón: ACTUALIZAR DOCUMENTOS (si pendiente)
│  │
│  ├─ /manager/roster Roster Oficial
│  │  ├─ Lista final de jugadores aprobados
│  │  ├─ Número, nombre, posición
│  │  └─ Detalles de cada uno
│  │
│  ├─ /manager/calendar Calendario
│  │  ├─ Vista de jornadas
│  │  ├─ Próximos partidos
│  │  ├─ Histórico
│  │  └─ Detalles de cada partido
│  │
│  ├─ /manager/results Resultados
│  │  ├─ Resultados recientes
│  │  ├─ Detalles completos
│  │  └─ Estadísticas del equipo
│  │
│  ├─ /manager/statistics Estadísticas
│  │  ├─ Estadísticas ofensivas
│  │  ├─ Estadísticas defensivas
│  │  ├─ Líderes del equipo
│  │  └─ Gráficas
│  │
│  ├─ /manager/payments Pagos
│  │  ├─ Estado financiero
│  │  ├─ Total, pagado, pendiente
│  │  └─ Historial de pagos
│  │
│  └─ /manager/announcements Comunicados
│     └─ Noticias de la liga
│
├─ 🏟️ DASHBOARD ÁRBITRO (Referee)
│  ├─ /referee Dashboard
│  │  ├─ Partidos asignados
│  │  ├─ Próximo partido
│  │  └─ Historial
│  │
│  ├─ /referee/game/:id MODO ÁRBITRO (Lo más importante)
│  │  ├─ Interfaz simplificada
│  │  ├─ Marcador grande
│  │  ├─ Botones TD
│  │  ├─ Panel de estadísticas
│  │  ├─ Listado de jugadores con elegibilidad
│  │  └─ Selección de MVP
│  │
│  └─ /referee/statistics Estadísticas
│     └─ Resumen de partidos
│
├─ 👨‍💼 DASHBOARD ADMIN (Administrator)
│  ├─ /admin Dashboard Principal
│  │  ├─ KPI principales
│  │  ├─ Últimas acciones
│  │  ├─ Alertas importantes
│  │  └─ Próximas jornadas
│  │
│  ├─ /admin/seasons Temporadas
│  │  ├─ Lista de temporadas
│  │  ├─ Crear temporada
│  │  └─ Detalles de temporada
│  │
│  ├─ /admin/categories Categorías
│  │  ├─ M / F / Mix
│  │  └─ Gestión
│  │
│  ├─ /admin/teams Equipos
│  │  ├─ Lista de equipos
│  │  ├─ Estado de cada uno
│  │  ├─ Crear equipo
│  │  ├─ Asignar managers
│  │  └─ Suspender si es necesario
│  │
│  ├─ /admin/players Jugadores
│  │  ├─ Vista global
│  │  ├─ Filtros por equipo, estado, etc
│  │  └─ Búsqueda
│  │
│  ├─ /admin/players/validation VALIDACIÓN DE JUGADORES ⭐
│  │  ├─ Cola de pendientes
│  │  ├─ Vista rápida de documentos
│  │  ├─ Botones: Aprobar, Rechazar, Solicitar Corrección
│  │  ├─ Campo para motivo
│  │  └─ Log de acciones
│  │
│  ├─ /admin/documents Gestión de Documentos
│  │  ├─ Historial de cargas
│  │  ├─ Versiones
│  │  ├─ Control de acceso
│  │  └─ Auditoría
│  │
│  ├─ /admin/rounds Jornadas
│  │  ├─ Lista de jornadas
│  │  ├─ Botón: GENERAR PRÓXIMA JORNADA
│  │  ├─ Vista de propuesta
│  │  ├─ Edición manual
│  │  └─ Publicar
│  │
│  ├─ /admin/games Partidos
│  │  ├─ Lista de todos
│  │  ├─ Crear partido manual
│  │  ├─ Editar horario
│  │  ├─ Ver resultados
│  │  ├─ Modificar resultados (solo admin)
│  │  └─ Finalmente revisar
│  │
│  ├─ /admin/fields Campos
│  │  ├─ Gestión de campos
│  │  ├─ Horarios disponibles
│  │  └─ Capacidad
│  │
│  ├─ /admin/referees Árbitros
│  │  ├─ Lista de árbitros
│  │  ├─ Crear árbitro
│  │  ├─ Asignar partidos
│  │  ├─ Ver historial
│  │  └─ Certificación
│  │
│  ├─ /admin/statistics Estadísticas
│  │  ├─ Tabla de posiciones
│  │  ├─ Rankings
│  │  ├─ Power Ranking
│  │  ├─ MVP
│  │  ├─ Récords
│  │  └─ Recalcular si es necesario
│  │
│  ├─ /admin/finances Finanzas
│  │  ├─ Ingresos
│  │  ├─ Gastos
│  │  ├─ Balance
│  │  ├─ Pagos por equipo
│  │  ├─ Cuentas por cobrar
│  │  └─ Reportes
│  │
│  ├─ /admin/playoffs Playoffs
│  │  ├─ Configurar playoff
│  │  ├─ Seleccionar equipos
│  │  ├─ Generar brackets
│  │  ├─ Ver resultados
│  │  └─ Seleccionar campeones
│  │
│  ├─ /admin/announcements Comunicados
│  │  ├─ Crear anuncio
│  │  ├─ Publicar
│  │  ├─ Ver historial
│  │  └─ Editar/Eliminar
│  │
│  ├─ /admin/users Usuarios
│  │  ├─ Gestión de usuarios
│  │  ├─ Asignar roles
│  │  ├─ Activar/Desactivar
│  │  └─ Historial de acceso
│  │
│  ├─ /admin/audit Auditoría
│  │  ├─ Log de cambios
│  │  ├─ Filtro por usuario, fecha, acción
│  │  ├─ Valores anteriores y nuevos
│  │  └─ IP de acceso
│  │
│  ├─ /admin/configuration Configuración
│  │  ├─ Datos de la liga
│  │  ├─ Horarios de jornadas
│  │  ├─ Reglas
│  │  ├─ Tamaño máximo de documentos
│  │  ├─ Extensiones permitidas
│  │  └─ Notificaciones
│  │
│  └─ /admin/center-jornada CENTRO DE JORNADA ⭐
│     ├─ Vista en vivo de todos los partidos
│     ├─ Estado de cada campo
│     ├─ Marcadores en tiempo real
│     ├─ Próximos partidos
│     └─ Panel de control
│
├─ 🎉 EXPERIENCIA POST-JORNADA (Automática)
│  ├─ Resumen de jornada
│  ├─ Tabla actualizada
│  ├─ MVP ofensivo
│  ├─ MVP defensivo
│  ├─ Líderes
│  ├─ Power Ranking
│  ├─ Rachas
│  └─ Próxima jornada
│
└─ 📊 ANALÍTICOS Y REPORTES
   ├─ /analytics Dashboard de análisis
   ├─ /reports Reportes personalizados
   ├─ /social Social content generator
   └─ /export Exportar datos
```

---

## ALGORITMOS CLAVE

### ALGORITMO 1: GENERACIÓN DE ENFRENTAMIENTOS (Round Robin Modified)

```pseudocode
FUNCIÓN GenerarEnfrentamientos(equipos[], descansosPrevios{})

  // Entrada: Lista de equipos, histórico de descansos

  PARA cada categoría:
    equiposCategoria = FiltrarPorCategoria(equipos)
    
    SI equiposCategoria.length es impar:
      // Agregar equipo fantasma para descanso
      equiposFantasma = CreaEquipoFantasma()
      equiposCategoria.push(equiposFantasma)
    
    enfrentamientos = []
    
    PARA cada ronda de round-robin:
      FOR i = 0 hasta equiposCategoria.length/2:
        equipo_a = equiposCategoria[i]
        equipo_b = equiposCategoria[length - 1 - i]
        
        // Verificar que no se hayan enfrentado recientemente
        SI PuedoEnfrentar(equipo_a, equipo_b):
          enfrentamiento = CreaEnfrentamiento(equipo_a, equipo_b)
          enfrentamientos.push(enfrentamiento)
        SINO:
          // Buscar alternativa
          alternativa = EncontrarAlternativa(equipo_b, enfrentamientos)
          enfrentamiento = CreaEnfrentamiento(equipo_a, alternativa)
          enfrentamientos.push(enfrentamiento)
      
      // Rotar lista
      equiposCategoria = RotarLista(equiposCategoria)
    
    RETORNAR enfrentamientos

FUNCIÓN CalcularDescansos(equipos[], enfrentamientos[])

  // Distribuir descansos equitativamente

  descansosPorEquipo = {}
  
  PARA cada equipo:
    descansosPorEquipo[equipo] = 0
  
  PARA cada enfrentamiento:
    SI enfrentamiento.equipo_a == NULL:
      descansosPorEquipo[equipo_fantasma] += 1
  
  // Verificar balance
  promedio = CalcularPromedio(descansosPorEquipo)
  
  PARA cada equipo:
    diferencia = descansosPorEquipo[equipo] - promedio
    SI ABS(diferencia) > 1:
      GenerarAlerta("Descansos desbalanceados")

RETORNAR descansosPorEquipo
```

### ALGORITMO 2: ASIGNACIÓN DE ÁRBITROS

```pseudocode
FUNCIÓN AsignarArbitros(partidos[], arbitros[])

  PARA cada partido:
    // Buscar árbitro con menos partidos asignados
    arb1 = BuscarArbitroDisponible(arbitros, partido.fecha)
    arb2 = BuscarArbitroDisponible(arbitros, partido.fecha, EXCLUIR: arb1)
    
    // Verificar que no hayan arbitrado muchas veces
    SI arb1.partidos_asignados > promedio:
      arb1 = BuscarProximo()
    
    SI arb2.partidos_asignados > promedio:
      arb2 = BuscarProximo()
    
    // Asignar
    partido.referee1 = arb1
    partido.referee2 = arb2
    
    // Registrar
    arb1.partidos_asignados += 1
    arb2.partidos_asignados += 1

RETORNAR partidos_con_arbitros
```

### ALGORITMO 3: CÁLCULO AUTOMÁTICO DE TABLA

```pseudocode
FUNCIÓN CalcularTabla(games[], season_id, category_id)

  standings = {}
  
  PARA cada equipo en la temporada:
    standings[equipo] = {
      played: 0,
      wins: 0,
      losses: 0,
      ties: 0,
      points_for: 0,
      points_against: 0,
      difference: 0,
      points: 0,
      streak: [],
      last_results: []
    }
  
  PARA cada partido FINALIZADO en season y category:
    home_team = partido.home_team
    away_team = partido.away_team
    home_score = partido.home_score
    away_score = partido.away_score
    
    standings[home_team].played += 1
    standings[away_team].played += 1
    
    standings[home_team].points_for += home_score
    standings[away_team].points_for += away_score
    
    standings[home_team].points_against += away_score
    standings[away_team].points_against += home_score
    
    SI home_score > away_score:
      standings[home_team].wins += 1
      standings[away_team].losses += 1
      standings[home_team].points += 2  // O 3 según reglas
      standings[home_team].streak.push("W")
      standings[away_team].streak.push("L")
    SINO SI home_score < away_score:
      standings[away_team].wins += 1
      standings[home_team].losses += 1
      standings[away_team].points += 2
      standings[away_team].streak.push("W")
      standings[home_team].streak.push("L")
    SINO:
      standings[home_team].ties += 1
      standings[away_team].ties += 1
      standings[home_team].points += 1
      standings[away_team].points += 1
      standings[home_team].streak.push("T")
      standings[away_team].streak.push("T")
    
    standings[home_team].difference = standings[home_team].points_for - standings[home_team].points_against
    standings[away_team].difference = standings[away_team].points_for - standings[away_team].points_against
    
    // Calcular racha
    standings[home_team].current_streak = CalcularRacha(standings[home_team].streak)
    standings[away_team].current_streak = CalcularRacha(standings[away_team].streak)
  
  // Ordenar
  standings_sorted = OrdenarPor(standings, ['points', 'difference', 'points_for'])
  
  RETORNAR standings_sorted
```

### ALGORITMO 4: RANKING DE JUGADORES

```pseudocode
FUNCIÓN GenerarRankings(season_id, category_id)

  rankings = {
    touchdowns: [],
    yards: [],
    receptions: [],
    interceptions: [],
    tackles: [],
    sacks: [],
    best_offensive: [],
    best_defensive: []
  }
  
  PARA cada jugador en season y category:
    stats = CalcularEstadisticasJugador(jugador, season_id, category_id)
    
    rankings.touchdowns.push({
      jugador: jugador,
      valor: stats.td
    })
    
    rankings.yards.push({
      jugador: jugador,
      valor: stats.total_yards
    })
    
    // ... más estadísticas
  
  // Ordenar cada ranking
  rankings.touchdowns = OrdenarDesc(rankings.touchdowns, 'valor')
  rankings.yards = OrdenarDesc(rankings.yards, 'valor')
  // ... más
  
  RETORNAR rankings
```

### ALGORITMO 5: POWER RANKING

```pseudocode
FUNCIÓN CalcularPowerRanking(equipos[], games[])

  power_ranking = []
  
  PARA cada equipo:
    puntos_power = 0
    
    // Factor 1: Victorias recientes (últimas 5 jornadas)
    recientes = FiltrarÚltimosPartidos(equipo, 5)
    victorias_recientes = ContarVictorias(recientes)
    puntos_power += victorias_recientes * 3
    
    // Factor 2: Diferencia de puntos
    diferencia = CalcularDiferencia(equipo)
    puntos_power += diferencia * 0.5
    
    // Factor 3: Racha actual
    racha = CalcularRacha(equipo)
    SI racha > 0:
      puntos_power += racha * 2
    SINO SI racha < 0:
      puntos_power -= ABS(racha) * 1
    
    // Factor 4: Fuerza de rivales (SOS - Strength of Schedule)
    sos = CalcularSOS(equipo)
    puntos_power += sos * 0.3
    
    // Factor 5: Estadísticas ofensivas y defensivas
    eficiencia_ofensiva = CalcularEficienciaOfensiva(equipo)
    eficiencia_defensiva = CalcularEficienciaDefensiva(equipo)
    puntos_power += eficiencia_ofensiva * 1.5
    puntos_power += eficiencia_defensiva * 1.5
    
    power_ranking.push({
      equipo: equipo,
      puntos: puntos_power,
      cambio: CalcularCambioAnterior(equipo)
    })
  
  // Ordenar
  power_ranking = OrdenarDesc(power_ranking, 'puntos')
  
  RETORNAR power_ranking
```

---

## SISTEMA DE ESTADÍSTICAS

### Estadísticas Ofensivas

```json
{
  "offensive_stats": {
    "passing": {
      "completions": "Pases completados",
      "attempts": "Intentos de pase",
      "yards": "Yardas de pase",
      "touchdowns": "TD de pase",
      "interceptions": "Intercepciones lanzadas",
      "completion_percentage": "AUTO: Completions / Attempts * 100",
      "yards_per_attempt": "AUTO: Yards / Attempts",
      "td_per_attempt": "AUTO: TD / Attempts"
    },
    "receiving": {
      "receptions": "Recepciones",
      "yards": "Yardas de recepción",
      "touchdowns": "TD de recepción",
      "yards_per_reception": "AUTO: Yards / Receptions"
    },
    "rushing": {
      "carries": "Acarreos",
      "yards": "Yardas terrestres",
      "touchdowns": "TD terrestres",
      "yards_per_carry": "AUTO: Yards / Carries"
    },
    "combined": {
      "total_yards": "AUTO: Passing Yards + Receiving Yards + Rushing Yards",
      "total_touchdowns": "AUTO: Pass TD + Rec TD + Rush TD"
    }
  }
}
```

### Estadísticas Defensivas

```json
{
  "defensive_stats": {
    "tackles": "Tackles/Flags",
    "interceptions": "Intercepciones",
    "sacks": "Sacks",
    "passes_defended": "Pases defendidos",
    "touchdowns": "TD defensivos",
    "forced_fumbles": "Fumbles forzados (opcional)",
    "safety": "Safeties (opcional)"
  }
}
```

### Cálculos Automáticos

```
Tabla de Posiciones:
├─ Puntos: WIN=2, TIE=1, LOSS=0
├─ Diferencia: PF - PA
├─ Racha: Últimas 3 jugadas (WWW, WLW, etc)
└─ Actualización: Automática después de cada partido

Rankings:
├─ Por jugador
├─ Por equipo
├─ Filtrable por jornada
└─ Actualización: Automática en tiempo real

Power Ranking:
├─ Cálculo múltifactorial
├─ Victorias recientes (peso mayor)
├─ Diferencia de puntos
├─ Racha actual
├─ Fuerza de rivales
├─ Eficiencia ofensiva y defensiva
└─ Actualización: Después de cada jornada

MVP:
├─ Sugerencias automáticas (basadas en stats)
├─ Confirmación manual del árbitro/admin
├─ Por jornada y por torneo
└─ Registro completo
```

---

## AUTOMATIZACIONES

### Automatización 1: Después de Cada Partido

```
EVENTO: Árbitro finaliza partido

├─ Sistema calcula automáticamente:
│  ├─ Tabla de posiciones
│  ├─ Cambios en rankings
│  ├─ Nuevas rachas
│  ├─ Récords rotos
│  ├─ MVP candidatos
│  ├─ Cambios en Power Ranking
│  └─ Estadísticas acumuladas
│
├─ Sistema notifica:
│  ├─ Managers (resultado de su equipo)
│  ├─ Árbitros (confirmación de datos)
│  ├─ Admin (para revisión)
│  └─ Público (en feed)
│
└─ Sistema genera:
   └─ Card para redes sociales
```

### Automatización 2: Después de Cada Jornada

```
EVENTO: Últimos partidos de jornada finalizados

├─ Sistema calcula:
│  ├─ Tabla final de jornada
│  ├─ MVP ofensivo y defensivo (si no se seleccionó)
│  ├─ Líderes de estadísticas
│  ├─ Rachas importantes
│  ├─ Records rotos
│  ├─ Cambios en Power Ranking
│  └─ Proyecciones para próxima jornada
│
├─ Sistema genera RESUMEN DE JORNADA:
│  ├─ Resultados
│  ├─ Tabla actualizada
│  ├─ MVP ofensivo
│  ├─ MVP defensivo
│  ├─ Líderes destacados
│  ├─ Rachas
│  ├─ Récords
│  ├─ Próxima jornada
│  └─ Recomendaciones
│
├─ Sistema notifica:
│  ├─ Todos los managers
│  ├─ Público en redes
│  └─ Email a suscriptores
│
└─ Sistema prepara:
   ├─ Propuesta de siguiente jornada
   └─ Alertas para admin
```

### Automatización 3: Validación de Documentos

```
EVENTO: Manager sube documento

├─ Sistema valida automáticamente:
│  ├─ Formato (JPG, PNG, PDF)
│  ├─ Tamaño (máx configurado)
│  ├─ Resolución mínima (si es foto)
│  └─ Completitud
│
├─ Sistema notifica al manager:
│  ├─ Si VÁLIDO: "Documento subido correctamente"
│  ├─ Si INVÁLIDO: Especifica el problema
│  └─ Puede reintentar
│
└─ Si todos los documentos están:
   └─ Notifica a admin para revisión
```

### Automatización 4: Notificaciones Programadas

```
Sistema envía automáticamente:

├─ 7 días antes de jornada:
│  ├─ Reminder a managers: "Próxima jornada en 7 días"
│  └─ Reminder a árbitros: "Partidos asignados próxima semana"
│
├─ 2 días antes de jornada:
│  ├─ Confirmación de equipos
│  └─ Cambios de horario si hay
│
├─ 1 día antes de jornada:
│  ├─ Últimos recordatorios
│  └─ Información de campos
│
├─ Día de jornada:
│  ├─ Actualización de horarios
│  ├─ Cambios de última hora
│  └─ Información del árbitro
│
├─ Cuando se rechaza documentación:
│  └─ Email con motivo detallado
│
├─ Cuando se aprueba jugador:
│  ├─ Notificación al manager
│  └─ Notificación al jugador (si tiene email)
│
├─ Reminders de pago:
│  ├─ 7 días antes del vencimiento
│  ├─ 3 días antes
│  ├─ Día del vencimiento
│  └─ Recordatorios semanales después de vencer
│
└─ Recordatorio de playoff:
   └─ Cuando quedan 3 jornadas
```

---

## SEGURIDAD Y PRIVACIDAD

### Niveles de Acceso a Documentos

```
┌─────────────────────────────────────────────────────────┐
│ DOCUMENTOS DE JUGADOR (ID, Fotos)                       │
├─────────────────────────────────────────────────────────┤
│ ACCESO PERMITIDO:                                       │
│  ├─ SUPER_ADMIN (acceso completo)                      │
│  ├─ SPORTS_ADMIN (acceso completo)                     │
│  ├─ Manager del equipo (solo de sus propios jugadores) │
│  └─ El jugador (ver sus propios documentos)            │
│                                                         │
│ ACCESO DENEGADO:                                        │
│  ├─ Público                                             │
│  ├─ Otros managers                                      │
│  ├─ Árbitros                                            │
│  ├─ Perfiles públicos                                   │
│  └─ Redes sociales                                      │
└─────────────────────────────────────────────────────────┘
```

### Almacenamiento Seguro

```
Información Sensible (Documentos):
├─ Almacenar en S3/Cloudinary con encriptación
├─ URLs firmadas con expiración
├─ Acceso solo mediante autenticación
├─ No permitir descarga directa
├─ No cachear en navegador
├─ Registrar cada acceso en AuditLogs
└─ Eliminar después de temporada si se configura

Contraseñas:
├─ Hash con bcrypt (min 10 rounds)
├─ Nunca almacenar en plano
├─ Regenerar si se expone
└─ Requeri cambio periódico (90 días)

JWT Tokens:
├─ Expiración: 1 hora (access token)
├─ Refresh token: 7 días
├─ Incluir rol en payload
├─ Verificación en cada request
└─ Revocación en logout

API Keys:
├─ Usar para integraciones externas
├─ Almacenar en .env (nunca en código)
├─ Rotar regularmente
└─ Logging de uso
```

### Auditoría

```
Registrar AUTOMÁTICAMENTE:
├─ Acceso a documentos sensibles
│  └─ Usuario, fecha, hora, IP
│
├─ Cambios en estados de jugador
│  └─ Anterior, nuevo, usuario, motivo
│
├─ Modificaciones de resultados
│  └─ Marcador anterior, nuevo, diferencia, usuario
│
├─ Aprobaciones y rechazos
│  └─ Jugador, motivo, reviewer, timestamp
│
├─ Cambios en tabla de posiciones
│  └─ Situación anterior, nueva, timestamp
│
├─ Acceso a reportes financieros
│  └─ Usuario, fecha, datos consultados
│
└─ Cambios de rol o permisos
   └─ Anterior, nuevo, admin, timestamp

Auditoría NO EDITABLE:
├─ Todos los logs son de solo lectura
├─ Se almacenan de forma inmutable
└─ Pueden ser consultados solo por SUPER_ADMIN
```

### Separación de Información

```
PÚBLICA (Visible para todos):
├─ Nombre del jugador
├─ Número de jersey
├─ Equipo
├─ Posición
├─ Fotografía (autorizada)
├─ Estadísticas
├─ Reconocimientos
├─ Resultados
├─ Tabla de posiciones
├─ Rankings
├─ Calendario
└─ MVP

PRIVADA (Solo manager y admin):
├─ Email
├─ Teléfono
├─ Fecha completa de nacimiento
├─ Dirección
├─ Información del registro
└─ Estado de documentos

SENSIBLE (Solo admin autorizado):
├─ Identificación oficial
├─ Fotos de documento
├─ Información bancaria (pagos)
├─ Datos de auditoría completa
└─ Logs de acceso
```

---

## PLAN DE DESARROLLO

### FASE 1: CORE (2-3 semanas)

**Objetivo:** Base sólida del sistema

**Tareas:**
```
SEMANA 1-2: Infraestructura
├─ Setup de proyecto (React + Express + PostgreSQL)
├─ Configuración de DB
├─ Sistema de autenticación (JWT)
├─ Roles y permisos básicos
├─ CRUD de usuarios
├─ CRUD de temporadas
├─ CRUD de categorías
├─ CRUD de equipos
├─ CRUD de managers de equipos
├─ Dashboard básico para roles
└─ Deploy inicial (CI/CD)

SEMANA 2-3: Jugadores y Documentos
├─ Modelo de jugadores
├─ Sistema de carga de documentos
├─ Validación de archivos
├─ Almacenamiento seguro (S3)
├─ Flujo de aprobación básico
├─ Estados de jugador (PENDING, APPROVED, REJECTED)
├─ Sistema de auditoría básico
├─ Notificaciones por email (setup)
└─ Testing E2E del flujo de registro
```

**Deliverables:**
- ✅ Sistema de login funcional
- ✅ Registro de jugadores completo
- ✅ Validación básica de documentos
- ✅ Dashboard de manager
- ✅ Dashboard de admin (gestión de usuarios)

---

### FASE 2: COMPETENCIA (2-3 semanas)

**Objetivo:** Sistema de partidos y jornadas

**Tareas:**
```
SEMANA 1: Configuración de Competencia
├─ CRUD de campos
├─ CRUD de árbitros
├─ Configuración de horarios
├─ CRUD de jornadas
├─ Generador de enfrentamientos (algoritmo Round Robin)
├─ Cálculo de descansos
├─ Asignación de árbitros
└─ Asignación de horarios y campos

SEMANA 2: Partidos y Modo Árbitro
├─ Modelo de partidos completo
├─ Interfaz MODO ÁRBITRO (EXTREMADAMENTE sencilla)
├─ Registro en tiempo real
├─ Sincronización entre dos árbitros
├─ Registro de eventos (TD, Sack, etc)
├─ Selección de MVP
├─ Finalización de partidos
└─ Validación de elegibilidad en vivo

SEMANA 3: Centro de Jornada
├─ Dashboard de partidos en vivo
├─ Vista de todos los campos simultáneamente
├─ Marcadores en tiempo real
├─ Estado de cada partido
├─ Próximos partidos
├─ Cambios de horario en vivo
└─ Panel de control del administrador
```

**Deliverables:**
- ✅ Generación de jornadas automática
- ✅ Modo Árbitro funcional (mobile-optimized)
- ✅ Sincronización en tiempo real entre árbitros
- ✅ Centro de Jornada
- ✅ Asignación automática de árbitros

---

### FASE 3: ESTADÍSTICAS (1-2 semanas)

**Objetivo:** Cálculos y visualización de datos

**Tareas:**
```
SEMANA 1: Estadísticas Básicas
├─ Recopilación de eventos en partidos
├─ Cálculo automático de estadísticas por jugador
├─ Cálculo automático de estadísticas por equipo
├─ Derivadas (%), promedios, totales
└─ API de estadísticas

SEMANA 2: Rankings y Clasificación
├─ Tabla de posiciones (automática después de cada partido)
├─ Rankings por categoría:
│  ├─ Touchdowns
│  ├─ Yardas
│  ├─ Recepciones
│  ├─ Intercepciones
│  ├─ Tackles
│  └─ Sacks
├─ Power Ranking (cálculo multifactorial)
├─ MVP del torneo vs MVP de jornada
├─ Recordes (más TD, más yardas, etc)
└─ Gráficas y visualizaciones

SEMANA 3: Rastreador de Cambios
├─ Cambios de posición
├─ Rachas
├─ Récords rotos
├─ Tendencias
└─ Predicciones
```

**Deliverables:**
- ✅ Tabla de posiciones automática
- ✅ Rankings en tiempo real
- ✅ Power Ranking
- ✅ MVP automáticos sugeridos
- ✅ Récords calculados

---

### FASE 4: FINANZAS (1 semana)

**Objetivo:** Gestión financiera de la liga

**Tareas:**
```
├─ Modelo de pagos
├─ Modelo de gastos
├─ Modelo de ingresos
├─ Cuentas por cobrar
├─ Dashboard de finanzas
├─ Reportes por equipo
├─ Reportes consolidados
├─ Alertas de pagos vencidos
├─ Recordatorios automáticos
└─ Integración con métodos de pago (opcional para fase inicial)
```

**Deliverables:**
- ✅ Seguimiento de pagos por equipo
- ✅ Dashboard de ingresos/gastos
- ✅ Reportes financieros
- ✅ Cuentas por cobrar

---

### FASE 5: EXPERIENCIA Y COMUNICACIÓN (1-2 semanas)

**Objetivo:** Pulir experiencia del usuario

**Tareas:**
```
SEMANA 1: Perfiles y Tarjetas
├─ Perfil público del jugador
├─ Perfil público del equipo
├─ Tarjetas digitales (Player Card, Team Card)
├─ MVP Cards
├─ Tarjetas de récords
├─ Tarjetas de rachas
└─ Compatibilidad con redes sociales

SEMANA 2: Comunicación
├─ Sistema de notificaciones completo
├─ Email personalizado
├─ WhatsApp (via Twilio - opcional)
├─ Push notifications (opcional)
├─ Sistema de comunicados
├─ Social content generator
├─ Portal público mejorado
└─ Feed de noticias

SEMANA 3: Experiencia Post-Jornada
├─ Generación automática de resumen
├─ Gráficas de desempeño
├─ Insights automáticos
├─ Rachas y tendencias
├─ Siguiente jornada
└─ Contenido para redes sociales
```

**Deliverables:**
- ✅ Perfiles públicos pulidos
- ✅ Tarjetas compartibles
- ✅ Resumen automático de jornada
- ✅ Sistema de notificaciones completo
- ✅ Feed de redes sociales generado

---

### FASE 6: PLAYOFFS E HISTORIA (1 semana)

**Objetivo:** Cierre de temporada y registro histórico

**Tareas:**
```
├─ Sistema de playoffs (4, 6, 8, 10, 12 equipos)
├─ Generación automática de brackets
├─ Visualización de playoffs
├─ Cálculo de campeones
├─ Registro de campeones por categoría
├─ MVP ofensivo y defensivo del torneo
├─ Hall de la Fama
├─ Récords históricos
├─ Estadísticas acumuladas por temporada
├─ Archivado de temporada anterior
└─ Preparación para próxima temporada
```

**Deliverables:**
- ✅ Sistema de playoffs automático
- ✅ Campeones registrados
- ✅ Hall of Fame
- ✅ Historial de temporadas

---

## CHECKLIST TÉCNICO ANTES DE INICIAR

```
ANTES DE ESCRIBIR UNA LÍNEA DE CÓDIGO:

[ ] Arquitectura de DB completamente definida
[ ] Relaciones entre tablas claras
[ ] Índices identificados
[ ] Roles y permisos especificados
[ ] Flujos de usuario documentados
[ ] Mapa de páginas completado
[ ] Algoritmos detallados
[ ] Seguridad planificada
[ ] Estrategia de testing definida
[ ] Hosting/infraestructura decidida
[ ] Dominios y DNS configurados
[ ] Variables de entorno documentadas
[ ] Estrategia de backup definida
[ ] Plan de escalabilidad futuro
[ ] Documentación de API planeada
[ ] Versionado de código (git flow)
[ ] Proceso de deploy definido
[ ] Monitoreo y alertas planificados
```

---

## SIGUIENTES PASOS

✅ **Documento de Arquitectura Completado**

El siguiente paso es:

1. **Validar esta arquitectura** con el equipo
2. **Crear diagrama ER detallado** en herramienta de DB
3. **Definir wireframes** de pantallas clave
4. **Comenzar FASE 1: CORE** con setup del proyecto

¿Deseas proceder con:
- [ ] Refinamiento de esta arquitectura
- [ ] Creación de wireframes
- [ ] Setup del proyecto (Fase 1)
- [ ] Documento de especificaciones adicionales

---

**Documento preparado para:**  
**Master Flag League - Cancún, QR, México**  
**Temporada 2026**
