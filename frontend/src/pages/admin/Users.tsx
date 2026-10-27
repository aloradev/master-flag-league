import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../../lib/api';
import type { Role } from '../../lib/types';
import { Alert, Button, Card, EmptyState, Field, Spinner } from '../../components/ui';
import { useAuth } from '../../store/auth';
import { IconUsers } from '../../components/icons';

interface UserRow {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  active: boolean;
  role: Role;
  role_label: string;
  last_login_at: string | null;
  teams: { id: string; name: string }[];
}

const ROLE_OPTIONS: { value: Role; label: string; help: string }[] = [
  { value: 'TEAM_MANAGER', label: 'Manager de Equipo', help: 'Registra jugadores de su equipo' },
  { value: 'REFEREE', label: 'Árbitro', help: 'Registra marcador y estadísticas' },
  { value: 'SPORTS_ADMIN', label: 'Admin Deportivo', help: 'Valida jugadores y administra partidos' },
  { value: 'FINANCE_ADMIN', label: 'Admin Financiero', help: 'Pagos, ingresos y gastos' },
  { value: 'SUPER_ADMIN', label: 'Super Administrador', help: 'Control total de la plataforma' },
];

/** La contraseña temporal se muestra una sola vez: hay que poder copiarla. */
const CredentialsPanel = ({
  email,
  password,
  onClose,
}: {
  email: string;
  password: string;
  onClose: () => void;
}) => {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`Usuario: ${email}\nContraseña temporal: ${password}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <Alert tone="success" title="Usuario creado">
      <p className="text-base-content/80">
        Entrégale estos datos. La contraseña no se vuelve a mostrar y se le pedirá
        cambiarla al ingresar.
      </p>
      <div className="mt-2 space-y-1 rounded-field bg-base-100/60 p-3 font-mono text-sm text-base-content">
        <div>{email}</div>
        <div className="text-lg font-bold tracking-wider">{password}</div>
      </div>
      <div className="mt-2 flex gap-2">
        <Button size="sm" onClick={copy}>
          {copied ? '✓ Copiado' : 'Copiar'}
        </Button>
        <Button tone="ghost" size="sm" onClick={onClose}>
          Entendido
        </Button>
      </div>
    </Alert>
  );
};

const NewUserForm = ({
  onCreated,
  onCancel,
  canCreateSuperAdmin,
}: {
  onCreated: (credentials: { email: string; password: string }) => void;
  onCancel: () => void;
  canCreateSuperAdmin: boolean;
}) => {
  const [form, setForm] = useState({ name: '', email: '', phone: '', role: 'TEAM_MANAGER' as Role });
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () =>
      api.post<{ id: string; email: string; temporaryPassword?: string }>('/admin/users', {
        name: form.name.trim(),
        email: form.email.trim().toLowerCase(),
        phone: form.phone.trim() || undefined,
        role: form.role,
      }),
    onSuccess: (data) => {
      setError(null);
      onCreated({ email: data.email, password: data.temporaryPassword ?? '—' });
      setForm({ name: '', email: '', phone: '', role: 'TEAM_MANAGER' });
    },
    onError: (err) =>
      setError(err instanceof ApiError ? err.message : 'No se pudo crear el usuario'),
  });

  const options = canCreateSuperAdmin
    ? ROLE_OPTIONS
    : ROLE_OPTIONS.filter((option) => option.value !== 'SUPER_ADMIN');
  const selected = options.find((option) => option.value === form.role);

  return (
    <Card className="space-y-3 p-4">
      <h2 className="font-semibold">Nuevo usuario</h2>

      <Field label="Nombre completo" required>
        <input
          className="input input-bordered w-full"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          autoFocus
        />
      </Field>

      <Field label="Correo electrónico" hint="Será su usuario para ingresar" required>
        <input
          type="email"
          inputMode="email"
          className="input input-bordered w-full"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
        />
      </Field>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Teléfono">
          <input
            type="tel"
            inputMode="tel"
            className="input input-bordered w-full"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
          />
        </Field>

        <Field label="Rol" hint={selected?.help} required>
          <select
            className="select select-bordered w-full"
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value as Role })}
          >
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>
      </div>

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
          disabled={!form.name.trim() || !form.email.trim()}
          className="flex-1"
        >
          {create.isPending ? 'Creando…' : 'Crear'}
        </Button>
      </div>
    </Card>
  );
};

const UserRowCard = ({ user, onChanged }: { user: UserRow; onChanged: () => void }) => {
  const { user: current } = useAuth();
  const [expanded, setExpanded] = useState(false);
  const [resetPassword, setResetPassword] = useState<string | null>(null);
  const [enlace, setEnlace] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isSelf = user.id === current?.id;
  const canChangeRole = current?.role === 'SUPER_ADMIN';

  const update = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.put(`/admin/users/${user.id}`, body),
    onSuccess: () => {
      setError(null);
      onChanged();
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'No se pudo actualizar'),
  });

  const reset = useMutation({
    mutationFn: () =>
      api.post<{ temporaryPassword: string }>(`/admin/users/${user.id}/reset-password`),
    onSuccess: (data) => {
      setEnlace(null);
      setResetPassword(data.temporaryPassword);
    },
    onError: (err) =>
      setError(err instanceof ApiError ? err.message : 'No se pudo restablecer la contraseña'),
  });

  /**
   * El enlace se prefiere sobre la contraseña temporal: NO cambia la
   * contraseña actual, así que si el encargado encuentra la suya antes de
   * abrirlo, sigue entrando con ella. La temporal, en cambio, deja fuera
   * a quien no llegó a leer el mensaje.
   */
  const generarEnlace = useMutation({
    mutationFn: () => api.post<{ url: string }>(`/admin/users/${user.id}/reset-link`),
    onSuccess: async (data) => {
      setResetPassword(null);
      setEnlace(data.url);
      setCopiado(false);
      try {
        await navigator.clipboard.writeText(data.url);
        setCopiado(true);
      } catch {
        // Sin permiso de portapapeles: el enlace queda a la vista para
        // seleccionarlo a mano, que es por lo que también se muestra.
      }
    },
    onError: (err) =>
      setError(err instanceof ApiError ? err.message : 'No se pudo generar el enlace'),
  });

  const copiar = async () => {
    if (!enlace) return;
    try {
      await navigator.clipboard.writeText(enlace);
      setCopiado(true);
    } catch {
      setCopiado(false);
    }
  };

  return (
    <Card as="li" className="p-3">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-3 text-left"
      >
        <div
          className={`size-2 shrink-0 rounded-full ${user.active ? 'bg-success' : 'bg-base-content/30'}`}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">
            {user.name}
            {isSelf && <span className="ml-1.5 text-xs text-base-content/50">(tú)</span>}
          </p>
          <p className="truncate text-xs text-base-content/60">{user.email}</p>
          <p className="mt-0.5 text-xs text-base-content/40">
            {user.role_label}
            {user.teams.length > 0 && ` · ${user.teams.map((t) => t.name).join(', ')}`}
            {!user.active && ' · Desactivado'}
          </p>
        </div>
        <span className="shrink-0 text-base-content/40" aria-hidden>
          {expanded ? '▴' : '▾'}
        </span>
      </button>

      {expanded && (
        <div className="mt-3 space-y-2 border-t border-base-300 pt-3">
          {resetPassword && (
            <div className="rounded-field bg-success/10 p-3">
              <p className="text-xs text-base-content/70">Nueva contraseña temporal:</p>
              <p className="font-mono text-lg font-bold tracking-wider">{resetPassword}</p>
            </div>
          )}

          {enlace && (
            <div className="space-y-2 rounded-field bg-info/10 p-3">
              <p className="text-xs text-base-content/70">
                Enlace para {user.name}. Vence en una hora y solo sirve una vez.
              </p>
              <p className="break-all font-mono text-xs">{enlace}</p>
              <div className="flex flex-wrap gap-2">
                <Button size="xs" onClick={copiar}>
                  {copiado ? 'Copiado ✓' : 'Copiar enlace'}
                </Button>
                <a
                  href={`https://wa.me/?text=${encodeURIComponent(
                    `Hola ${user.name}, abre este enlace para poner tu contraseña de Master Flag League. Vence en una hora: ${enlace}`
                  )}`}
                  target="_blank"
                  rel="noreferrer"
                  className="btn btn-xs"
                >
                  Enviar por WhatsApp
                </a>
              </div>
            </div>
          )}

          {error && <Alert tone="error">{error}</Alert>}

          {canChangeRole && !isSelf && (
            <Field label="Rol">
              <select
                className="select select-bordered select-sm w-full"
                value={user.role}
                onChange={(e) => update.mutate({ role: e.target.value })}
                disabled={update.isPending}
              >
                {ROLE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </Field>
          )}

          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              tone="primary"
              onClick={() => generarEnlace.mutate()}
              loading={generarEnlace.isPending}
            >
              {generarEnlace.isPending ? 'Generando…' : 'Generar enlace'}
            </Button>

            <Button size="sm" outline onClick={() => reset.mutate()} loading={reset.isPending}>
              {reset.isPending ? 'Restableciendo…' : 'Contraseña temporal'}
            </Button>

            {!isSelf && (
              <Button
                size="sm"
                tone={user.active ? 'error' : 'success'}
                outline
                onClick={() => update.mutate({ active: !user.active })}
                loading={update.isPending}
              >
                {user.active ? 'Desactivar' : 'Reactivar'}
              </Button>
            )}
          </div>

          {user.last_login_at && (
            <p className="text-xs text-base-content/40">
              Último ingreso:{' '}
              {new Date(user.last_login_at).toLocaleDateString('es-MX', {
                day: 'numeric',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </p>
          )}
        </div>
      )}
    </Card>
  );
};

export default function AdminUsers() {
  const queryClient = useQueryClient();
  const { user: current } = useAuth();
  const [creating, setCreating] = useState(false);
  const [credentials, setCredentials] = useState<{ email: string; password: string } | null>(null);
  const [roleFilter, setRoleFilter] = useState('');

  const users = useQuery({
    queryKey: ['users', roleFilter],
    queryFn: () => api.get<UserRow[]>(`/admin/users${roleFilter ? `?role=${roleFilter}` : ''}`),
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['users'] });
    void queryClient.invalidateQueries({ queryKey: ['teams'] });
  };

  if (users.isLoading) return <Spinner />;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Usuarios</h1>
          <p className="text-sm text-base-content/60">
            {users.data?.length ?? 0} usuario(s) con acceso a la plataforma
          </p>
        </div>
        {!creating && (
          <button onClick={() => setCreating(true)} className="btn btn-primary btn-sm">
            Nuevo usuario
          </button>
        )}
      </div>

      {credentials && (
        <CredentialsPanel
          email={credentials.email}
          password={credentials.password}
          onClose={() => setCredentials(null)}
        />
      )}

      {creating && (
        <NewUserForm
          canCreateSuperAdmin={current?.role === 'SUPER_ADMIN'}
          onCreated={(data) => {
            setCredentials(data);
            setCreating(false);
            refresh();
          }}
          onCancel={() => setCreating(false)}
        />
      )}

      <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar">
        <button
          aria-pressed={roleFilter === ''}
          onClick={() => setRoleFilter('')}
          className={`min-h-11 shrink-0 rounded-full border px-3 py-2 text-xs ${
            roleFilter === ''
              ? 'border-primary bg-primary/15 text-primary'
              : 'border-base-content/20 text-base-content/60'
          }`}
        >
          Todos
        </button>
        {ROLE_OPTIONS.map((option) => (
          <button
            key={option.value}
            aria-pressed={roleFilter === option.value}
            onClick={() => setRoleFilter(option.value)}
            className={`min-h-11 shrink-0 rounded-full border px-3 py-2 text-xs ${
              roleFilter === option.value
                ? 'border-primary bg-primary/15 text-primary'
                : 'border-base-content/20 text-base-content/60'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {(users.data?.length ?? 0) === 0 ? (
        <Card>
          <EmptyState
            icon={<IconUsers size={40} />}
            title="Sin usuarios en este filtro"
            description="Crea los encargados de equipo y árbitros para que puedan usar la plataforma."
          />
        </Card>
      ) : (
        <ul className="space-y-2">
          {users.data?.map((user) => (
            <UserRowCard key={user.id} user={user} onChanged={refresh} />
          ))}
        </ul>
      )}
    </div>
  );
}
