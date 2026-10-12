import Registration from './pages/Registration';
import NotFound from './pages/NotFound';
import Favoritos from './pages/publico/Favoritos';
import { PrivateMetadata } from './components/PageMetadata';
import { RouteExperience } from './components/RouteExperience';
import PublicHome from './pages/publico/Home';
import { useEffect, useMemo, useState } from 'react';
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useLocation,
} from 'react-router-dom';
import { useAuth, isAdmin, homeFor } from './store/auth';
import { Layout } from './components/Layout';
import { Alert, Spinner } from './components/ui';
import type { Role } from './lib/types';

import Login from './pages/Login';
import ChangePassword from './pages/ChangePassword';
import Recuperar from './pages/Recuperar';
import Restablecer from './pages/Restablecer';
import JornadaPublica from './pages/publico/Jornada';
import TablaPublica from './pages/publico/Tabla';
import EstadisticasPublicas from './pages/publico/Estadisticas';
import EquipoPublico from './pages/publico/Equipo';
import Jugar from './pages/publico/Jugar';
import PlayerInterest from './pages/admin/PlayerInterest';
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
import AdminLeagues from './pages/admin/Leagues';
import Roster from './pages/Roster';
import Jornadas from './pages/Jornadas';
import Standings from './pages/Standings';
import AdminRounds from './pages/admin/Rounds';
import AdminReferees from './pages/admin/Referees';
import Scrimmage from './pages/admin/Scrimmage';
import AdminFinances from './pages/admin/Finances';
import ManagerPayments from './pages/manager/Payments';
import RefereeGames from './pages/referee/MyGames';
import RefereeGameMode from './pages/referee/GameMode';
import PlayerRankings from './pages/PlayerRankings';
import PublicPlayer from './pages/publico/Player';
import PartidoPublico from './pages/publico/Partido';
import PowerRanking from './pages/PowerRanking';
import SeasonHistory from './pages/SeasonHistory';
import Playoffs from './pages/Playoffs';
import { temporaryApi } from './lib/api';
import { createCompetition } from './lib/competition';

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
    return <Navigate to="/ingresar" state={{ from: location.pathname + location.search }} replace />;
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

const ScrimmageEntry = () => {
  const location = useLocation();
  const token = new URLSearchParams(location.search).get('access');
  const client = useMemo(() => createCompetition(temporaryApi(token ?? '')), [token]);
  return <main className="mx-auto min-h-screen max-w-2xl space-y-4 p-4">
    <h1 className="text-xl font-bold">Modo árbitro · Scrimmage</h1>
    {token
      ? <RefereeGameMode key={`${location.pathname}:${token}`} client={client} temporary />
      : <Alert tone="error">El enlace está incompleto. Solicita a administración que copie el acceso completo desde Scrimmages.</Alert>}
  </main>;
};

const App = () => {
  const { restore } = useAuth();
  const [offline, setOffline] = useState(!navigator.onLine);

  useEffect(() => {
    void restore();
  }, [restore]);

  useEffect(() => {
    const online = () => setOffline(false);
    const offlineNow = () => setOffline(true);
    window.addEventListener('online', online);
    window.addEventListener('offline', offlineNow);
    return () => { window.removeEventListener('online', online); window.removeEventListener('offline', offlineNow); };
  }, []);

  return (
    <BrowserRouter>
      <RouteExperience />
      <PrivateMetadata />
      {offline && <div role="status" className="fixed inset-x-0 top-0 z-50 bg-warning px-3 py-2 text-center text-xs font-medium text-warning-content">Sin conexión. Se muestran los últimos datos disponibles; las acciones requieren internet.</div>}
      <Routes><Route path="/" element={<PublicHome />} /><Route path="/registro" element={<Registration />} />
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
        <Route path="/estadisticas" element={<EstadisticasPublicas />} />
        <Route path="/equipos/:id" element={<EquipoPublico />} />
        <Route path="/jugar" element={<Jugar />} />
        <Route path="/favoritos" element={<Favoritos />} />
        <Route path="/jugador/:id" element={<PublicPlayer />} />
        <Route path="/partido/:id" element={<PartidoPublico />} />
        <Route path="/scrimmage/:id" element={<ScrimmageEntry />} />
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
          <Route path="/rankings" element={<PlayerRankings />} />
          <Route path="/power-ranking" element={<PowerRanking />} />
          <Route path="/historial" element={<SeasonHistory />} />
          <Route path="/playoffs" element={<Playoffs />} />
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
          <Route path="/equipo/nuevo" element={<Registration team />} /><Route path="/equipo" element={<MyTeam />} />
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
          <Route path="/admin/interesados" element={<PlayerInterest />} />
          <Route path="/admin/validacion" element={<ValidationQueue />} />
          <Route path="/admin/equipos" element={<AdminTeams />} />
          <Route path="/admin/equipos/:id" element={<AdminTeamDetail />} />
          <Route path="/admin/equipos/:id/roster" element={<Roster />} />
          <Route path="/admin/usuarios" element={<AdminUsers />} />
          <Route path="/admin/jornadas" element={<AdminRounds />} />
        <Route path="/admin/arbitros" element={<AdminReferees />} />
        <Route path="/admin/scrimmages" element={<Scrimmage />} />
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
          <Route path="/admin/ligas" element={<AdminLeagues />} />
        </Route>

        <Route
          path="*"
          element={<NotFound />}
        />
      </Routes>
    </BrowserRouter>
  );
};

export default App;
