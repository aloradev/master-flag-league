-- ============================================================
-- MASTER FLAG LEAGUE — Esquema FASE 1 (CORE)
-- Idempotente: se puede correr varias veces sin efectos.
-- ============================================================

-- ---------- MULTI-TENANCY: LIGAS ----------
-- Base de la escalabilidad (req. 54): cada liga es un tenant
-- independiente con sus propias temporadas, equipos y usuarios.
CREATE TABLE IF NOT EXISTS leagues (
  id            VARCHAR(36) PRIMARY KEY,
  name          VARCHAR(255) NOT NULL,
  slug          VARCHAR(100) UNIQUE NOT NULL,
  city          VARCHAR(120),
  state         VARCHAR(120),
  country       VARCHAR(120) DEFAULT 'México',
  sport         VARCHAR(60)  DEFAULT 'FLAG_FOOTBALL',
  timezone      VARCHAR(60)  DEFAULT 'America/Cancun',
  logo_url      TEXT,
  status        VARCHAR(30)  DEFAULT 'ACTIVE',
  created_at    TIMESTAMPTZ  DEFAULT NOW()
);

-- ---------- ROLES ----------
CREATE TABLE IF NOT EXISTS roles (
  id            VARCHAR(36) PRIMARY KEY,
  name          VARCHAR(50) UNIQUE NOT NULL,
  label         VARCHAR(120),
  permissions   JSONB DEFAULT '{}',
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ---------- USUARIOS ----------
CREATE TABLE IF NOT EXISTS users (
  id            VARCHAR(36) PRIMARY KEY,
  league_id     VARCHAR(36) REFERENCES leagues(id) ON DELETE CASCADE,
  email         VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  name          VARCHAR(255) NOT NULL,
  phone         VARCHAR(30),
  role_id       VARCHAR(36) NOT NULL REFERENCES roles(id),
  active        BOOLEAN DEFAULT TRUE,
  must_change_password BOOLEAN DEFAULT FALSE,
  last_login_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ---------- TEMPORADAS ----------
CREATE TABLE IF NOT EXISTS seasons (
  id                    VARCHAR(36) PRIMARY KEY,
  league_id             VARCHAR(36) NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  name                  VARCHAR(255) NOT NULL,
  year                  INTEGER NOT NULL,
  start_date            DATE NOT NULL,
  end_date              DATE,
  -- Req. 10: fecha límite para registrar jugadores
  registration_deadline DATE,
  -- Req. 9: si TRUE, solo jugadores aprobados pueden participar
  require_approval_to_play BOOLEAN DEFAULT TRUE,
  default_start_time    TIME DEFAULT '19:00',
  status                VARCHAR(30) DEFAULT 'ACTIVE',
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

-- ---------- CATEGORÍAS ----------
CREATE TABLE IF NOT EXISTS categories (
  id            VARCHAR(36) PRIMARY KEY,
  season_id     VARCHAR(36) NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  name          VARCHAR(60) NOT NULL,
  slug          VARCHAR(60) NOT NULL,
  color         VARCHAR(20) DEFAULT '#667eea',
  sort_order    INTEGER DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (season_id, slug)
);

-- ---------- EQUIPOS ----------
CREATE TABLE IF NOT EXISTS teams (
  id               VARCHAR(36) PRIMARY KEY,
  season_id        VARCHAR(36) NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  category_id      VARCHAR(36) NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  name             VARCHAR(255) NOT NULL,
  short_name       VARCHAR(20),
  logo_url         TEXT,
  image_url        TEXT,
  color_primary    VARCHAR(20) DEFAULT '#1f2937',
  color_secondary  VARCHAR(20) DEFAULT '#f9fafb',
  status           VARCHAR(30) DEFAULT 'ACTIVE',
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (season_id, category_id, name)
);

-- ---------- MANAGERS DE EQUIPO (req. 4: 2 encargados) ----------
CREATE TABLE IF NOT EXISTS team_users (
  id            VARCHAR(36) PRIMARY KEY,
  team_id       VARCHAR(36) NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id       VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role          VARCHAR(30) DEFAULT 'MANAGER',
  joined_at     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (team_id, user_id)
);

-- ---------- JUGADORES ----------
CREATE TABLE IF NOT EXISTS players (
  id                    VARCHAR(36) PRIMARY KEY,
  team_id               VARCHAR(36) NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  season_id             VARCHAR(36) NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  category_id           VARCHAR(36) NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  first_name            VARCHAR(120) NOT NULL,
  last_name_paternal    VARCHAR(120) NOT NULL,
  last_name_maternal    VARCHAR(120),
  date_of_birth         DATE NOT NULL,
  jersey_number         INTEGER,
  position              VARCHAR(60),
  photo_url             TEXT,
  phone                 VARCHAR(30),
  email                 VARCHAR(255),
  -- Req. 7: 🟡 PENDING / 🟢 APPROVED / 🔴 REJECTED / ⚫ BLOCKED
  status                VARCHAR(40) DEFAULT 'PENDING',
  -- Req. 9 + sugerencia final: elegibilidad CALCULADA, nunca capturada
  is_eligible           BOOLEAN DEFAULT FALSE,
  eligibility_reason    TEXT,
  -- Campos adicionales configurables (req. 5)
  extra_fields          JSONB DEFAULT '{}',
  registered_by_user_id VARCHAR(36) REFERENCES users(id),
  reviewed_by_user_id   VARCHAR(36) REFERENCES users(id),
  reviewed_at           TIMESTAMPTZ,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (team_id, jersey_number)
);

-- ---------- DOCUMENTOS (req. 6, 11, 12) ----------
-- Versionado: is_current marca la versión vigente y conserva el historial.
CREATE TABLE IF NOT EXISTS player_documents (
  id                    VARCHAR(36) PRIMARY KEY,
  player_id             VARCHAR(36) NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  document_type         VARCHAR(40) NOT NULL,  -- PHOTO | ID_FRONT | ID_BACK
  file_url              TEXT NOT NULL,
  storage_key           TEXT,
  mime_type             VARCHAR(100),
  file_size             INTEGER,
  version               INTEGER DEFAULT 1,
  is_current            BOOLEAN DEFAULT TRUE,
  status                VARCHAR(40) DEFAULT 'PENDING',
  review_notes          TEXT,
  uploaded_by_user_id   VARCHAR(36) REFERENCES users(id),
  uploaded_at           TIMESTAMPTZ DEFAULT NOW()
);

-- ---------- HISTORIAL DE APROBACIONES (req. 8) ----------
CREATE TABLE IF NOT EXISTS player_approvals (
  id                    VARCHAR(36) PRIMARY KEY,
  player_id             VARCHAR(36) NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  action                VARCHAR(40) NOT NULL,  -- APPROVE | REJECT | REQUEST_CORRECTION | BLOCK
  previous_status       VARCHAR(40),
  new_status            VARCHAR(40),
  reason                TEXT,
  reviewed_by_user_id   VARCHAR(36) REFERENCES users(id),
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

-- ---------- CAMPOS ----------
CREATE TABLE IF NOT EXISTS fields (
  id            VARCHAR(36) PRIMARY KEY,
  season_id     VARCHAR(36) NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  name          VARCHAR(120) NOT NULL,
  location      TEXT,
  capacity      INTEGER,
  status        VARCHAR(30) DEFAULT 'ACTIVE',
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (season_id, name)
);

-- ---------- ÁRBITROS ----------
CREATE TABLE IF NOT EXISTS referees (
  id              VARCHAR(36) PRIMARY KEY,
  season_id       VARCHAR(36) NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  user_id         VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
  name            VARCHAR(255) NOT NULL,
  phone           VARCHAR(30),
  badge_number    VARCHAR(40),
  certified       BOOLEAN DEFAULT FALSE,
  status          VARCHAR(30) DEFAULT 'ACTIVE',
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ---------- CONFIGURACIÓN (req. 5, 6) ----------
CREATE TABLE IF NOT EXISTS settings (
  id            VARCHAR(36) PRIMARY KEY,
  league_id     VARCHAR(36) REFERENCES leagues(id) ON DELETE CASCADE,
  season_id     VARCHAR(36) REFERENCES seasons(id) ON DELETE CASCADE,
  key           VARCHAR(120) NOT NULL,
  value         JSONB NOT NULL,
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (league_id, season_id, key)
);

-- ---------- AUDITORÍA (req. 42) ----------
CREATE TABLE IF NOT EXISTS audit_logs (
  id            VARCHAR(36) PRIMARY KEY,
  league_id     VARCHAR(36),
  user_id       VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
  user_email    VARCHAR(255),
  action        VARCHAR(120) NOT NULL,
  entity_type   VARCHAR(80),
  entity_id     VARCHAR(36),
  old_value     JSONB,
  new_value     JSONB,
  ip_address    VARCHAR(60),
  user_agent    TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ---------- ÍNDICES ----------
CREATE INDEX IF NOT EXISTS idx_users_email        ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_league       ON users(league_id);
CREATE INDEX IF NOT EXISTS idx_seasons_league     ON seasons(league_id);
CREATE INDEX IF NOT EXISTS idx_categories_season  ON categories(season_id);
CREATE INDEX IF NOT EXISTS idx_teams_season       ON teams(season_id);
CREATE INDEX IF NOT EXISTS idx_teams_category     ON teams(category_id);
CREATE INDEX IF NOT EXISTS idx_team_users_team    ON team_users(team_id);
CREATE INDEX IF NOT EXISTS idx_team_users_user    ON team_users(user_id);
CREATE INDEX IF NOT EXISTS idx_players_team       ON players(team_id);
CREATE INDEX IF NOT EXISTS idx_players_season     ON players(season_id);
CREATE INDEX IF NOT EXISTS idx_players_status     ON players(status);
CREATE INDEX IF NOT EXISTS idx_players_eligible   ON players(is_eligible);
CREATE INDEX IF NOT EXISTS idx_docs_player        ON player_documents(player_id);
CREATE INDEX IF NOT EXISTS idx_docs_current       ON player_documents(player_id, document_type, is_current);
CREATE INDEX IF NOT EXISTS idx_approvals_player   ON player_approvals(player_id);
CREATE INDEX IF NOT EXISTS idx_audit_user         ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_created      ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_entity       ON audit_logs(entity_type, entity_id);
