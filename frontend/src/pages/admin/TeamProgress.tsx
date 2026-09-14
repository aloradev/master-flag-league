import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import type { Season } from '../../lib/types';
import { MOTIVO_DESCANSO } from '../../lib/competition';
import { fechaTexto } from '../../lib/format';
import { Alert, Button, Card, Field, Spinner } from '../../components/ui';

type Progress = { id:string; name:string; category_id:string; category_name:string; status:string;
  competition_start_date:string|null; counts:Record<string,number>;
  timeline:{round_id:string;number:number;date:string;state:string;game_id:string|null;opponent:string|null;bye_reason:string|null}[] };
const labels:Record<string,string> = { PLAYED:'Jugado', WALKOVER:'Resuelto por incomparecencia', POSTPONED:'Pospuesto', LIVE:'En juego',
  CANCELLED:'Partido cancelado', AWAITING_RESULT:'Pendiente de resultado', SCHEDULED:'Programado', BYE:'Descanso',
  BEFORE_ENTRY:'Anterior a su incorporación', UNASSIGNED_ELAPSED:'Sin participación asignada', UNASSIGNED:'Sin asignar' };

function Entry({team,season}:{team:Progress;season:Season}) {
  const qc=useQueryClient();
  const [date,setDate]=useState(team.competition_start_date ?? '');
  const [reason,setReason]=useState('');
  const save=useMutation({mutationFn:()=>api.put(`/admin/teams/${team.id}/competition-entry`,{date:date || null,reason}),
    onSuccess:()=>{setReason('');void qc.invalidateQueries({queryKey:['rounds']});}});
  return <details className="space-y-2">
    <summary className="cursor-pointer text-sm">Confirmar o corregir incorporación</summary>
    <p className="text-xs">Indica cuándo empezó a participar en la temporada, aunque se haya registrado después en la app. Vacío significa sin confirmar. Este dato no crea partidos ni cambia sus fechas.</p>
    <fieldset disabled={save.isPending} className="space-y-2">
      <Field label="Fecha de incorporación"><input type="date" min={season.start_date.slice(0,10)} max={season.end_date?.slice(0,10)} className="input input-bordered w-full" value={date} onChange={e=>setDate(e.target.value)} /></Field>
      <Field label="Motivo o fuente"><input maxLength={1000} className="input input-bordered w-full" value={reason} onChange={e=>setReason(e.target.value)} /></Field>
      {save.error && <Alert tone="error">{save.error.message}</Alert>}
      {save.isSuccess && <Alert tone="success">Incorporación guardada en auditoría.</Alert>}
      <Button size="sm" disabled={!reason.trim()} loading={save.isPending} onClick={()=>save.mutate()}>Guardar incorporación</Button>
    </fieldset>
  </details>;
}

export default function TeamProgress({season,onOpenRound}:{season:Season;onOpenRound:(id:string)=>void}) {
  const [open,setOpen]=useState(false);
  const [filter,setFilter]=useState('all');
  const [category,setCategory]=useState('');
  const progress=useQuery({queryKey:['rounds','team-progress',season.id],queryFn:()=>api.get<Progress[]>(`/admin/team-progress?seasonId=${season.id}`),enabled:open});
  const visible=(progress.data ?? []).filter(t=>(!category || t.category_id===category) && (filter==='all'
    || (filter==='pending' && (t.counts.AWAITING_RESULT>0 || t.counts.POSTPONED>0))
    || (filter==='unassigned' && t.counts.UNASSIGNED_ELAPSED>0)
    || (filter==='late' && !!t.competition_start_date && t.competition_start_date>season.start_date.slice(0,10))
    || (filter==='unknown' && !t.competition_start_date)));
  return <Card className="space-y-3 p-4">
    <Button size="sm" onClick={()=>setOpen(!open)}>{open?'Ocultar seguimiento por equipo':'Partidos pendientes, descansos e incorporaciones'}</Button>
    {open && <>
      <p className="text-sm">Solo jornadas publicadas de temporada regular. Los borradores, playoffs y jornadas canceladas quedan fuera del seguimiento.</p>
      <Alert>Una jornada sin partido asignado no es una derrota, un descanso ni un encuentro que el equipo deba reponer. Los descansos se cuentan solo cuando están registrados.</Alert>
      <div className="flex flex-wrap gap-2">
        <Field label="Categoría"><select className="select select-bordered" value={category} onChange={e=>setCategory(e.target.value)}><option value="">Todas</option>{season.categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
        <Field label="Mostrar"><select className="select select-bordered" value={filter} onChange={e=>setFilter(e.target.value)}>
          <option value="all">Todos los equipos</option><option value="pending">Pendientes o pospuestos</option>
          <option value="unassigned">Jornadas pasadas sin asignación</option><option value="late">Incorporados después del inicio</option><option value="unknown">Incorporación sin confirmar</option>
        </select></Field>
        <Button size="sm" disabled={progress.isFetching} onClick={()=>void progress.refetch()}>Actualizar seguimiento</Button>
      </div>
      {progress.isLoading && <Spinner />}
      {progress.error && <Alert tone="error">{progress.error.message}</Alert>}
      {progress.isSuccess && !visible.length && <p>No hay equipos que coincidan con el filtro.</p>}
      {visible.map(team=><section key={team.id} className="space-y-3 rounded border border-base-300 p-3">
        <h3 className="font-semibold">{team.name} · {team.category_name}</h3>
        {team.status!=='ACTIVE' && <p className="text-xs text-warning">Equipo no activo</p>}
        <p className="text-sm">Incorporación: {team.competition_start_date ? fechaTexto(team.competition_start_date) : 'sin confirmar'}</p>
        <div className="flex flex-wrap gap-2 text-xs">{['PLAYED','WALKOVER','AWAITING_RESULT','POSTPONED','LIVE','SCHEDULED','BYE','UNASSIGNED_ELAPSED'].map(state=><span key={state} className="rounded bg-base-300 px-2 py-1">{labels[state]}: {team.counts[state]}</span>)}</div>
        <Entry key={`${team.id}:${team.competition_start_date}`} team={team} season={season} />
        <details><summary className="cursor-pointer text-sm">Ver detalle por jornada</summary>
          {!team.timeline.length && <p className="text-sm">Todavía no hay jornadas publicadas de temporada regular.</p>}
          <ul className="mt-2 max-h-96 space-y-2 overflow-y-auto text-sm">{team.timeline.map(r=><li key={r.round_id} className="border-b border-base-300 pb-2">
            <a className="link" href={`#round-${r.round_id}`} onClick={()=>onOpenRound(r.round_id)}>Jornada {r.number}</a> · {fechaTexto(r.date)}
            <p>{labels[r.state]}{r.opponent ? ` · vs ${r.opponent}` : ''}{r.bye_reason ? ` · ${MOTIVO_DESCANSO[r.bye_reason] ?? r.bye_reason}` : ''}</p>
          </li>)}</ul>
        </details>
      </section>)}
    </>}
  </Card>;
}
