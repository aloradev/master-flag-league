import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { competition, type Proposal } from '../../lib/competition';
import type { Season } from '../../lib/types';
import { Alert, Button, Card, Field, Spinner } from '../../components/ui';

type Category = { id: string; name: string; teams: { id: string; name: string }[] };
type Match = { key: number; category: string; home: string; away: string; field: string; time: string };

export default function ManualRound({ season, onSaved, onCancel, initialProposal }: {
  initialProposal?: Proposal; season: Season; onSaved: () => void; onCancel: () => void;
}) {
  const [date, setDate] = useState(initialProposal?.scheduledDate ?? season.start_date.slice(0, 10));
  const [matches, setMatches] = useState<Match[]>(() => initialProposal?.games.map((g, key) => ({ key, category: g.categoryId, home: g.homeTeamId, away: g.awayTeamId, field: g.fieldId ?? '', time: g.time ?? '' })) ?? []);
  const [rests, setRests] = useState<string[]>(initialProposal?.byes.map(b => b.teamId) ?? []);
  const [nextKey, setNextKey] = useState(initialProposal?.games.length ?? 0);
  const options = useQuery({ queryKey: ['manual-round-options', season.id],
    queryFn: () => api.get<Category[]>(`/admin/rounds/options?seasonId=${season.id}`) });
  const categories = options.data ?? [];
  const settings = useQuery({ queryKey: ['season-settings', season.id], queryFn: () => api.get<{ game_times?: { slots?: string[]; field_slots?: Record<string, string[]> } }>(`/seasons/${season.id}/settings`) });
  const teams = categories.flatMap(c => c.teams.map(t => ({ ...t, category: c })));
  const playing = matches.flatMap(m => [m.home, m.away]).filter(Boolean);
  const appearances = matches.flatMap(m => [m.home, m.away]).filter(Boolean).reduce<Record<string, number>>((acc, id) => ({ ...acc, [id]: (acc[id] ?? 0) + 1 }), {});
  const complete = matches.length > 0 && matches.every(m => m.category && m.home && m.away && m.field && m.time);
  const duplicateSlot = new Set(matches.filter(m => m.field && m.time).map(m => `${m.field}:${m.time}`)).size < matches.filter(m => m.field && m.time).length;
  const save = useMutation({
    mutationFn: () => {
      const proposal: Proposal = {
        manual: true,
        seasonId: season.id, scheduledDate: date, roundNumber: 0, capacity: matches.length, warnings: [],
        games: matches.map(m => ({ categoryId: m.category, categoryName: categories.find(c => c.id === m.category)!.name,
          homeTeamId: m.home, homeTeamName: teams.find(t => t.id === m.home)!.name,
          awayTeamId: m.away, awayTeamName: teams.find(t => t.id === m.away)!.name,
          fieldId: m.field, fieldName: season.fields.find(f => f.id === m.field)!.name, time: m.time, meeting: 1 })),
        byes: teams.filter(t => rests.includes(t.id) && !playing.includes(t.id)).map(t => ({
          teamId: t.id, teamName: t.name, categoryId: t.category.id, categoryName: t.category.name,
          reason: 'MANUAL', totalAfter: 0 })),
      };
      return competition.createRound(season.id, proposal);
    }, onSuccess: onSaved,
  });
  const update = (key: number, patch: Partial<Match>) => setMatches(rows => rows.map(m => m.key === key ? { ...m, ...patch } : m));

  return <Card className="space-y-4 p-4">
    <h2 className="text-lg font-bold">Crear jornada manual</h2>
    <p className="text-sm text-base-content/70">Elige enfrentamientos entre equipos oficiales activos, incluso con plantilla pendiente. Se respeta la fecha de incorporación confirmada y no se permiten equipos ni campos ya asignados ese día. Los horarios son de Cancún. Se guardará como borrador; después podrás asignar árbitros y publicar. Para capturar estadísticas individuales se requieren jugadores registrados y la elegibilidad configurada.</p>
    {options.isLoading && <Spinner />}
    <Button size="sm" disabled={options.isFetching} onClick={() => void options.refetch()}>Actualizar equipos activos</Button>
    {options.isError && <Alert tone="error">No se pudieron cargar los equipos. <button onClick={() => void options.refetch()}>Reintentar</button></Alert>}
    {save.error && <Alert tone="error">{save.error.message}</Alert>}
    <fieldset disabled={save.isPending} className="space-y-4">
      <Field label="Fecha" required><input required type="date" className="input input-bordered" value={date} min={season.start_date.slice(0, 10)} onChange={e => setDate(e.target.value)} /></Field>
      {matches.map((m, index) => <section key={m.key} className="space-y-3 rounded-field border border-base-300 p-3">
        <div className="flex items-center justify-between"><h3 className="font-semibold">Partido {index + 1}</h3><Button size="xs" tone="ghost" onClick={() => setMatches(rows => rows.filter(row => row.key !== m.key))}>Quitar partido {index + 1}</Button></div>
        <Field label="Categoría"><select className="select select-bordered w-full" value={m.category} onChange={e => update(m.key, { category: e.target.value, home: '', away: '' })}>
          <option value="">Selecciona categoría</option>{categories.filter(c => c.teams.length >= 2).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select></Field>
        <div className="grid gap-3 sm:grid-cols-2">{(['home', 'away'] as const).map(side => <Field key={side} label={side === 'home' ? 'Equipo local' : 'Equipo visitante'}>
          <select className="select select-bordered w-full" value={m[side]} onChange={e => update(m.key, { [side]: e.target.value })}>
            <option value="">Selecciona equipo</option>{categories.find(c => c.id === m.category)?.teams.map(t => <option key={t.id} value={t.id}>{t.name} — {appearances[t.id] ?? 0} {(appearances[t.id] ?? 0) === 1 ? 'partido' : 'partidos'}</option>)}
          </select></Field>)}</div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Campo"><select className="select select-bordered w-full" value={m.field} onChange={e => update(m.key, { field: e.target.value })}>
            <option value="">Selecciona campo</option>{season.fields.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select></Field>
          <Field label="Hora (Cancún)" hint={`Horarios del campo: ${(settings.data?.game_times?.field_slots?.[m.field] ?? settings.data?.game_times?.slots ?? [season.default_start_time.slice(0, 5)]).join(', ') || 'Sin disponibilidad configurada'}. En modo manual puedes indicar una excepción.`}><input className="input input-bordered w-full" type="time" value={m.time} onChange={e => update(m.key, { time: e.target.value })} /></Field>
        </div>
      </section>)}
      <Button disabled={!categories.some(c => c.teams.length >= 2) || !season.fields.length} onClick={() => {
        setMatches(rows => [...rows, { key: nextKey, category: '', home: '', away: '', field: season.fields[0]?.id ?? '', time: season.default_start_time.slice(0, 5) }]); setNextKey(nextKey + 1);
      }}>Agregar partido</Button>
      {options.isSuccess && !categories.some(c => c.teams.length >= 2) && <Alert>No hay una categoría con al menos dos equipos oficiales activos.</Alert>}
      <section className="space-y-2"><h3 className="font-semibold">Descansos administrativos</h3>
        <p className="text-xs text-base-content/70">Marca los equipos que descansan. Los equipos sin partido ni descanso seleccionado quedan fuera de esta jornada, sin sumar descanso.</p>
        {teams.filter(t => !playing.includes(t.id)).map(t => <label key={t.id} className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="checkbox checkbox-sm" checked={rests.includes(t.id)} onChange={e => setRests(e.target.checked ? [...rests, t.id] : rests.filter(id => id !== t.id))} />{t.name} · {t.category.name}
        </label>)}
      </section>
      {duplicateSlot && <Alert tone="warning">Hay dos partidos en el mismo campo y horario. Cambia uno antes de guardar.</Alert>}
      {Object.entries(appearances).filter(([, count]) => count >= 3).map(([id, count]) => <Alert key={id} tone="warning">{teams.find(t => t.id === id)?.name} ya tiene {count} partidos asignados en esta jornada. Puedes continuar.</Alert>)}
      <div className="flex flex-wrap gap-2"><Button tone="success" loading={save.isPending} disabled={!date || !complete || duplicateSlot || options.isError} onClick={() => save.mutate()}>Guardar jornada manual como borrador</Button>
        <Button tone="ghost" onClick={onCancel}>Cancelar</Button></div>
    </fieldset>
  </Card>;
}
