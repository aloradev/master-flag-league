import { useNavigate } from 'react-router-dom'
import useAuthStore from '../../store/auth'

export default function AdminDashboard() {
  const navigate = useNavigate()
  const { logout, user } = useAuthStore()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-primary">🏆 Administración</h1>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-600">{user?.name}</span>
            <button
              onClick={handleLogout}
              className="btn btn-sm btn-outline"
            >
              Salir
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* KPIs */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="card bg-white shadow">
            <div className="card-body">
              <h3 className="card-title text-sm">Jugadores Pendientes</h3>
              <div className="text-3xl font-bold text-warning">0</div>
            </div>
          </div>

          <div className="card bg-white shadow">
            <div className="card-body">
              <h3 className="card-title text-sm">Total Jugadores</h3>
              <div className="text-3xl font-bold text-primary">0</div>
            </div>
          </div>

          <div className="card bg-white shadow">
            <div className="card-body">
              <h3 className="card-title text-sm">Equipos Activos</h3>
              <div className="text-3xl font-bold text-success">0</div>
            </div>
          </div>

          <div className="card bg-white shadow">
            <div className="card-body">
              <h3 className="card-title text-sm">Jornada Actual</h3>
              <div className="text-3xl font-bold">-</div>
            </div>
          </div>
        </div>

        {/* Admin Actions */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="card bg-white shadow">
            <div className="card-body">
              <h2 className="card-title mb-4">⭐ Validación de Jugadores</h2>
              <button className="btn btn-primary btn-block mb-2">
                Revisar Documentos
              </button>
              <p className="text-sm text-gray-600">
                0 jugadores pendientes de aprobación
              </p>
            </div>
          </div>

          <div className="card bg-white shadow">
            <div className="card-body">
              <h2 className="card-title mb-4">⚽ Competencia</h2>
              <button className="btn btn-primary btn-block mb-2">
                Generar Jornada
              </button>
              <button className="btn btn-outline btn-block">
                Ver Partidos
              </button>
            </div>
          </div>

          <div className="card bg-white shadow">
            <div className="card-body">
              <h2 className="card-title mb-4">📊 Gestión</h2>
              <button className="btn btn-outline btn-block mb-2">
                Equipos
              </button>
              <button className="btn btn-outline btn-block">
                Usuarios
              </button>
            </div>
          </div>

          <div className="card bg-white shadow">
            <div className="card-body">
              <h2 className="card-title mb-4">📈 Reportes</h2>
              <button className="btn btn-outline btn-block mb-2">
                Estadísticas
              </button>
              <button className="btn btn-outline btn-block">
                Auditoría
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
