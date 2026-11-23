import { useDiscardPlayoff } from '../lib/useDiscardPlayoff';
import { useCompetitionSeason } from './admin/useCompetitionSeason';
import { EventInputs, FixtureForm, type FixtureDraft, useEventEditor } from './admin/EventEditor';
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuth, isAdmin } from '../store/auth';
import { Alert, Button, Card, Field, Spinner } from '../components/ui';

interface Playoff {
  id: string; category_name: string; stage: number; champion_name: string | null;
  seeds: { id: string; name: string }[]; slots: (string | null)[];
  games: { id: string; stage: number; slot:number; date:string; time:string; round_status:string; home: string; away: string; home_score: number; away_score: number; status: string; offensive_mvp: string | null; defensive_mvp: string | null }[];
}

function phaseName(p:Playoff,stage:number) {
  const size=2**(Math.ceil(Math.log2(p.seeds.length))-stage+1);
  return size===2?'Final':size===4?'Semifinales':size===8?'Cuartos de final':'Octavos de final';
}

export function PlayoffList({ seasonId, manage = false }: { seasonId: string; manage?: boolean }) {
  const qc = useQueryClient();
  const editor=useEventEditor(seasonId,manage);
  const {date,time,fieldId,roundId}=editor;
  const [slots,setSlots]=useState<Record<string,{fieldId:string;time:string}>>({});
  const refresh=()=>{void qc.invalidateQueries({queryKey:['playoffs']});void qc.invalidateQueries({queryKey:['rounds']});};
  const { mutation: discard, confirmDiscard } = useDiscardPlayoff();
  const move=useMutation({mutationFn:(v:{id:string;gameId:string})=>api.post('/admin/playoffs/'+v.id+'/games/'+v.gameId+'/schedule',{date,time,fieldId,roundId:roundId||undefined}),onSuccess:refresh});
  function matches(p:Playoff) {
    const teams=p.stage===0?p.slots:p.slots.filter((_,i)=>i%2===0).map((home,i)=>{
      const away=p.slots[i*2+1], g=p.games.find(g=>g.stage===p.stage && g.slot===i);
      if (!home || !away) return home || away;
      if (!g || !['FINISHED','WALKOVER'].includes(g.status) || g.home_score===g.away_score) return null;
      return g.home_score>g.away_score?home:away;
    });
    return teams.flatMap((home,i)=>i%2===0 && home && teams[i+1]?[{slot:i/2,label:[home,teams[i+1]].map(id=>p.seeds.find(s=>s.id===id)?.name).join(' vs ')}]:[]);
  }
  const key=(p:Playoff,i:number)=>p.id+'-'+p.stage+'-'+i;
  const option=(p:Playoff,i:number)=>slots[key(p,i)]??{time,fieldId};
  const list = useQuery({ queryKey: ['playoffs', seasonId], queryFn: () => api.get<Playoff[]>(`/playoffs?seasonId=${encodeURIComponent(seasonId)}`) });
  const [selected,setSelected]=useState<string[]>([]);
  const [fixtures,setFixtures]=useState<FixtureDraft[]>([]);
  const chosen=(list.data??[]).filter(p=>selected.includes(p.id) && matches(p).length);
  const batch=useMutation({mutationFn:()=>api.post('/admin/playoffs/schedule-batch',{seasonId,date,fixtures,roundId:roundId||undefined,stages:chosen.map(p=>({id:p.id,time,stage:p.stage,matches:Object.fromEntries(matches(p).map(m=>[m.slot,option(p,m.slot)]))}))}),
    onSuccess:()=>{setSelected([]);setFixtures([]);refresh();}});
  const advance = useMutation({ mutationFn: (p: Playoff) => api.post(`/admin/playoffs/${p.id}/advance`, { date, time, stage: p.stage, roundId:roundId||undefined,matches:Object.fromEntries(matches(p).map(m=>[m.slot,option(p,m.slot)])) }), onSuccess: () => { void qc.invalidateQueries({ queryKey: ['playoffs'] }); void qc.invalidateQueries({ queryKey: ['rounds'] }); } });
  if (list.isLoading) return <Spinner />;
  if (list.error) return <Alert tone="error">{list.error.message}</Alert>;
  return <div className="space-y-4">
    {manage && <><EventInputs editor={editor} /><FixtureForm onAdd={m=>setFixtures(prev=>[...prev,m])} seasonId={seasonId} editor={editor} /></>}
    {(discard.error || move.error) && <Alert tone="error">{(discard.error || move.error)?.message}</Alert>}
    {discard.isSuccess && <Alert tone="success">Descarte guardado.</Alert>}
    {move.isSuccess && <Alert tone="success">Partido reprogramado.</Alert>}
    {advance.error && <Alert tone="error">{advance.error.message}</Alert>}
    {advance.isSuccess && <Alert tone="success">Fase actualizada. Programa campos y árbitros en Jornadas antes de publicar.</Alert>}
    {!list.data?.length && <p className="text-sm">Todavía no hay playoffs en esta temporada.</p>}
    {list.data?.map((p) => <Card key={p.id} className="space-y-3 p-4">
      <h2 className="text-lg font-bold">{p.category_name} · {p.seeds.length} equipos</h2>
      {p.champion_name && <Alert tone="success" title="Campeón">{p.champion_name}</Alert>}
      <details><summary className="cursor-pointer">Clasificación inicial</summary><ol>{p.seeds.map((s, i) => <li key={s.id}>{i + 1}. {s.name}</li>)}</ol></details>
      {p.stage <= 1 && p.slots.some((s) => s === null) && <p className="text-sm">Pase directo: {p.slots.filter((s, i) => s && !p.slots[i ^ 1]).map((s) => p.seeds.find((t) => t.id === s)?.name).join(', ')}</p>}
      <div className="flex gap-4 overflow-x-auto pb-2">{Array.from({ length: p.stage }, (_, i) => i + 1).map((stage) => <section key={stage} className="min-w-60 space-y-2"><h3 className="font-semibold">{phaseName(p,stage)}</h3>{p.games.filter((g) => g.stage === stage).map((g) => <div key={g.id} className="rounded-box border border-base-300 p-3 text-sm"><p>{g.home} <strong>{g.home_score}</strong></p><p>{g.away} <strong>{g.away_score}</strong></p><p className="text-xs text-base-content/60">{g.status==='CANCELLED'?'Descartado':g.round_status==='DRAFT'?'Borrador':g.status==='SCHEDULED'?'Programado':g.status==='FINISHED'?'Finalizado':g.status} · {g.date.slice(0,10)} · {g.time.slice(0,5)}</p>
      {manage && g.stage===p.stage && !p.champion_name && <>{['CANCELLED','SCHEDULED'].includes(g.status) && <Button size="sm" disabled={!date || !fieldId || move.isPending} onClick={()=>move.mutate({id:p.id,gameId:g.id})}>Aplicar fecha, hora y cancha</Button>}{g.status!=='CANCELLED' && <Button size="sm" onClick={()=>confirmDiscard(p.id,p.category_name,g.id)}>Descartar partido</Button>}</>}{p.champion_name && stage === p.stage && <><p>MVP ofensivo de la final: {g.offensive_mvp || 'Sin seleccionar'}</p><p>MVP defensivo de la final: {g.defensive_mvp || 'Sin seleccionar'}</p></>}</div>)}</section>)}</div>
      {manage && matches(p).length>0 && <label className="flex gap-2"><input type="checkbox" checked={selected.includes(p.id)} onChange={e=>setSelected(v=>e.target.checked?[...v,p.id]:v.filter(id=>id!==p.id))} /> Incluir {p.category_name} en la programación conjunta</label>}
      {manage && <Button tone="error" outline onClick={()=>confirmDiscard(p.id,p.category_name)}>Descartar playoff</Button>}
      {manage && !p.champion_name && matches(p).map(m=>{
        const current=option(p,m.slot);
        const update=(value:Partial<typeof current>)=>setSlots(prev=>({...prev,[key(p,m.slot)]:{...current,...value}}));
        return <div className="flex flex-wrap items-center gap-2" key={m.slot}><strong>{m.label}</strong><input aria-label="Hora del partido" type="time" className="input" value={current.time} onChange={e=>update({time:e.target.value})} /><select aria-label="Cancha del partido" className="select" value={current.fieldId} onChange={e=>update({fieldId:e.target.value})}><option value="">Asignar en borrador</option>{editor.fields.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select></div>;
      })}
      {manage && !p.champion_name && <Button disabled={!date || !time} loading={advance.isPending} onClick={() => advance.mutate(p)}>{p.stage === 0 ? 'Programar primera fase' : p.slots.length === 2 ? 'Confirmar campeón' : 'Avanzar ganadores'}</Button>}
    </Card>)}
    {manage && (chosen.length>0 || fixtures.length>0) && <Card className="p-4 space-y-2"><h2>Vista previa · {date}</h2>{fixtures.map((m,i)=><p key={i}>{m.time} · {editor.fields.find(f=>f.id===m.fieldId)?.name} · {m.kind==='FRIENDLY'?'Amistoso':'Temporada regular'} · {m.label} <button className="link" onClick={()=>setFixtures(v=>v.filter((_,j)=>j!==i))}>Quitar</button></p>)}{chosen.flatMap(p=>matches(p).map(m=>{const o=option(p,m.slot);return <p key={key(p,m.slot)}>{o.time} · {editor.fields.find(f=>f.id===o.fieldId)?.name??'Cancha por asignar'} · {p.category_name} · {phaseName(p,p.stage+1)} · {m.label}</p>;}))}
      <Button disabled={!date} loading={batch.isPending} onClick={()=>batch.mutate()}>Guardar programación conjunta</Button></Card>}
    {batch.error && <Alert tone="error">{batch.error.message}</Alert>}
    {batch.isSuccess && <Alert tone="success">Programación conjunta guardada.</Alert>}
  </div>;
}

export default function Playoffs() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [categoryId, setCategoryId] = useState('');
  const [count, setCount] = useState(4);
  const {season,options,setSelected}=useCompetitionSeason();
  const settings = useQuery({ queryKey: ['season-settings', season.data?.id], queryFn: () => api.get<{ competition?: { playoff_count?: number } }>(`/seasons/${season.data!.id}/settings`), enabled: Boolean(season.data?.id) && isAdmin(user?.role) });
  useEffect(() => { if (settings.data?.competition?.playoff_count) setCount(settings.data.competition.playoff_count); }, [settings.data]);
  const create = useMutation({ mutationFn: () => api.post('/admin/playoffs', { seasonId: season.data!.id, categoryId, count }), onSuccess: () => { void qc.invalidateQueries({ queryKey: ['playoffs'] }); } });
  if (season.isLoading) return <Spinner />;
  if (!season.data) return <Alert tone="error">No hay temporada activa. Consulta los campeones en Historial.</Alert>;
  return <div className="mx-auto max-w-4xl space-y-5"><h1 className="text-xl font-bold">Playoffs · {season.data.name}</h1>
    <Field label="Temporada"><select className="select" value={season.data.id} onChange={e=>{setSelected(e.target.value);setCategoryId('');}}>{options.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
    {isAdmin(user?.role) && <Card className="space-y-3 p-4"><h2 className="font-semibold">Crear clasificación</h2><p className="text-sm">Clasifican los primeros equipos de la tabla regular con partidos jugados. La siembra queda fija; los ganadores conservan su llave.</p><Field label="Categoría"><select className="select w-full" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}><option value="">Selecciona</option>{season.data.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field><Field label="Equipos clasificados"><select className="select" value={count} onChange={(e) => setCount(Number(e.target.value))}>{[3, 4, 6, 8, 10, 12].map((n) => <option key={n}>{n}</option>)}</select></Field>{create.error && <Alert tone="error">{create.error.message}</Alert>}<Button loading={create.isPending} disabled={!categoryId} onClick={() => create.mutate()}>Crear playoffs</Button><Link className="link block" to="/admin/jornadas">Programar campos y árbitros en Jornadas</Link></Card>}
    <PlayoffList key={season.data.id} seasonId={season.data.id} manage={isAdmin(user?.role)} />
  </div>;
}
