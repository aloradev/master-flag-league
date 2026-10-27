import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import type { Season } from '../lib/types';
import { Alert, Card, EmptyState, Spinner } from '../components/ui';
import { competition, type PlayerStat } from '../lib/competition';

const METRICS: { key: keyof PlayerStat; label: string }[] = [
  { key: 'touchdowns', label: 'Touchdowns' }, { key: 'yards', label: 'Yardas' },
  { key: 'receptions', label: 'Recepciones' }, { key: 'interceptions', label: 'Intercepciones' },
  { key: 'flag_pulls', label: 'Quite de flags' }, { key: 'passes_defended', label: 'Pases defendidos' },
];

const offensive = (p: PlayerStat) => Number(p.offensive_score ?? 0) + Number(p.offensive_mvps ?? 0) * 5;
const defensive = (p: PlayerStat) => Number(p.defensive_score ?? 0) + Number(p.defensive_mvps ?? 0) * 5;
const total = (p: PlayerStat) => offensive(p) + defensive(p);
const perGame = (value: number, p: PlayerStat) => value / Math.max(Number(p.games_played ?? 0), 1);

export default function PlayerRankings() {
  const [categoryId, setCategoryId] = useState('');
  const [metric, setMetric] = useState<keyof PlayerStat>('touchdowns');
  const season = useQuery({ queryKey: ['season-active'], queryFn: () => api.get<Season>('/seasons/active'), retry: false });
  const stats = useQuery({ queryKey: ['player-stats', season.data?.id, categoryId], queryFn: () => competition.playerStats(season.data!.id, categoryId || undefined), enabled: Boolean(season.data) });
  if (season.isLoading || stats.isLoading) return <Spinner label="Calculando rankings…" />;
  if (season.error || stats.error) return <Alert tone="error">{(season.error || stats.error)?.message}</Alert>;
  const rows = [...(stats.data ?? [])].sort((a, b) => Number(b[metric] ?? 0) - Number(a[metric] ?? 0)).filter((p) => Number(p[metric] ?? 0) > 0).slice(0, 25);
  const eligible = (stats.data ?? []).filter((p) => Number(p.games_played ?? 0) >= 3);
  const mvpOff = [...eligible].sort((a, b) => perGame(offensive(b), b) - perGame(offensive(a), a))[0];
  const mvpDef = [...eligible].sort((a, b) => perGame(defensive(b), b) - perGame(defensive(a), a))[0];
  const teams = [...new Map((stats.data ?? []).map((p) => [p.team_id, p.team_name])).entries()].map(([teamId, teamName]) => ({ teamId, teamName, players: (stats.data ?? []).filter((p) => p.team_id === teamId).sort((a, b) => total(b) - total(a)).slice(0, 3) }));
  return <div className="mx-auto max-w-3xl space-y-5">
    <header><h1 className="text-xl font-bold">Rankings de jugadores</h1><p className="text-sm text-base-content/60">{season.data?.name} · solo partidos finalizados</p></header>
    <div className="flex flex-wrap gap-2"><select aria-label="Categoría" className="select select-bordered select-sm" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}><option value="">Todas las categorías</option>{season.data?.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select><select aria-label="Estadística" className="select select-bordered select-sm" value={metric} onChange={(e) => setMetric(e.target.value as keyof PlayerStat)}>{METRICS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}</select></div>
    <section className="grid gap-3 sm:grid-cols-2"><Card className="border-secondary/40 p-4"><p className="text-xs font-bold uppercase text-secondary">MVP ofensivo de la liga</p>{mvpOff ? <><Link className="mt-1 block text-lg font-black link" to={`/jugador/${mvpOff.player_id}`}>{mvpOff.player_name}</Link><p className="text-xs text-base-content/60">{mvpOff.team_name} · {perGame(offensive(mvpOff), mvpOff).toFixed(2)} impacto por partido</p></> : <p className="mt-2 text-sm text-base-content/60">Se necesitan 3 partidos jugados.</p>}</Card><Card className="border-info/40 p-4"><p className="text-xs font-bold uppercase text-info">MVP defensivo de la liga</p>{mvpDef ? <><Link className="mt-1 block text-lg font-black link" to={`/jugador/${mvpDef.player_id}`}>{mvpDef.player_name}</Link><p className="text-xs text-base-content/60">{mvpDef.team_name} · {perGame(defensive(mvpDef), mvpDef).toFixed(2)} impacto por partido</p></> : <p className="mt-2 text-sm text-base-content/60">Se necesitan 3 partidos jugados.</p>}</Card></section>
    <section className="space-y-3"><h2 className="text-sm font-bold">Top 3 por equipo</h2>{teams.map((team) => <Card key={team.teamId} className="p-3"><h3 className="font-semibold">{team.teamName}</h3><ol className="mt-2 divide-y divide-base-300/50">{team.players.map((p, i) => <li key={p.player_id} className="flex items-center gap-2 py-2"><span className="w-5 text-center font-bold">{i + 1}</span><Link className="link min-w-0 flex-1 truncate text-sm" to={`/jugador/${p.player_id}`}>{p.player_name}</Link><span className="text-xs tabular text-base-content/60">{total(p).toFixed(1)} pts</span></li>)}</ol></Card>)}</section>
    {!rows.length ? <EmptyState title="Aún no hay estadísticas" description="Los rankings se llenarán al cerrar partidos con jugadas acreditadas a jugadores." /> : <Card className="divide-y divide-base-300/60 p-0">{rows.map((p, i) => <div key={p.player_id} className="flex items-center gap-3 px-4 py-3"><span className="w-7 text-center text-lg font-black">{i + 1}</span><div className="min-w-0 flex-1"><Link className="link truncate font-semibold" to={`/jugador/${p.player_id}`}>{p.player_name}</Link><p className="truncate text-xs text-base-content/60">{p.team_name} · {p.category_name}</p></div><span className="text-xl font-black tabular">{Number(p[metric] ?? 0)}</span></div>)}</Card>}
    <p className="text-xs text-base-content/50">Las estadísticas se calculan directamente de los eventos vigentes; anular una jugada actualiza el ranking automáticamente.</p>
  </div>;
}
