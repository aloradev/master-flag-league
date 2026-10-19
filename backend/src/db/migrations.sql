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
  logo_storage_key TEXT,
  image_url        TEXT,
  color_primary    VARCHAR(20) DEFAULT '#1f2937',
  color_secondary  VARCHAR(20) DEFAULT '#f9fafb',
  status           VARCHAR(30) DEFAULT 'ACTIVE',
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (season_id, category_id, name)
);

ALTER TABLE teams ADD COLUMN IF NOT EXISTS team_type VARCHAR(20) NOT NULL DEFAULT 'OFFICIAL';
UPDATE teams SET team_type = 'SCRIMMAGE' WHERE team_type = 'OFFICIAL' AND name LIKE 'Scrimmage · %';
DO $$ BEGIN
  ALTER TABLE teams ADD CONSTRAINT teams_team_type_check CHECK (team_type IN ('OFFICIAL', 'SCRIMMAGE'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

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
  -- Original privado (endpoint autenticado) y derivado público de 512 px.
  photo_url             TEXT,
  avatar_url            TEXT,
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

-- ============================================================
-- FASE 2 — COMPETENCIA
-- ============================================================

-- ---------- JORNADAS ----------
CREATE TABLE IF NOT EXISTS rounds (
  id              VARCHAR(36) PRIMARY KEY,
  season_id       VARCHAR(36) NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  number          INTEGER NOT NULL,
  name            VARCHAR(120),
  scheduled_date  DATE NOT NULL,
  -- DRAFT: propuesta que solo ve el administrador. Nadie más debe enterarse
  -- de un calendario que todavía puede cambiar.
  status          VARCHAR(30) NOT NULL DEFAULT 'DRAFT',
  notes           TEXT,
  generated_by    VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
  published_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (season_id, number),
  CHECK (status IN ('DRAFT', 'PUBLISHED', 'IN_PROGRESS', 'FINISHED', 'CANCELLED'))
);

-- ---------- HORARIOS DE CADA JORNADA ----------
-- Los horarios cambian de una jornada a otra, así que son filas y no
-- columnas: el administrador agrega o quita tandas sin migrar nada.
--
-- De aquí sale el límite real de la noche. Con 2 campos y 3 horarios caben
-- 6 partidos; si los equipos inscritos necesitan más, alguien descansa.
-- Esa cuenta la hace el generador, no el usuario.
CREATE TABLE IF NOT EXISTS round_time_slots (
  id          VARCHAR(36) PRIMARY KEY,
  round_id    VARCHAR(36) NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  start_time  TIME NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  UNIQUE (round_id, start_time)
);

-- ---------- PARTIDOS ----------
CREATE TABLE IF NOT EXISTS games (
  id                      VARCHAR(36) PRIMARY KEY,
  season_id               VARCHAR(36) NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  round_id                VARCHAR(36) NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  category_id             VARCHAR(36) NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  field_id                VARCHAR(36) REFERENCES fields(id) ON DELETE SET NULL,
  home_team_id            VARCHAR(36) NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  away_team_id            VARCHAR(36) NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  scheduled_time          TIME NOT NULL,
  status                  VARCHAR(30) NOT NULL DEFAULT 'SCHEDULED',
  -- Caché derivada de game_events, igual que players.is_eligible: se
  -- recalcula en cada registro. Se guarda para que la tabla de posiciones
  -- y el centro de jornada no tengan que sumar eventos en cada consulta.
  home_score              INTEGER NOT NULL DEFAULT 0,
  away_score              INTEGER NOT NULL DEFAULT 0,
  -- La única excepción a lo anterior: un partido ganado por incomparecencia
  -- no tiene eventos que sumar, el marcador lo dicta el reglamento.
  walkover_team_id        VARCHAR(36) REFERENCES teams(id) ON DELETE SET NULL,
  mvp_offensive_player_id VARCHAR(36) REFERENCES players(id) ON DELETE SET NULL,
  mvp_defensive_player_id VARCHAR(36) REFERENCES players(id) ON DELETE SET NULL,
  started_at              TIMESTAMPTZ,
  ended_at                TIMESTAMPTZ,
  closed_by               VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
  notes                   TEXT,
  created_at              TIMESTAMPTZ DEFAULT NOW(),
  updated_at              TIMESTAMPTZ DEFAULT NOW(),
  CHECK (home_team_id <> away_team_id),
  CHECK (status IN ('SCHEDULED', 'LIVE', 'FINISHED', 'CANCELLED', 'WALKOVER', 'POSTPONED'))
);
ALTER TABLE games ADD COLUMN IF NOT EXISTS game_type VARCHAR(20) NOT NULL DEFAULT 'OFFICIAL';
ALTER TABLE games ADD COLUMN IF NOT EXISTS scrimmage_access_revoked_at TIMESTAMPTZ;
DO $$ BEGIN
  ALTER TABLE games ADD CONSTRAINT games_game_type_check CHECK (game_type IN ('OFFICIAL','SCRIMMAGE'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Un campo no puede tener dos partidos a la misma hora. Esto sí se puede
-- expresar como índice, así que se expresa: la validación en el servicio
-- puede olvidarse en un endpoint nuevo, la base no.
CREATE UNIQUE INDEX IF NOT EXISTS uq_games_campo_hora
  ON games(round_id, field_id, scheduled_time)
  WHERE field_id IS NOT NULL AND status <> 'CANCELLED';

-- ---------- ÁRBITROS ASIGNADOS ----------
-- Tabla en lugar de columnas referee1_id/referee2_id: así la consulta de
-- choques ("¿este árbitro ya tiene partido a esta hora?") es un JOIN normal
-- en vez de un OR sobre dos columnas, y un partido puede llevar un tercero
-- sin migrar la tabla de partidos.
CREATE TABLE IF NOT EXISTS game_referees (
  id           VARCHAR(36) PRIMARY KEY,
  game_id      VARCHAR(36) NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  referee_id   VARCHAR(36) NOT NULL REFERENCES referees(id) ON DELETE CASCADE,
  role         VARCHAR(20) NOT NULL DEFAULT 'PRINCIPAL',
  assigned_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (game_id, referee_id),
  UNIQUE (game_id, role),
  CHECK (role IN ('PRINCIPAL', 'AUXILIAR'))
);

-- ---------- EVENTOS DEL PARTIDO ----------
CREATE TABLE IF NOT EXISTS game_events (
  id           VARCHAR(36) PRIMARY KEY,
  game_id      VARCHAR(36) NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  team_id      VARCHAR(36) NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  player_id    VARCHAR(36) REFERENCES players(id) ON DELETE SET NULL,
  event_type   VARCHAR(40) NOT NULL,
  -- Los puntos se copian del catálogo al registrar, no se consultan al
  -- mostrar. Si mañana el reglamento cambia el valor de una jugada, los
  -- partidos ya jugados conservan el marcador con el que se jugaron.
  points       INTEGER NOT NULL DEFAULT 0,
  quarter      INTEGER,
  yards        INTEGER,
  -- Los dos árbitros escriben sobre el mismo partido; hay que saber quién.
  recorded_by  VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
  -- "Deshacer" anula, no borra. Con dos árbitros registrando a la vez, un
  -- DELETE dejaría un hueco imposible de explicar después del partido.
  voided_at    TIMESTAMPTZ,
  voided_by    VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ---------- DESCANSOS ----------
-- El descanso es un hecho de la jornada, no la ausencia de un partido:
-- se registra por qué descansa el equipo, porque "sobra uno" y "no
-- alcanzaron los horarios" se resuelven distinto la jornada siguiente.
CREATE TABLE IF NOT EXISTS round_byes (
  id          VARCHAR(36) PRIMARY KEY,
  round_id    VARCHAR(36) NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  team_id     VARCHAR(36) NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  reason      VARCHAR(40) NOT NULL DEFAULT 'ODD_TEAMS',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (round_id, team_id),
  CHECK (reason IN ('ODD_TEAMS', 'CAPACITY', 'MANUAL'))
);

-- Un equipo no puede jugar dos veces la misma noche, y eso no se puede
-- expresar como UNIQUE porque el equipo aparece en cualquiera de dos
-- columnas. Va como disparador para que también proteja los ajustes
-- manuales del administrador, no solo lo que produce el generador.
CREATE OR REPLACE FUNCTION check_equipo_una_vez_por_jornada()
RETURNS TRIGGER AS $$
DECLARE
  choque INTEGER;
  permite_repetidos BOOLEAN;
BEGIN
  IF NEW.status = 'CANCELLED' THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(allow_team_repeats, FALSE) INTO permite_repetidos
  FROM rounds WHERE id = NEW.round_id;
  IF permite_repetidos THEN
    IF (SELECT COUNT(*) FROM games g WHERE g.round_id=NEW.round_id AND g.id<>NEW.id
      AND g.status<>'CANCELLED' AND NEW.home_team_id IN (g.home_team_id,g.away_team_id)) >= 2
      OR (SELECT COUNT(*) FROM games g WHERE g.round_id=NEW.round_id AND g.id<>NEW.id
      AND g.status<>'CANCELLED' AND NEW.away_team_id IN (g.home_team_id,g.away_team_id)) >= 2 THEN
      RAISE EXCEPTION 'Un equipo puede jugar como máximo dos partidos por jornada' USING ERRCODE='check_violation';
    END IF;
    RETURN NEW;
  END IF;

  SELECT COUNT(*) INTO choque
  FROM games g
  WHERE g.round_id = NEW.round_id
    AND g.id <> NEW.id
    AND g.status <> 'CANCELLED'
    AND (NEW.home_team_id IN (g.home_team_id, g.away_team_id)
      OR NEW.away_team_id IN (g.home_team_id, g.away_team_id));

  IF choque > 0 THEN
    RAISE EXCEPTION 'Uno de los equipos ya tiene partido en esta jornada'
      USING ERRCODE = 'unique_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_equipo_una_vez_por_jornada ON games;
CREATE TRIGGER trg_equipo_una_vez_por_jornada
  BEFORE INSERT OR UPDATE OF round_id, home_team_id, away_team_id, status ON games
  FOR EACH ROW EXECUTE FUNCTION check_equipo_una_vez_por_jornada();

CREATE INDEX IF NOT EXISTS idx_rounds_season      ON rounds(season_id, number);
CREATE INDEX IF NOT EXISTS idx_slots_round        ON round_time_slots(round_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_games_round        ON games(round_id);
CREATE INDEX IF NOT EXISTS idx_games_categoria    ON games(category_id, status);
CREATE INDEX IF NOT EXISTS idx_games_local        ON games(home_team_id);
CREATE INDEX IF NOT EXISTS idx_games_visitante    ON games(away_team_id);
CREATE INDEX IF NOT EXISTS idx_game_refs_arbitro  ON game_referees(referee_id);
CREATE INDEX IF NOT EXISTS idx_eventos_partido    ON game_events(game_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_eventos_jugador    ON game_events(player_id) WHERE voided_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_byes_round         ON round_byes(round_id);

-- ============================================================
-- FASE 4 — FINANZAS
-- ============================================================
--
-- El documento de arquitectura contemplaba UNA tabla `payments` con
-- amount, due_date, paid_date y status. Se separó en dos, y conviene
-- saber por qué: en una sola tabla, un equipo que paga la mitad de su
-- inscripción no cabe en ninguna parte —hay que inventar un segundo
-- registro o sobrescribir el monto—, y `status` termina siendo algo que
-- una persona teclea. Con cargos y pagos separados, el saldo es una
-- resta y el estado se deduce; nadie marca "PAGADO" a mano, se registra
-- un pago y el estado sigue solo. Es el mismo principio que sostiene
-- players.is_eligible y el marcador de los partidos.
--
-- Todo el dinero va en CENTAVOS ENTEROS. No en NUMERIC ni en decimales
-- flotantes: 0.1 + 0.2 no es 0.3 en punto flotante, y el driver de
-- Postgres devuelve NUMERIC como cadena para no perder precisión, lo
-- que obliga a convertir en cada consulta y abre la puerta a que alguien
-- convierta con parseFloat. Con enteros, sumar es sumar.

-- ---------- CARGOS: lo que el equipo DEBE ----------
CREATE TABLE IF NOT EXISTS fees (
  id            VARCHAR(36) PRIMARY KEY,
  season_id     VARCHAR(36) NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  team_id       VARCHAR(36) NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  concept       VARCHAR(40) NOT NULL,
  description   VARCHAR(255),
  amount_cents  INTEGER NOT NULL,
  due_date      DATE NOT NULL,
  -- Cuando el cargo nace de una jornada se guarda cuál: así el generador
  -- no lo cobra dos veces y el equipo ve de qué noche viene.
  round_id      VARCHAR(36) REFERENCES rounds(id) ON DELETE SET NULL,
  -- Un cargo mal hecho se CANCELA, no se borra: la cuenta de la liga
  -- tiene que poder explicarse completa meses después.
  cancelled_at  TIMESTAMPTZ,
  cancelled_by  VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
  cancel_reason TEXT,
  created_by    VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  CHECK (amount_cents > 0),
  CHECK (concept IN ('INSCRIPTION', 'ROUND', 'FINE', 'OTHER'))
);

-- Un solo cargo de inscripción por equipo y temporada, y uno de
-- arbitraje por equipo y jornada. Sin esto, correr el generador de
-- cargos dos veces cobraría doble y nadie lo notaría hasta que un
-- encargado reclamara.
CREATE UNIQUE INDEX IF NOT EXISTS uq_fees_inscripcion
  ON fees(season_id, team_id)
  WHERE concept = 'INSCRIPTION' AND cancelled_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_fees_jornada
  ON fees(round_id, team_id)
  WHERE concept = 'ROUND' AND cancelled_at IS NULL;

-- ---------- PAGOS: dinero RECIBIDO ----------
-- `fee_id` es obligatorio a propósito. Se consideró permitir el abono
-- suelto —"me dieron mil pesos"— y se descartó: un peso sin concepto
-- obliga a adivinar a qué se aplicó, y ese es justo el dato que se
-- necesita cuando un equipo pregunta qué le falta. Un pago que cubre
-- dos cargos se registra como dos renglones, que es lo que debería
-- decir el recibo de todas formas.
CREATE TABLE IF NOT EXISTS payments (
  id            VARCHAR(36) PRIMARY KEY,
  season_id     VARCHAR(36) NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  team_id       VARCHAR(36) NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  fee_id        VARCHAR(36) NOT NULL REFERENCES fees(id) ON DELETE CASCADE,
  amount_cents  INTEGER NOT NULL,
  paid_on       DATE NOT NULL,
  method        VARCHAR(30) NOT NULL DEFAULT 'CASH',
  -- Folio de transferencia o del recibo entregado.
  reference     VARCHAR(120),
  notes         TEXT,
  voided_at     TIMESTAMPTZ,
  voided_by     VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
  void_reason   TEXT,
  recorded_by   VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  CHECK (amount_cents > 0),
  CHECK (method IN ('CASH', 'TRANSFER', 'CARD', 'OTHER'))
);

-- ---------- GASTOS ----------
CREATE TABLE IF NOT EXISTS expenses (
  id            VARCHAR(36) PRIMARY KEY,
  season_id     VARCHAR(36) NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  category      VARCHAR(40) NOT NULL,
  description   VARCHAR(255) NOT NULL,
  amount_cents  INTEGER NOT NULL,
  spent_on      DATE NOT NULL,
  -- El pago a los árbitros es el gasto que se repite cada jornada, así
  -- que se puede atar a la noche y al árbitro y dejar de ser un texto
  -- libre imposible de sumar por persona.
  round_id      VARCHAR(36) REFERENCES rounds(id) ON DELETE SET NULL,
  referee_id    VARCHAR(36) REFERENCES referees(id) ON DELETE SET NULL,
  voided_at     TIMESTAMPTZ,
  voided_by     VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
  void_reason   TEXT,
  recorded_by   VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  CHECK (amount_cents > 0),
  CHECK (category IN ('REFEREES', 'FIELDS', 'EQUIPMENT', 'AWARDS', 'ADMIN', 'OTHER'))
);

CREATE INDEX IF NOT EXISTS idx_fees_equipo       ON fees(team_id) WHERE cancelled_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_fees_temporada    ON fees(season_id, due_date);
CREATE INDEX IF NOT EXISTS idx_fees_jornada      ON fees(round_id);
CREATE INDEX IF NOT EXISTS idx_pagos_cargo       ON payments(fee_id) WHERE voided_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_pagos_equipo      ON payments(team_id, paid_on DESC);
CREATE INDEX IF NOT EXISTS idx_gastos_temporada  ON expenses(season_id, spent_on DESC);
CREATE INDEX IF NOT EXISTS idx_gastos_arbitro    ON expenses(referee_id) WHERE voided_at IS NULL;

-- ============================================================
-- MIGRACIONES INCREMENTALES
-- Para bases ya creadas antes de que existieran estas columnas.
-- Postgres 9.6+ soporta IF NOT EXISTS en ADD COLUMN, así que esto
-- es seguro de correr en cada despliegue.
-- ============================================================
ALTER TABLE players ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE teams   ADD COLUMN IF NOT EXISTS logo_storage_key TEXT;

-- ---------- BAJA DE JUGADORES ----------
-- Reportado usando la aplicación: un jugador que dejó de jugar no se
-- podía quitar del roster. No se borra sin más porque sus anotaciones
-- viven en game_events: borrarlo dejaría touchdowns sin autor y los
-- rankings de la temporada cambiarían hacia atrás. Se marca la baja y
-- desaparece de plantillas, listas y conteos; el historial queda.
ALTER TABLE players ADD COLUMN IF NOT EXISTS removed_at         TIMESTAMPTZ;
ALTER TABLE players ADD COLUMN IF NOT EXISTS removed_by_user_id VARCHAR(36) REFERENCES users(id);
ALTER TABLE players ADD COLUMN IF NOT EXISTS removal_reason     TEXT;

-- El dorsal se libera al dar de baja. Con la restricción de tabla
-- original, el número de quien se fue quedaba bloqueado el resto de la
-- temporada y el equipo no podía dárselo a nadie más.
-- Se busca por definición y no por nombre: si la base se creó con otro
-- nombre de restricción, un DROP ... IF EXISTS literal no encontraría
-- nada, el índice parcial se crearía igual y el dorsal seguiría
-- bloqueado sin que nada lo delatara.
DO $$
DECLARE nombre TEXT;
BEGIN
  SELECT conname INTO nombre
  FROM pg_constraint
  WHERE conrelid = 'players'::regclass
    AND contype = 'u'
    AND pg_get_constraintdef(oid) = 'UNIQUE (team_id, jersey_number)';
  IF nombre IS NOT NULL THEN
    EXECUTE format('ALTER TABLE players DROP CONSTRAINT %I', nombre);
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS idx_players_jersey_activo
  ON players (team_id, jersey_number)
  WHERE removed_at IS NULL AND jersey_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_players_activos
  ON players (team_id) WHERE removed_at IS NULL;

-- ---------- RESTABLECER CONTRASEÑA ----------
-- Antes solo administración podía reponer una contraseña, entregando una
-- temporal a mano. Con veinte encargados eso es un cuello de botella el
-- día del arranque.
--
-- Se guarda el HASH del token, nunca el token: si la base se filtra, no
-- entrega el acceso a las cuentas. Un solo uso y una hora de vida.
CREATE TABLE IF NOT EXISTS password_resets (
  id            VARCHAR(36) PRIMARY KEY,
  user_id       VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash    VARCHAR(64) NOT NULL,
  expires_at    TIMESTAMPTZ NOT NULL,
  used_at       TIMESTAMPTZ,
  -- Quién lo generó: el propio usuario (NULL) o un administrador.
  created_by    VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_reset_token ON password_resets(token_hash);
CREATE INDEX IF NOT EXISTS idx_reset_vigentes
  ON password_resets(user_id, expires_at) WHERE used_at IS NULL;

-- Eliminación directa por categoría. La siembra queda congelada al crear.
CREATE TABLE IF NOT EXISTS playoffs (
  id VARCHAR(36) PRIMARY KEY,
  season_id VARCHAR(36) NOT NULL REFERENCES seasons(id),
  category_id VARCHAR(36) NOT NULL REFERENCES categories(id),
  seeds JSONB NOT NULL,
  slots JSONB NOT NULL,
  stage INTEGER NOT NULL DEFAULT 0,
  champion_id VARCHAR(36) REFERENCES teams(id),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(season_id, category_id)
);
ALTER TABLE rounds ADD COLUMN IF NOT EXISTS playoff_id VARCHAR(36) REFERENCES playoffs(id);
CREATE TABLE IF NOT EXISTS playoff_games (
  playoff_id VARCHAR(36) NOT NULL REFERENCES playoffs(id),
  game_id VARCHAR(36) UNIQUE NOT NULL REFERENCES games(id),
  stage INTEGER NOT NULL,
  slot INTEGER NOT NULL,
  PRIMARY KEY(playoff_id, stage, slot)
);

-- Payload cifrado (puede contener credenciales); se purga al terminar o vencer.
CREATE TABLE IF NOT EXISTS email_jobs (
  id VARCHAR(36) PRIMARY KEY,
  dedupe_key VARCHAR(64) NOT NULL UNIQUE,
  payload TEXT,
  status VARCHAR(16) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','PROCESSING','SENT','FAILED')),
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  lease_token VARCHAR(36),
  lease_until TIMESTAMPTZ,
  last_error VARCHAR(80),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_email_jobs_pending ON email_jobs(next_attempt_at)
  WHERE status IN ('PENDING','PROCESSING');

-- Revocación de sesiones y separación estructural de jornadas de prueba.
ALTER TABLE users ADD COLUMN IF NOT EXISTS session_version INTEGER NOT NULL DEFAULT 0;
CREATE OR REPLACE FUNCTION revoke_changed_user_sessions() RETURNS trigger AS $$
BEGIN
  IF NEW.password_hash IS DISTINCT FROM OLD.password_hash
    OR NEW.role_id IS DISTINCT FROM OLD.role_id
    OR NEW.active IS DISTINCT FROM OLD.active
    OR NEW.league_id IS DISTINCT FROM OLD.league_id THEN
    NEW.session_version := OLD.session_version + 1;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS revoke_changed_user_sessions ON users;
CREATE TRIGGER revoke_changed_user_sessions BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION revoke_changed_user_sessions();

ALTER TABLE rounds ADD COLUMN IF NOT EXISTS round_type VARCHAR(20) NOT NULL DEFAULT 'OFFICIAL';
ALTER TABLE rounds ADD COLUMN IF NOT EXISTS allow_team_repeats BOOLEAN NOT NULL DEFAULT FALSE;
UPDATE rounds ro SET round_type = 'SCRIMMAGE'
 WHERE EXISTS (SELECT 1 FROM games g WHERE g.round_id = ro.id AND g.game_type = 'SCRIMMAGE')
 AND NOT EXISTS (SELECT 1 FROM games g WHERE g.round_id = ro.id AND g.game_type = 'OFFICIAL');
ALTER TABLE rounds DROP CONSTRAINT IF EXISTS rounds_season_id_number_key;
CREATE UNIQUE INDEX IF NOT EXISTS rounds_number_by_type ON rounds(season_id, round_type, number);
-- Cada prueba crea sus participantes; el nombre puede repetirse en otra prueba.
ALTER TABLE teams DROP CONSTRAINT IF EXISTS teams_season_id_category_id_name_key;
CREATE UNIQUE INDEX IF NOT EXISTS official_team_name_unique ON teams(season_id, category_id, name)
 WHERE team_type = 'OFFICIAL';

-- Los resultados históricos no dependen de que se hayan transcrito las jugadas.
ALTER TABLE games ADD COLUMN IF NOT EXISTS score_source VARCHAR(16) NOT NULL DEFAULT 'EVENTS'
  CHECK (score_source IN ('EVENTS', 'MANUAL'));
ALTER TABLE games ADD COLUMN IF NOT EXISTS statistics_status VARCHAR(16) NOT NULL DEFAULT 'COMPLETE'
  CHECK (statistics_status IN ('PENDING', 'COMPLETE'));

-- La fecha deportiva no se deduce del momento de captura en la aplicación.
ALTER TABLE teams ADD COLUMN IF NOT EXISTS competition_start_date DATE;

-- Un total del acta conserva cantidad y yardas acumuladas sin inventar jugadas.
ALTER TABLE game_events ADD COLUMN IF NOT EXISTS quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity BETWEEN 1 AND 100);
ALTER TABLE game_events ADD COLUMN IF NOT EXISTS capture_source VARCHAR(16) NOT NULL DEFAULT 'PLAY'
  CHECK (capture_source IN ('PLAY','TOTALS'));
CREATE TABLE IF NOT EXISTS game_stat_batches (
  id VARCHAR(36) PRIMARY KEY,
  game_id VARCHAR(36) NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  user_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
  request_hash VARCHAR(64) NOT NULL,
  result JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS player_interests (
  id VARCHAR(36) PRIMARY KEY,
  request_id UUID NOT NULL UNIQUE,
  league_id VARCHAR(36) NOT NULL REFERENCES leagues(id),
  name VARCHAR(120) NOT NULL,
  email VARCHAR(255) NOT NULL,
  phone VARCHAR(30),
  category VARCHAR(80) NOT NULL,
  experience VARCHAR(20) NOT NULL CHECK (experience IN ('NEW','CASUAL','EXPERIENCED')),
  availability VARCHAR(300) NOT NULL DEFAULT '',
  status VARCHAR(20) NOT NULL DEFAULT 'NEW' CHECK (status IN ('NEW','CONTACTED','CLOSED')),
  consent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS player_interests_league_status ON player_interests(league_id,status,created_at);

-- Captura temporal por enlace, independiente del registro de jugadores.
CREATE TABLE IF NOT EXISTS game_reports (
 game_id TEXT PRIMARY KEY REFERENCES games(id) ON DELETE CASCADE,
 token_hash TEXT,
 expires_at TIMESTAMPTZ,
 data JSONB NOT NULL DEFAULT '{}'::jsonb,
 revision INTEGER NOT NULL DEFAULT 0,
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- A draft reserves a postponed fixture; publication moves the original match.
ALTER TABLE games ADD COLUMN IF NOT EXISTS postponed_game_id VARCHAR(36) REFERENCES games(id);
CREATE UNIQUE INDEX IF NOT EXISTS unique_postponed_reservation ON games(postponed_game_id) WHERE postponed_game_id IS NOT NULL;

-- Avoid inventing an odd-team bye when first-leg opponents are unavailable.
ALTER TABLE round_byes DROP CONSTRAINT IF EXISTS round_byes_reason_check;
ALTER TABLE round_byes ADD CONSTRAINT round_byes_reason_check CHECK (reason IN ('ODD_TEAMS','CAPACITY','MANUAL','FIRST_LEG'));

-- Club identity for avoiding simultaneous cross-category fixtures.
ALTER TABLE teams ADD COLUMN IF NOT EXISTS club_name VARCHAR(150);
