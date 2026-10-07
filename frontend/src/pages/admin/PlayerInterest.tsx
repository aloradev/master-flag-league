import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { Alert, EmptyState, Spinner } from '../../components/ui';
import { fechaTexto } from '../../lib/format';

interface Interest { id: string; name: string; email: string; phone: string | null; category: string; experience: string; availability: string; status: string; created_at: string }
const statuses = { NEW: 'Nueva', CONTACTED: 'Contactada', CLOSED: 'Cerrada' };
export default function PlayerInterest() {
  const [status, setStatus] = useState('NEW');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const query = useQuery({ queryKey: ['player-interest'], queryFn: ({ signal }) => api.get<Interest[]>('/admin/player-interest', signal), retry: false, refetchInterval: 60000 });
  const update = async (id: string, next: string) => {
    setBusy(id); setError('');
    try { await api.put(`/admin/player-interest/${id}`, { status: next }); await query.refetch(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo guardar.'); }
    finally { setBusy(''); }
  };
  const rows = (query.data ?? []).filter(row => !status || row.status === status);
  return <div className="mx-auto max-w-4xl space-y-5"><header><h1 className="text-xl font-bold">Jugadores interesados</h1><p className="mt-1 text-sm text-base-content/60">Solicitudes para encontrar equipo · {query.data?.filter(row => row.status === 'NEW').length ?? 0} nuevas</p></header>
    <div><label htmlFor="interest-filter" className="text-sm font-semibold">Estado</label><select id="interest-filter" className="select ml-3" value={status} onChange={event => setStatus(event.target.value)}><option value="">Todas</option>{Object.entries(statuses).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></div>
    {error && <Alert tone="error">{error}</Alert>}
    {query.isLoading ? <Spinner /> : query.isError && !query.data ? <EmptyState title="No se pudieron cargar las solicitudes" action={<button className="btn" onClick={() => void query.refetch()}>Reintentar</button>} /> : <>
      {query.isError && <Alert tone="warning">No se pudo actualizar la bandeja. Se muestran los últimos datos.</Alert>}
      {!rows.length ? <EmptyState title="No hay solicitudes en este estado" /> : <ul className="divide-y divide-base-300">{rows.map(row => <li key={row.id} className="space-y-3 py-5"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><h2 className="break-words font-bold">{row.name}</h2><p className="text-xs text-base-content/60">{row.category} · {({ NEW: 'Principiante', CASUAL: 'Ocasional', EXPERIENCED: 'Con experiencia' })[row.experience as 'NEW']} · {fechaTexto(row.created_at)}</p></div><select aria-label={`Estado de ${row.name}`} className="select select-sm" value={row.status} disabled={!!busy} onChange={event => void update(row.id, event.target.value)}>{Object.entries(statuses).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></div><div className="flex flex-wrap gap-x-5 gap-y-2 text-sm"><a className="link break-all" href={`mailto:${row.email}`}>{row.email}</a>{row.phone && <a className="link" href={`tel:${row.phone.replace(/[^+\d]/g, '')}`}>{row.phone}</a>}</div>{row.availability && <p className="whitespace-pre-wrap break-words text-sm text-base-content/70">{row.availability}</p>}</li>)}</ul>}
      {(query.data?.length ?? 0) >= 300 && <p className="text-xs text-base-content/60">Se muestran las 300 solicitudes más recientes.</p>}
    </>}
  </div>;
}
