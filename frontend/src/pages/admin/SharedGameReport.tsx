import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { api, temporaryApi } from '../../lib/api';
import { Alert, Button, Card, Field, Spinner } from '../../components/ui';
const stats = { td: 'TD', passes: 'Pases de TD', receptions: 'Recepciones', interceptions: 'Intercepciones', sacks: 'Sacks' };
type Player = { team: string; name: string; jersey: string } & Record<keyof typeof stats, number>;
type Data = { author: string; notes: string; homeScore: number; awayScore: number; players: Player[] };
type Report = { data: Partial<Data>; revision: number; updated_at?: string; game?: { home_team_name: string; away_team_name: string } };
export function ReportAccess({ gameId }: { gameId: string }) {
 const qc = useQueryClient();
 const [link, setLink] = useState('');
 const [copied,setCopied] = useState(false);
 const report = useQuery({queryKey:['report',gameId],queryFn:()=>api.get<Report|null>(`/admin/games/${gameId}/report`)});
 const create = useMutation({mutationFn:()=>api.post<{token:string}>(`/admin/games/${gameId}/report-link`),onSuccess:r=>{setLink(`${location.origin}/llenar-acta/${gameId}#${r.token}`);setCopied(false);}});
 const revoke = useMutation({mutationFn:()=>api.del(`/admin/games/${gameId}/report-link`),onSuccess:()=>setLink('')});
 return <Card className="space-y-3 p-4">
  <h2 className="text-lg font-bold">Compartir llenado del acta</h2>
  <p className="text-sm">El enlace dura 7 días y permite llenar este partido sin cuenta ni registro de jugadores. Generar otro invalida el anterior.</p>
  <div className="flex flex-wrap gap-2"><Button type="button" loading={create.isPending} onClick={()=>create.mutate()}>Generar enlace de llenado</Button><Button type="button" tone="ghost" loading={revoke.isPending} onClick={()=>revoke.mutate()}>Revocar enlace</Button></div>
  {(create.error||revoke.error) && <Alert tone="error">{(create.error||revoke.error)?.message}</Alert>}
  {link && <Field label="Enlace para compartir"><input className="input input-bordered w-full" readOnly value={link} onFocus={e=>e.target.select()} /><Button type="button" size="sm" onClick={()=>void navigator.clipboard.writeText(link).then(()=>setCopied(true)).catch(()=>setCopied(false))}>{copied?'Copiado':'Copiar enlace'}</Button></Field>}
  <Button type="button" size="sm" tone="ghost" onClick={()=>void qc.invalidateQueries({queryKey:['report',gameId]})}>Actualizar captura recibida</Button>
  {report.isLoading && <Spinner />}{report.error && <Alert tone="error">{report.error.message}</Alert>}
  {report.data?.data.author ? <div className="space-y-2 text-sm"><p>Capturado por: <strong>{report.data.data.author}</strong></p><p>Marcador del acta: {report.data.data.homeScore} – {report.data.data.awayScore}</p><p className="whitespace-pre-wrap">{report.data.data.notes}</p><div className="overflow-x-auto"><table className="table table-sm"><thead><tr><th>Equipo</th><th>Jugador</th>{Object.values(stats).map(s=><th key={s}>{s}</th>)}</tr></thead><tbody>{report.data.data.players?.map((p,i)=><tr key={i}><td>{p.team==='home'?'Local':'Visitante'}</td><td>#{p.jersey} {p.name}</td>{Object.keys(stats).map(s=><td key={s}>{p[s as keyof typeof stats]}</td>)}</tr>)}</tbody></table></div><Alert>Captura recibida para revisión. Guarda el marcador oficial abajo; las estadísticas por nombre quedan en esta acta hasta vincular jugadores registrados.</Alert></div> : <p className="text-sm">Todavía no se ha recibido una captura.</p>}
 </Card>;
}
function Form({report, id, token}:{report:Report;id:string;token:string}) {
 const [data,setData] = useState<Data>({author:'',notes:'',homeScore:0,awayScore:0,players:[],...report.data});
 const [revision,setRevision] = useState(report.revision);
 const save = useMutation({mutationFn:()=>temporaryApi(token).put<{revision:number}>(`/public/game-reports/${id}`,{data,revision}),onSuccess:r=>setRevision(r.revision)});
 const change = (patch:Partial<Data>)=>{setData(d=>({...d,...patch}));save.reset();};
 return <form className="space-y-4" onSubmit={e=>{e.preventDefault();save.mutate();}}>
 <Alert>Captura temporal por nombre y dorsal. Administración revisará el acta antes de publicar el resultado.</Alert>
 <fieldset disabled={save.isPending} className="space-y-4">
 <Field label="Nombre de quien llena el acta"><input required maxLength={150} className="input input-bordered w-full" value={data.author} onChange={e=>change({author:e.target.value})}/></Field>
 <div className="grid grid-cols-2 gap-3">{(['home','away'] as const).map(side=><Field key={side} label={side==='home'?report.game!.home_team_name:report.game!.away_team_name}><input required type="number" min={0} max={999} step={1} className="input input-bordered w-full" value={data[`${side}Score`]} onChange={e=>change({[`${side}Score`]:e.target.value===''?NaN:Number(e.target.value)})}/></Field>)}</div>
 <h2 className="text-lg font-bold">Estadísticas por jugador</h2>
 {data.players.map((p,i)=><Card key={i} className="space-y-3 p-3"><div className="grid gap-3 sm:grid-cols-3"><Field label="Equipo"><select className="select select-bordered w-full" value={p.team} onChange={e=>change({players:data.players.map((v,j)=>j===i?{...v,team:e.target.value}:v)})}><option value="home">{report.game!.home_team_name}</option><option value="away">{report.game!.away_team_name}</option></select></Field>{(['name','jersey'] as const).map(k=><Field key={k} label={k==='name'?'Nombre del jugador':'Dorsal (opcional)'}><input required={k==='name'} maxLength={k==='name'?150:10} className="input input-bordered w-full" value={p[k]} onChange={e=>change({players:data.players.map((v,j)=>j===i?{...v,[k]:e.target.value}:v)})}/></Field>)}</div><div className="grid grid-cols-2 gap-3 sm:grid-cols-5">{Object.entries(stats).map(([k,label])=><Field key={k} label={label}><input required type="number" min={0} max={999} step={1} className="input input-bordered w-full" value={p[k as keyof typeof stats]} onChange={e=>change({players:data.players.map((v,j)=>j===i?{...v,[k]:e.target.value===''?NaN:Number(e.target.value)}:v)})}/></Field>)}</div><Button type="button" size="sm" tone="ghost" onClick={()=>change({players:data.players.filter((_,j)=>j!==i)})}>Quitar jugador</Button></Card>)}
 <Button type="button" disabled={data.players.length>=200} onClick={()=>change({players:[...data.players,{team:'home',name:'',jersey:'',td:0,passes:0,receptions:0,interceptions:0,sacks:0}]})}>Añadir jugador</Button>
 <Field label="Acta: incidencias y observaciones"><textarea maxLength={10000} className="textarea textarea-bordered min-h-40 w-full" value={data.notes} onChange={e=>change({notes:e.target.value})}/></Field>
 {save.error && <Alert tone="error">{save.error.message}</Alert>}{save.isSuccess && <Alert tone="success">Acta y estadísticas guardadas. Administración ya puede revisarlas.</Alert>}
 <Button type="submit" loading={save.isPending}>Guardar acta y estadísticas</Button>
 </fieldset></form>;
}
export default function SharedGameReport() {
 const {id} = useParams();
 const [token] = useState(()=>location.hash.slice(1));
 const report = useQuery({queryKey:['shared-report',id,token],queryFn:()=>temporaryApi(token).get<Report>(`/public/game-reports/${id}`),enabled:!!id&&!!token,retry:false,refetchOnWindowFocus:false});
 return <main className="mx-auto min-h-screen max-w-3xl space-y-5 p-4"><h1 className="text-2xl font-bold">Estadísticas y acta del partido</h1>{!token?<Alert tone="error">El enlace está incompleto. Solicita el enlace completo a administración.</Alert>:report.isLoading?<Spinner/>:report.error?<Alert tone="error">{report.error.message}</Alert>:report.data&&<><p className="font-semibold">{report.data.game?.home_team_name} vs {report.data.game?.away_team_name}</p><Form report={report.data} id={id!} token={token}/></>}</main>;
}

