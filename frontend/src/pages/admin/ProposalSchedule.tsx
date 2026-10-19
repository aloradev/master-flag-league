import { useState } from 'react';
import { Alert, Button } from '../../components/ui';
import { hora12, type Proposal, type ProposedGame } from '../../lib/competition';
import { moveProposal } from '../../lib/moveProposal.mjs';

export default function ProposalSchedule({ proposal, earliest, disabled, onChange }: {
 proposal: Proposal; earliest: Record<string,string>; disabled: boolean; onChange:(games:ProposedGame[])=>void;
}) {
 const [selected,setSelected]=useState<number|null>(null);
 const [error,setError]=useState('');
 const [message,setMessage]=useState('');
 const [over,setOver]=useState('');
 const slots=proposal.availableSlots ?? proposal.games.flatMap(g=>g.fieldId&&g.time ? [{fieldId:g.fieldId,fieldName:g.fieldName ?? 'Campo',time:g.time}] : []);
 const times=[...new Set(slots.map(s=>s.time))].sort();
 const move=(index:number,slot:typeof slots[number])=>{
  if(disabled)return;
  try {
   const games=moveProposal(proposal.games,index,slot,slots,earliest,proposal.clubReservations);
   onChange(games);setSelected(null);setError('');setMessage(`Horario actualizado: ${slot.fieldName}, ${hora12(slot.time)}. Guarda el borrador para conservarlo.`);
  }catch(e){setError(e instanceof Error?e.message:'No se pudo cambiar el horario.');setMessage('');}
  setOver('');
 };
 const card=(g:ProposedGame,index:number)=> <div className="flex flex-wrap items-center gap-2">
  <span aria-hidden="true" className="text-base-content/50">⠿</span>
  <span className="min-w-0 flex-1 font-medium">{g.homeTeamName} <span className="font-normal text-base-content/40">vs</span> {g.awayTeamName}</span>
  <span className="badge badge-ghost badge-sm">{g.categoryName}</span>
  {g.recovery && <span className="badge badge-info badge-sm">Recuperación</span>}
  {g.postponedGameId && <span className="badge badge-info badge-sm">Pospuesto</span>}
  {g.meeting>1 && <span className="badge badge-warning badge-sm">{g.meeting}º encuentro</span>}
  <Button type="button" size="xs" tone="ghost" disabled={disabled} aria-label={`Mover ${g.homeTeamName} vs ${g.awayTeamName}`} aria-pressed={selected===index} onClick={()=>{setSelected(selected===index?null:index);setError('');}}>Mover</Button>
 </div>;
 return <div className="space-y-4">
  <p className="text-sm text-base-content/70">Arrastra un encuentro a otro campo u horario. Si está ocupado, se intercambian los dos encuentros. También puedes pulsar “Mover” y elegir el destino.</p>
  {error && <Alert tone="error">{error}</Alert>}
  <p role="status" className="text-sm text-success">{message}</p>
  {selected!==null && <div className="space-y-2 rounded border border-info p-3"><p className="text-sm font-semibold">Elige destino para {proposal.games[selected]?.homeTeamName} vs {proposal.games[selected]?.awayTeamName}</p><label className="block text-sm">Nuevo campo y horario<select className="select select-bordered mt-1 w-full" value="" disabled={disabled} onChange={e=>{const slot=slots[Number(e.target.value)];if(slot)move(selected,slot);}}><option value="" disabled>Selecciona un espacio</option>{slots.map((slot,i)=>{const game=proposal.games.find(g=>g.fieldId===slot.fieldId&&g.time===slot.time);return <option key={`${slot.fieldId}:${slot.time}`} value={i}>{hora12(slot.time)} · {slot.fieldName}{game?` · ${game.homeTeamName} vs ${game.awayTeamName}`:' · Libre'}</option>;})}</select></label><Button type="button" size="xs" tone="ghost" onClick={()=>setSelected(null)}>Cancelar movimiento</Button></div>}
  {times.map(time=><section key={time} className="space-y-2"><h3 className="tabular text-sm font-bold">{hora12(time)}</h3><ul className="space-y-2">{slots.filter(s=>s.time===time).map(slot=>{
   const index=proposal.games.findIndex(g=>g.fieldId===slot.fieldId&&g.time===slot.time);
   const game=proposal.games[index];const key=`${slot.fieldId}:${slot.time}`;
   return <li key={key} data-schedule-slot={key} draggable={!disabled&&!!game}
    onDragStart={event=>{if(index<0)return;event.dataTransfer.setData('application/x-mfl-game',String(index));event.dataTransfer.effectAllowed='move';setSelected(index);setError('');}}
    onDragEnd={()=>{setSelected(null);setOver('');}}
    onDragOver={event=>{if(disabled)return;event.preventDefault();event.dataTransfer.dropEffect='move';setOver(key);}}
    onDragLeave={()=>setOver(current=>current===key?'':current)}
    onDrop={event=>{event.preventDefault();if(disabled)return;const value=event.dataTransfer.getData('application/x-mfl-game');if(value!=='')move(Number(value),slot);}}
    className={`rounded-field border px-3 py-2 text-sm ${over===key?'border-info bg-info/10':'border-base-300/60 bg-base-100/60'} ${game&&!disabled?'cursor-grab active:cursor-grabbing':''}`}>
     <span className="mb-1 block text-[11px] font-semibold text-base-content/60">{slot.fieldName}</span>
     {game?card(game,index):<div className="flex items-center justify-between gap-2 text-base-content/50"><span>Espacio libre · Arrastra aquí</span>{selected!==null&&<Button type="button" size="xs" disabled={disabled} onClick={()=>move(selected,slot)}>Mover aquí</Button>}</div>}
   </li>;
  })}</ul></section>)}
  {proposal.games.map((g,index)=>!g.time||!g.fieldId?<div key={`unscheduled-${index}`} draggable={!disabled} onDragStart={event=>{event.dataTransfer.setData('application/x-mfl-game',String(index));event.dataTransfer.effectAllowed='move';}} className="rounded border border-warning p-3"><p className="text-sm text-warning">Sin horario compatible</p>{card(g,index)}</div>:null)}
 </div>;
}
