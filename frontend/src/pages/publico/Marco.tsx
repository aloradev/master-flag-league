import { Link, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { Logo } from '../../components/Logo';
import { ThemeToggle } from '../../components/ThemeToggle';
import { useAuth, homeFor } from '../../store/auth';
import { IconShield, IconFootball, IconTrophy, IconDashboard, IconUsers } from '../../components/icons';

/**
 * Marco de las pantallas públicas.
 *
 * Sin navegación de la aplicación y sin nada que sugiera una sesión: quien
 * abre esto llegó por un enlace pegado en un grupo de WhatsApp y casi
 * siempre desde el celular, a veces en la cancha. Comparte navegación
 * de escritorio y accesos inferiores con espacio para el área segura móvil.
 */
export const Marco = ({
  titulo,
  subtitulo,
  acciones,
  children,
  campaign = false,
}: {
  titulo: string;
  subtitulo?: string;
  acciones?: ReactNode;
  children: ReactNode;
  campaign?: boolean;
}) => {
  const { pathname } = useLocation();
  const { user } = useAuth();
  const links = [
    { to: '/', label: 'Inicio', desktop: 'La liga', icon: IconShield, active: pathname === '/' },
    { to: '/jornada', label: 'Jornada', desktop: 'Partidos', icon: IconFootball, active: pathname.startsWith('/jornada') || pathname.startsWith('/partido/') },
    { to: '/tabla', label: 'Tabla', desktop: 'Posiciones', icon: IconTrophy, active: pathname === '/tabla' || pathname.startsWith('/equipos/') },
    { to: '/estadisticas', label: 'Stats', desktop: 'Estadísticas', icon: IconDashboard, active: pathname === '/estadisticas' || pathname.startsWith('/jugador/') },
    { to: '/jugar', label: 'Jugar', desktop: 'Jugar', icon: IconUsers, active: pathname === '/jugar' || pathname === '/registro' },
  ];

  const pestana = (activa: boolean) =>
    `mfl-toque flex-1 rounded-field px-3 py-2 text-center text-sm font-medium ${
      activa ? 'bg-primary/15 text-primary' : 'text-base-content/60'
    }`;

  return (
    <div className="public-shell min-h-dvh bg-base-100"><a href="#public-content" className="skip-link">Saltar al contenido</a>
      <header className="sticky top-0 z-20 border-b border-base-300 bg-base-100/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-4 py-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <Link
              to="/"
              aria-label="Ir al inicio de Master Flag League"
              title="Ir al inicio"
              className="shrink-0 rounded-field focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <Logo size="sm" className="size-12" />
            </Link>
            <div className="min-w-0 leading-tight">
              <p className="truncate text-sm font-bold">Master Flag League</p>
              <p className="truncate text-xs text-base-content/50">Cancún</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {acciones}
            {user ? <Link to={homeFor(user.role)} className="btn btn-sm btn-primary">Mi espacio</Link> : <>
              <Link to="/ingresar" className="inline-flex min-h-10 items-center rounded-field px-2 text-xs font-semibold text-base-content/70 hover:bg-base-200 sm:px-3 sm:text-sm">Ingresar</Link>
              <Link to="/registro" className="btn btn-sm btn-primary hidden px-2 text-xs sm:inline-flex sm:px-3 sm:text-sm">Crear cuenta</Link>
            </>}
            <ThemeToggle compact />
          </div>
        </div>

        <nav aria-label="Navegación pública" className="mx-auto hidden max-w-6xl gap-1 px-3 pb-2 sm:flex">
          {links.map(link => <Link key={link.to} to={link.to} aria-current={link.active ? 'page' : undefined} className={pestana(link.active)}>{link.desktop}</Link>)}
        </nav>
      </header>

      <main id="public-content" tabIndex={-1} className={campaign ? 'mfl-campaign' : 'mx-auto max-w-5xl px-4 py-6'}>
        {!campaign && <div className="public-page-heading mb-6">
          <p className="text-xs font-bold uppercase tracking-[.2em] text-primary">MFL · Cancún</p>
          <h1 className="mt-2 text-3xl font-black uppercase tracking-tight sm:text-5xl">{titulo}</h1>
          {subtitulo && <p className="text-sm text-base-content/60">{subtitulo}</p>}
        </div>}
        {children}
      </main>

      <footer className="mx-auto max-w-3xl px-4 pb-8 pt-2 text-center">
        <div className="mb-3 border-t border-base-300 pt-4">
          <p className="text-sm text-base-content/70">Sigue a la liga en Instagram</p>
          <a href="https://www.instagram.com/mflcancun/" target="_blank" rel="noopener noreferrer"
            aria-label="Instagram de Master Flag League: @mflcancun (abre en otra pestaña)"
            className="inline-flex min-h-11 items-center gap-2 rounded-field px-3 font-semibold text-primary hover:underline">
            <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <rect x="3" y="3" width="18" height="18" rx="5" />
              <circle cx="12" cy="12" r="4" />
              <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
            </svg>
            @mflcancun
          </a>
        </div>
        <Link to="/ingresar" className="text-xs text-base-content/40 hover:text-base-content/70">
          Acceso para encargados y árbitros
        </Link>
      </footer>
      <nav aria-label="Navegación pública móvil" className="public-bottom-nav fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-base-300 bg-base-100 sm:hidden">
        {links.map(({ to, label, icon: Icon, active }) => <Link key={to} to={to} aria-label={label === 'Stats' ? 'Estadísticas' : label} aria-current={active ? 'page' : undefined} className={`flex min-w-0 flex-col items-center justify-center gap-1 text-[11px] font-semibold ${active ? 'bg-primary/10 text-primary' : 'text-base-content/65'}`}><Icon size={21} /><span>{label}</span></Link>)}
      </nav>
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
