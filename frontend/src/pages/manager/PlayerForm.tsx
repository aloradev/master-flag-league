import { useState, type FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api, ApiError } from '../../lib/api';
import type { TeamSummary } from '../../lib/types';
import { Alert, Button, Card, Field, Spinner } from '../../components/ui';

/** Posiciones habituales en flag football. */
const POSITIONS = ['QB', 'WR', 'RB', 'C', 'TE', 'DB', 'LB', 'RUSH', 'SAFETY'];

export default function PlayerForm() {
  const navigate = useNavigate();

  const teams = useQuery({
    queryKey: ['teams'],
    queryFn: () => api.get<TeamSummary[]>('/teams'),
  });

  const [form, setForm] = useState({
    firstName: '',
    lastNamePaternal: '',
    lastNameMaternal: '',
    dateOfBirth: '',
    jerseyNumber: '',
    position: '',
    phone: '',
    email: '',
  });
  const [teamId, setTeamId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const selectedTeam = teamId || teams.data?.[0]?.id || '';

  const update = (key: keyof typeof form) => (value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const created = await api.post<{ id: string }>('/players', {
        teamId: selectedTeam,
        firstName: form.firstName.trim(),
        lastNamePaternal: form.lastNamePaternal.trim(),
        lastNameMaternal: form.lastNameMaternal.trim() || undefined,
        dateOfBirth: form.dateOfBirth,
        jerseyNumber: form.jerseyNumber ? Number(form.jerseyNumber) : undefined,
        position: form.position || undefined,
        phone: form.phone.trim() || undefined,
        email: form.email.trim() || undefined,
      });

      // El jugador ya existe; el siguiente paso es su documentación.
      navigate(`/equipo/jugadores/${created.id}?nuevo=1`, { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo registrar al jugador');
      setSaving(false);
    }
  };

  if (teams.isLoading) return <Spinner />;

  const complete =
    form.firstName.trim() && form.lastNamePaternal.trim() && form.dateOfBirth && selectedTeam;

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <div>
        <Link to="/equipo" className="text-sm text-base-content/60 hover:text-base-content">
          ← Mi equipo
        </Link>
        <h1 className="mt-1 text-xl font-bold">Agregar jugador</h1>
        <p className="text-sm text-base-content/60">
          Paso 1 de 2 · Después subirás su fotografía e identificación.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <Card className="space-y-4 p-4">
          {(teams.data?.length ?? 0) > 1 && (
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
              required
              autoFocus
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Apellido paterno" required>
              <input
                className="input input-bordered w-full"
                value={form.lastNamePaternal}
                onChange={(e) => update('lastNamePaternal')(e.target.value)}
                required
              />
            </Field>

            <Field label="Apellido materno">
              <input
                className="input input-bordered w-full"
                value={form.lastNameMaternal}
                onChange={(e) => update('lastNameMaternal')(e.target.value)}
              />
            </Field>
          </div>

          <Field label="Fecha de nacimiento" required>
            <input
              type="date"
              className="input input-bordered w-full"
              value={form.dateOfBirth}
              onChange={(e) => update('dateOfBirth')(e.target.value)}
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
                max={99}
                className="input input-bordered w-full tabular"
                value={form.jerseyNumber}
                onChange={(e) => update('jerseyNumber')(e.target.value)}
              />
            </Field>

            <Field label="Posición">
              <select
                className="select select-bordered w-full"
                value={form.position}
                onChange={(e) => update('position')(e.target.value)}
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
              />
            </Field>

            <Field label="Correo electrónico">
              <input
                type="email"
                inputMode="email"
                className="input input-bordered w-full"
                value={form.email}
                onChange={(e) => update('email')(e.target.value)}
              />
            </Field>
          </div>
        </Card>

        {error && <Alert tone="error">{error}</Alert>}

        <div className="flex gap-2">
          <Link to="/equipo" className="btn btn-ghost flex-1">
            Cancelar
          </Link>
          <Button
            type="submit"
            tone="primary"
            className="flex-1"
            loading={saving}
            disabled={!complete}
          >
            {saving ? 'Registrando…' : 'Continuar'}
          </Button>
        </div>
      </form>
    </div>
  );
}
