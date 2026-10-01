import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { fechaTexto } from '../../lib/format';
import { Alert, Button, Card, Spinner } from '../../components/ui';

type Kind='TEAM'|'RESULT'|'STATISTICS'|'REFEREE'|'POSTPONED'|'REGISTRATION';
type Item={id:string;type:'game'|'player'|'team';kinds:Kind[];title:string;detail:string;date:string|null;round_id:string|null;team_id:string|null;reason:string|null};
type Pending={items:Item[];counts:Record<Kind,number>;updated_at:string};
const labels:Record<Kind,string>={TEAM:'Equipos incompletos',RESULT:'Resultados pendientes',STATISTICS:'Estadísticas incompletas',REFEREE:'Sin árbitro principal habilitado',POSTPONED:'Partidos pospuestos',REGISTRATION:'Registros por revisar o completar'};

export default function PendingPanel({seasonId}:{seasonId:string}) {
  const [filter,setFilter]=useState<Kind|'ALL'>('ALL');
  const [limit,setLimit]=useState(20);
  const pending=useQuery({queryKey:['admin-pending',seasonId],queryFn:()=>api.get<Pending>(`/admin/pending?seasonId=${encodeURIComponent(seasonId)}`),refetchInterval:60000});
  const items=(pending.data?.items ?? []).filter(item=>filter==='ALL' || item.kinds.includes(filter));
  return <section className="space-y-3" aria-label="Pendientes administrativos">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="font-semibold">Pendientes administrativos</h2>
      <Button size="sm" disabled={pending.isFetching} onClick={()=>void pending.refetch()}>Actualizar pendientes</Button>
    </div>
    {pending.isLoading && <Spinner label="Consultando pendientes…" />}
    {pending.error && <Alert tone="error">No se pudieron actualizar los pendientes. Usa Actualizar pendientes para reintentar.</Alert>}
    {pending.data && <>
      <p className="text-xs text-base-content/60">Resultados de fechas anteriores a hoy, estadísticas pendientes de partidos finalizados y asignaciones de árbitro principal con cuenta activa. Incluye partidos oficiales publicados de la temporada, también playoffs.</p>
      <div className="flex flex-wrap gap-2" aria-label="Filtrar pendientes">
        <button className={`btn btn-sm ${filter==='ALL'?'btn-primary':'btn-ghost'}`} aria-pressed={filter==='ALL'} onClick={()=>{setFilter('ALL');setLimit(20);}}>Todos ({pending.data.items.length})</button>
        {(Object.keys(labels) as Kind[]).map(kind=><button key={kind} className={`btn btn-sm h-auto py-2 ${filter===kind?'btn-primary':'btn-ghost'}`} aria-pressed={filter===kind} onClick={()=>{setFilter(kind);setLimit(20);}}>{labels[kind]} ({pending.data!.counts[kind]})</button>)}
      </div>
      <p className="text-xs text-base-content/60">Un partido puede tener varios pendientes y aparece una sola vez en Todos.</p>
      {!items.length && <Alert tone="success">{filter==='ALL'?'No hay pendientes de equipos, resultados, estadísticas, árbitros ni revisión de registros en este momento.':'No hay pendientes en este filtro.'}</Alert>}
      <ul className="space-y-2">
        {items.slice(0,limit).map(item=><Card as="li" key={`${item.type}:${item.id}`} className="space-y-2 p-3">
          <h3 className="font-semibold">{item.title}</h3>
          <p className="text-xs text-base-content/60">{item.detail}{item.date ? ` · ${fechaTexto(item.date)}` : ''}</p>
          <div className="flex flex-wrap gap-2">{item.kinds.map(kind=><span key={kind} className="text-xs text-warning">{labels[kind]}</span>)}</div>
          {item.reason && <p className="text-sm">{item.reason}</p>}
          {item.type==='game' ? <div className="flex flex-wrap gap-3"><Link className="btn btn-sm" to={`/admin/jornadas?roundId=${encodeURIComponent(item.round_id!)}#game-${encodeURIComponent(item.id)}`}>Abrir gestión del partido</Link>
            {item.kinds.includes('RESULT') && <Link className="btn btn-sm btn-ghost" to={`/arbitro/partido/${encodeURIComponent(item.id)}`}>Capturar jugadas y cerrar</Link>}</div>
            : <div className="flex flex-wrap gap-3 text-sm"><Link className="link" to={`/admin/validacion?teamId=${encodeURIComponent(item.team_id!)}`}>Revisar registros del equipo</Link><Link className="link" to={`/admin/equipos/${encodeURIComponent(item.team_id!)}`}>Abrir equipo</Link></div>}
        </Card>)}
      </ul>
      {items.length>limit && <Button size="sm" onClick={()=>setLimit(limit+20)}>Mostrar más ({items.length-limit} restantes)</Button>}
      <p className="text-xs text-base-content/50">Actualizado a las {new Date(pending.data.updated_at).toLocaleTimeString('es-MX',{timeZone:'America/Cancun',hour:'2-digit',minute:'2-digit'})} de Cancún. Los pendientes desaparecen al resolverlos; actualización automática cada minuto.</p>
    </>}
  </section>;
}
