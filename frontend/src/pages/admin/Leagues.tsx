import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '../../lib/api';
import { useAuth } from '../../store/auth';
import { Alert, Button, Card, Field, Spinner } from '../../components/ui';

type League={id:string;name:string;slug:string;city:string|null;state:string|null;status:string;seasons_count:number;teams_count:number};
const currentYear=new Date().getFullYear();

export default function AdminLeagues(){
  const user=useAuth(s=>s.user); const switchLeague=useAuth(s=>s.switchLeague);
  const qc=useQueryClient(); const navigate=useNavigate();
  const [show,setShow]=useState(false); const [error,setError]=useState('');
  const [editing,setEditing]=useState<string|null>(null);
  const [leagueForm,setLeagueForm]=useState({name:'',city:'',state:''});
  const [form,setForm]=useState({name:'',city:'Cancún',state:'Quintana Roo',seasonName:`Temporada ${currentYear}`,year:String(currentYear),startDate:'',registrationDeadline:'',categories:'Varonil, Femenil, Mixto'});
  const leagues=useQuery({queryKey:['admin-leagues'],queryFn:()=>api.get<League[]>('/admin/leagues')});
  const create=useMutation({mutationFn:()=>api.post('/admin/leagues',{...form,year:Number(form.year),categories:form.categories.split(',').map(v=>v.trim()).filter(Boolean)}),onSuccess:()=>{setShow(false);setError('');void qc.invalidateQueries({queryKey:['admin-leagues']});},onError:e=>setError(e instanceof ApiError?e.message:'No se pudo crear la liga')});
  const update=useMutation({mutationFn:(id:string)=>api.put(`/admin/leagues/${id}`,leagueForm),onSuccess:()=>{setEditing(null);setError('');void qc.invalidateQueries({queryKey:['admin-leagues']});},onError:e=>setError(e instanceof ApiError?e.message:'No se pudo actualizar la liga')});
  const activate=useMutation({mutationFn:async(id:string)=>switchLeague(id),onSuccess:()=>{void qc.clear();navigate('/admin/temporada',{replace:true});},onError:e=>setError(e instanceof ApiError?e.message:'No se pudo cambiar de liga')});
  const submit=(e:FormEvent)=>{e.preventDefault();if(!create.isPending)create.mutate();};
  if(leagues.isLoading)return <Spinner label="Cargando ligas…"/>;
  return <div className="mx-auto max-w-3xl space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-xl font-bold">Ligas</h1><p className="text-sm text-base-content/60">Cada liga mantiene separadas sus temporadas, categorías, equipos, usuarios y partidos.</p></div><Button tone="primary" onClick={()=>setShow(v=>!v)}>{show?'Cancelar':'Crear liga'}</Button></div>
    {error&&<Alert tone="error">{error}</Alert>}
    {show&&<form onSubmit={submit}><Card className="space-y-4 p-4"><div><h2 className="font-semibold">Nueva liga</h2><p className="text-sm text-base-content/60">Se creará también la primera temporada y sus categorías. Después podrás ajustar reglas, documentos y sedes.</p></div>
      <Field label="Nombre de la liga" required><input className="input w-full" required maxLength={255} value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></Field>
      <div className="grid gap-3 sm:grid-cols-2"><Field label="Ciudad" required><input className="input w-full" required value={form.city} onChange={e=>setForm({...form,city:e.target.value})}/></Field><Field label="Estado"><input className="input w-full" value={form.state} onChange={e=>setForm({...form,state:e.target.value})}/></Field></div>
      <div className="grid gap-3 sm:grid-cols-2"><Field label="Primera temporada" required><input className="input w-full" required value={form.seasonName} onChange={e=>setForm({...form,seasonName:e.target.value})}/></Field><Field label="Año" required><input type="number" min="2020" max="2100" className="input w-full" required value={form.year} onChange={e=>setForm({...form,year:e.target.value})}/></Field></div>
      <div className="grid gap-3 sm:grid-cols-2"><Field label="Inicio" required><input type="date" className="input w-full" required value={form.startDate} onChange={e=>setForm({...form,startDate:e.target.value})}/></Field><Field label="Cierre de inscripciones" hint="Opcional"><input type="date" className="input w-full" value={form.registrationDeadline} onChange={e=>setForm({...form,registrationDeadline:e.target.value})}/></Field></div>
      <Field label="Categorías iniciales" hint="Sepáralas con comas. Podrás agregar o eliminar categorías vacías después." required><input className="input w-full" required value={form.categories} onChange={e=>setForm({...form,categories:e.target.value})}/></Field>
      <Alert tone="info">Crear la liga no cambia tu contexto actual. Cuando esté lista, usa “Administrar esta liga”.</Alert>
      <Button type="submit" tone="primary" block loading={create.isPending} disabled={!form.name.trim()||!form.city.trim()||!form.startDate||!form.categories.trim()}>Crear liga y temporada</Button>
    </Card></form>}
    <div className="grid gap-3 sm:grid-cols-2">{leagues.data?.map(l=><Card key={l.id} className="space-y-3 p-4">{editing===l.id?<form className="space-y-3" onSubmit={e=>{e.preventDefault();update.mutate(l.id);}}><h2 className="font-semibold">Editar liga</h2><Field label="Nombre" required><input className="input w-full" required maxLength={255} value={leagueForm.name} onChange={e=>setLeagueForm({...leagueForm,name:e.target.value})}/></Field><Field label="Ciudad" required><input className="input w-full" required maxLength={120} value={leagueForm.city} onChange={e=>setLeagueForm({...leagueForm,city:e.target.value})}/></Field><Field label="Estado"><input className="input w-full" maxLength={120} value={leagueForm.state} onChange={e=>setLeagueForm({...leagueForm,state:e.target.value})}/></Field><p className="text-xs text-base-content/60">El enlace interno de la liga se conserva para no romper accesos compartidos.</p><div className="flex gap-2"><Button type="submit" size="sm" tone="primary" loading={update.isPending} disabled={!leagueForm.name.trim()||!leagueForm.city.trim()}>Guardar cambios</Button><Button type="button" size="sm" tone="ghost" onClick={()=>setEditing(null)}>Cancelar</Button></div></form>:<><div className="flex items-start justify-between gap-2"><div><h2 className="font-semibold">{l.name}</h2><p className="text-sm text-base-content/60">{[l.city,l.state].filter(Boolean).join(', ')||'Ubicación pendiente'}</p></div>{l.id===user?.leagueId&&<span className="badge badge-success">Activa</span>}</div><div className="flex gap-4 text-sm"><span>{l.seasons_count} temporadas</span><span>{l.teams_count} equipos</span></div><Button size="sm" outline block onClick={()=>{setEditing(l.id);setLeagueForm({name:l.name,city:l.city??'',state:l.state??''});setError('');}}>Editar nombre y ubicación</Button>{l.id===user?.leagueId?<Button outline block onClick={()=>navigate('/admin/temporada')}>Configurar temporada y categorías</Button>:<Button outline block loading={activate.isPending} onClick={()=>activate.mutate(l.id)}>Administrar esta liga</Button>}</>}</Card>)}</div>
  </div>;
}
