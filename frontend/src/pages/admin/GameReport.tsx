import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { competition, ETIQUETA_PARTIDO, type GameDetail } from '../../lib/competition';
import { Alert, Button, Card, Field, Spinner } from '../../components/ui';
import HistoricalResult from './HistoricalResult';
import HistoricalStatistics from './HistoricalStatistics';
import { ReportAccess } from './SharedGameReport';

function Report({ game }: { game: GameDetail }) {
  const qc = useQueryClient();
  const [notes, setNotes] = useState(game.notes ?? '');
  const save = useMutation({
    mutationFn: () => competition.updateGame(game.id, { notes }),
    onSuccess: async () => {
      await Promise.all(['game', 'round', 'games', 'public-game'].map(key => qc.invalidateQueries({ queryKey: [key] })));
    },
  });
  return <Card className="space-y-4 p-4">
    <h2 className="text-lg font-bold">Acta del partido</h2>
    <p className="text-sm text-base-content/70">Registra incidencias, sanciones, acuerdos y observaciones del arbitraje. Se guardan junto al partido.</p>
    <form className="space-y-3" onSubmit={event => { event.preventDefault(); save.mutate(); }}>
      <Field label="Observaciones del acta" hint={`${notes.length}/10000 caracteres`}>
        <textarea className="textarea textarea-bordered min-h-48 w-full" maxLength={10000} value={notes} disabled={save.isPending} onChange={event => { setNotes(event.target.value); save.reset(); }} placeholder="Árbitros presentes, incidencias, sanciones y acuerdos…" />
      </Field>
      {save.error && <Alert tone="error">{save.error.message}</Alert>}
      {save.isSuccess && <Alert tone="success">Acta guardada.</Alert>}
      <Button type="submit" loading={save.isPending} disabled={notes === (game.notes ?? '')}>Guardar acta</Button>
    </form>
  </Card>;
}

export default function GameReport() {
  const { id } = useParams<{ id: string }>();
  const game = useQuery({ queryKey: ['game', id], queryFn: () => competition.game(id!), enabled: Boolean(id) });
  if (game.isLoading) return <Spinner />;
  if (game.error) return <Alert tone="error">{game.error.message}<button className="link ml-2" onClick={() => void game.refetch()}>Reintentar</button></Alert>;
  if (!game.data) return <Alert>Partido no encontrado.</Alert>;
  const g = game.data;
  return <main className="mx-auto max-w-4xl space-y-5">
    <Link className="link text-sm" to={`/admin/jornadas?roundId=${encodeURIComponent(g.round_id)}#game-${g.id}`}>← Volver a la jornada</Link>
    <header className="space-y-2">
      <span className="badge badge-outline">Captura temporal</span>
      <h1 className="text-2xl font-bold">Estadísticas y acta</h1>
      <p className="text-sm text-base-content/70">Jornada {g.round_number} · {g.category_name} · {g.scheduled_date.slice(0, 10)} · {g.scheduled_time?.slice(0, 5)} · {g.field_name || 'Campo por asignar'}</p>
    </header>
    <ReportAccess gameId={g.id} />
    <Card className="space-y-3 p-4">
      <p className="text-sm">{ETIQUETA_PARTIDO[g.status].texto}</p>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <strong className="break-words">{g.home_team_name}</strong>
        <span className="text-2xl font-black tabular-nums">{['FINISHED', 'LIVE', 'WALKOVER'].includes(g.status) ? `${g.home_score} – ${g.away_score}` : 'vs'}</span>
        <strong className="break-words text-right">{g.away_team_name}</strong>
      </div>
      <HistoricalResult key={g.id} game={g} roundStatus={g.round_status} showStatistics={false} />
    </Card>
    <Card className="space-y-3 p-4">
      <h2 className="text-lg font-bold">Estadísticas individuales</h2>
      {g.status === 'FINISHED' && g.score_source === 'MANUAL'
        ? <HistoricalStatistics gameId={g.id} initiallyOpen />
        : <Alert>{g.status === 'LIVE' || (g.status === 'FINISHED' && g.score_source !== 'MANUAL')
          ? <>Las estadísticas de este partido se gestionan desde el <Link className="link" to={`/arbitro/partido/${g.id}`}>modo árbitro</Link>.</>
          : 'Guarda primero el marcador final para capturar las estadísticas del acta.'}</Alert>}
    </Card>
    <Report key={g.id} game={g} />
  </main>;
}
