import { useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { Alert } from '../../components/ui';
import { Marco } from './Marco';
import type { TablaPublica } from './Tabla';

export default function Jugar() {
  const [requestId] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const categories = useQuery({ queryKey: ['publico-tabla'], queryFn: ({ signal }) => api.get<TablaPublica>('/public/standings', signal), retry: false });
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget);
    setBusy(true); setError('');
    try {
      await api.post('/public/player-interest', { requestId, name: form.get('name'), email: form.get('email'), phone: form.get('phone'), category: form.get('category'), experience: form.get('experience'), availability: form.get('availability'), consent: form.get('consent') === 'on', website: form.get('website') });
      setSent(true);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo enviar la solicitud.'); }
    finally { setBusy(false); }
  };
  return <Marco titulo="Quiero jugar" subtitulo="Master Flag League · Cancún"><div className="mx-auto max-w-xl space-y-6">
    <div className="border-b border-base-300 pb-5"><h2 className="text-xl font-bold">Busco equipo</h2><p className="mt-2 text-sm text-base-content/70">Cuéntanos qué buscas. La liga revisará tu solicitud para orientarte según los equipos y lugares disponibles.</p><p className="mt-3 text-sm">¿Ya tienes equipo? <Link className="link font-semibold" to="/registro">Inscribir mi equipo</Link></p></div>
    {sent ? <section role="status" className="space-y-4"><h2 className="text-xl font-bold text-primary">Solicitud recibida</h2><p>La liga recibió tus datos y podrá contactarte por correo o teléfono. La asignación a un equipo depende de la disponibilidad.</p><Link className="btn btn-primary" to="/jornada">Ver la jornada</Link></section> : <form onSubmit={submit} className="space-y-4" aria-busy={busy}><fieldset disabled={busy} className="space-y-4">
      <div><label htmlFor="interest-name" className="text-sm font-semibold">Nombre</label><input id="interest-name" name="name" className="input mt-1 w-full" required minLength={2} maxLength={120} autoComplete="name" /></div>
      <div><label htmlFor="interest-email" className="text-sm font-semibold">Correo electrónico</label><input id="interest-email" name="email" type="email" className="input mt-1 w-full" required maxLength={255} autoComplete="email" /></div>
      <div><label htmlFor="interest-phone" className="text-sm font-semibold">Teléfono (opcional)</label><input id="interest-phone" name="phone" type="tel" className="input mt-1 w-full" minLength={7} maxLength={30} autoComplete="tel" /></div>
      <div className="grid gap-4 sm:grid-cols-2"><div className="min-w-0"><label htmlFor="interest-category" className="text-sm font-semibold">Categoría de interés</label><select id="interest-category" name="category" className="select mt-1 w-full"><option value="Por definir">Quiero orientación</option>{categories.data?.categories.map(group => <option key={group.category.id} value={group.category.name}>{group.category.name}</option>)}</select></div>
        <div className="min-w-0"><label htmlFor="interest-experience" className="text-sm font-semibold">Experiencia</label><select id="interest-experience" name="experience" className="select mt-1 w-full"><option value="NEW">Quiero empezar</option><option value="CASUAL">Juego ocasionalmente</option><option value="EXPERIENCED">He jugado en una liga</option></select></div></div>
      <div><label htmlFor="interest-availability" className="text-sm font-semibold">Disponibilidad y posición (opcional)</label><textarea id="interest-availability" name="availability" className="textarea mt-1 w-full" rows={3} maxLength={300} /></div>
      <div hidden aria-hidden="true"><label>Sitio web<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
      <label className="flex items-start gap-3 text-sm"><input type="checkbox" name="consent" required className="checkbox mt-0.5 shrink-0" /><span>Autorizo a Master Flag League a contactarme por esta solicitud. Mis datos de contacto no se publican.</span></label>
      {error && <Alert tone="error">{error}</Alert>}
      <button type="submit" className="btn btn-primary w-full" disabled={busy}>{busy ? 'Enviando...' : 'Enviar solicitud'}</button>
    </fieldset></form>}
  </div></Marco>;
}
