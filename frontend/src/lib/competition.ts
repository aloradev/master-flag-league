import { api } from './api';

// ─────────────────────────────── TIPOS ────────────────────────────────────

export type RoundStatus = 'DRAFT' | 'PUBLISHED' | 'IN_PROGRESS' | 'FINISHED' | 'CANCELLED';
export type GameStatus =
  | 'SCHEDULED' | 'LIVE' | 'FINISHED' | 'CANCELLED' | 'WALKOVER' | 'POSTPONED';

export interface Jugada {
  label: string;
  points: number;
  side: 'OFFENSE' | 'DEFENSE';
  needsPlayer: boolean;
  primary?: boolean;
}

export interface RefereeRef {
  referee_id: string;
  role: 'PRINCIPAL' | 'AUXILIAR';
  name: string;
  user_id?: string | null;
}

export interface GameEvent {
  id: string;
  team_id: string;
  player_id: string | null;
  event_type: string;
  points: number;
  quarter: number | null;
  yards: number | null;
  recorded_by: string | null;
  recorded_by_name: string | null;
  voided_at: string | null;
  created_at: string;
  label: string;
  player_name: string | null;
  jersey_number: number | null;
}

export interface RosterPlayer {
  id: string;
  first_name: string;
  last_name_paternal: string;
  last_name_maternal: string | null;
  jersey_number: number | null;
  position: string | null;
  is_eligible: boolean;
  eligibility_reason: string | null;
  avatar_url: string | null;
}

export interface Game {
  id: string;
  season_id: string;
  round_id: string;
  category_id: string;
  field_id: string | null;
  home_team_id: string;
  away_team_id: string;
  scheduled_time: string;
  status: GameStatus;
  game_type?: 'OFFICIAL' | 'SCRIMMAGE';
  home_score: number;
  away_score: number;
  score_source?: 'EVENTS' | 'MANUAL';
  statistics_status?: 'PENDING' | 'COMPLETE';
  walkover_team_id: string | null;
  mvp_offensive_player_id: string | null;
  mvp_defensive_player_id: string | null;
  started_at: string | null;
  ended_at: string | null;
  notes: string | null;
  category_name: string;
  category_color: string;
  field_name: string | null;
  round_number: number;
  scheduled_date: string;
  round_status: RoundStatus;
  home_team_name: string;
  home_short_name: string | null;
  home_logo_url: string | null;
  home_color: string | null;
  away_team_name: string;
  away_short_name: string | null;
  away_logo_url: string | null;
  away_color: string | null;
  referees?: RefereeRef[];
  my_role?: 'PRINCIPAL' | 'AUXILIAR';
}

export interface GameDetail extends Game {
  referees: RefereeRef[];
  events: GameEvent[];
  rosters: { home: RosterPlayer[]; away: RosterPlayer[] };
  rules: { periods: number };
  plays: Record<string, Jugada>;
}

export interface GameLive {
  id: string;
  status: GameStatus;
  home_score: number;
  away_score: number;
  home_team_id: string;
  away_team_id: string;
  started_at: string | null;
  ended_at: string | null;
  mvp_offensive_player_id: string | null;
  mvp_defensive_player_id: string | null;
  changes: GameEvent[];
  server_time: string;
}

export interface RoundSummary {
  id: string;
  season_id: string;
  number: number;
  name: string | null;
  scheduled_date: string;
  status: RoundStatus;
  notes: string | null;
  published_at: string | null;
  games_count: number;
  finished_count: number;
  byes_count: number;
  slots: string[];
}

export interface RoundBye {
  team_id: string;
  reason: 'ODD_TEAMS' | 'CAPACITY' | 'MANUAL';
  team_name: string;
  short_name: string | null;
  logo_url: string | null;
  category_id: string;
  category_name: string;
}

export interface RoundDetail extends RoundSummary {
  games: Game[];
  byes: RoundBye[];
  generated_by_name: string | null;
}

/** La propuesta viene en camelCase: es un cálculo, no una fila de la base. */
export interface ProposedGame {
  categoryId: string;
  categoryName: string;
  homeTeamId: string;
  homeTeamName: string;
  awayTeamId: string;
  awayTeamName: string;
  fieldId: string | null;
  fieldName: string | null;
  time: string | null;
  meeting: number;
}

export interface ProposedBye {
  teamId: string;
  teamName: string;
  categoryId: string;
  categoryName: string;
  reason: 'ODD_TEAMS' | 'CAPACITY' | 'MANUAL';
  totalAfter: number;
}

export interface Proposal {
  roundNumber: number;
  scheduledDate: string;
  capacity: number;
  games: ProposedGame[];
  byes: ProposedBye[];
  warnings: string[];
  seasonId: string;
}

export interface StandingRow {
  team_id: string;
  team_name: string;
  short_name: string | null;
  logo_url: string | null;
  category_id: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  points_for: number;
  points_against: number;
  point_diff: number;
  points: number;
  streak: string;
  form: ('W' | 'D' | 'L')[];
  position: number;
}

export interface StandingsGroup {
  category: { id: string; name: string; color: string };
  rows: StandingRow[];
}

export interface Referee {
  id: string;
  name: string;
  phone: string | null;
  badge_number: string | null;
  certified: boolean;
  status: string;
  user_id: string | null;
  games_assigned: number;
}

export interface PlayerStat {
  player_id: string; player_name: string; jersey_number: number | null; position: string | null;
  avatar_url: string | null; team_id: string; team_name: string; short_name: string | null;
  category_id: string; category_name: string; games_played: number;
  touchdowns: number; yards: number; receptions: number; completions: number;
  interceptions: number; flag_pulls: number; passes_defended: number;
  offensive_mvps: number; defensive_mvps: number; offensive_score: number; defensive_score: number;
}

// ─────────────────────────────── LLAMADAS ─────────────────────────────────

export const createCompetition = (apiClient = api) => {
 const api = apiClient;
 return {
  rounds: (seasonId?: string) =>
    api.get<RoundSummary[]>(`/rounds${seasonId ? `?seasonId=${seasonId}` : ''}`),
  round: (id: string) => api.get<RoundDetail>(`/rounds/${id}`),
  propose: (seasonId: string, scheduledDate?: string, slots?: string[], restTeamIds?: string[], earliestTimes?: Record<string, string>) =>
    api.post<Proposal>('/admin/rounds/propose', { seasonId, scheduledDate, slots, restTeamIds, earliestTimes }),
  createRound: (seasonId: string, proposal?: Proposal) =>
    api.post<RoundDetail>('/admin/rounds', { seasonId, proposal }),
  updateRound: (id: string, cambios: Record<string, unknown>) =>
    api.put<RoundSummary>(`/admin/rounds/${id}`, cambios),
  publishRound: (id: string) => api.post<RoundSummary>(`/admin/rounds/${id}/publish`),
  cancelRound: (id: string, reason?: string) =>
    api.post<RoundSummary>(`/admin/rounds/${id}/cancel`, { reason }),
  deleteRound: (id: string) => api.del<{ id: string }>(`/admin/rounds/${id}`),

  games: (filtros: Record<string, string | undefined> = {}) => {
    const q = Object.entries(filtros)
      .filter(([, v]) => v)
      .map(([k, v]) => `${k}=${encodeURIComponent(v as string)}`)
      .join('&');
    return api.get<Game[]>(`/games${q ? `?${q}` : ''}`);
  },
  myGames: () => api.get<Game[]>('/games/mine'),
  game: (id: string) => api.get<GameDetail>(`/games/${id}`),
  live: (id: string, since?: string) =>
    api.get<GameLive>(`/games/${id}/live${since ? `?since=${encodeURIComponent(since)}` : ''}`),
  startGame: (id: string) => api.post<Game>(`/games/${id}/start`),
  addEvent: (
    id: string,
    evento: { eventType: string; teamId: string; playerId?: string; quarter?: number; yards?: number }
  ) =>
    api.post<{ id: string; label: string; points: number; score: { home: number; away: number } }>(
      `/games/${id}/events`,
      evento
    ),
  voidEvent: (gameId: string, eventId: string) =>
    api.post<{ id: string; score?: { home: number; away: number } }>(
      `/games/${gameId}/events/${eventId}/void`
    ),
  finishGame: (
    id: string,
    datos: { mvpOffensivePlayerId?: string | null; mvpDefensivePlayerId?: string | null; notes?: string }
  ) => api.post<Game>(`/games/${id}/finish`, datos),
  updateGame: (id: string, cambios: Record<string, unknown>) =>
    api.put<Game>(`/admin/games/${id}`, cambios),
  assignReferees: (id: string, assignments: { refereeId: string; role: string }[]) =>
    api.post<RefereeRef[]>(`/admin/games/${id}/referees`, { assignments }),
  walkover: (id: string, winnerTeamId: string, reason?: string) =>
    api.post<Game>(`/admin/games/${id}/walkover`, { winnerTeamId, reason }),

  standings: (seasonId: string, categoryId?: string) =>
    api.get<StandingsGroup[]>(
      `/standings?seasonId=${seasonId}${categoryId ? `&categoryId=${categoryId}` : ''}`
    ),
  referees: (seasonId?: string) =>
    api.get<Referee[]>(`/referees${seasonId ? `?seasonId=${seasonId}` : ''}`),
  createReferee: (datos: Record<string, unknown>) => api.post<Referee>('/admin/referees', datos),
  playerStats: (seasonId: string, categoryId?: string, teamId?: string) =>
    api.get<PlayerStat[]>(`/statistics/players?seasonId=${encodeURIComponent(seasonId)}${categoryId ? `&categoryId=${encodeURIComponent(categoryId)}` : ''}${teamId ? `&teamId=${encodeURIComponent(teamId)}` : ''}`),
  publicPlayerStats: (seasonId: string, playerId: string) =>
    api.get<PlayerStat[]>(`/public/statistics/players?seasonId=${encodeURIComponent(seasonId)}&playerId=${encodeURIComponent(playerId)}`),
};

};
export const competition = createCompetition();

// ─────────────────────────────── AYUDAS ───────────────────────────────────

export const nombreCompleto = (p: RosterPlayer): string =>
  [p.first_name, p.last_name_paternal, p.last_name_maternal].filter(Boolean).join(' ');

/** "19:00" → "7:00 PM". El horario de la liga se habla en 12 horas. */
export const hora12 = (hhmm?: string | null): string => {
  if (!hhmm) return '—';
  const [h, m] = hhmm.split(':').map(Number);
  if (Number.isNaN(h)) return hhmm;
  const sufijo = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m ?? 0).padStart(2, '0')} ${sufijo}`;
};

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/**
 * Fecha larga en español, construida a mano.
 *
 * `toLocaleDateString('es-MX')` depende de los datos de idioma del
 * navegador, que en algunos Android salen en inglés. Un calendario de una
 * liga de Cancún no puede decir "Friday".
 */
export const fechaLarga = (iso?: string | null): string => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return `${DIAS[d.getUTCDay()]} ${d.getUTCDate()} de ${MESES[d.getUTCMonth()]} de ${d.getUTCFullYear()}`;
};

export const fechaCorta = (iso?: string | null): string => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return `${d.getUTCDate()} ${MESES[d.getUTCMonth()].slice(0, 3)}`;
};

export const ETIQUETA_JORNADA: Record<RoundStatus, { texto: string; tono: string }> = {
  DRAFT: { texto: 'Borrador', tono: 'badge-ghost' },
  PUBLISHED: { texto: 'Publicada', tono: 'badge-info' },
  IN_PROGRESS: { texto: 'En curso', tono: 'badge-warning' },
  FINISHED: { texto: 'Terminada', tono: 'badge-success' },
  CANCELLED: { texto: 'Cancelada', tono: 'badge-error' },
};

export const ETIQUETA_PARTIDO: Record<GameStatus, { texto: string; tono: string }> = {
  SCHEDULED: { texto: 'Programado', tono: 'badge-ghost' },
  LIVE: { texto: 'En vivo', tono: 'badge-error' },
  FINISHED: { texto: 'Final', tono: 'badge-success' },
  CANCELLED: { texto: 'Cancelado', tono: 'badge-ghost' },
  WALKOVER: { texto: 'Incomparecencia', tono: 'badge-warning' },
  POSTPONED: { texto: 'Pospuesto', tono: 'badge-warning' },
};

export const MOTIVO_DESCANSO: Record<string, string> = {
  ODD_TEAMS: 'Número impar de equipos',
  CAPACITY: 'No alcanzaron los horarios',
  MANUAL: 'Decisión del administrador',
};
