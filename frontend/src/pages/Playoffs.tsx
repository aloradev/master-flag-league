import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { Season } from '../lib/types';
import { useAuth, isAdmin } from '../store/auth';
import { Alert, Button, Card, Field, Spinner } from '../components/ui';

interface Playoff {
  id: string; category_name: string; stage: number; champion_name: string | null;
  seeds: { id: string; name: string }[]; slots: (string | null)[];
  games: { id: string; stage: number; slot: number; home: string; away: string; home_score: number; away_score: number; status: string; offensive_mvp: string | null; defensive_mvp: string | null }[];
}

export function PlayoffList({ seasonId, manage = false }: { seasonId: string; manage?: boolean }) {
  const qc = useQueryClient();
  const [date, setDate] = useState('');
  const [time, setTime] = useState('19:00');
  const list = useQuery({ queryKey: ['playoffs', seasonId], queryFn: () => api.get<Playoff[]>(`/playoffs?seasonId=${encodeURIComponent(seasonId)}`) });
  const advance = useMutation({ mutationFn: (p: Playoff) => api.post(`/admin/playoffs/${p.id}/advance`, { date, time, stage: p.stage }), onSuccess: () => { void qc.invalidateQueries({ queryKey: ['playoffs'] }); void qc.invalidateQueries({ queryKey: ['rounds'] }); } });
  if (list.isLoading) return <Spinner />;
  if (list.error) return <Alert tone="error">{list.error.message}</Alert>;
  return <div className="space-y-4">
    {manage && <div className="grid gap-3 sm:grid-cols-2"><Field label="Fecha de la siguiente fase"><input type="date" className="input w-full" value={date} onChange={(e) => setDate(e.target.value)} /></Field><Field label="Hora inicial"><input type="time" className="input w-full" value={time} onChange={(e) => setTime(e.target.value)} /></Field></div>}
    {advance.error && <Alert tone="error">{advance.error.message}</Alert>}
    {advance.isSuccess && <Alert tone="success">Fase actualizada. Programa campos y árbitros en Jornadas antes de publicar.</Alert>}
    {!list.data?.length && <p className="text-sm">Todavía no hay playoffs en esta temporada.</p>}
    {list.data?.map((p) => <Card key={p.id} className="space-y-3 p-4">
      <h2 className="text-lg font-bold">{p.category_name} · {p.seeds.length} equipos</h2>
      {p.champion_name && <Alert tone="success" title="Campeón">{p.champion_name}</Alert>}
      <details><summary className="cursor-pointer">Clasificación inicial</summary><ol>{p.seeds.map((s, i) => <li key={s.id}>{i + 1}. {s.name}</li>)}</ol></details>
      {p.stage <= 1 && p.slots.some((s) => s === null) && <p className="text-sm">Pase directo: {p.slots.filter((s, i) => s && !p.slots[i ^ 1]).map((s) => p.seeds.find((t) => t.id === s)?.name).join(', ')}</p>}
      <div className="flex gap-4 overflow-x-auto pb-2">{Array.from({ length: p.stage }, (_, i) => i + 1).map((stage) => <section key={stage} className="min-w-60 space-y-2"><h3 className="font-semibold">Fase {stage}</h3>{p.games.filter((g) => g.stage === stage).map((g) => <div key={g.id} className="rounded-box border border-base-300 p-3 text-sm"><p>{g.home} <strong>{g.home_score}</strong></p><p>{g.away} <strong>{g.away_score}</strong></p><p className="text-xs text-base-content/60">{g.status}</p>{p.champion_name && stage === p.stage && <><p>MVP ofensivo de la final: {g.offensive_mvp || 'Sin seleccionar'}</p><p>MVP defensivo de la final: {g.defensive_mvp || 'Sin seleccionar'}</p></>}</div>)}</section>)}</div>
      {manage && !p.champion_name && <Button disabled={!date || !time} loading={advance.isPending} onClick={() => advance.mutate(p)}>{p.stage === 0 ? 'Programar primera fase' : p.slots.length === 2 ? 'Confirmar campeón' : 'Avanzar ganadores'}</Button>}
    </Card>)}
  </div>;
}

export default function Playoffs() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [categoryId, setCategoryId] = useState('');
  const [count, setCount] = useState(4);
  const season = useQuery({ queryKey: ['season-active'], queryFn: () => api.get<Season>('/seasons/active') });
  const settings = useQuery({ queryKey: ['season-settings', season.data?.id], queryFn: () => api.get<{ competition?: { playoff_count?: number } }>(`/seasons/${season.data!.id}/settings`), enabled: Boolean(season.data?.id) && isAdmin(user?.role) });
  useEffect(() => { if (settings.data?.competition?.playoff_count) setCount(settings.data.competition.playoff_count); }, [settings.data]);
  const create = useMutation({ mutationFn: () => api.post('/admin/playoffs', { seasonId: season.data!.id, categoryId, count }), onSuccess: () => { void qc.invalidateQueries({ queryKey: ['playoffs'] }); } });
  if (season.isLoading) return <Spinner />;
  if (!season.data) return <Alert tone="error">No hay temporada activa. Consulta los campeones en Historial.</Alert>;
  return <div className="mx-auto max-w-4xl space-y-5"><h1 className="text-xl font-bold">Playoffs · {season.data.name}</h1>
    {isAdmin(user?.role) && <Card className="space-y-3 p-4"><h2 className="font-semibold">Crear clasificación</h2><p className="text-sm">Clasifican los primeros equipos de la tabla regular con partidos jugados. La siembra queda fija; los ganadores conservan su llave.</p><Field label="Categoría"><select className="select w-full" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}><option value="">Selecciona</option>{season.data.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field><Field label="Equipos clasificados"><select className="select" value={count} onChange={(e) => setCount(Number(e.target.value))}>{[3, 4, 6, 8, 10, 12].map((n) => <option key={n}>{n}</option>)}</select></Field>{create.error && <Alert tone="error">{create.error.message}</Alert>}<Button loading={create.isPending} disabled={!categoryId} onClick={() => create.mutate()}>Crear playoffs</Button><Link className="link block" to="/admin/jornadas">Programar campos y árbitros en Jornadas</Link></Card>}
    <PlayoffList seasonId={season.data.id} manage={isAdmin(user?.role)} />
  </div>;
}
