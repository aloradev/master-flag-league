import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams, Link, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../../lib/api';
import type { PlayerDetail, TeamSummary } from '../../lib/types';
import { Alert, Button, Card, Field, Spinner } from '../../components/ui';
import { IconWarning } from '../../components/icons';
import { activeTeamId } from '../../lib/teamContext';

/** Posiciones habituales en flag football. */
const POSITIONS = ['QB', 'WR', 'RB', 'C', 'TE', 'DB', 'LB', 'RUSH', 'SAFETY'];

const VACIO = {
  firstName: '',
  lastNamePaternal: '',
  lastNameMaternal: '',
  dateOfBirth: '',
  jerseyNumber: '',
  position: '',
  phone: '',
  email: '',
};

/**
 * ALTA Y EDICIÓN DE JUGADOR
 *
 * Un solo formulario para las dos cosas. Existía únicamente el alta: el
 * endpoint de edición estaba en la API desde la Fase 1 y ninguna
 * pantalla lo llamaba nunca, así que en la práctica un jugador
 * registrado no se podía corregir ni siendo Super Admin.
 *
 * Los campos que quien consulta no puede tocar llegan deshabilitados y
 * con el motivo escrito, en lugar de aceptar el cambio y rechazarlo al
 * guardar. Que la regla se vea antes de teclear es la diferencia entre
 * una restricción y una sorpresa.
 */
export default function PlayerForm() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const editando = Boolean(id);
  const requestedTeamId = searchParams.get('equipo');

  const teams = useQuery({
    queryKey: ['teams-managed'],
    queryFn: () => api.get<TeamSummary[]>('/teams?managed=true'),
    enabled: !editando,
  });

  const jugador = useQuery({
    queryKey: ['player', id],
    queryFn: () => api.get<PlayerDetail>(`/players/${id}`),
    enabled: editando,
  });

  const [form, setForm] = useState(VACIO);
  const [teamId, setTeamId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Precarga al abrir en modo edición.
  useEffect(() => {
    const p = jugador.data;
    if (!p) return;
    setForm({
      firstName: p.first_name ?? '',
      lastNamePaternal: p.last_name_paternal ?? '',
      lastNameMaternal: p.last_name_maternal ?? '',
      dateOfBirth: (p.date_of_birth ?? '').slice(0, 10),
      jerseyNumber: p.jersey_number != null ? String(p.jersey_number) : '',
      position: p.position ?? '',
      phone: p.phone ?? '',
      email: p.email ?? '',
    });
  }, [jugador.data]);

  const selectedTeam =
    teamId ||
    teams.data?.find((candidate) => candidate.id === requestedTeamId)?.id ||
    teams.data?.find((candidate) => candidate.id === activeTeamId())?.id ||
    teams.data?.[0]?.id ||
    '';
  const contextTeamId = editando ? jugador.data?.team_id ?? requestedTeamId : selectedTeam;
  const teamQuery = contextTeamId ? `equipo=${encodeURIComponent(contextTeamId)}` : '';
  const update = (key: keyof typeof form) => (value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const permitidos = jugador.data?.editable_fields;
  /** En alta todo es editable; en edición manda la API. */
  const puede = (campo: keyof typeof form) => !editando || !permitidos || permitidos.includes(campo);

  const bloqueados = editando && permitidos
    ? (Object.keys(VACIO) as (keyof typeof form)[]).filter((c) => !permitidos.includes(c))
    : [];

  /**
   * Aviso antes de guardar, no después: cambiar la fecha de nacimiento de
   * un jugador aprobado lo devuelve a revisión, y eso se tiene que saber
   * antes de tocar el botón.
   */
  const nacimientoCambia =
    editando &&
    jugador.data?.status === 'APPROVED' &&
    form.dateOfBirth &&
    form.dateOfBirth !== (jugador.data?.date_of_birth ?? '').slice(0, 10);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);

    const cuerpo = {
      firstName: form.firstName.trim(),
      lastNamePaternal: form.lastNamePaternal.trim(),
      lastNameMaternal: form.lastNameMaternal.trim() || undefined,
      dateOfBirth: form.dateOfBirth,
      jerseyNumber: form.jerseyNumber ? Number(form.jerseyNumber) : undefined,
      position: form.position || undefined,
      phone: form.phone.trim() || undefined,
      email: form.email.trim() || undefined,
    };

    try {
      if (editando) {
        const r = await api.put<{ back_to_review?: boolean }>(`/players/${id}`, cuerpo);
        void qc.invalidateQueries({ queryKey: ['player', id] });
        void qc.invalidateQueries({ queryKey: ['team'] });
        void qc.invalidateQueries({ queryKey: ['teams'] });
        const resultFlag = r?.back_to_review ? 'revision=1' : 'guardado=1';
        navigate(`/equipo/jugadores/${id}?${resultFlag}${teamQuery ? `&${teamQuery}` : ''}`, {
          replace: true,
        });
      } else {
        const created = await api.post<{ id: string }>('/players', {
          teamId: selectedTeam,
          ...cuerpo,
        });
        // El jugador ya existe; el siguiente paso es su documentación.
        navigate(`/equipo/jugadores/${created.id}?nuevo=1${teamQuery ? `&${teamQuery}` : ''}`, { replace: true });
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo guardar');
      setSaving(false);
    }
  };

  if (editando ? jugador.isLoading : teams.isLoading) return <Spinner />;
  if (editando && jugador.error) {
    return <Alert tone="error">{(jugador.error as Error).message}</Alert>;
  }

  const complete =
    form.firstName.trim() &&
    form.lastNamePaternal.trim() &&
    form.dateOfBirth &&
    (editando || selectedTeam);

  const volverA = editando
    ? `/equipo/jugadores/${id}${teamQuery ? `?${teamQuery}` : ''}`
    : `/equipo${teamQuery ? `?${teamQuery}` : ''}`;

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <div>
        <Link to={volverA} className="text-sm text-base-content/60 hover:text-base-content">
          ← {editando ? jugador.data?.full_name ?? 'Jugador' : 'Mi equipo'}
        </Link>
        <h1 className="mt-1 text-xl font-bold">
          {editando ? 'Editar jugador' : 'Agregar jugador'}
        </h1>
        <p className="text-sm text-base-content/60">
          {editando
            ? `${jugador.data?.team_name} · ${jugador.data?.category_name}`
            : 'Paso 1 de 2 · Después subirás su fotografía e identificación.'}
        </p>
      </div>

      {bloqueados.length > 0 && (
        <Alert tone="info" title="Algunos datos solo los cambia administración">
          Este jugador ya fue revisado, así que su nombre, apellidos, fecha de nacimiento y
          número quedaron fijos: son los datos que respalda la identificación aprobada y el
          roster que firman los árbitros. El teléfono, el correo y la posición sí los puedes
          actualizar.
        </Alert>
      )}

      {nacimientoCambia && (
        <Alert tone="warning" title="Esto devolverá al jugador a revisión">
          <span className="flex items-start gap-2">
            <IconWarning size={16} />
            <span>
              Cambiar la fecha de nacimiento de un jugador aprobado lo regresa a revisión, y
              mientras tanto deja de ser elegible para jugar. La aprobación anterior ya no
              respaldaría el expediente.
            </span>
          </span>
        </Alert>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <Card className="space-y-4 p-4">
          {!editando && (teams.data?.length ?? 0) > 1 && (
            <Field label="Equipo" required>
              <select
                className="select select-bordered w-full"
                value={selectedTeam}
                onChange={(e) => setTeamId(e.target.value)}
                required
              >
                {teams.data!.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name} · {team.category_name}
                  </option>
                ))}
              </select>
            </Field>
          )}

          <Field label="Nombre(s)" required>
            <input
              className="input input-bordered w-full"
              value={form.firstName}
              onChange={(e) => update('firstName')(e.target.value)}
              disabled={!puede('firstName')}
              required
              autoFocus={!editando}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Apellido paterno" required>
              <input
                className="input input-bordered w-full"
                value={form.lastNamePaternal}
                onChange={(e) => update('lastNamePaternal')(e.target.value)}
                disabled={!puede('lastNamePaternal')}
                required
              />
            </Field>

            <Field label="Apellido materno">
              <input
                className="input input-bordered w-full"
                value={form.lastNameMaternal}
                onChange={(e) => update('lastNameMaternal')(e.target.value)}
                disabled={!puede('lastNameMaternal')}
              />
            </Field>
          </div>

          <Field
            label="Fecha de nacimiento"
            required
            hint={
              editando && puede('dateOfBirth')
                ? 'Es la que decide en qué categoría puede jugar.'
                : undefined
            }
          >
            <input
              type="date"
              className="input input-bordered w-full"
              value={form.dateOfBirth}
              onChange={(e) => update('dateOfBirth')(e.target.value)}
              disabled={!puede('dateOfBirth')}
              max={new Date().toISOString().slice(0, 10)}
              required
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Número de jersey" hint="Debe ser único en el equipo">
              <input
                type="number"
                inputMode="numeric"
                min={0}
                max={1000}
                className="input input-bordered w-full tabular"
                value={form.jerseyNumber}
                onChange={(e) => update('jerseyNumber')(e.target.value)}
                disabled={!puede('jerseyNumber')}
              />
            </Field>

            <Field label="Posición">
              <select
                className="select select-bordered w-full"
                value={form.position}
                onChange={(e) => update('position')(e.target.value)}
                disabled={!puede('position')}
              >
                <option value="">Sin especificar</option>
                {POSITIONS.map((position) => (
                  <option key={position} value={position}>
                    {position}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </Card>

        <Card className="space-y-4 p-4">
          <p className="text-xs text-base-content/50">
            Datos de contacto opcionales. No se muestran en el perfil público.
          </p>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Teléfono">
              <input
                type="tel"
                inputMode="tel"
                className="input input-bordered w-full"
                value={form.phone}
                onChange={(e) => update('phone')(e.target.value)}
                disabled={!puede('phone')}
              />
            </Field>

            <Field label="Correo electrónico">
              <input
                type="email"
                inputMode="email"
                className="input input-bordered w-full"
                value={form.email}
                onChange={(e) => update('email')(e.target.value)}
                disabled={!puede('email')}
              />
            </Field>
          </div>
        </Card>

        {error && <Alert tone="error">{error}</Alert>}

        <div className="flex gap-2">
          <Link to={volverA} className="btn btn-ghost flex-1">
            Cancelar
          </Link>
          <Button
            type="submit"
            tone="primary"
            className="flex-1"
            loading={saving}
            disabled={!complete}
          >
            {editando ? 'Guardar cambios' : 'Continuar'}
          </Button>
        </div>
      </form>
    </div>
  );
}
