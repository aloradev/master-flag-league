import { useNavigate } from 'react-router-dom'
import useAuthStore from '../../store/auth'

export default function ManagerDashboard() {
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
          <h1 className="text-2xl font-bold text-primary">🏆 Mi Equipo</h1>
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
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          {/* Resumen Cards */}
          <div className="card bg-white shadow">
            <div className="card-body">
              <h3 className="card-title text-sm">Jugadores Registrados</h3>
              <div className="text-3xl font-bold text-primary">0</div>
              <p className="text-xs text-gray-600">Total en equipo</p>
            </div>
          </div>

          <div className="card bg-white shadow">
            <div className="card-body">
              <h3 className="card-title text-sm">Aprobados</h3>
              <div className="text-3xl font-bold text-success">0</div>
              <p className="text-xs text-gray-600">Elegibles para jugar</p>
            </div>
          </div>

          <div className="card bg-white shadow">
            <div className="card-body">
              <h3 className="card-title text-sm">Pendientes</h3>
              <div className="text-3xl font-bold text-warning">0</div>
              <p className="text-xs text-gray-600">Requieren revisión</p>
            </div>
          </div>
        </div>

        {/* Próximas Acciones */}
        <div className="card bg-white shadow">
          <div className="card-body">
            <h2 className="card-title">Próximas Acciones</h2>
            <div className="space-y-2">
              <button className="btn btn-primary btn-block">
                ➕ Agregar Jugador
              </button>
              <button className="btn btn-outline btn-block">
                📋 Ver Mis Jugadores
              </button>
              <button className="btn btn-outline btn-block">
                📅 Ver Calendario
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
