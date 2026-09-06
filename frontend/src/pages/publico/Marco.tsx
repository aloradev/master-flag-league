import { Link, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { Logo } from '../../components/Logo';
import { ThemeToggle } from '../../components/ThemeToggle';

/**
 * Marco de las pantallas públicas.
 *
 * Sin navegación de la aplicación y sin nada que sugiera una sesión: quien
 * abre esto llegó por un enlace pegado en un grupo de WhatsApp y casi
 * siempre desde el celular, a veces en la cancha. Solo el escudo, las dos
 * pestañas que importan y el botón de compartir.
 */
export const Marco = ({
  titulo,
  subtitulo,
  acciones,
  children,
}: {
  titulo: string;
  subtitulo?: string;
  acciones?: ReactNode;
  children: ReactNode;
}) => {
  const { pathname } = useLocation();
  const enJornada = pathname.startsWith('/jornada');

  const pestana = (activa: boolean) =>
    `mfl-toque flex-1 rounded-field px-3 py-2 text-center text-sm font-medium ${
      activa ? 'bg-primary/15 text-primary' : 'text-base-content/60'
    }`;

  return (
    <div className="min-h-dvh bg-base-100">
      <header className="sticky top-0 z-20 border-b border-base-300 bg-base-100/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-2 px-4 py-2.5">
          <div className="flex min-w-0 items-center gap-2.5">
            <Link
              to="/jornada"
              aria-label="Ir al inicio público de Master Flag League"
              title="Ir al inicio"
              className="shrink-0 rounded-field focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <Logo size="sm" className="size-9" />
            </Link>
            <div className="min-w-0 leading-tight">
              <p className="truncate text-sm font-bold">Master Flag League</p>
              <p className="truncate text-xs text-base-content/50">Cancún</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {acciones}
            <ThemeToggle compact />
          </div>
        </div>

        <nav className="mx-auto flex max-w-3xl gap-1 px-3 pb-2">
          <Link to="/jornada" className={pestana(enJornada)}>
            Jornada
          </Link>
          <Link to="/tabla" className={pestana(!enJornada)}>
            Tabla
          </Link>
        </nav>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-4">
        <div className="mb-4">
          <h1 className="text-xl font-bold">{titulo}</h1>
          {subtitulo && <p className="text-sm text-base-content/60">{subtitulo}</p>}
        </div>
        {children}
      </main>

      <footer className="mx-auto max-w-3xl px-4 pb-8 pt-2 text-center">
        <Link to="/ingresar" className="text-xs text-base-content/40 hover:text-base-content/70">
          Acceso para encargados y árbitros
        </Link>
      </footer>
    </div>
  );
};

/**
 * Compartir a WhatsApp.
 *
 * Es un enlace `wa.me`, no la API de Meta: abre WhatsApp en el teléfono de
 * quien lo toca con el mensaje ya escrito, sin costo por mensaje, sin
 * plantillas que aprobar y sin exigir un negocio constituido. En
 * escritorio abre WhatsApp Web.
 */
export const BotonCompartir = ({ texto }: { texto: string }) => (
  <a
    href={`https://wa.me/?text=${encodeURIComponent(texto)}`}
    target="_blank"
    rel="noreferrer"
    className="btn btn-sm btn-primary"
  >
    Compartir
  </a>
);
