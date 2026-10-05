import { PasswordInput } from '../components/PasswordInput';
import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuth } from '../store/auth';
import { Alert, Spinner } from '../components/ui';
import { Marco } from './publico/Marco';

type Option = { id: string; name: string; league_id: string; league_name: string; category_id: string; category_name: string };
export default function Registration({ team = false }: { team?: boolean }) {
  const navigate = useNavigate();
  const cache = useQueryClient();
  const user = useAuth(s => s.user);
  // Una cuenta autenticada no debe volver al alta de usuario: ese formulario
  // crearía una segunda cuenta y confunde el flujo de inscripción de equipo.
  if (user && !team) return <Navigate to="/equipo/nuevo" replace />;
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [seasonId, setSeasonId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const options = useQuery({ queryKey: ['registration-options'], queryFn: () => api.get<Option[]>('/public/registration-options') });
  const choices = (options.data ?? []).filter(o => !team || o.league_id === user?.leagueId);
  const leagues = [...new Map(choices.map(o => [o.league_id, o])).values()];
  const seasons = [...new Map(choices.map(o => [o.id, o])).values()];
  const selectedSeason = seasonId || (seasons.length === 1 ? seasons[0].id : '');
  const categories = choices.filter(o => o.id === selectedSeason);
  const selected = categories.find(o => o.category_id === categoryId);
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (busy) return; setBusy(true); setError('');
    const form = new FormData(event.currentTarget);
    try {
      if (team) {
        const option = selected;
        if (!option) throw new Error('Elige la temporada y la categoría de tu equipo.');
        const result = await api.post<{ id: string }>('/teams', { name: form.get('name'), seasonId: option.id, categoryId: option.category_id });
        await cache.invalidateQueries({ queryKey: ['teams-managed'] });
        await useAuth.getState().restore();
        navigate(`/equipo?equipo=${encodeURIComponent(result.id)}&inscrito=1`);
      } else {
        await api.post('/auth/register', { name: form.get('name'), email: form.get('email'), password: form.get('password'), leagueId: form.get('league') });
        navigate('/ingresar?registrado=1', { state: { email: String(form.get('email') ?? '').trim(), from: '/equipo/nuevo' } });
      }
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo guardar'); }
    finally { setBusy(false); }
  };
  const content = <div className="mx-auto max-w-lg space-y-5"><ol aria-label="Pasos del registro" className="ux-steps"><li aria-current={!team ? 'step' : undefined}>1 · Cuenta</li><li aria-current={team ? 'step' : undefined}>2 · Equipo</li><li>3 · Plantilla</li></ol>
    <p>{team ? 'Inscribe tu equipo en una temporada abierta y continúa con la plantilla. La validación de jugadores y los pagos conservan sus reglas.' : 'Crea tu cuenta de encargado. Después de ingresar podrás inscribir tu equipo y gestionar sus jugadores.'}</p>
    {options.isLoading ? <Spinner /> : options.error ? <Alert tone="error">No se pudieron consultar las inscripciones. <button type="button" className="link" onClick={() => void options.refetch()}>Reintentar</button></Alert> : !choices.length ? <Alert>No hay temporadas con inscripciones abiertas.</Alert> :
      <form onSubmit={submit} className="space-y-4" aria-busy={busy}><fieldset disabled={busy} className="space-y-4">
        <label className="block">{team ? 'Nombre del equipo' : 'Tu nombre'}<input name="name" required maxLength={255} autoComplete={team ? 'off' : 'name'} className="input mt-1 w-full" /></label>
        {team ? <>
          <label className="block">Temporada<select name="season" className="select mt-1 w-full" required value={selectedSeason} onChange={e => { setSeasonId(e.target.value); setCategoryId(''); }}><option value="" disabled>Elige una temporada</option>{seasons.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</select></label>
          <label className="block">Categoría<select name="category" className="select mt-1 w-full" required value={categoryId} disabled={!selectedSeason} onChange={e => setCategoryId(e.target.value)}><option value="" disabled>Elige la categoría de tu equipo</option>{categories.map(o => <option key={o.category_id} value={o.category_id}>{o.category_name}</option>)}</select></label>
          <p className="text-sm text-base-content/60">Los jugadores que agregues pertenecerán a esta categoría. Para corregirla después, contacta a la administración de la liga.</p>
          {selected && <Alert title="Tu inscripción">{selected.name} · {selected.category_name}. Después podrás agregar jugadores y sus documentos.</Alert>}
        </> : <>
          <label className="block">Liga donde jugarás<select name="league" className="select mt-1 w-full">{leagues.map(o => <option key={o.league_id} value={o.league_id}>{o.league_name}</option>)}</select><span className="mt-1 block text-sm text-base-content/60">Aquí eliges una liga existente. La creación y configuración de ligas está reservada al Super Administrador.</span></label>
          <label className="block">Correo<input name="email" type="email" required maxLength={255} autoComplete="email" className="input mt-1 w-full" /></label>
          <label className="block">Contraseña<PasswordInput name="password" pattern="(?=.*[A-Za-z])(?=.*[0-9]).{8,}" title="Usa al menos 8 caracteres, una letra y un número" required minLength={8} maxLength={72} autoComplete="new-password" className="input mt-1 w-full" /><span className="text-sm text-base-content/60">Al menos 8 caracteres, una letra y un número.</span></label>
        </>}
        {error && <Alert tone="error">{error}</Alert>}
        <button className="btn btn-primary w-full" disabled={busy}>{busy ? 'Guardando…' : team ? 'Inscribir equipo' : 'Crear cuenta'}</button>
      </fieldset></form>}
    {team && <p className="text-sm text-base-content/60">Si tu equipo ya está registrado, pide a la liga vincular tu cuenta. No vuelvas a crearlo: así conservas su plantilla e historial.</p>}
    <Link className="link" to={team ? '/equipo' : '/ingresar'}>{team ? 'Volver a mis equipos' : 'Ya tengo cuenta · Ingresar'}</Link>
  </div>;
  return team ? <section className="space-y-4"><h1 className="text-xl font-bold">Inscribir equipo</h1>{content}</section> : <Marco titulo="Crea tu cuenta">{content}</Marco>;
}
