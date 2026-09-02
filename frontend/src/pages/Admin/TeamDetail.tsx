import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../../lib/api';
import type { TeamDetail as Team } from '../../lib/types';
import { Alert, Card, Field, Spinner } from '../../components/ui';
import { StatusBadge, EligibilityBadge } from '../../components/StatusBadge';
import { PlayerAvatar } from '../../components/AuthImage';

interface ManagerOption {
  id: string;
  name: string;
  email: string;
  active: boolean;
  teams: { id: string; name: string }[];
}

const MAX_MANAGERS = 2;

export default function AdminTeamDetail() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [assigning, setAssigning] = useState(false);
  const [selected, setSelected] = useState('');
  const [error, setError] = useState<string | null>(null);

  const team = useQuery({
    queryKey: ['team', id],
    queryFn: () => api.get<Team>(`/teams/${id}`),
    enabled: Boolean(id),
  });

  // Solo se ofrecen managers activos que aún no llevan un equipo:
  // un mismo encargado en dos equipos confunde el alcance de sus permisos.
  const candidates = useQuery({
    queryKey: ['users', 'TEAM_MANAGER'],
    queryFn: () => api.get<ManagerOption[]>('/admin/users?role=TEAM_MANAGER&active=true'),
    enabled: assigning,
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['team', id] });
    void queryClient.invalidateQueries({ queryKey: ['teams'] });
    void queryClient.invalidateQueries({ queryKey: ['users'] });
  };

  const assign = useMutation({
    mutationFn: (userId: string) => api.post(`/admin/teams/${id}/managers`, { userId }),
    onSuccess: () => {
      setError(null);
      setAssigning(false);
      setSelected('');
      refresh();
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'No se pudo asignar'),
  });

  const remove = useMutation({
    mutationFn: (userId: string) => api.del(`/admin/teams/${id}/managers/${userId}`),
    onSuccess: () => {
      setError(null);
      refresh();
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'No se pudo remover'),
  });

  if (team.isLoading) return <Spinner />;
  if (team.isError || !team.data) {
    return <Alert tone="error">No se pudo cargar el equipo.</Alert>;
  }

  const data = team.data;
  const summary = data.registration_summary;
  const available = (candidates.data ?? []).filter(
    (candidate) =>
      candidate.teams.length === 0 &&
      !data.managers.some((manager) => manager.id === candidate.id)
  );

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link to="/admin/equipos" className="inline-block text-sm text-base-content/60 hover:text-base-content">
        ← Equipos
      </Link>

      {/* Identidad */}
      <Card className="p-4">
        <div className="flex items-center gap-4">
          <div
            className="flex size-14 shrink-0 items-center justify-center rounded-box text-lg font-bold"
            style={{ backgroundColor: data.color_primary }}
          >
            {data.short_name ?? data.name.slice(0, 3).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-xl font-bold">{data.name}</h1>
            <p className="text-sm text-base-content/60">
              {data.category_name} · {data.season_name}
            </p>
          </div>
          <Link to={`/admin/equipos/${id}/roster`} className="btn btn-sm shrink-0">
            Roster
          </Link>
        </div>

        <div className="mt-4 grid grid-cols-4 gap-2 border-t border-base-300 pt-3 text-center">
          <div>
            <div className="tabular text-lg font-bold">{summary.total}</div>
            <div className="text-xs text-base-content/50">Jugadores</div>
          </div>
          <div>
            <div className="tabular text-lg font-bold text-success">{summary.eligible}</div>
            <div className="text-xs text-base-content/50">Elegibles</div>
          </div>
          <div>
            <div className="tabular text-lg font-bold text-warning">{summary.pending}</div>
            <div className="text-xs text-base-content/50">En revisión</div>
          </div>
          <div>
            <div className="tabular text-lg font-bold text-error">
              {summary.corrections + summary.rejected}
            </div>
            <div className="text-xs text-base-content/50">Por corregir</div>
          </div>
        </div>
      </Card>

      {error && <Alert tone="error">{error}</Alert>}

      {/* Encargados */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-base-content/70">
            Encargados ({data.managers.length}/{MAX_MANAGERS})
          </h2>
          {data.managers.length < MAX_MANAGERS && !assigning && (
            <button onClick={() => setAssigning(true)} className="btn btn-primary btn-xs">
              Asignar
            </button>
          )}
        </div>

        {data.managers.length === 0 && !assigning && (
          <Alert tone="warning">
            Este equipo no tiene encargados. Sin uno, nadie puede registrar a sus jugadores.
          </Alert>
        )}

        {assigning && (
          <Card className="mb-2 space-y-3 p-3">
            {candidates.isLoading ? (
              <Spinner />
            ) : available.length === 0 ? (
              <>
                <p className="text-sm text-base-content/70">
                  No hay managers disponibles. Crea un usuario con rol Manager de Equipo.
                </p>
                <div className="flex gap-2">
                  <button onClick={() => setAssigning(false)} className="btn btn-ghost btn-sm flex-1">
                    Cerrar
                  </button>
                  <Link to="/admin/usuarios" className="btn btn-primary btn-sm flex-1">
                    Crear usuario
                  </Link>
                </div>
              </>
            ) : (
              <>
                <Field label="Manager a asignar">
                  <select
                    className="select select-bordered select-sm w-full"
                    value={selected}
                    onChange={(e) => setSelected(e.target.value)}
                  >
                    <option value="">Selecciona…</option>
                    {available.map((candidate) => (
                      <option key={candidate.id} value={candidate.id}>
                        {candidate.name} · {candidate.email}
                      </option>
                    ))}
                  </select>
                </Field>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setAssigning(false);
                      setSelected('');
                    }}
                    className="btn btn-ghost btn-sm flex-1"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={() => selected && assign.mutate(selected)}
                    className="btn btn-primary btn-sm flex-1"
                    disabled={!selected || assign.isPending}
                  >
                    {assign.isPending ? (
                      <span className="loading loading-spinner loading-xs" />
                    ) : (
                      'Asignar'
                    )}
                  </button>
                </div>
              </>
            )}
          </Card>
        )}

        {data.managers.length > 0 && (
          <ul className="space-y-2">
            {data.managers.map((manager) => (
              <Card as="li" key={manager.id} className="flex items-center gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{manager.name}</p>
                  <p className="truncate text-xs text-base-content/60">{manager.email}</p>
                </div>
                <button
                  onClick={() => remove.mutate(manager.id)}
                  className="btn btn-ghost btn-xs shrink-0 text-error"
                  disabled={remove.isPending}
                >
                  Remover
                </button>
              </Card>
            ))}
          </ul>
        )}
      </section>

      {/* Plantilla */}
      <section>
        <h2 className="mb-2 text-sm font-semibold text-base-content/70">
          Plantilla ({data.roster.length})
        </h2>

        {data.roster.length === 0 ? (
          <Card className="p-4 text-center text-sm text-base-content/50">
            Sin jugadores registrados
          </Card>
        ) : (
          <ul className="space-y-2">
            {data.roster.map((player) => (
              <Card as="li" key={player.id} className="flex items-center gap-3 p-3">
                <PlayerAvatar
                  photoUrl={player.photo_url}
                  name={`${player.first_name} ${player.last_name_paternal}`}
                  jersey={player.jersey_number}
                  size="sm"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    {player.jersey_number != null && (
                      <span className="tabular text-xs font-bold text-base-content/50">
                        #{player.jersey_number}
                      </span>
                    )}
                    <span className="truncate text-sm font-medium">
                      {player.first_name} {player.last_name_paternal}
                    </span>
                  </div>
                  <div className="mt-1">
                    <StatusBadge status={player.status} />
                  </div>
                </div>
                <EligibilityBadge isEligible={player.is_eligible} />
              </Card>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
