import { useEffect, useState } from 'react';

/**
 * Tema claro / oscuro.
 *
 * Tres estados, no dos: 'system' sigue la preferencia del sistema
 * operativo, y solo se guarda una elección explícita del usuario. Así
 * quien no toca nada obtiene el modo con el que ya usa su teléfono.
 */
export type ThemePreference = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'mfl.theme';

const readStored = (): ThemePreference => {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === 'light' || value === 'dark' ? value : 'system';
  } catch {
    return 'system';
  }
};

const systemPrefersDark = (): boolean => {
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  } catch {
    return false;
  }
};

export const resolveTheme = (preference: ThemePreference): 'light' | 'dark' =>
  preference === 'system' ? (systemPrefersDark() ? 'dark' : 'light') : preference;

const apply = (preference: ThemePreference) => {
  const resolved = resolveTheme(preference);
  const root = document.documentElement;
  root.setAttribute('data-theme', resolved === 'dark' ? 'mfl-dark' : 'mfl-light');
  root.style.colorScheme = resolved;
};

export const useTheme = () => {
  const [preference, setPreference] = useState<ThemePreference>(readStored);

  useEffect(() => {
    apply(preference);

    try {
      if (preference === 'system') localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, preference);
    } catch {
      /* modo privado: el tema durará solo esta sesión */
    }
  }, [preference]);

  // Si el usuario dejó 'system', el cambio de tema del sistema debe
  // reflejarse sin recargar la página.
  useEffect(() => {
    if (preference !== 'system') return;

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => apply('system');
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [preference]);

  return {
    preference,
    resolved: resolveTheme(preference),
    setPreference,
    toggle: () => setPreference(resolveTheme(preference) === 'dark' ? 'light' : 'dark'),
  };
};
