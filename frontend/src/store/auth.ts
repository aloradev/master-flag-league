import { create } from 'zustand';
import { api, tokenStore, setUnauthorizedHandler, ApiError } from '../lib/api';
import type { Role, SessionUser } from '../lib/types';

interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: SessionUser;
}

interface AuthState {
  user: SessionUser | null;
  /** loading mientras se restaura la sesión guardada al abrir la app. */
  status: 'loading' | 'authenticated' | 'anonymous';
  error: string | null;
  submitting: boolean;

  login: (email: string, password: string) => Promise<SessionUser>;
  logout: () => void;
  restore: () => Promise<void>;
  clearError: () => void;
  markPasswordChanged: () => void;
}

export const useAuth = create<AuthState>((set, get) => ({
  user: null,
  status: tokenStore.get() ? 'loading' : 'anonymous',
  error: null,
  submitting: false,

  login: async (email, password) => {
    set({ submitting: true, error: null });
    try {
      const data = await api.post<LoginResponse>('/auth/login', { email, password });
      tokenStore.set(data.accessToken);
      set({ user: data.user, status: 'authenticated', submitting: false });
      return data.user;
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : 'No se pudo conectar con el servidor';
      set({ error: message, submitting: false });
      throw err;
    }
  },

  logout: () => {
    tokenStore.clear();
    set({ user: null, status: 'anonymous', error: null });
  },

  /** Rehidrata la sesión con el token guardado. */
  restore: async () => {
    if (!tokenStore.get()) {
      set({ status: 'anonymous' });
      return;
    }
    try {
      const me = await api.get<any>('/auth/me');
      set({
        user: {
          id: me.id,
          email: me.email,
          name: me.name,
          role: me.role,
          leagueId: me.league_id,
          mustChangePassword: me.must_change_password,
          permissions: me.permissions,
        },
        status: 'authenticated',
      });
    } catch {
      tokenStore.clear();
      set({ user: null, status: 'anonymous' });
    }
  },

  clearError: () => set({ error: null }),

  markPasswordChanged: () => {
    const user = get().user;
    if (user) set({ user: { ...user, mustChangePassword: false } });
  },
}));

// Un 401 en cualquier llamada cierra la sesión.
setUnauthorizedHandler(() => useAuth.getState().logout());

const ADMIN: Role[] = ['SUPER_ADMIN', 'SPORTS_ADMIN'];

export const isAdmin = (role?: Role) => Boolean(role && ADMIN.includes(role));

/** Pantalla de inicio según el rol. */
export const homeFor = (role?: Role): string => {
  if (isAdmin(role)) return '/admin';
  if (role === 'TEAM_MANAGER') return '/equipo';
  if (role === 'REFEREE') return '/arbitro';
  if (role === 'FINANCE_ADMIN') return '/admin';
  return '/';
};
