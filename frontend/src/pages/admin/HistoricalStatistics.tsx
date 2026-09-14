import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { competition, nombreCompleto, type GameDetail } from '../../lib/competition';
import { Alert, Button, Field, Spinner } from '../../components/ui';

function Editor({ game }: { game: GameDetail }) {
  const qc = useQueryClient();
  const [team, setTeam] = useState(game.home_team_id);
  const [eventType, setEventType] = useState('TOUCHDOWN');
  const [player, setPlayer] = useState('');
  const [quarter, setQuarter] = useState('');
  const [yards, setYards] = useState('');
  const [reason, setReason] = useState('');
  const [offensive, setOffensive] = useState(game.mvp_offensive_player_id ?? '');
  const [defensive, setDefensive] = useState(game.mvp_defensive_player_id ?? '');
  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post(`/admin/games/${game.id}/historical-statistics`, { ...body, reason }),
    onSuccess: async () => {
      await Promise.all(['game','round','rounds','statistics','player-stats','public-player-stats','rankings','public-game','publico-jornada'].map(key => qc.invalidateQueries({ queryKey: [key] })));
    },
  });
  const pending = game.statistics_status === 'PENDING';
  const roster = team === game.home_team_id ? game.rosters.home : game.rosters.away;
  const players = [...game.rosters.home, ...game.rosters.away];
  const play = game.plays[eventType];
  const withYards = ['PASS_COMPLETE','RECEPTION','RUSH'].includes(eventType);
  const active = game.events.filter(e => !e.voided_at);
  const sum = (id: string) => active.filter(e => e.team_id === id).reduce((total,e) => total + e.points, 0);
  const matched = sum(game.home_team_id) === game.home_score && sum(game.away_team_id) === game.away_score;
  const name = (id: string) => id === game.home_team_id ? game.home_team_name : game.away_team_name;
  return <div className="space-y-3">
    <p className="text-sm">Marcador oficial: <strong>{game.home_score} – {game.away_score}</strong>. Las jugadas de esta captura no cambian ese resultado.</p>
    <Alert tone={pending ? 'warning' : 'success'}>{pending ? 'Estadísticas pendientes: se publicarán en rankings cuando completes la captura.' : 'Estadísticas completas. Reabre la captura para corregirlas.'}</Alert>
    {save.error && <Alert tone="error">{save.error.message}</Alert>}
    {save.isSuccess && <Alert tone="success">Cambio guardado y registrado en auditoría.</Alert>}
    <fieldset disabled={save.isPending} className="space-y-3">
      <Field label="Fuente o motivo del cambio" hint="Se registra en cada jugada, anulación y cambio de estado."><textarea maxLength={1000} className="textarea textarea-bordered w-full" value={reason} onChange={e => setReason(e.target.value)} /></Field>
      {!pending ? <Button size="sm" disabled={!reason.trim()} onClick={() => save.mutate({ action: 'REOPEN' })}>Reabrir estadísticas para corregir</Button> : <>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Equipo"><select className="select select-bordered w-full" value={team} onChange={e => { setTeam(e.target.value); setPlayer(''); }}>
            {[game.home_team_id,game.away_team_id].map(id => <option key={id} value={id}>{name(id)}</option>)}
          </select></Field>
          <Field label="Jugada"><select className="select select-bordered w-full" value={eventType} onChange={e => { setEventType(e.target.value); setYards(''); }}>
            {Object.entries(game.plays).map(([id,p]) => <option key={id} value={id}>{p.label}</option>)}
          </select></Field>
          <Field label={play.needsPlayer ? 'Jugador (obligatorio)' : 'Jugador (opcional)'}><select className="select select-bordered w-full" value={player} onChange={e => setPlayer(e.target.value)}>
            <option value="">Selecciona jugador</option>{roster.map(p => <option key={p.id} value={p.id}>{nombreCompleto(p)}{p.jersey_number != null ? ` · #${p.jersey_number}` : ''}</option>)}
          </select></Field>
          <Field label="Periodo (opcional)"><select className="select select-bordered w-full" value={quarter} onChange={e => setQuarter(e.target.value)}>
            <option value="">Sin especificar</option>{Array.from({ length: game.rules.periods }, (_,i) => <option key={i+1} value={i+1}>{i+1}</option>)}
          </select></Field>
          {withYards && <Field label="Yardas (opcional)"><input type="number" min={-100} max={100} step={1} className="input input-bordered w-full" value={yards} onChange={e => setYards(e.target.value)} /></Field>}
        </div>
        {!roster.length && <Alert>Este equipo todavía no tiene jugadores registrados. Dales de alta para capturar sus estadísticas individuales.</Alert>}
        <Button size="sm" disabled={!reason.trim() || (play.needsPlayer && !player) || (yards !== '' && (!Number.isInteger(Number(yards)) || Number(yards) < -100 || Number(yards) > 100))} loading={save.isPending} onClick={() => save.mutate({ action: 'ADD', eventType, teamId: team, playerId: player || null, quarter: quarter ? Number(quarter) : null, yards: withYards && yards !== '' ? Number(yards) : null })}>Guardar jugada</Button>
      </>}
      <p className="text-sm">Puntos transcritos: {sum(game.home_team_id)} – {sum(game.away_team_id)} · Marcador oficial: {game.home_score} – {game.away_score}</p>
      <h4 className="font-semibold">Jugadas capturadas</h4>
      {!game.events.length && <p className="text-sm">Todavía no hay jugadas.</p>}
      <ul className="max-h-80 space-y-2 overflow-y-auto">
        {game.events.map(e => <li key={e.id} className="rounded border border-base-300 p-2 text-sm">
          <p className={e.voided_at ? 'line-through opacity-60' : ''}>{e.label} · {name(e.team_id)}{e.player_name ? ` · ${e.player_name}` : ''}{e.yards != null ? ` · ${e.yards} yardas` : ''}{e.quarter != null ? ` · periodo ${e.quarter}` : ''}</p>
          <p className="text-xs text-base-content/60">{e.recorded_by_name || 'Administración'}{e.voided_at ? ' · Anulada' : ''}</p>
          {pending && !e.voided_at && <Button size="xs" tone="ghost" disabled={!reason.trim()} onClick={() => save.mutate({ action: 'VOID', eventId: e.id })}>Anular jugada</Button>}
        </li>)}
      </ul>
      {pending && <>
        {!matched && <Alert tone="warning">Completa o corrige las anotaciones hasta que coincidan con el marcador oficial.</Alert>}
        <div className="grid gap-3 sm:grid-cols-2">
          {(['ofensivo','defensivo'] as const).map(side => <Field key={side} label={`MVP ${side} (opcional)`}><select className="select select-bordered w-full" value={side === 'ofensivo' ? offensive : defensive} onChange={e => (side === 'ofensivo' ? setOffensive : setDefensive)(e.target.value)}>
            <option value="">Sin asignar</option>{players.map(p => <option key={p.id} value={p.id}>{nombreCompleto(p)}</option>)}
          </select></Field>)}
        </div>
        <p className="text-xs">Revisa también yardas, recepciones y estadísticas defensivas antes de completar. Para corregir después podrás reabrir la captura.</p>
        <Button size="sm" tone="success" disabled={!reason.trim() || !matched} onClick={() => save.mutate({ action: 'COMPLETE', mvpOffensivePlayerId: offensive || null, mvpDefensivePlayerId: defensive || null })}>Marcar estadísticas completas</Button>
      </>}
    </fieldset>
  </div>;
}

export default function HistoricalStatistics({ gameId }: { gameId: string }) {
  const [open, setOpen] = useState(false);
  const game = useQuery({ queryKey: ['game',gameId], queryFn: () => competition.game(gameId), enabled: open });
  return <section className="space-y-3 border-t border-base-300 pt-3">
    <Button size="sm" onClick={() => setOpen(!open)}>{open ? 'Ocultar estadísticas' : 'Capturar o revisar estadísticas'}</Button>
    {open && (game.isLoading ? <Spinner /> : game.error ? <Alert tone="error">{game.error.message}<button className="link ml-2" onClick={() => void game.refetch()}>Reintentar</button></Alert> : game.data && <>
      <Button size="xs" disabled={game.isFetching} onClick={() => void game.refetch()}>Actualizar jugadores y jugadas</Button>
      <Editor key={gameId} game={game.data} />
    </>)}
  </section>;
}
