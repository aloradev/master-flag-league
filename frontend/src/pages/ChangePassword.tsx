import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { useAuth, homeFor } from '../store/auth';
import { Alert, Button, Field } from '../components/ui';
import { Logo } from '../components/Logo';

export default function ChangePassword() {
  const { user, markPasswordChanged, logout } = useAuth();
  const navigate = useNavigate();

  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [details, setDetails] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const mismatch = confirm.length > 0 && next !== confirm;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (mismatch) return;

    setSaving(true);
    setError(null);
    setDetails([]);

    try {
      await api.post('/auth/change-password', { currentPassword: current, newPassword: next });
      markPasswordChanged();
      navigate(homeFor(user?.role), { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        if (Array.isArray(err.details)) setDetails(err.details as string[]);
      } else {
        setError('No se pudo actualizar la contraseña');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="hero-gradient flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <Logo size="sm" className="w-20" />
          <h1 className="mt-3 text-xl font-bold">Define tu contraseña</h1>
          <p className="mt-1 text-sm text-base-content/60">
            Tu acceso se creó con una contraseña temporal. Elige una propia para continuar.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-4 rounded-box border border-base-300/70 bg-base-200/70 p-6 backdrop-blur"
        >
          <Field label="Contraseña temporal" required>
            <input
              type="password"
              autoComplete="current-password"
              className="input input-bordered w-full"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              required
              autoFocus
            />
          </Field>

          <Field
            label="Nueva contraseña"
            hint="Mínimo 8 caracteres, con al menos una letra y un número"
            required
          >
            <input
              type="password"
              autoComplete="new-password"
              className="input input-bordered w-full"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              required
            />
          </Field>

          <Field
            label="Confirma la nueva contraseña"
            error={mismatch ? 'Las contraseñas no coinciden' : undefined}
            required
          >
            <input
              type="password"
              autoComplete="new-password"
              className={`input input-bordered w-full ${mismatch ? 'input-error' : ''}`}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
            />
          </Field>

          {error && (
            <Alert tone="error" title={error}>
              {details.length > 0 && (
                <ul className="list-inside list-disc">
                  {details.map((detail) => (
                    <li key={detail}>{detail}</li>
                  ))}
                </ul>
              )}
            </Alert>
          )}

          <Button
            type="submit"
            tone="primary"
            block
            loading={saving}
            disabled={mismatch || !current || !next || !confirm}
          >
            {saving ? 'Guardando…' : 'Guardar y continuar'}
          </Button>

          <Button type="button" tone="ghost" size="sm" block onClick={logout}>
            Cerrar sesión
          </Button>
        </form>
      </div>
    </div>
  );
}
