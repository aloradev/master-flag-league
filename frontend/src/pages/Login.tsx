import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth, homeFor } from '../store/auth';
import { Alert, Field } from '../components/ui';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { login, error, submitting, status, user, clearError } = useAuth();
  const navigate = useNavigate();

  if (status === 'authenticated' && user) {
    return <Navigate to={user.mustChangePassword ? '/cambiar-contrasena' : homeFor(user.role)} replace />;
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      const session = await login(email.trim(), password);
      navigate(session.mustChangePassword ? '/cambiar-contrasena' : homeFor(session.role), {
        replace: true,
      });
    } catch {
      /* el mensaje ya está en el store */
    }
  };

  return (
    <div className="hero-gradient flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="text-5xl" aria-hidden>
            🏆
          </div>
          <h1 className="mt-3 text-2xl font-bold tracking-tight">Master Flag League</h1>
          <p className="mt-1 text-sm text-base-content/60">Liga de Flag Football · Cancún</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-4 rounded-box border border-base-300/70 bg-base-200/70 p-6 backdrop-blur"
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
            />
          </Field>

          {error && <Alert tone="error">{error}</Alert>}

          <button
            type="submit"
            className="btn btn-primary w-full"
            disabled={submitting || !email || !password}
          >
            {submitting ? <span className="loading loading-spinner loading-sm" /> : 'Ingresar'}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-base-content/40">
          Si no tienes acceso, solicítalo a la administración de la liga.
        </p>
      </div>
    </div>
  );
}
