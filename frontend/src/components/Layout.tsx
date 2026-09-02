import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth, isAdmin } from '../store/auth';

interface NavItem {
  to: string;
  label: string;
  icon: string;
}

const NAV_BY_ROLE: Record<string, NavItem[]> = {
  ADMIN: [
    { to: '/admin', label: 'Panel', icon: '📊' },
    { to: '/admin/validacion', label: 'Validación', icon: '✅' },
    { to: '/admin/equipos', label: 'Equipos', icon: '🛡️' },
  ],
  TEAM_MANAGER: [
    { to: '/equipo', label: 'Mi equipo', icon: '🛡️' },
    { to: '/equipo/jugadores/nuevo', label: 'Agregar', icon: '➕' },
  ],
  REFEREE: [{ to: '/arbitro', label: 'Mis partidos', icon: '🏈' }],
};

/**
 * Estructura mobile-first (req. 47): navegación inferior en celular
 * —donde el pulgar alcanza— y lateral en escritorio.
 */
export const Layout = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const items = isAdmin(user?.role)
    ? NAV_BY_ROLE.ADMIN
    : NAV_BY_ROLE[user?.role ?? ''] ?? [];

  const handleLogout = () => {
    logout();
    navigate('/ingresar', { replace: true });
  };

  return (
    <div className="min-h-dvh md:flex">
      {/* Navegación lateral — escritorio */}
      <aside className="hidden w-60 shrink-0 border-r border-base-300 bg-base-200/50 md:flex md:flex-col">
        <div className="flex items-center gap-2 px-5 py-5">
          <span className="text-xl" aria-hidden>
            🏆
          </span>
          <div className="leading-tight">
            <div className="text-sm font-bold">Master Flag</div>
            <div className="text-xs text-base-content/50">League</div>
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
              <span aria-hidden>{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-base-300 p-3">
          <div className="truncate px-2 text-xs text-base-content/50">{user?.email}</div>
          <button
            onClick={handleLogout}
            className="mt-2 w-full rounded-field px-3 py-2 text-left text-sm text-base-content/70 hover:bg-base-300/60"
          >
            Cerrar sesión
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Encabezado — celular */}
        <header className="sticky top-0 z-20 flex items-center justify-between border-b border-base-300 bg-base-100/95 px-4 py-3 backdrop-blur md:hidden">
          <div className="flex items-center gap-2">
            <span aria-hidden>🏆</span>
            <span className="text-sm font-bold">Master Flag League</span>
          </div>
          <button
            onClick={handleLogout}
            className="text-xs text-base-content/60"
            aria-label="Cerrar sesión"
          >
            Salir
          </button>
        </header>

        <main className="min-w-0 flex-1 px-4 pb-24 pt-4 md:px-8 md:pb-10 md:pt-6">
          <Outlet />
        </main>

        {/* Navegación inferior — celular */}
        {items.length > 0 && (
          <nav className="fixed inset-x-0 bottom-0 z-20 flex border-t border-base-300 bg-base-200/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
            {items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/admin' || item.to === '/equipo'}
                className={({ isActive }) =>
                  `flex flex-1 flex-col items-center gap-0.5 py-2.5 text-xs ${
                    isActive ? 'text-primary' : 'text-base-content/60'
                  }`
                }
              >
                <span className="text-lg" aria-hidden>
                  {item.icon}
                </span>
                {item.label}
              </NavLink>
            ))}
          </nav>
        )}
      </div>
    </div>
  );
};
