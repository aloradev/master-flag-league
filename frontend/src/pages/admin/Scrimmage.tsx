import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { api, ApiError } from '../../lib/api';
import type { Season } from '../../lib/types';
import { Alert, Button, Card, Field, Spinner } from '../../components/ui';

export default function Scrimmage() {
  const season = useQuery({ queryKey: ['season-active'], queryFn: () => api.get<Season>('/seasons/active') });
  const [categoryId, setCategoryId] = useState(''); const [home, setHome] = useState(''); const [away, setAway] = useState('');
  const [date, setDate] = useState(''); const [time, setTime] = useState('19:00'); const [message, setMessage] = useState<string | null>(null);
  const create = useMutation({ mutationFn: () => api.post('/admin/scrimmages', { seasonId: season.data!.id, categoryId, homeTeamName: home, awayTeamName: away, date, time, name: 'Scrimmage de prueba' }), onSuccess: (r: any) => setMessage(`Scrimmage creado. Partido: ${r.gameId ?? r.id ?? 'listo'}. Abre Modo árbitro.`), onError: (e) => setMessage(e instanceof ApiError ? e.message : 'No se pudo crear') });
  if (season.isLoading) return <Spinner />;
  if (!season.data) return <Alert tone="error">No hay temporada activa.</Alert>;
  return <div className="mx-auto max-w-2xl space-y-4"><h1 className="text-xl font-bold">Scrimmage de prueba</h1><Alert>Este partido crea equipos temporales automáticamente. No requiere jugadores, roster ni árbitro asignado y no afecta tabla, rankings, playoffs ni finanzas. La hora se captura como hora local de Cancún; el árbitro puede iniciar el partido cuando esté listo.</Alert>{message && <Alert tone={create.isError ? 'error' : 'success'}>{message}</Alert>}<Card className="space-y-4 p-4"><Field label="Categoría"><select className="select w-full" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}><option value="">Selecciona</option>{season.data.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field><div className="grid gap-3 sm:grid-cols-2"><Field label="Equipo local"><input className="input w-full" value={home} onChange={(e) => setHome(e.target.value)} placeholder="Ej. Halcones" /></Field><Field label="Equipo visitante"><input className="input w-full" value={away} onChange={(e) => setAway(e.target.value)} placeholder="Ej. Jaguares" /></Field></div><div className="grid gap-3 sm:grid-cols-2"><Field label="Fecha"><input type="date" className="input w-full" value={date} onChange={(e) => setDate(e.target.value)} /></Field><Field label="Hora programada (Cancún)"><input type="time" className="input w-full" value={time} onChange={(e) => setTime(e.target.value)} /></Field></div><Button loading={create.isPending} disabled={!categoryId || home.trim().length < 2 || away.trim().length < 2 || !date} onClick={() => create.mutate()}>Crear scrimmage</Button></Card></div>;
}
