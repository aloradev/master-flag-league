import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { api } from '../../lib/api';
import { Alert, Card, EmptyState, Spinner } from '../../components/ui';
import { IconFootball } from '../../components/icons';
import { TeamCrest } from '../../components/AuthImage';
import { Marco } from './Marco';
import { fechaTexto } from '../../lib/format';

type PublicGame = {
  game_type?: 'OFFICIAL' | 'SCRIMMAGE';
  id: string; status: string; home_score: number; away_score: number;
  scheduled_time: string; scheduled_date: string; field_name: string | null;
  category_name: string; home_team_id: string; away_team_id: string;
  home_team_name: string; home_short_name: string | null; home_logo_url: string | null; home_color: string | null;
  away_team_name: string; away_short_name: string | null; away_logo_url: string | null; away_color: string | null;
  touchdowns: Array<{ team_id: string; quarter: number | null; created_at: string }>;
};

const etiqueta: Record<string, string> = { SCHEDULED: 'Programado', LIVE: 'En vivo', FINISHED: 'Finalizado', WALKOVER: 'Incomparecencia' };

export default function PartidoPublico() {
  const { id = '' } = useParams();
  const consulta = useQuery({ queryKey: ['public-game', id], queryFn: () => api.get<PublicGame>(`/public/games/${id}`), retry: false, refetchInterval: 10000 });
  if (consulta.isLoading) return <Marco titulo="Partido"><Spinner /></Marco>;
  if (!consulta.data) return <Marco titulo="Partido"><EmptyState icon={<IconFootball size={40} />} title="No se pudo cargar el partido" description={consulta.error?.message ?? 'El partido no está disponible.'} action={<button className="btn min-h-11" onClick={() => void consulta.refetch()}>Reintentar</button>} /></Marco>;
  const p = consulta.data;
  return <Marco titulo={`${p.home_team_name} vs ${p.away_team_name}`} subtitulo={`${fechaTexto(p.scheduled_date)} · ${p.scheduled_time} Cancún${p.field_name ? ` · ${p.field_name}` : ''}`}>
    {consulta.isError && <Alert tone="warning">Reconectando… Se muestra el último marcador recibido.</Alert>}
    <Card className="space-y-4 p-5">
      {p.game_type === 'SCRIMMAGE' && <Alert tone="info">Scrimmage de prueba. No cuenta para posiciones ni rankings oficiales.</Alert>}
      <div className="flex items-center justify-between text-sm text-base-content/60"><span>{p.category_name}</span><span className={`badge ${p.status === 'LIVE' ? 'badge-error' : 'badge-ghost'}`}>{etiqueta[p.status] ?? p.status}</span></div>
      <div className="flex items-center gap-3">
        <div className="flex min-w-0 flex-1 flex-col items-center gap-2 text-center"><TeamCrest name={p.home_team_name} shortName={p.home_short_name} logoUrl={p.home_logo_url} color={p.home_color ?? undefined} className="size-16" /><span className="font-semibold">{p.home_team_name}</span></div>
        <div className="text-3xl font-black tabular">{p.home_score} - {p.away_score}</div>
        <div className="flex min-w-0 flex-1 flex-col items-center gap-2 text-center"><TeamCrest name={p.away_team_name} shortName={p.away_short_name} logoUrl={p.away_logo_url} color={p.away_color ?? undefined} className="size-16" /><span className="font-semibold">{p.away_team_name}</span></div>
      </div>
      {p.touchdowns.length > 0 && <div className="border-t border-base-300 pt-3"><p className="mb-2 text-sm font-semibold">Touchdowns</p><div className="flex flex-wrap gap-2 text-xs">{p.touchdowns.map((t, i) => <span key={`${t.created_at}-${i}`} className="rounded-full bg-base-200 px-3 py-1">{t.team_id === p.home_team_id ? p.home_short_name || p.home_team_name : p.away_short_name || p.away_team_name}{t.quarter ? ` · Q${t.quarter}` : ''}</span>)}</div></div>}
      {p.status === 'LIVE' && <Alert tone="info">Marcador en vivo. Esta pantalla se actualiza automáticamente.</Alert>}
    </Card>
  </Marco>;
}
