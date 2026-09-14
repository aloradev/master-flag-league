import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import type { Game, RoundStatus } from '../../lib/competition';
import { Alert, Button, Field } from '../../components/ui';
import HistoricalStatistics from './HistoricalStatistics';

export default function HistoricalResult({ game, roundStatus }: { game: Game; roundStatus: RoundStatus }) {
  const qc = useQueryClient();
  const historical = game.score_source === 'MANUAL';
  const [open, setOpen] = useState(false);
  const [home, setHome] = useState(historical ? String(game.home_score) : '');
  const [away, setAway] = useState(historical ? String(game.away_score) : '');
  const [reason, setReason] = useState('');
  const save = useMutation({
    mutationFn: () => api.put(`/admin/games/${game.id}/historical-result`, {
      homeScore: Number(home), awayScore: Number(away), reason,
    }),
    onSuccess: () => {
      setOpen(false); setReason('');
      for (const key of ['round', 'rounds', 'games', 'game', 'standings', 'public-game', 'public-round', 'publico-jornada', 'my-games', 'player-stats', 'public-player-stats']) {
        void qc.invalidateQueries({ queryKey: [key] });
      }
    },
  });
  const valid = [home, away].every(v => v.trim() !== '' && Number.isInteger(Number(v)) && Number(v) >= 0 && Number(v) <= 999);
  const available = ['PUBLISHED', 'IN_PROGRESS', 'FINISHED'].includes(roundStatus)
    && (game.status === 'SCHEDULED' || (game.status === 'FINISHED' && historical));
  return <section className="space-y-3 border-t border-base-300 pt-3">
    {historical && <p className="font-semibold">Resultado registrado: {game.home_score} – {game.away_score}</p>}
    {game.statistics_status === 'PENDING' && <Alert tone="warning">Estadísticas pendientes. El resultado ya cuenta para posiciones.</Alert>}
    {save.isSuccess && <Alert tone="success">Resultado guardado.</Alert>}
    {roundStatus === 'DRAFT' && <p className="text-xs">Para registrar un partido ya jugado, publica primero esta jornada con su fecha real.</p>}
    {available && !open && <Button size="sm" onClick={() => { setHome(historical ? String(game.home_score) : ''); setAway(historical ? String(game.away_score) : ''); save.reset(); setOpen(true); }}>
      {historical ? 'Corregir resultado histórico' : 'Capturar resultado de partido ya jugado'}
    </Button>}
    {available && open && <fieldset disabled={save.isPending} className="space-y-3">
      <p className="text-sm">Transcribe el marcador del acta. El partido quedará finalizado con estadísticas pendientes; no necesitas registrar jugadores ni jugadas para guardar el resultado.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={`Puntos de ${game.home_team_name}`}><input type="number" min="0" max="999" step="1" className="input input-bordered w-full" value={home} onChange={e => setHome(e.target.value)} /></Field>
        <Field label={`Puntos de ${game.away_team_name}`}><input type="number" min="0" max="999" step="1" className="input input-bordered w-full" value={away} onChange={e => setAway(e.target.value)} /></Field>
      </div>
      <Field label={historical ? 'Motivo de la corrección' : 'Fuente del resultado'} hint="Queda registrado en el historial de auditoría.">
        <textarea className="textarea textarea-bordered w-full" maxLength={1000} value={reason} onChange={e => setReason(e.target.value)} placeholder="Ej. Acta de la jornada 1, revisada por administración" />
      </Field>
      {save.error && <Alert tone="error">{save.error.message}</Alert>}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" tone="success" loading={save.isPending} disabled={!valid || !reason.trim()} onClick={() => save.mutate()}>Guardar resultado histórico</Button>
        <Button size="sm" tone="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
      </div>
    </fieldset>}
    {historical && game.status === 'FINISHED' && available && <HistoricalStatistics gameId={game.id} />}
  </section>;
}
