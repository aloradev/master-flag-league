import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { Season } from '../lib/types';
import { Alert, Card, EmptyState, Spinner } from '../components/ui';
import { TeamCrest } from '../components/AuthImage';
import { competition, type StandingRow } from '../lib/competition';

const impacto = (r: StandingRow) => r.points * 10 + r.wins * 3 + r.point_diff * 0.5 + r.form.reduce((s, x) => s + (x === 'W' ? 2 : x === 'D' ? 1 : 0), 0);

export default function PowerRanking() {
  const [categoryId, setCategoryId] = useState('');
  const season = useQuery({ queryKey: ['season-active'], queryFn: () => api.get<Season>('/seasons/active'), retry: false });
  const standings = useQuery({ queryKey: ['power-ranking', season.data?.id, categoryId], queryFn: () => competition.standings(season.data!.id, categoryId || undefined), enabled: Boolean(season.data) });
  if (season.isLoading || standings.isLoading) return <Spinner label="Calculando Power Ranking…" />;
  if (season.error || standings.error) return <Alert tone="error">{(season.error || standings.error)?.message}</Alert>;
  const rows = (standings.data ?? []).flatMap((g) => g.rows.map((r) => ({ ...r, category_name: g.category.name }))).sort((a, b) => impacto(b) - impacto(a));
  return <div className="mx-auto max-w-2xl space-y-5"><header><h1 className="text-xl font-bold">Power Ranking</h1><p className="text-sm text-base-content/60">{season.data?.name} · rendimiento acumulado y forma reciente</p></header><select className="select select-bordered select-sm" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}><option value="">Todas las categorías</option>{season.data?.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>{!rows.length ? <EmptyState title="Aún no hay resultados" description="El Power Ranking aparecerá cuando existan partidos finalizados." /> : <Card className="divide-y divide-base-300/60 p-0">{rows.map((r, i) => <div key={r.team_id} className="flex items-center gap-3 px-4 py-3"><span className="w-7 text-center text-lg font-black">{i + 1}</span><TeamCrest name={r.team_name} shortName={r.short_name} logoUrl={r.logo_url} className="size-9" /><div className="min-w-0 flex-1"><p className="truncate font-semibold">{r.team_name}</p><p className="text-xs text-base-content/60">{r.category_name} · {r.wins}G · {r.points} pts · {r.point_diff >= 0 ? '+' : ''}{r.point_diff} dif.</p></div><span className="font-black tabular">{impacto(r).toFixed(1)}</span></div>)}</Card>}<p className="text-xs text-base-content/50">Fórmula transparente: puntos x10 + victorias x3 + diferencia x0.5 + forma reciente. Se recalcula desde partidos finalizados.</p></div>;
}
