import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import type { Season, ValidationStats } from '../../lib/types';
import { Alert, Card, Spinner, Stat } from '../../components/ui';
import { useAuth } from '../../store/auth';
import { diasHasta, fechaTexto } from '../../lib/format';

export default function AdminDashboard() {
  const { user } = useAuth();

  const season = useQuery({
    queryKey: ['season-active'],
    queryFn: () => api.get<Season>('/seasons/active'),
    retry: false,
  });

  const stats = useQuery({
    queryKey: ['validation-stats'],
    queryFn: () => api.get<ValidationStats>('/admin/validation/stats'),
  });

  if (stats.isLoading) return <Spinner />;

  const data = stats.data;
  const pendingWork = (data?.pending ?? 0) + (data?.corrections ?? 0);

  const daysToStart = diasHasta(season.data?.start_date);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="text-xl font-bold">Hola, {user?.name?.split(' ')[0]}</h1>
        <p className="text-sm text-base-content/60">
          {season.data
            ? `${season.data.name} · inicia el ${fechaTexto(season.data.start_date)}`
            : 'Sin temporada activa'}
        </p>
      </div>

      {/* Lo que requiere acción va primero */}
      {pendingWork > 0 && (
        <Link to="/admin/validacion" className="block">
          <Card className="flex items-center justify-between p-4 transition-colors hover:bg-base-300/40">
            <div>
              <p className="font-semibold">
                {pendingWork} registro{pendingWork === 1 ? '' : 's'} esperando tu revisión
              </p>
              <p className="text-sm text-base-content/60">Abrir cola de validación</p>
            </div>
            <span className="text-2xl" aria-hidden>
              →
            </span>
          </Card>
        </Link>
      )}

      {daysToStart != null && daysToStart >= 0 && daysToStart <= 21 && (
        <Alert tone={daysToStart <= 7 ? 'warning' : 'info'}>
          {daysToStart === 0
            ? 'La temporada arranca hoy.'
            : `Faltan ${daysToStart} día(s) para el inicio de la temporada.`}
          {season.data?.registration_deadline &&
            ` Registro cierra el ${fechaTexto(season.data.registration_deadline)}.`}
        </Alert>
      )}

      <section>
        <h2 className="mb-2 text-sm font-semibold text-base-content/70">Jugadores</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat value={data?.total ?? 0} label="Registrados" />
          <Stat value={data?.eligible ?? 0} label="Elegibles" tone="success" />
          <Stat value={data?.pending ?? 0} label="En revisión" tone="warning" />
          <Stat value={data?.corrections ?? 0} label="Por corregir" tone="error" />
        </div>
      </section>

      {(data?.by_team?.length ?? 0) > 0 && (
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-base-content/70">Avance por equipo</h2>
            <Link to="/admin/equipos" className="text-xs text-primary hover:underline">
              Administrar equipos
            </Link>
          </div>

          <Card className="divide-y divide-base-300">
            {data!.by_team.map((team) => {
              const progress = team.total > 0 ? (team.eligible / team.total) * 100 : 0;
              return (
                <div key={team.id} className="px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <span
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: team.color_primary }}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">
                      {team.name}
                    </span>
                    <span className="tabular shrink-0 text-xs text-base-content/60">
                      {team.eligible}/{team.total} elegibles
                    </span>
                  </div>
                  <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-base-300">
                    <div
                      className="h-full rounded-full bg-success transition-all"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  {team.pending > 0 && (
                    <p className="mt-1 text-xs text-warning">{team.pending} en revisión</p>
                  )}
                </div>
              );
            })}
          </Card>
        </section>
      )}

      {season.data && (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-base-content/70">Temporada</h2>
          <Card className="grid grid-cols-2 gap-3 p-4 text-sm sm:grid-cols-4">
            <div>
              <div className="text-xs text-base-content/50">Categorías</div>
              <div className="mt-0.5 font-medium">{season.data.categories.length}</div>
            </div>
            <div>
              <div className="text-xs text-base-content/50">Campos</div>
              <div className="mt-0.5 font-medium">{season.data.fields.length}</div>
            </div>
            <div>
              <div className="text-xs text-base-content/50">Primer horario</div>
              <div className="mt-0.5 font-medium tabular">
                {season.data.default_start_time?.slice(0, 5)}
              </div>
            </div>
            <div>
              <div className="text-xs text-base-content/50">Registro</div>
              <div
                className={`mt-0.5 font-medium ${
                  season.data.registration_open ? 'text-success' : 'text-error'
                }`}
              >
                {season.data.registration_open ? 'Abierto' : 'Cerrado'}
              </div>
            </div>
          </Card>
        </section>
      )}
    </div>
  );
}
