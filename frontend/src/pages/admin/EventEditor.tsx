import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Field, Alert, Button } from '../../components/ui';
import { api } from '../../lib/api';

type Option = {id:string;name:string};
type Round = Option & {scheduled_date:string; status:string; number:number};
export function useEventEditor(seasonId:string, enabled:boolean) {
  const [date,setDate]=useState('');
  const [time,setTime]=useState('19:00');
  const [fieldId,setField]=useState('');
  const [roundId,setRound]=useState('');
  const fields=useQuery({queryKey:['event-fields',seasonId],enabled,queryFn:()=>api.get<Option[]>('/seasons/'+seasonId+'/fields')});
  const rounds=useQuery({queryKey:['rounds','event',seasonId],enabled,queryFn:()=>api.get<Round[]>('/rounds?seasonId='+seasonId)});
  return {date,time,fieldId,roundId,fields:fields.data??[],setDate,setTime,setField,setRound,
    error:fields.error || rounds.error,rounds:(rounds.data??[]).filter(r=>r.scheduled_date.slice(0,10)===date && ['DRAFT','PUBLISHED'].includes(r.status))};
}
export type EventEditorState=ReturnType<typeof useEventEditor>;
export function EventInputs({editor:e}:{editor:EventEditorState}) {
  return <div className="grid gap-3 sm:grid-cols-2">
    <Field label="Fecha"><input className="input w-full" type="date" value={e.date} onChange={v=>{e.setDate(v.target.value);e.setRound('');}} /></Field>
    <Field label="Jornada"><select className="select w-full" value={e.roundId} onChange={v=>e.setRound(v.target.value)}><option value="">Compartir jornada de competición de esta fecha</option>{e.rounds.map(r=><option key={r.id} value={r.id}>J{r.number} · {r.name}</option>)}<option value="new">Crear jornada separada</option></select></Field>
    <Field label="Hora de Cancún"><input type="time" className="input" value={e.time} onChange={v=>e.setTime(v.target.value)} /></Field>
    <Field label="Cancha"><select className="select" value={e.fieldId} onChange={v=>e.setField(v.target.value)}><option value="">Asignar en borrador</option>{e.fields.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select></Field>
    {e.error && <Alert tone="error">{e.error.message}</Alert>}
  </div>;
}

export type FixtureDraft={kind:'FRIENDLY'|'REGULAR';categoryId:string;homeTeamId:string;awayTeamId:string;fieldId:string;time:string;label:string};
export function FixtureForm({editor:e,seasonId,onAdd}:{editor:EventEditorState;seasonId:string;onAdd:(m:FixtureDraft)=>void}) {
  const [kind,setKind]=useState<FixtureDraft['kind']>('FRIENDLY');
  const [category,setCategory]=useState('');
  const [home,setHome]=useState('');
  const [away,setAway]=useState('');
  const categories=useQuery({queryKey:['event-categories',seasonId],queryFn:()=>api.get<Option[]>('/seasons/'+seasonId+'/categories')});
  const teams=useQuery({queryKey:['friendly-teams',seasonId,category],enabled:!!category,queryFn:()=>api.get<Option[]>('/teams?status=ACTIVE&seasonId='+seasonId+'&categoryId='+category)});
  function add() {
    const label=[home,away].map(id=>teams.data?.find(t=>t.id===id)?.name).join(' vs ');
    onAdd({kind,categoryId:category,homeTeamId:home,awayTeamId:away,fieldId:e.fieldId,time:e.time,label});
    setHome('');setAway('');
  }
  return <details className="rounded-box border p-3"><summary>Agregar partido regular o amistoso</summary><div className="grid gap-2 py-3 sm:grid-cols-2">
    <Field label="Tipo de partido"><select className="select" value={kind} onChange={e=>setKind(e.target.value as FixtureDraft['kind'])}><option value="FRIENDLY">Amistoso</option><option value="REGULAR">Temporada regular</option></select></Field>
    <Field label="Categoría"><select className="select" value={category} onChange={v=>{setCategory(v.target.value);setHome('');setAway('');}}><option value="">Selecciona</option>{categories.data?.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
    {(['Local','Visitante'] as const).map((label,i)=><Field key={label} label={label}><select className="select" value={i?away:home} onChange={v=>(i?setAway:setHome)(v.target.value)}><option value="">Selecciona equipo</option>{teams.data?.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></Field>)}
    <Button disabled={!home || !away || home===away || !e.date || !e.fieldId || !e.time} onClick={add}>Agregar a la vista previa</Button>
    {(teams.error || categories.error) && <Alert tone="error">{(teams.error || categories.error)?.message}</Alert>}
  </div></details>;
}
