import { useSyncExternalStore } from 'react';

export type FavoriteKind = 'team' | 'player' | 'game';
export interface Favorite { kind: FavoriteKind; id: string; name: string }
export interface GameSnapshot { id: string; home_team_name: string; away_team_name: string; status: string; scheduled_date?: string; scheduled_time: string | null; field_name: string | null; home_score: number | null; away_score: number | null }
export type NoticeKind = 'live' | 'result' | 'schedule' | 'status' | 'update';
export interface Notice { id: string; gameId: string; text: string; created: number; read: boolean; kind?: NoticeKind }
interface State { favorites: Favorite[]; enabled: boolean; snapshots: Record<string, GameSnapshot>; notices: Notice[] }
const KEY = 'mfl.favorites.v1';
const empty = (): State => ({ favorites: [], enabled: false, snapshots: {}, notices: [] });
const listeners = new Set<() => void>();
const kinds = ['team', 'player', 'game'];
const validText = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 500;
function load(): State {
  try {
    const data = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (!data || !Array.isArray(data.favorites) || !Array.isArray(data.notices)) return empty();
    const favorites = data.favorites.filter((f: Favorite) => f && kinds.includes(f.kind) && validText(f.id) && validText(f.name)).slice(0, 40);
    const notices = data.notices.filter((n: Notice) => n && validText(n.id) && validText(n.gameId) && validText(n.text) && Number.isFinite(n.created) && Number.isFinite(new Date(n.created).getTime()) && typeof n.read === 'boolean').slice(0, 30)
      .map((n: Notice) => ({ ...n, kind: ['live', 'result', 'schedule', 'status', 'update'].includes(n.kind ?? '') ? n.kind : 'update' as const }));
    const snapshots: Record<string, GameSnapshot> = {};
    for (const game of Object.values(data.snapshots || {}) as GameSnapshot[]) {
      if (game && validText(game.id) && validText(game.home_team_name) && validText(game.away_team_name) && validText(game.status)) snapshots[game.id] = game;
      if (Object.keys(snapshots).length >= 300) break;
    }
    return { favorites, notices, snapshots, enabled: data.enabled === true };
  } catch { return empty(); }
}
let state = load();
function save(next: State) {
  try { localStorage.setItem(KEY, JSON.stringify(next)); }
  catch { return false; }
  state = next; listeners.forEach(listener => listener()); return true;
}
window.addEventListener('storage', event => { if (event.key === KEY || event.key === null) { state = load(); listeners.forEach(listener => listener()); } });
export const favoriteHref = (favorite: Favorite) => `/${({ team: 'equipos', player: 'jugador', game: 'partido' })[favorite.kind]}/${encodeURIComponent(favorite.id)}`;
export function useFavorites() {
  return useSyncExternalStore(listener => { listeners.add(listener); return () => { listeners.delete(listener); }; }, () => state);
}
export function toggleFavorite(favorite: Favorite) {
  const exists = state.favorites.some(item => item.id === favorite.id && item.kind === favorite.kind);
  if (!exists && state.favorites.length >= 40) return 'Puedes guardar hasta 40 favoritos.';
  const favorites = exists ? state.favorites.filter(item => item.id !== favorite.id || item.kind !== favorite.kind) : [...state.favorites, favorite];
  return save({ ...state, favorites, snapshots: {} }) ? '' : 'No se pudo guardar en este dispositivo.';
}
export const setNoticesEnabled = (enabled: boolean) => save({ ...state, enabled, snapshots: {} });
export const markNoticesRead = () => save({ ...state, notices: state.notices.map(notice => ({ ...notice, read: true })) });
export const markNoticeRead = (id: string) => save({ ...state, notices: state.notices.map(notice => notice.id === id ? { ...notice, read: true } : notice) });
export const clearNotices = () => save({ ...state, notices: [] });
export function observeGames(games: GameSnapshot[]) {
  if (!state.enabled) return;
  const snapshots = { ...state.snapshots };
  const notices = [...state.notices];
  let changed = false;
  for (const game of games) {
    const previous = snapshots[game.id];
    if (JSON.stringify(previous) === JSON.stringify(game)) continue;
    snapshots[game.id] = game; changed = true;
    if (!previous) continue;
    const changes: string[] = [];
    let kind: NoticeKind = 'update';
    if (previous.status !== game.status) {
      const status: Record<string, string> = { LIVE: 'Partido en vivo', FINISHED: 'Resultado final', WALKOVER: 'Incomparecencia', POSTPONED: 'Partido pospuesto', CANCELLED: 'Partido cancelado', SCHEDULED: 'Partido programado' };
      changes.push(status[game.status] || 'Estado actualizado');
      kind = game.status === 'LIVE' ? 'live' : ['FINISHED', 'WALKOVER'].includes(game.status) ? 'result' : 'status';
    }
    if (previous.scheduled_date !== game.scheduled_date || previous.scheduled_time !== game.scheduled_time || previous.field_name !== game.field_name) {
      changes.push(`Horario o cancha actualizados: ${game.scheduled_date?.slice(0, 10) || 'Fecha por confirmar'} · ${game.scheduled_time || 'Hora por confirmar'} · ${game.field_name || 'Cancha por confirmar'}`);
      if (kind === 'update') kind = 'schedule';
    }
    if (['FINISHED', 'WALKOVER'].includes(game.status) && (changes.length || previous.home_score !== game.home_score || previous.away_score !== game.away_score) && game.home_score != null && game.away_score != null) {
      changes.push(`${game.home_score} - ${game.away_score}`);
      if (kind === 'update') kind = 'result';
    }
    if (changes.length) notices.unshift({ id: crypto.randomUUID(), gameId: game.id, text: `${game.home_team_name} vs ${game.away_team_name}: ${changes.join(' · ')}`.slice(0, 500), created: Date.now(), read: false, kind });
  }
  if (changed) save({ ...state, snapshots: Object.fromEntries(Object.entries(snapshots).slice(-300)), notices: notices.slice(0, 30) });
}
