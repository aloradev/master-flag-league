import { Dialog } from '../../components/Dialog';
import { useState, useRef } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../../lib/api';
import type { TeamDetail as Team } from '../../lib/types';
import { Alert, Button, Card, Field, Spinner } from '../../components/ui';
import { StatusBadge, EligibilityBadge } from '../../components/StatusBadge';
import { PlayerAvatar, TeamCrest } from '../../components/AuthImage';
import { useAuth } from '../../store/auth';

interface ManagerOption {
  id: string;
  name: string;
  email: string;
  active: boolean;
  role: string;
  role_label: string;
  teams: { id: string; name: string }[];
}

const MAX_MANAGERS = 2;

export default function AdminTeamDetail() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const restoreSession = useAuth((state) => state.restore);
  const [assigning, setAssigning] = useState(false);
  const [selected, setSelected] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [editando, setEditando] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  const team = useQuery({
    queryKey: ['team', id],
    queryFn: () => api.get<Team>(`/teams/${id}`),
    enabled: Boolean(id),
  });

  // La relación usuario-equipo es muchos-a-muchos. También se puede asignar
  // a un administrador: conserva su rol global, y la membresía identifica el
  // equipo del que se ocupa como encargado.
  const candidates = useQuery({
    queryKey: ['users', 'manager-candidates'],
    queryFn: () => api.get<ManagerOption[]>('/admin/users?active=true'),
    enabled: assigning,
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['team', id] });
    void queryClient.invalidateQueries({ queryKey: ['teams'] });
    void queryClient.invalidateQueries({ queryKey: ['teams-managed'] });
    void queryClient.invalidateQueries({ queryKey: ['round-teams'] });
    void queryClient.invalidateQueries({ queryKey: ['manual-round-options'] });
    void queryClient.invalidateQueries({ queryKey: ['users'] });
  };

  const assign = useMutation({
    mutationFn: (userId: string) => api.post(`/admin/teams/${id}/managers`, { userId }),
    onSuccess: () => {
      setError(null);
      setAssigning(false);
      setSelected('');
      refresh();
      void restoreSession();
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'No se pudo asignar'),
  });

  /**
   * El logo se redimensiona en el servidor a 512 px WebP: se sube el
   * archivo original tal como salió del diseñador y la API se encarga
   * de que no pese 4 MB en cada listado.
   */
  const uploadLogo = useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      return api.upload(`/teams/${id}/logo`, formData);
    },
    onSuccess: () => {
      setError(null);
      refresh();
    },
    onError: (err) =>
      setError(err instanceof ApiError ? err.message : 'No se pudo subir el logo'),
  });

  const remove = useMutation({
    mutationFn: (userId: string) => api.del(`/admin/teams/${id}/managers/${userId}`),
    onSuccess: () => {
      setError(null);
      refresh();
      void restoreSession();
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
      ['TEAM_MANAGER', 'SUPER_ADMIN', 'SPORTS_ADMIN'].includes(candidate.role) &&
      !data.managers.some((manager) => manager.id === candidate.id)
  );

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link to="/admin/equipos" className="inline-block text-sm text-base-content/60 hover:text-base-content">
        ← Equipos
      </Link>

      {/* Identidad */}
      <Card className="p-4">
        <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-4 sm:flex">
          <TeamCrest
            logoUrl={data.logo_url}
            name={data.name}
            shortName={data.short_name}
            color={data.color_primary}
            className="size-16 text-lg"
          />
          <div className="min-w-0 flex-1">
            <h1 className="break-words text-xl font-bold leading-tight">{data.name}</h1>
            <p className="text-sm text-base-content/60">
              {data.category_name} · {data.season_name}
            </p>
            <div className="mt-1.5">
              <input
                ref={logoInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) uploadLogo.mutate(file);
                  if (logoInputRef.current) logoInputRef.current.value = '';
                }}
              />
              <Button
                size="xs"
                onClick={() => logoInputRef.current?.click()}
                loading={uploadLogo.isPending}
              >
                {uploadLogo.isPending
                  ? 'Subiendo…'
                  : data.logo_url
                    ? 'Cambiar logo'
                    : 'Subir logo'}
              </Button>
            </div>
          </div>
          <div className="col-span-2 flex flex-wrap gap-2 sm:shrink-0">
            <Button size="sm" onClick={() => { setEditando(true); setError(null); }}>
              Editar
            </Button>
            <Link to={`/admin/equipos/${id}/roster`} className="btn btn-sm">
              Roster
            </Link>
          </div>
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
                  No hay managers ni administradores disponibles para asignar.
                </p>
                <div className="flex gap-2">
                  <Button tone="ghost" size="sm" onClick={() => setAssigning(false)} className="flex-1">
                    Cerrar
                  </Button>
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
                        {candidate.name} · {candidate.role_label}
                        {candidate.teams.length > 0
                          ? ` · ${candidate.teams.length} equipo(s)`
                          : ''}
                      </option>
                    ))}
                  </select>
                </Field>
                <div className="flex gap-2">
                  <Button
                    tone="ghost"
                    size="sm"
                    onClick={() => {
                      setAssigning(false);
                      setSelected('');
                    }}
                    className="flex-1"
                  >
                    Cancelar
                  </Button>
                  <Button
                    tone="primary"
                    size="sm"
                    onClick={() => selected && assign.mutate(selected)}
                    loading={assign.isPending}
                    disabled={!selected}
                    className="flex-1"
                  >
                    {assign.isPending ? 'Asignando…' : 'Asignar'}
                  </Button>
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
                <Button
                  tone="ghost"
                  size="xs"
                  onClick={() => remove.mutate(manager.id)}
                  loading={remove.isPending}
                  className="shrink-0 text-error"
                >
                  Remover
                </Button>
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
          // Cada renglón es un ENLACE al jugador. Hasta ahora la
          // plantilla era un callejón sin salida para administración: se
          // veía el nombre y no había forma de abrir la ficha.
          <ul className="space-y-2">
            {data.roster.map((player) => (
              <Card as="li" key={player.id}>
                <Link
                  to={`/equipo/jugadores/${player.id}`}
                  className="flex items-center gap-3 rounded-box p-3 transition-colors hover:bg-base-300/40"
                >
                <PlayerAvatar
                  avatarUrl={player.avatar_url}
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
                </Link>
              </Card>
            ))}
          </ul>
        )}
      </section>

      {editando && (
        <EditarEquipo
          equipo={data}
          onCerrar={() => setEditando(false)}
          onGuardado={() => { setEditando(false); refresh(); }}
          onError={setError}
        />
      )}
    </div>
  );
}

/**
 * Editar los datos del equipo.
 *
 * `PUT /teams/:id` existía desde la Fase 1 y ninguna pantalla lo llamaba:
 * cambiar el nombre de un equipo mal escrito no se podía hacer desde la
 * aplicación. El caso llega el primer día de inscripciones, con un
 * dedazo en un nombre.
 *
 * El estado (activo / suspendido) va aparte y con su explicación, porque
 * suspender saca al equipo del generador de jornadas y de la tabla: no
 * es lo mismo que corregirle el nombre.
 */
const EditarEquipo = ({
  equipo,
  onCerrar,
  onGuardado,
  onError,
}: {
  equipo: Team;
  onCerrar: () => void;
  onGuardado: () => void;
  onError: (m: string) => void;
}) => {
  const [form, setForm] = useState({
    name: equipo.name,
    clubName: equipo.club_name ?? '',
    shortName: equipo.short_name ?? '',
    colorPrimary: equipo.color_primary || '#1f2937',
    colorSecondary: equipo.color_secondary || '#f9fafb',
    status: equipo.status ?? 'ACTIVE',
  });
  const [guardando, setGuardando] = useState(false);

  const enviar = async () => {
    setGuardando(true);
    try {
      await api.put(`/teams/${equipo.id}`, {
        name: form.name.trim(),
        clubName: form.clubName.trim(),
        shortName: form.shortName.trim() || undefined,
        colorPrimary: form.colorPrimary,
        colorSecondary: form.colorSecondary,
        status: form.status,
      });
      onGuardado();
    } catch (e) {
      onError(e instanceof ApiError ? e.message : 'No se pudo guardar el equipo');
      onCerrar();
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Dialog title="Editar equipo" onClose={() => { if (!guardando) onCerrar(); }}>
        <Field label="Nombre" required>
          <input
            className="input input-bordered w-full"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
        </Field>

        <Field label="Club para horarios" hint="Usa el mismo club en femenil, varonil y mixto para evitar que mixto coincida con varonil o femenil. Varonil y femenil sí pueden coincidir. Si lo dejas vacío, se usa el nombre del equipo.">
          <input className="input input-bordered w-full" maxLength={150} value={form.clubName} onChange={e=>setForm({...form,clubName:e.target.value})} />
        </Field>
        <Field label="Nombre corto" hint="Tres o cuatro letras. Es lo que cabe en el marcador.">
          <input
            className="input input-bordered w-full uppercase"
            maxLength={20}
            value={form.shortName}
            onChange={(e) => setForm({ ...form, shortName: e.target.value })}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Color principal">
            <input
              type="color"
              className="input input-bordered h-10 w-full p-1"
              value={form.colorPrimary}
              onChange={(e) => setForm({ ...form, colorPrimary: e.target.value })}
            />
          </Field>
          <Field label="Color secundario">
            <input
              type="color"
              className="input input-bordered h-10 w-full p-1"
              value={form.colorSecondary}
              onChange={(e) => setForm({ ...form, colorSecondary: e.target.value })}
            />
          </Field>
        </div>

        <Field
          label="Estado"
          hint="Un equipo suspendido sale del generador de jornadas y de la tabla de posiciones."
        >
          <select
            className="select select-bordered w-full"
            value={form.status}
            onChange={(e) => setForm({ ...form, status: e.target.value })}
          >
            <option value="ACTIVE">Activo</option>
            <option value="SUSPENDED">Suspendido</option>
          </select>
        </Field>

        <Button
          tone="primary"
          block
          loading={guardando}
          disabled={!form.name.trim()}
          onClick={enviar}
        >
          Guardar cambios
        </Button>
    </Dialog>
  );
};
