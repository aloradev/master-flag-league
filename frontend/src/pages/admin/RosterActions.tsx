import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { Alert, Button, Field } from '../../components/ui';

export default function RosterActions({teamId}:{teamId:string}) {
  const qc=useQueryClient();
  const [search,setSearch]=useState('');
  const matches=useQuery({queryKey:['roster-search',search],enabled:search.trim().length>=2,
    queryFn:()=>api.get<{id:string;first_name:string;last_name_paternal:string;team_name:string;category_name:string;season_name:string;birth_year:number}[]>('/admin/player-profiles?search='+encodeURIComponent(search.trim()))});
  const associate=useMutation({mutationFn:(playerId:string)=>api.post('/admin/teams/'+teamId+'/associate-player',{playerId}),
    onSuccess:()=>{setSearch('');void qc.invalidateQueries({queryKey:['team',teamId]});}});
  return <div className="mb-4 space-y-2">
    <Link className="btn btn-primary btn-sm" to={'/equipo/jugadores/nuevo?equipo='+teamId}>Registrar jugador</Link>
    <Field label="Buscar jugador existente para asociarlo"><input className="input w-full" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Nombre o apellido" /></Field>
    {search.trim().length>=2 && matches.data?.map(p=><div key={p.id} className="flex items-center justify-between gap-2"><span>{p.first_name} {p.last_name_paternal} · {p.team_name} · {p.category_name} · {p.season_name} · Nac. {p.birth_year}</span><Button size="sm" disabled={associate.isPending} onClick={()=>{if(window.confirm('¿Asociar este perfil al equipo seleccionado?')) associate.mutate(p.id);}}>Asociar</Button></div>)}
    {search.trim().length>=2 && matches.data?.length===0 && <p>Sin coincidencias.</p>}
    {(matches.error || associate.error) && <Alert tone="error">{(matches.error || associate.error)?.message}</Alert>}
    {associate.isSuccess && <Alert tone="success">Jugador en el roster.</Alert>}
  </div>;
}

export function LinkPlayerAccount({id}:{id:string}) {
  const [email,setEmail]=useState('');
  const link=useMutation({mutationFn:()=>api.post('/admin/players/'+id+'/link-account',{email,verified:true})});
  return <details><summary>Vincular cuenta de acceso</summary><Field label="Correo de la cuenta verificada"><input className="input" type="email" value={email} onChange={e=>{setEmail(e.target.value);link.reset();}} /></Field>
    <Button disabled={!email || link.isPending} onClick={()=>{if(window.confirm('¿Verificaste la identidad del titular y su correo antes de vincular la cuenta?')) link.mutate();}}>Confirmar vínculo</Button>
    {link.error && <Alert tone="error">{link.error.message}</Alert>}{link.isSuccess && <p>Cuenta vinculada.</p>}</details>;
}
