import { Link } from 'react-router-dom';
import { Marco } from './publico/Marco';
import { useAuth, homeFor } from '../store/auth';

export default function NotFound() {
  const user = useAuth(state => state.user);
  return <Marco titulo="Página no encontrada" subtitulo="Este enlace no existe o ya no está disponible.">
    <div className="flex flex-wrap gap-3 py-5">
      <Link className="btn btn-primary" to="/">Ir al inicio</Link>
      <Link className="btn btn-outline" to="/jornada">Ver jornada</Link>
      {user && <Link className="btn btn-outline" to={homeFor(user.role)}>Mi espacio</Link>}
    </div>
  </Marco>;
}
