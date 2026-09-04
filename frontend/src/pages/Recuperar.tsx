import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { Alert, Button, Field } from '../components/ui';
import { Logo } from '../components/Logo';
import { ThemeToggle } from '../components/ThemeToggle';

/**
 * "Olvidé mi contraseña".
 *
 * La respuesta es la misma exista o no el correo. No es un descuido de
 * redacción: si dijéramos "ese correo no está registrado", cualquiera
 * podría averiguar quién pertenece a la liga probando direcciones. Por eso
 * el texto habla en condicional —"si ese correo pertenece a una cuenta"—.
 */
export default function Recuperar() {
  const [email, setEmail] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [listo, setListo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    try {
      await api.post('/auth/forgot-password', { email: email.trim() });
      setListo(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo enviar la solicitud');
    } finally {
      setEnviando(false);
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
          <p className="mt-4 text-sm text-base-content/60">Recuperar el acceso</p>
        </div>

        {listo ? (
          <div className="space-y-4 rounded-box border border-base-300 bg-base-200/80 p-6 shadow-lg backdrop-blur">
            <Alert tone="success" title="Solicitud enviada">
              Si ese correo pertenece a una cuenta, te llegará un enlace para poner una
              contraseña nueva. Vence en una hora.
            </Alert>
            <p className="text-xs text-base-content/60">
              No te llegó nada? Revisa el correo no deseado. Si sigue sin aparecer, pídele
              a la administración de la liga que te genere el enlace: lo pueden hacer al
              instante desde su pantalla de usuarios.
            </p>
            <Link to="/ingresar" className="btn btn-block">
              Volver a ingresar
            </Link>
          </div>
        ) : (
          <form
            onSubmit={enviar}
            className="space-y-4 rounded-box border border-base-300 bg-base-200/80 p-6 shadow-lg backdrop-blur"
          >
            <p className="text-sm text-base-content/70">
              Escribe tu correo y te mandamos un enlace para poner una contraseña nueva.
            </p>

            <Field label="Correo electrónico" required>
              <input
                type="email"
                autoComplete="username"
                inputMode="email"
                className="input input-bordered w-full"
                placeholder="tu@correo.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
                disabled={enviando}
              />
            </Field>

            {error && <Alert tone="error">{error}</Alert>}

            <Button type="submit" tone="primary" block loading={enviando} disabled={!email}>
              {enviando ? 'Enviando…' : 'Enviarme el enlace'}
            </Button>

            <Link to="/ingresar" className="btn btn-ghost btn-block btn-sm">
              Cancelar
            </Link>
          </form>
        )}
      </div>
    </div>
  );
}
