import { useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { PasswordInput } from '../components/PasswordInput';
import { useAuth, homeFor } from '../store/auth';
import { Alert, Button, Field } from '../components/ui';
import { Logo } from '../components/Logo';
import { ThemeToggle } from '../components/ThemeToggle';

export default function Login() {
  const location = useLocation();
  const [email, setEmail] = useState(typeof location.state?.email === 'string' ? location.state.email : '');
  const [password, setPassword] = useState('');
  const { login, error, submitting, status, user, clearError } = useAuth();
  const navigate = useNavigate();
  const from = location.state?.from;
  const destination = typeof from === 'string' && from.startsWith('/') && !from.startsWith('//') && !from.startsWith('/ingresar') ? from : null;
  const [params] = useSearchParams();
  const restablecida = params.get('restablecida') === '1';
  useEffect(() => {
    if (typeof location.state?.email === 'string') setEmail(location.state.email);
  }, [location.key]);

  if (status === 'authenticated' && user) {
    return (
      <Navigate
        to={user.mustChangePassword ? '/cambiar-contrasena' : destination ?? homeFor(user.role)}
        replace
      />
    );
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      const session = await login(email.trim(), password);
      navigate(session.mustChangePassword ? '/cambiar-contrasena' : destination ?? homeFor(session.role), {
        replace: true,
      });
    } catch {
      /* el mensaje ya quedó en el store */
    }
  };

  return (
    <div className="login-screen hero-gradient relative flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="absolute right-3 top-3">
        <ThemeToggle compact />
      </div>

      <div className="login-shell w-full max-w-4xl">
        <div className="login-playfield" aria-hidden="true"><span className="login-field-line login-field-line-one" /><span className="login-field-line login-field-line-two" /><span className="login-ball">🏈</span><span className="login-playfield-copy">LA SIGUIENTE<br /><strong>JUGADA</strong><small>empieza aquí</small></span></div>
        <div className="login-card-wrap w-full max-w-md">
        <div className="mb-7 flex flex-col items-center text-center">
          <Logo size="md" className="w-36 drop-shadow-lg sm:w-40" priority />
          <p className="mt-4 text-sm text-base-content/60">
            <span className="block text-xl font-bold text-base-content">Bienvenido a tu liga</span>
            Ingresa para continuar con tu equipo.
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
            <PasswordInput
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

          {params.get('registrado') === '1' && <Alert tone="success">Cuenta creada. Ingresa para inscribir tu equipo.</Alert>}
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
          <Link to="/registro" className="link">Crear cuenta de encargado</Link> · <Link to="/" className="link">Conocer la liga</Link>
        </p>
        </div>
      </div>
    </div>
  );
}
