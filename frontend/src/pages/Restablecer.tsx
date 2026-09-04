import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { Alert, Button, Field, Spinner } from '../components/ui';
import { Logo } from '../components/Logo';
import { ThemeToggle } from '../components/ThemeToggle';

/**
 * Poner una contraseña nueva desde el enlace.
 *
 * El enlace se comprueba ANTES de pedir nada. Sin eso, alguien con un
 * enlace vencido escribiría una contraseña, la enviaría, y solo entonces
 * se enteraría de que tenía que pedir otro — con la contraseña nueva ya
 * en la cabeza y sin cuenta donde ponerla.
 */
export default function Restablecer() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const navigate = useNavigate();

  const [revisando, setRevisando] = useState(true);
  const [valido, setValido] = useState(false);
  const [password, setPassword] = useState('');
  const [repetida, setRepetida] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detalles, setDetalles] = useState<string[]>([]);

  useEffect(() => {
    let activo = true;
    if (!token) {
      setRevisando(false);
      setValido(false);
      return;
    }
    api
      .get<{ valid: boolean }>(`/auth/reset-password/${encodeURIComponent(token)}`)
      .then((r) => activo && setValido(r.valid))
      .catch(() => activo && setValido(false))
      .finally(() => activo && setRevisando(false));
    return () => {
      activo = false;
    };
  }, [token]);

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setDetalles([]);
    if (password !== repetida) {
      setError('Las dos contraseñas no coinciden');
      return;
    }
    setEnviando(true);
    try {
      await api.post('/auth/reset-password', { token, password });
      navigate('/ingresar?restablecida=1', { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        setDetalles(Array.isArray(err.details) ? err.details : []);
      } else {
        setError('No se pudo cambiar la contraseña');
      }
    } finally {
      setEnviando(false);
    }
  };

  const caja =
    'space-y-4 rounded-box border border-base-300 bg-base-200/80 p-6 shadow-lg backdrop-blur';

  return (
    <div className="hero-gradient relative flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="absolute right-3 top-3">
        <ThemeToggle compact />
      </div>

      <div className="w-full max-w-sm">
        <div className="mb-7 flex flex-col items-center text-center">
          <Logo size="md" className="w-36 drop-shadow-lg sm:w-40" priority />
          <p className="mt-4 text-sm text-base-content/60">Contraseña nueva</p>
        </div>

        {revisando ? (
          <div className={caja}>
            <Spinner label="Comprobando el enlace…" />
          </div>
        ) : !valido ? (
          <div className={caja}>
            <Alert tone="error" title="Este enlace ya no sirve">
              Venció o ya se usó. Los enlaces duran una hora y solo funcionan una vez.
            </Alert>
            <Link to="/recuperar" className="btn btn-primary btn-block">
              Pedir uno nuevo
            </Link>
            <Link to="/ingresar" className="btn btn-ghost btn-block btn-sm">
              Volver a ingresar
            </Link>
          </div>
        ) : (
          <form onSubmit={enviar} className={caja}>
            <Field label="Contraseña nueva" required>
              <input
                type="password"
                autoComplete="new-password"
                className="input input-bordered w-full"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoFocus
                disabled={enviando}
              />
            </Field>

            <Field label="Repítela" required>
              <input
                type="password"
                autoComplete="new-password"
                className="input input-bordered w-full"
                placeholder="••••••••"
                value={repetida}
                onChange={(e) => setRepetida(e.target.value)}
                required
                disabled={enviando}
              />
            </Field>

            <p className="text-xs text-base-content/50">
              {/* Lo que de verdad exige el servidor. Anunciar una regla más
                  estricta que la real hace que la gente pelee con el
                  formulario por nada. */}
              Al menos 8 caracteres, con una letra y un número.
            </p>

            {error && (
              <Alert tone="error">
                {error}
                {detalles.length > 0 && (
                  <ul className="mt-1 list-disc pl-4">
                    {detalles.map((d) => (
                      <li key={d}>{d}</li>
                    ))}
                  </ul>
                )}
              </Alert>
            )}

            <Button
              type="submit"
              tone="primary"
              block
              loading={enviando}
              disabled={!password || !repetida}
            >
              {enviando ? 'Guardando…' : 'Guardar y entrar'}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
