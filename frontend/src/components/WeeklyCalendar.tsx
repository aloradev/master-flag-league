import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { type Game, fechaLarga, hora12, ETIQUETA_PARTIDO } from '../lib/competition';
import { Alert, Card, Spinner } from './ui';
import { CalendarActions } from './CalendarActions';
const shift = (day: string, amount: number) => { const date = new Date(day+'T12:00:00Z'); date.setUTCDate(date.getUTCDate()+amount); return date.toISOString().slice(0,10); };
const monday = (day: string) => shift(day,-((new Date(day+'T12:00:00Z').getUTCDay()+6)%7));
export function WeeklyCalendar({ seasonId, teamId }: { seasonId: string; teamId: string }) {
  const today = new Intl.DateTimeFormat('en-CA',{timeZone:'America/Cancun'}).format(new Date());
  const [week,setWeek] = useState(monday(today));
  const [category,setCategory] = useState('');
  const games = useQuery({queryKey:['weekly-games',seasonId],queryFn:()=>api.get<Game[]>(`/games?seasonId=${encodeURIComponent(seasonId)}`),refetchInterval:30000});
  const categories = [...new Map((games.data??[]).map(game=>[game.category_id,game.category_name])).entries()];
  const filtered = (games.data??[]).filter(game=>(!teamId || [game.home_team_id,game.away_team_id].includes(teamId)) && (!category || game.category_id===category));
  const days = Array.from({length:7},(_,i)=>shift(week,i));
  const next = filtered.filter(game=>['SCHEDULED','LIVE'].includes(game.status) && game.scheduled_date.slice(0,10)>=today).sort((a,b)=>a.scheduled_date.localeCompare(b.scheduled_date))[0];
  return <section className="space-y-4" aria-label="Calendario semanal">
    <div className="flex flex-wrap items-end gap-3"><label className="text-sm">Categoría<select value={category} onChange={event=>setCategory(event.target.value)} className="select block"><option value="">Todas</option>{categories.map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></label>
      <button className="btn btn-outline" onClick={()=>setWeek(monday(today))}>Esta semana</button>
      {next && <button className="btn btn-ghost" onClick={()=>setWeek(monday(next.scheduled_date.slice(0,10)))}>Próximo partido</button>}
    </div>
    <div className="flex items-center justify-between gap-2"><button aria-label="Semana anterior" className="btn btn-square" onClick={()=>setWeek(shift(week,-7))}>←</button><h2 className="text-center text-sm font-bold" aria-live="polite">{fechaLarga(week)} — {fechaLarga(days[6])}</h2><button aria-label="Semana siguiente" className="btn btn-square" onClick={()=>setWeek(shift(week,7))}>→</button></div>
    {games.isLoading && <Spinner />}
    {games.error && <Alert tone="error">No se pudo actualizar el calendario. <button className="link" onClick={()=>void games.refetch()}>Reintentar</button></Alert>}
    {games.data && <div className="grid gap-3 lg:grid-cols-2">{days.map(day=>{
      const matches = filtered.filter(game=>game.scheduled_date.slice(0,10)===day).sort((a,b)=>a.scheduled_time.localeCompare(b.scheduled_time));
      return <Card key={day} className={`space-y-3 p-4 ${day===today?'border-primary':''}`}><h3 className="font-bold">{day===today?'Hoy · ':''}{fechaLarga(day)}</h3>
        {!matches.length && <p className="text-sm text-base-content/50">Sin partidos para estos filtros.</p>}
        {matches.map(game=><article key={game.id} className="space-y-2 border-t border-base-300 pt-3"><p className="text-xs text-primary">{game.category_name} · {ETIQUETA_PARTIDO[game.status].texto}</p><p className="font-semibold">{game.home_team_name} vs {game.away_team_name}</p><p className="text-sm">{hora12(game.scheduled_time)} · {game.field_name??'Sede por confirmar'}</p>
          {['FINISHED','WALKOVER','LIVE'].includes(game.status) && <p className="text-xl font-black">{game.home_score} – {game.away_score}</p>}
          <CalendarActions game={game} />{game.round_status!=='DRAFT' && <Link className="link text-sm" to={`/partido/${game.id}`}>Ver partido y compartir</Link>}
        </article>)}
      </Card>;
    })}</div>}
  </section>;
}
