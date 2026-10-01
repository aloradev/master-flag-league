import { Dialog } from './Dialog';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth, isAdmin } from '../store/auth';
import { Logo } from './Logo';
import { ThemeToggle } from './ThemeToggle';
import {
  IconDashboard,
  IconCheckCircle,
  IconShield,
  IconUsers,
  IconSettings,
  IconClipboard,
  IconPlus,
  IconDocument,
  IconFootball,
  IconTrophy,
  IconMoney,
  IconLogout,
  IconMore,
} from './icons';
import { useEffect, useState } from 'react';
import type { ComponentType } from 'react';

interface NavItem {
  to: string;
  label: string;
  Icon: ComponentType<{ size?: number; className?: string }>;
  /** La barra inferior del celular da lugar propio solo a los primarios:
   *  más de cinco iconos dejan de ser tocables con el pulgar. El resto no
   *  desaparece — se alcanza por el botón "Más", que ocupa el quinto. */
  primary?: boolean;
  superAdminOnly?: boolean;
}

const NAV_BY_ROLE: Record<string, NavItem[]> = {
  ADMIN: [
    { to: '/admin', label: 'Panel', Icon: IconDashboard, primary: true },
    { to: '/admin/validacion', label: 'Validación', Icon: IconCheckCircle, primary: true },
    { to: '/admin/equipos', label: 'Equipos', Icon: IconShield, primary: true },
    { to: '/admin/jornadas', label: 'Jornadas', Icon: IconFootball, primary: true },
    { to: '/jornadas', label: 'Calendario compartido', Icon: IconFootball },
    { to: '/admin/finanzas', label: 'Finanzas', Icon: IconMoney },
    { to: '/posiciones', label: 'Posiciones', Icon: IconTrophy },
    { to: '/rankings', label: 'Rankings', Icon: IconTrophy },
    { to: '/power-ranking', label: 'Power Ranking', Icon: IconTrophy },
    { to: '/historial', label: 'Historial', Icon: IconTrophy },
    { to: '/admin/usuarios', label: 'Usuarios', Icon: IconUsers },
    { to: '/admin/arbitros', label: 'Árbitros', Icon: IconUsers },
    { to: '/admin/scrimmages', label: 'Scrimmages', Icon: IconFootball },
    { to: '/admin/temporada', label: 'Temporada y categorías', Icon: IconSettings },
    { to: '/admin/ligas', label: 'Ligas', Icon: IconShield, superAdminOnly: true },
    { to: '/admin/auditoria', label: 'Auditoría', Icon: IconClipboard, superAdminOnly: true },
  ],
  TEAM_MANAGER: [
    { to: '/equipo', label: 'Mi equipo', Icon: IconShield, primary: true },
    { to: '/equipo/jugadores/nuevo', label: 'Agregar', Icon: IconPlus, primary: true },
    { to: '/equipo/roster', label: 'Roster', Icon: IconDocument, primary: true },
    { to: '/equipo/pagos', label: 'Pagos', Icon: IconMoney },
    { to: '/jornadas', label: 'Calendario', Icon: IconFootball, primary: true },
    { to: '/posiciones', label: 'Posiciones', Icon: IconTrophy },
    { to: '/rankings', label: 'Rankings', Icon: IconTrophy },
  ],
  FINANCE_ADMIN: [
    { to: '/admin/finanzas', label: 'Finanzas', Icon: IconMoney, primary: true },
    { to: '/jornadas', label: 'Jornadas', Icon: IconFootball, primary: true },
    { to: '/posiciones', label: 'Posiciones', Icon: IconTrophy, primary: true },
    { to: '/rankings', label: 'Rankings', Icon: IconTrophy },
  ],
  REFEREE: [
    { to: '/arbitro', label: 'Mis partidos', Icon: IconFootball, primary: true },
    { to: '/jornadas', label: 'Jornadas', Icon: IconClipboard, primary: true },
    { to: '/posiciones', label: 'Posiciones', Icon: IconTrophy, primary: true },
    { to: '/rankings', label: 'Rankings', Icon: IconTrophy },
  ],
};

/**
 * Estructura mobile-first (req. 47): navegación inferior en celular
 * —donde el pulgar alcanza— y lateral en escritorio.
 */
export const Layout = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const location = useLocation();
  const [menuAbierto, setMenuAbierto] = useState(false);

  const items = (isAdmin(user?.role) ? NAV_BY_ROLE.ADMIN : NAV_BY_ROLE[user?.role ?? ''] ?? [])
    .filter((item) => !item.superAdminOnly || user?.role === 'SUPER_ADMIN');

  // Un administrador conserva todos sus permisos, pero también puede tener
  // una responsabilidad operativa sobre equipos concretos. Esa membresía
  // merece una entrada separada: no convierte todo el panel administrativo
  // en la vista del manager.
  if (isAdmin(user?.role) && (user?.teams?.length ?? 0) > 0) {
    items.splice(4, 0, {
      to: '/equipo',
      label: user!.teams!.length > 1 ? 'Mis equipos' : 'Mi equipo',
      Icon: IconShield,
      primary: true,
    });
  }

  items.push({ to: '/playoffs', label: 'Playoffs', Icon: IconTrophy });
  if (!items.some((item) => item.to === '/historial')) items.push({ to: '/historial', label: 'Historial', Icon: IconTrophy });
  const primaryItems = items.filter((item) => item.primary).slice(0, 4);
  const restoItems = items.filter((item) => !primaryItems.includes(item));

  /** `/admin` y `/equipo` son prefijo de sus propias subrutas: sin `end`
   *  se quedarían marcados como activos en toda la sección. */
  const esExacta = (to: string) => to === '/admin' || to === '/equipo';

  const activa = (to: string) =>
    esExacta(to)
      ? location.pathname === to
      : location.pathname === to || location.pathname.startsWith(`${to}/`);

  /** Si la pantalla abierta vive dentro de "Más", el botón se pinta
   *  activo: sin eso, en el celular ninguna pestaña queda marcada y se
   *  pierde el "dónde estoy". */
  const restoActivo = restoItems.some((item) => activa(item.to));

  // Cambiar de ruta cierra la hoja, incluido el botón atrás del celular.
  useEffect(() => {
    setMenuAbierto(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!menuAbierto) return;
    const alTeclear = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') setMenuAbierto(false);
    };
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, [menuAbierto]);

  const handleLogout = () => {
    logout();
    navigate('/ingresar', { replace: true });
  };

  return (
    <div className="min-h-dvh md:flex"><a href="#main-content" className="skip-link">Saltar al contenido</a>
      {/* Navegación lateral — escritorio */}
      <aside className="hidden sticky top-0 h-dvh overflow-y-auto w-60 shrink-0 border-r border-base-300 bg-base-200/50 md:flex md:flex-col">
        <div className="flex items-center gap-2.5 px-4 py-4">
          <Link
            to="/ingresar"
            aria-label="Ir al acceso de Master Flag League"
            title="Ir al inicio"
            className="shrink-0 rounded-field focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <Logo size="sm" className="size-10" />
          </Link>
          <div className="leading-tight">
            <div className="text-sm font-bold">Master Flag League</div>
            <div className="text-xs text-base-content/50">Cancún</div>
          </div>
        </div>

        <nav className="flex-1 space-y-1 px-3">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/admin' || item.to === '/equipo'}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-field px-3 py-2 text-sm transition-colors ${
                  isActive
                    ? 'bg-primary/15 font-medium text-primary'
                    : 'text-base-content/70 hover:bg-base-300/60'
                }`
              }
            >
              <item.Icon size={18} />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="space-y-2 border-t border-base-300 p-3">
          <ThemeToggle />
          <div className="truncate px-2 text-xs text-base-content/50">{user?.email}</div>
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-3 rounded-field px-3 py-2 text-left text-sm text-base-content/70 hover:bg-base-300/60"
          >
            <IconLogout size={18} />
            Cerrar sesión
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Encabezado — celular */}
        <header className="sticky top-0 z-20 flex items-center justify-between border-b border-base-300 bg-base-100/95 px-3 py-2 backdrop-blur md:hidden">
          <div className="flex min-w-0 items-center gap-2">
            <Link
              to="/ingresar"
              aria-label="Ir al acceso de Master Flag League"
              title="Ir al inicio"
              className="shrink-0 rounded-field focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <Logo size="sm" className="size-8" />
            </Link>
            <span className="truncate text-sm font-bold">Master Flag League</span>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <ThemeToggle compact />
            {/* 44 px: "Cerrar sesión" queda a un dedo del marcador en el
                Modo Árbitro, y a 32 px un toque errado a media jornada
                saca al árbitro de la sesión. */}
            <button
              onClick={handleLogout}
              className="btn btn-ghost btn-square min-h-11 min-w-11"
              aria-label="Cerrar sesión"
              title="Cerrar sesión"
            >
              <IconLogout size={20} />
            </button>
          </div>
        </header>

        <main id="main-content" tabIndex={-1} className="min-w-0 flex-1 px-4 pb-24 pt-4 md:px-8 md:pb-10 md:pt-6">
          <div className="mb-5 flex items-center justify-between gap-3 border-b border-base-300 pb-3 text-xs text-base-content/60"><span>{items.find(item => activa(item.to))?.label ?? 'Mi espacio'}</span><Link to="/" className="link">Ver sitio público ↗</Link></div><Outlet />
        </main>

        {/* Navegación inferior — celular */}
        {items.length > 0 && (
          <nav className="fixed inset-x-0 bottom-0 z-20 flex border-t border-base-300 bg-base-200/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
            {primaryItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={esExacta(item.to)}
                className={({ isActive }) =>
                  `mfl-toque flex flex-1 flex-col items-center gap-0.5 py-2.5 text-xs ${
                    isActive ? 'text-primary' : 'text-base-content/60'
                  }`
                }
              >
                <item.Icon size={22} />
                {item.label}
              </NavLink>
            ))}

            {restoItems.length > 0 && (
              <button
                type="button"
                onClick={() => setMenuAbierto(true)}
                aria-haspopup="dialog"
                aria-expanded={menuAbierto}
                className={`mfl-toque flex flex-1 flex-col items-center gap-0.5 py-2.5 text-xs ${
                  restoActivo ? 'text-primary' : 'text-base-content/60'
                }`}
              >
                <IconMore size={22} />
                Más
              </button>
            )}
          </nav>
        )}

        {/* Las secciones que no caben en la barra. No es un adorno: sin
            esto, desde el celular no había manera de abrir Pagos,
            Finanzas, Usuarios ni Temporada. */}
        {menuAbierto && (
          <Dialog title="Más secciones" onClose={() => setMenuAbierto(false)}>
              <nav className="grid gap-1">
                {restoItems.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={esExacta(item.to)}
                    onClick={() => setMenuAbierto(false)}
                    className={({ isActive }) =>
                      `mfl-toque flex items-center gap-3 rounded-field px-3 py-3 text-sm ${
                        isActive
                          ? 'bg-primary/15 font-medium text-primary'
                          : 'text-base-content/80'
                      }`
                    }
                  >
                    <item.Icon size={20} />
                    {item.label}
                  </NavLink>
                ))}
              </nav>
          </Dialog>
        )}
      </div>
    </div>
  );
};
