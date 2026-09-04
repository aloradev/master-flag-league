import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth, homeFor } from '../store/auth';
import { Alert, Button, Field } from '../components/ui';
import { Logo } from '../components/Logo';
import { ThemeToggle } from '../components/ThemeToggle';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { login, error, submitting, status, user, clearError } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const restablecida = params.get('restablecida') === '1';

  if (status === 'authenticated' && user) {
    return (
      <Navigate
        to={user.mustChangePassword ? '/cambiar-contrasena' : homeFor(user.role)}
        replace
      />
    );
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      const session = await login(email.trim(), password);
      navigate(session.mustChangePassword ? '/cambiar-contrasena' : homeFor(session.role), {
        replace: true,
      });
    } catch {
      /* el mensaje ya quedó en el store */
    }
  };

  return (
    <div className="hero-gradient relative flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="absolute right-3 top-3">
        <ThemeToggle compact />
      </div>

      <div className="w-full max-w-sm">
        <div className="mb-7 flex flex-col items-center text-center">
          <Logo size="md" className="w-36 drop-shadow-lg sm:w-40" priority />
          <p className="mt-4 text-sm text-base-content/60">
            Sistema de gestión de la liga
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-4 rounded-box border border-base-300 bg-base-200/80 p-6 shadow-lg backdrop-blur"
        >
          <Field label="Correo electrónico" required>
            <input
              type="email"
              autoComplete="username"
              inputMode="email"
              className="input input-bordered w-full"
              placeholder="tu@correo.com"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (error) clearError();
              }}
              required
              autoFocus
              disabled={submitting}
            />
          </Field>

          <Field label="Contraseña" required>
            <input
              type="password"
              autoComplete="current-password"
              className="input input-bordered w-full"
              placeholder="••••••••"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (error) clearError();
              }}
              required
              disabled={submitting}
            />
          </Field>

          {restablecida && !error && (
            <Alert tone="success">
              Tu contraseña quedó cambiada. Entra con la nueva.
            </Alert>
          )}

          {error && <Alert tone="error">{error}</Alert>}

          <Button
            type="submit"
            tone="primary"
            block
            loading={submitting}
            disabled={!email || !password}
          >
            {submitting ? 'Verificando…' : 'Ingresar'}
          </Button>
        </form>

        <div className="mt-4 text-center">
          <Link
            to="/recuperar"
            className="text-sm text-base-content/60 underline-offset-2 hover:text-base-content hover:underline"
          >
            Olvidé mi contraseña
          </Link>
        </div>

        <p className="mt-5 text-center text-xs text-base-content/40">
          Si no tienes acceso, solicítalo a la administración de la liga.
        </p>
      </div>
    </div>
  );
}
