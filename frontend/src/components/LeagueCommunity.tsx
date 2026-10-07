import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { StandingsGroup } from '../lib/competition';
import { TeamCrest } from './AuthImage';
import { Link } from 'react-router-dom';
export function LeagueCommunity() {
  const standings=useQuery({queryKey:['publico-tabla'],queryFn:()=>api.get<{season:{name:string};categories:StandingsGroup[]}>('/public/standings'),retry:false});
  const groups=standings.data?.categories.filter(group=>group.rows.length) ?? [];
  if (!groups.length) return null;
  return <section className="campaign-section" aria-labelledby="community"><p className="campaign-eyebrow">NUESTRA COMUNIDAD</p><h2 id="community">LOS EQUIPOS QUE<br /><em>HACEN LA LIGA.</em></h2><p className="campaign-community-summary mt-4 text-sm">{standings.data?.season.name} · Conoce a los equipos participantes.</p>
    <div className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{groups.flatMap(group=>group.rows.map(team=><Link key={team.team_id} to={`/equipos/${team.team_id}`} className="campaign-community-team flex items-center gap-3 rounded border border-slate-700 bg-slate-900 p-4 hover:border-cyan-300"><TeamCrest name={team.team_name} shortName={team.short_name} logoUrl={team.logo_url} className="size-12 shrink-0" /><span className="min-w-0"><span className="block break-words text-sm font-bold">{team.team_name}</span><span className="text-xs text-slate-400">{group.category.name}</span></span></Link>))}</div>
  </section>;
}
