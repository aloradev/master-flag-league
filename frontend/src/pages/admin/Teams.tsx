import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../../lib/api';
import type { Season, TeamSummary } from '../../lib/types';
import { Alert, Button, Card, EmptyState, Field, Spinner } from '../../components/ui';
import { IconShield, IconWarning } from '../../components/icons';
import { TeamCrest } from '../../components/AuthImage';

const PALETTE = ['#0ea5e9', '#16a34a', '#dc2626', '#f59e0b', '#7c3aed', '#db2777', '#0d9488', '#64748b'];

/** Alta de equipo. Los managers se asignan después, desde la ficha del equipo. */
const NewTeamForm = ({
  season,
  onCreated,
  onCancel,
}: {
  season: Season;
  onCreated: () => void;
  onCancel: () => void;
}) => {
  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState(season.categories[0]?.id ?? '');
  const [color, setColor] = useState(PALETTE[0]);
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () =>
      api.post('/admin/teams', {
        seasonId: season.id,
        categoryId,
        name: name.trim(),
        colorPrimary: color,
      }),
    onSuccess: () => {
      setName('');
      setError(null);
      onCreated();
    },
    onError: (err) =>
      setError(err instanceof ApiError ? err.message : 'No se pudo crear el equipo'),
  });

  return (
    <Card className="space-y-3 p-4">
      <h2 className="font-semibold">Nuevo equipo</h2>

      <Field label="Nombre" required>
        <input
          className="input input-bordered w-full"
          placeholder="Sharks"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
        />
      </Field>

      <Field label="Categoría" required>
        <select
          className="select select-bordered w-full"
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
        >
          {season.categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Color del equipo">
        <div className="flex flex-wrap gap-2">
          {PALETTE.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setColor(option)}
              aria-label={`Color ${option}`}
              className={`size-8 rounded-full transition-transform ${
                color === option ? 'scale-110 ring-2 ring-base-content ring-offset-2 ring-offset-base-200' : ''
              }`}
              style={{ backgroundColor: option }}
            />
          ))}
        </div>
      </Field>

      {error && <Alert tone="error">{error}</Alert>}

      <div className="flex gap-2">
        <Button tone="ghost" size="sm" onClick={onCancel} className="flex-1">
          Cancelar
        </Button>
        <Button
          tone="primary"
          size="sm"
          onClick={() => create.mutate()}
          loading={create.isPending}
          disabled={!name.trim() || !categoryId}
          className="flex-1"
        >
          {create.isPending ? 'Creando…' : 'Crear'}
        </Button>
      </div>
    </Card>
  );
};

export default function AdminTeams() {
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const season = useQuery({
    queryKey: ['season-active'],
    queryFn: () => api.get<Season>('/seasons/active'),
    retry: false,
  });

  const teams = useQuery({
    queryKey: ['teams'],
    queryFn: () => api.get<TeamSummary[]>('/teams'),
  });

  if (teams.isLoading || season.isLoading) return <Spinner />;

  if (teams.isError) {
    return <Alert tone="error">No se pudieron cargar los equipos. Actualiza la página y, si continúa, revisa la conexión con el servidor.</Alert>;
  }

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['teams'] });
    void queryClient.invalidateQueries({ queryKey: ['validation-stats'] });
    setCreating(false);
  };
  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/admin/teams/${id}`),
    onSuccess: refresh,
  });

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Equipos</h1>
          <p className="text-sm text-base-content/60">
            {teams.data?.length ?? 0} equipo(s) en la temporada
          </p>
        </div>
        {!creating && season.data && (
          <button onClick={() => setCreating(true)} className="btn btn-primary btn-sm">
            Nuevo equipo
          </button>
        )}
      </div>

      {!season.data && (
        <Alert tone="warning">
          No hay una temporada activa. Crea una antes de registrar equipos.
        </Alert>
      )}

      {creating && season.data && (
        <NewTeamForm season={season.data} onCreated={refresh} onCancel={() => setCreating(false)} />
      )}

      {(teams.data?.length ?? 0) === 0 && !creating ? (
        <Card>
          <EmptyState
            icon={<IconShield size={40} />}
            title="Todavía no hay equipos"
            description="Crea los equipos de la temporada y asigna a sus encargados para que empiecen a registrar jugadores."
          />
        </Card>
      ) : (
        <ul className="space-y-2">
          {teams.data?.map((team) => {
            const total = Number(team.players_total);
            const eligible = Number(team.players_eligible);
            const pending = Number(team.players_pending);

            return (
              <Card as="li" key={team.id}>
                <div className="flex items-center gap-3 p-3 transition-colors hover:bg-base-300/40">
                  <Link to={`/admin/equipos/${team.id}`} aria-label={`Abrir equipo ${team.name}`} className="flex min-w-0 flex-1 items-center gap-3">
                  <TeamCrest
                    logoUrl={team.logo_url}
                    name={team.name}
                    shortName={team.short_name}
                    color={team.color_primary}
                    className="size-11 text-xs"
                  />

                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{team.name}</p>
                    <p className="text-xs text-base-content/60">
                      {team.category_name} ·{' '}
                      <span className="tabular">
                        {eligible}/{total}
                      </span>{' '}
                      elegibles
                      {pending > 0 && (
                        <span className="text-warning"> · {pending} en revisión</span>
                      )}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-base-content/40">
                      {team.managers.length === 0
                        ? 'Sin encargados asignados'
                        : team.managers.map((m) => m.name).join(', ')}
                    </p>
                  </div>

                  {team.managers.length === 0 && (
                    <span
                      className="shrink-0 text-warning"
                      title="Falta asignar encargado"
                      aria-label="Falta asignar encargado"
                    >
                      <IconWarning size={20} />
                    </span>
                  )}
                  </Link>
                  <Button size="xs" tone="error" outline loading={remove.isPending}
                    onClick={(event) => { event.preventDefault(); if (window.confirm(`¿Eliminar ${team.name}? Solo se puede eliminar si no tiene jugadores ni partidos.`)) remove.mutate(team.id); }}>
                    Eliminar
                  </Button>
                </div>
              </Card>
            );
          })}
        </ul>
      )}
    </div>
  );
}
