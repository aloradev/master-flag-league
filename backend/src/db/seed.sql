-- ============================================================
-- DATOS BASE — idempotente (ON CONFLICT DO NOTHING)
-- ============================================================

-- ---------- ROLES Y PERMISOS (req. 3) ----------
INSERT INTO roles (id, name, label, permissions) VALUES
('role_super_admin', 'SUPER_ADMIN', 'Super Administrador', '{
  "leagues":["create","read","update","delete"],
  "seasons":["create","read","update","delete"],
  "categories":["create","read","update","delete"],
  "teams":["create","read","update","delete","suspend"],
  "players":["create","read","update","delete","approve","reject"],
  "documents":["read","validate","delete"],
  "fields":["create","read","update","delete"],
  "referees":["create","read","update","delete","assign"],
  "games":["create","read","update","delete","finalize","modify_score"],
  "rounds":["create","read","update","delete","generate"],
  "statistics":["read","recalculate"],
  "finances":["create","read","update","delete"],
  "users":["create","read","update","delete","assign_role"],
  "audit_logs":["read"],
  "settings":["read","update"]
}'),
('role_sports_admin', 'SPORTS_ADMIN', 'Administrador Deportivo', '{
  "teams":["read","update"],
  "players":["read","update","approve","reject"],
  "documents":["read","validate"],
  "fields":["read","update"],
  "referees":["read","assign"],
  "games":["create","read","update","finalize"],
  "rounds":["read","generate","update"],
  "statistics":["read","update"]
}'),
('role_finance_admin', 'FINANCE_ADMIN', 'Administrador Financiero', '{
  "finances":["create","read","update","delete"],
  "payments":["read","update"],
  "teams":["read"],
  "reports":["generate"]
}'),
('role_team_manager', 'TEAM_MANAGER', 'Manager de Equipo', '{
  "players":["create","read","update_own"],
  "documents":["upload","read_own"],
  "team_info":["read","update"],
  "statistics":["read"],
  "payments":["read"]
}'),
('role_referee', 'REFEREE', 'Árbitro', '{
  "games":["read_assigned","record_events","record_stats","select_mvp"],
  "standings":["read"]
}'),
('role_public', 'PUBLIC_USER', 'Público', '{
  "standings":["read"],
  "results":["read"],
  "schedules":["read"],
  "announcements":["read"]
}')
ON CONFLICT (name) DO UPDATE SET permissions = EXCLUDED.permissions, label = EXCLUDED.label;

-- ---------- LIGA INICIAL: CANCÚN ----------
INSERT INTO leagues (id, name, slug, city, state, timezone) VALUES
('league_cancun', 'Liga de Flag Football Cancún', 'cancun', 'Cancún', 'Quintana Roo', 'America/Cancun')
ON CONFLICT (slug) DO NOTHING;

-- ---------- TEMPORADA 2026 ----------
INSERT INTO seasons (id, league_id, name, year, start_date, registration_deadline, default_start_time, require_approval_to_play, status) VALUES
('season_2026', 'league_cancun', 'Temporada 2026', 2026, '2026-09-12', '2026-09-10', '19:00', TRUE, 'ACTIVE')
ON CONFLICT (id) DO NOTHING;

-- ---------- CATEGORÍAS ----------
INSERT INTO categories (id, season_id, name, slug, color, sort_order) VALUES
('cat_varonil_2026', 'season_2026', 'Varonil', 'varonil', '#2563eb', 1),
('cat_femenil_2026', 'season_2026', 'Femenil', 'femenil', '#db2777', 2),
('cat_mixto_2026',   'season_2026', 'Mixto',   'mixto',   '#7c3aed', 3)
ON CONFLICT (season_id, slug) DO NOTHING;

-- ---------- CAMPOS ----------
INSERT INTO fields (id, season_id, name, status) VALUES
('field_1_2026', 'season_2026', 'Campo 1', 'ACTIVE'),
('field_2_2026', 'season_2026', 'Campo 2', 'ACTIVE')
ON CONFLICT (season_id, name) DO NOTHING;

-- ---------- CONFIGURACIÓN DE DOCUMENTOS (req. 6) ----------
INSERT INTO settings (id, league_id, season_id, key, value) VALUES
('set_docs_2026', 'league_cancun', 'season_2026', 'documents', '{
  "required": ["PHOTO", "ID_FRONT", "ID_BACK"],
  "allowed_mime": ["image/jpeg", "image/png", "application/pdf"],
  "max_size_mb": 5
}'),
('set_times_2026', 'league_cancun', 'season_2026', 'game_times', '{
  "slots": ["19:00", "20:00", "21:00"]
}'),
-- Reglas de competencia. Están aquí y no en el código para que la liga
-- pueda cambiar el valor de una victoria sin un despliegue, y para que una
-- segunda liga pueda usar otras sin tocar nada.
('set_comp_2026', 'league_cancun', 'season_2026', 'competition', '{
  "points_win": 3,
  "points_draw": 1,
  "points_loss": 0,
  "walkover_score": [20, 0],
  "periods": 2,
  "tiebreakers": ["wins", "point_diff", "points_for", "points_against"],
  "rounds_planned": 10
}'),
-- Montos en CENTAVOS enteros. Las fechas de vencimiento NO se configuran
-- aquí: la de la inscripción es el cierre de registro de la temporada y
-- la de cada jornada es la fecha de esa jornada. Son datos que el
-- sistema ya tiene, así que no se teclean dos veces ni pueden
-- contradecirse.
('set_fin_2026', 'league_cancun', 'season_2026', 'finance', '{
  "currency": "MXN",
  "inscription_cents": 100000,
  "round_fee_cents": 50000,
  "referee_fee_cents": 25000
}')
-- Estos valores son únicamente el punto de partida. En producción el
-- migrador corre en cada arranque, así que actualizar el conflicto aquí
-- borraría cualquier cambio hecho desde las pantallas de Temporada o
-- Finanzas. Una configuración existente pertenece a la liga, no al seed.
ON CONFLICT (league_id, season_id, key) DO NOTHING;
