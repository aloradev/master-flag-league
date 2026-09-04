import { useTheme } from '../lib/theme';
import { IconSun, IconMoon, IconMonitor } from './icons';
import type { ComponentType } from 'react';

/**
 * Conmutador de tema.
 *
 * En la cabecera va la versión compacta: un toque alterna claro y oscuro,
 * que es lo que la gente espera de un icono de sol o luna. La versión
 * completa, con los tres estados explícitos (incluido "seguir al
 * sistema"), vive en la barra lateral, donde hay espacio para
 * etiquetarlos y no hay que adivinar.
 */
export const ThemeToggle = ({ compact = false }: { compact?: boolean }) => {
  const { resolved, preference, setPreference, toggle } = useTheme();

  if (compact) {
    return (
      <button
        onClick={toggle}
        className="btn btn-ghost btn-square min-h-11 min-w-11"
        aria-label={resolved === 'dark' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}
        title={resolved === 'dark' ? 'Tema claro' : 'Tema oscuro'}
      >
        {resolved === 'dark' ? <IconSun size={20} /> : <IconMoon size={20} />}
      </button>
    );
  }

  const options: {
    value: typeof preference;
    label: string;
    Icon: ComponentType<{ size?: number }>;
  }[] = [
    { value: 'light', label: 'Claro', Icon: IconSun },
    { value: 'dark', label: 'Oscuro', Icon: IconMoon },
    { value: 'system', label: 'Sistema', Icon: IconMonitor },
  ];

  return (
    <div
      className="flex gap-1 rounded-field bg-base-300/60 p-1"
      role="radiogroup"
      aria-label="Tema de la interfaz"
    >
      {options.map((option) => (
        <button
          key={option.value}
          onClick={() => setPreference(option.value)}
          role="radio"
          aria-checked={preference === option.value}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-selector px-2 py-1.5 text-xs transition-colors ${
            preference === option.value
              ? 'bg-base-100 font-medium text-base-content shadow-sm'
              : 'text-base-content/60 hover:text-base-content'
          }`}
        >
          <option.Icon size={14} />
          {option.label}
        </button>
      ))}
    </div>
  );
};
