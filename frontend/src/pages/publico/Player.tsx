import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { Alert, Card, Spinner } from '../../components/ui';
import { PlayerAvatar } from '../../components/AuthImage';
import { competition } from '../../lib/competition';

export default function PublicPlayer() {
  const { id } = useParams<{ id: string }>();
  const player = useQuery({ queryKey: ['public-player', id], queryFn: () => api.get<any>(`/public/players/${id}`), enabled: Boolean(id) });
  const stats = useQuery({ queryKey: ['public-player-stats', id, player.data?.season_id], queryFn: () => competition.publicPlayerStats(player.data.season_id, id!), enabled: Boolean(player.data?.season_id) });
  if (player.isLoading || stats.isLoading) return <Spinner />;
  if (player.error || stats.error || !player.data) return <Alert tone="error">Jugador no encontrado.</Alert>;
  const p = player.data; const s = stats.data?.[0];
  const values: [string, number | undefined][] = [['Partidos', s?.games_played], ['Touchdowns', s?.touchdowns], ['Yardas', s?.yards], ['Recepciones', s?.receptions], ['Intercepciones', s?.interceptions], ['Quite de flags', s?.flag_pulls], ['Pases defendidos', s?.passes_defended], ['MVP', (s?.offensive_mvps ?? 0) + (s?.defensive_mvps ?? 0)]];
  return <main className="mx-auto max-w-2xl space-y-4 p-4"><Card className="p-5"><div className="flex items-center gap-4"><PlayerAvatar avatarUrl={p.avatar_url} name={p.full_name} jersey={p.jersey_number} size="lg" /><div><h1 className="text-2xl font-black">{p.full_name}</h1><p className="text-sm text-base-content/60">{p.team_name} · {p.category_name}</p></div></div></Card><Card className="p-5"><h2 className="mb-3 font-semibold">Estadísticas de {p.season_name}</h2><dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">{values.map(([label, value]) => <div key={label} className="rounded-box bg-base-200 p-3"><dt className="text-xs text-base-content/60">{label}</dt><dd className="text-xl font-black tabular">{value ?? 0}</dd></div>)}</dl></Card><p className="text-center text-xs text-base-content/50">Perfil público · Estadísticas de partidos finalizados</p></main>;
}
