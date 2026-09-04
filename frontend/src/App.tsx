import { useEffect } from 'react';
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useLocation,
} from 'react-router-dom';
import { useAuth, isAdmin, homeFor } from './store/auth';
import { Layout } from './components/Layout';
import { Spinner } from './components/ui';
import type { Role } from './lib/types';

import Login from './pages/Login';
import ChangePassword from './pages/ChangePassword';
import Recuperar from './pages/Recuperar';
import Restablecer from './pages/Restablecer';
import JornadaPublica from './pages/publico/Jornada';
import TablaPublica from './pages/publico/Tabla';
import MyTeam from './pages/manager/MyTeam';
import PlayerForm from './pages/manager/PlayerForm';
import PlayerDetail from './pages/manager/PlayerDetail';
import AdminDashboard from './pages/admin/Dashboard';
import ValidationQueue from './pages/admin/ValidationQueue';
import AdminTeams from './pages/admin/Teams';
import AdminTeamDetail from './pages/admin/TeamDetail';
import AdminUsers from './pages/admin/Users';
import AdminAudit from './pages/admin/Audit';
import SeasonConfig from './pages/admin/SeasonConfig';
import Roster from './pages/Roster';
import Jornadas from './pages/Jornadas';
import Standings from './pages/Standings';
import AdminRounds from './pages/admin/Rounds';
import AdminFinances from './pages/admin/Finances';
import ManagerPayments from './pages/manager/Payments';
import RefereeGames from './pages/referee/MyGames';
import RefereeGameMode from './pages/referee/GameMode';

/** Puerta de acceso: exige sesión y, si se indica, un rol permitido. */
const Protected = ({
  allow,
  children,
}: {
  allow?: (role: Role) => boolean;
  children: React.ReactNode;
}) => {
  const { user, status } = useAuth();
  const location = useLocation();

  if (status === 'loading') return <Spinner label="Cargando tu sesión…" />;
  if (status === 'anonymous' || !user) {
    return <Navigate to="/ingresar" state={{ from: location.pathname }} replace />;
  }

  // Una contraseña temporal debe cambiarse antes de usar la plataforma.
  if (user.mustChangePassword && location.pathname !== '/cambiar-contrasena') {
    return <Navigate to="/cambiar-contrasena" replace />;
  }

  if (allow && !allow(user.role)) {
    return <Navigate to={homeFor(user.role)} replace />;
  }

  return <>{children}</>;
};

const App = () => {
  const { restore, user, status } = useAuth();

  useEffect(() => {
    void restore();
  }, [restore]);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/ingresar" element={<Login />} />
        {/* Sin sesión a propósito: quien no puede entrar tampoco puede
            autenticarse para pedir ayuda. */}
        <Route path="/recuperar" element={<Recuperar />} />
        <Route path="/restablecer" element={<Restablecer />} />

        {/* Públicas: es lo que se pega en el grupo de WhatsApp que los
            encargados ya tienen. Sin id, /jornada muestra la vigente, así
            que el mismo enlace sirve toda la temporada. */}
        <Route path="/jornada" element={<JornadaPublica />} />
        <Route path="/jornada/:id" element={<JornadaPublica />} />
        <Route path="/tabla" element={<TablaPublica />} />
        <Route
          path="/cambiar-contrasena"
          element={
            <Protected>
              <ChangePassword />
            </Protected>
          }
        />

        {/* Calendario y tabla: los ve cualquiera con sesión. El
            calendario y las posiciones son de la liga, no de un rol, y
            el backend ya oculta las jornadas en borrador. */}
        <Route
          element={
            <Protected>
              <Layout />
            </Protected>
          }
        >
          <Route path="/jornadas" element={<Jornadas />} />
          <Route path="/posiciones" element={<Standings />} />
        </Route>

        {/* Modo Árbitro */}
        <Route
          element={
            <Protected allow={(role) => role === 'REFEREE' || isAdmin(role)}>
              <Layout />
            </Protected>
          }
        >
          <Route path="/arbitro" element={<RefereeGames />} />
          <Route path="/arbitro/partido/:id" element={<RefereeGameMode />} />
        </Route>

        {/* Portal del manager */}
        <Route
          element={
            <Protected allow={(role) => role === 'TEAM_MANAGER' || isAdmin(role)}>
              <Layout />
            </Protected>
          }
        >
          <Route path="/equipo" element={<MyTeam />} />
          <Route path="/equipo/jugadores/nuevo" element={<PlayerForm />} />
          <Route path="/equipo/jugadores/:id" element={<PlayerDetail />} />
          <Route path="/equipo/jugadores/:id/editar" element={<PlayerForm />} />
          <Route path="/equipo/roster" element={<Roster />} />
          <Route path="/equipo/pagos" element={<ManagerPayments />} />
        </Route>

        {/* Finanzas: administración deportiva y el Administrador
            Financiero, que no pasa el guardia de /admin. */}
        <Route
          element={
            <Protected allow={(role) => isAdmin(role) || role === 'FINANCE_ADMIN'}>
              <Layout />
            </Protected>
          }
        >
          <Route path="/admin/finanzas" element={<AdminFinances />} />
        </Route>

        {/* Administración */}
        <Route
          element={
            <Protected allow={isAdmin}>
              <Layout />
            </Protected>
          }
        >
          <Route path="/admin" element={<AdminDashboard />} />
          <Route path="/admin/validacion" element={<ValidationQueue />} />
          <Route path="/admin/equipos" element={<AdminTeams />} />
          <Route path="/admin/equipos/:id" element={<AdminTeamDetail />} />
          <Route path="/admin/equipos/:id/roster" element={<Roster />} />
          <Route path="/admin/usuarios" element={<AdminUsers />} />
          <Route path="/admin/jornadas" element={<AdminRounds />} />
          <Route path="/admin/temporada" element={<SeasonConfig />} />
        </Route>

        <Route
          element={
            <Protected allow={(role) => role === 'SUPER_ADMIN'}>
              <Layout />
            </Protected>
          }
        >
          <Route path="/admin/auditoria" element={<AdminAudit />} />
        </Route>

        <Route
          path="*"
          element={
            <Navigate
              to={status === 'authenticated' ? homeFor(user?.role) : '/ingresar'}
              replace
            />
          }
        />
      </Routes>
    </BrowserRouter>
  );
};

export default App;
