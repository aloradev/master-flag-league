import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { Season } from '../lib/types';
import { Alert, Card, EmptyState, Spinner } from '../components/ui';
import { competition } from '../lib/competition';

type SeasonRow = Season & { status: string; teams_count: string | number; players_count: string | number };
export default function SeasonHistory() {
  const [selected, setSelected] = useState('');
  const seasons = useQuery({ queryKey: ['seasons'], queryFn: () => api.get<SeasonRow[]>('/seasons') });
  const standings = useQuery({ queryKey: ['history-standings', selected], queryFn: () => competition.standings(selected), enabled: Boolean(selected) });
  if (seasons.isLoading) return <Spinner />;
  if (seasons.error) return <Alert tone="error">{seasons.error.message}</Alert>;
  const season = seasons.data?.find((s) => s.id === selected);
  return <div className="mx-auto max-w-3xl space-y-5"><header><h1 className="text-xl font-bold">Historial de temporadas</h1><p className="text-sm text-base-content/60">Consulta temporadas y sus posiciones finales</p></header>{!seasons.data?.length ? <EmptyState title="No hay temporadas registradas" /> : <div className="grid gap-2 sm:grid-cols-2">{seasons.data.map((s) => <button key={s.id} type="button" onClick={() => setSelected(s.id)} className={`rounded-box border p-4 text-left ${selected === s.id ? 'border-primary bg-primary/10' : 'border-base-300 bg-base-200/60'}`}><span className="block font-bold">{s.name}</span><span className="text-xs text-base-content/60">{s.year} · {s.status} · {s.teams_count} equipos · {s.players_count} jugadores</span></button>)}</div>}{season && <section className="space-y-3"><h2 className="font-semibold">Posiciones de {season.name}</h2>{standings.isLoading && <Spinner />}{standings.error && <Alert tone="error">{standings.error.message}</Alert>}{standings.data?.map((group) => <Card key={group.category.id} className="p-3"><h3 className="font-semibold">{group.category.name}</h3><ol className="mt-2 divide-y divide-base-300/50">{group.rows.slice(0, 3).map((row) => <li key={row.team_id} className="flex justify-between py-2 text-sm"><span>{row.position}. {row.team_name}</span><span className="font-bold tabular">{row.points} pts</span></li>)}</ol></Card>)}</section>}</div>;
}
