import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import type { Season } from '../../lib/types';
import { Alert, Button, Card } from '../../components/ui';

export default function FieldTimes({ season, disabled }: { season: Season; disabled: boolean }) {
  const qc = useQueryClient();
  const [times, setTimes] = useState<Record<string, string[]>>({});
  const settings = useQuery({ queryKey: ['season-settings', season.id], queryFn: () => api.get<Record<string, unknown>>(`/seasons/${season.id}/settings`) });
  useEffect(() => {
    if (!settings.data) return;
    const stored = settings.data.game_times as { slots?: string[]; field_slots?: Record<string, string[]> } | undefined;
    setTimes(Object.fromEntries(season.fields.map(f => [f.id, stored?.field_slots?.[f.id] ?? stored?.slots ?? [season.default_start_time.slice(0, 5)]])));
  }, [settings.data, season.fields, season.default_start_time]);
  const slots = [...new Set(Object.values(times).flat())].sort();
  const valid = slots.length > 0 && slots.every(t => /^([01]\d|2[0-3]):[0-5]\d$/.test(t)) && Object.values(times).every(ts => new Set(ts).size === ts.length);
  const save = useMutation({ mutationFn: () => api.put(`/admin/seasons/${season.id}/settings/game_times`, { value: { slots, field_slots: times } }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['season-settings', season.id] }); void qc.invalidateQueries({ queryKey: ['season-slots'] }); } });
  return <Card className="space-y-3 p-4"><h2 className="font-semibold">Horarios disponibles por campo</h2>
    <p className="text-sm">Cada hora representa el inicio de un partido (Cancún). Deja suficiente tiempo entre partidos. Sin horarios, el campo no participa en el generador. No modifica jornadas guardadas.</p>
    {settings.error && <Alert tone="error">No se pudieron cargar los horarios.</Alert>}
    <fieldset disabled={disabled || settings.isPending || settings.isError || save.isPending} className="space-y-3">
      {season.fields.map(f => <section key={f.id} className="space-y-2"><h3 className="font-medium">{f.name}</h3>
        {(times[f.id] ?? []).map((t, i) => <div key={i} className="flex gap-2"><input aria-label={`${f.name}: horario ${i + 1}`} type="time" className="input" value={t} onChange={e => setTimes({ ...times, [f.id]: times[f.id].map((v, j) => j === i ? e.target.value : v) })} />
          <Button size="sm" onClick={() => setTimes({ ...times, [f.id]: times[f.id].filter((_, j) => i !== j) })}>Quitar</Button></div>)}
        <Button size="sm" onClick={() => setTimes({ ...times, [f.id]: [...(times[f.id] ?? []), ''] })}>Agregar horario a {f.name}</Button>
      </section>)}
      <p className="text-sm">Espacios configurados: {Object.values(times).flat().filter(Boolean).length} partidos por jornada.</p>
      <Button disabled={!valid} loading={save.isPending} onClick={() => save.mutate()}>Guardar horarios de campos</Button>
    </fieldset>
    {save.error && <Alert tone="error">{save.error.message}</Alert>}{save.isSuccess && <Alert tone="success">Horarios guardados. Genera una nueva propuesta para utilizarlos.</Alert>}
  </Card>;
}
