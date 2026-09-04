const KEY = 'mfl.active-team-id';

export const activeTeamId = (): string | null => {
  try { return localStorage.getItem(KEY); } catch { return null; }
};

export const rememberTeam = (id: string): void => {
  try { localStorage.setItem(KEY, id); } catch { /* storage disabled */ }
};
