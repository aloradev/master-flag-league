import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useLocation } from 'react-router-dom';
import { competition, ETIQUETA_PARTIDO, type Game, type Referee } from '../../lib/competition';
import type { Season } from '../../lib/types';
import { Alert, Button, Card, Field, Spinner } from '../../components/ui';
import HistoricalResult from './HistoricalResult';

function GameEditor({ game, season, referees, locked }: { game: Game; season: Season; referees: Referee[]; locked: boolean }) {
  const qc = useQueryClient();
  const [fieldId, setFieldId] = useState(game.field_id ?? '');
  const [time, setTime] = useState(game.scheduled_time.slice(0, 5));
  const [notes, setNotes] = useState(game.notes ?? '');
  const [principal, setPrincipal] = useState(game.referees?.find((r) => r.role === 'PRINCIPAL')?.referee_id ?? '');
  const [auxiliar, setAuxiliar] = useState(game.referees?.find((r) => r.role === 'AUXILIAR')?.referee_id ?? '');
  const refresh = () => {
    for (const key of ['round', 'rounds', 'games', 'game', 'my-games', 'referees']) void qc.invalidateQueries({ queryKey: [key] });
  };
  const save = useMutation({ mutationFn: () => competition.updateGame(game.id, { fieldId, scheduledTime: time, notes }), onSuccess: refresh });
  const assign = useMutation({ mutationFn: () => competition.assignReferees(game.id, [
    ...(principal ? [{ refereeId: principal, role: 'PRINCIPAL' }] : []),
    ...(auxiliar ? [{ refereeId: auxiliar, role: 'AUXILIAR' }] : []),
  ]), onSuccess: refresh });
  const disabled = locked || !['SCHEDULED', 'POSTPONED'].includes(game.status);
  return <Card className="space-y-3 p-3">
    <h3 className="font-bold">{game.home_team_name} vs {game.away_team_name}</h3>
    <p className="text-sm">{game.category_name} · {ETIQUETA_PARTIDO[game.status].texto}</p>
    {disabled ? <p className="text-sm">Este partido no admite cambios de programación ni árbitros.</p> : <>
      <fieldset disabled={save.isPending || assign.isPending} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Campo"><select className="select select-bordered w-full" value={fieldId} onChange={(e) => { setFieldId(e.target.value); save.reset(); }}><option value="" disabled>Selecciona campo</option>{season.fields.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select></Field>
          <Field label="Hora"><input type="time" className="input input-bordered w-full" value={time} onChange={(e) => { setTime(e.target.value); save.reset(); }} /></Field>
        </div>
        <Field label="Notas"><input className="input input-bordered w-full" value={notes} onChange={(e) => { setNotes(e.target.value); save.reset(); }} /></Field>
        {save.error && <Alert tone="error">{save.error.message}</Alert>}
        {save.isSuccess && <Alert tone="success">Programación guardada.</Alert>}
        <Button size="sm" disabled={!fieldId || !time} loading={save.isPending} onClick={() => save.mutate()}>Guardar programación</Button>
        <div className="grid gap-3 border-t border-base-300 pt-3 sm:grid-cols-2">
          {(['PRINCIPAL', 'AUXILIAR'] as const).map((role) => <Field key={role} label={role === 'PRINCIPAL' ? 'Árbitro principal' : 'Árbitro auxiliar'}><select className="select select-bordered w-full" value={role === 'PRINCIPAL' ? principal : auxiliar} onChange={(e) => { (role === 'PRINCIPAL' ? setPrincipal : setAuxiliar)(e.target.value); assign.reset(); }}>
            <option value="">Sin asignar</option>{referees.filter((r) => r.status === 'ACTIVE' || game.referees?.some((a) => a.referee_id === r.id)).map((r) => <option key={r.id} value={r.id}>{r.name}{!r.user_id ? ' (sin cuenta)' : ''}</option>)}
          </select></Field>)}
        </div>
        {principal && principal === auxiliar && <Alert tone="warning">Selecciona dos árbitros distintos.</Alert>}
        {assign.error && <Alert tone="error">{assign.error.message}</Alert>}
        {assign.isSuccess && <Alert tone="success">Asignación guardada.</Alert>}
        <Button size="sm" disabled={Boolean(principal && principal === auxiliar)} loading={assign.isPending} onClick={() => assign.mutate()}>Guardar árbitros</Button>
        <p className="text-xs">Seleccionar “Sin asignar” retira esa asignación al guardar. Guarda primero los cambios de horario.</p>
      </fieldset>
    </>}
  </Card>;
}

export default function RoundGames({ id, season }: { id: string; season: Season }) {
  const { hash } = useLocation();
  const round = useQuery({ queryKey: ['round', id], queryFn: () => competition.round(id) });
  const refs = useQuery({ queryKey: ['referees', season.id], queryFn: () => competition.referees(season.id) });
  const ready = !!round.data && !!refs.data;
  useEffect(() => {
    if (ready && hash.startsWith('#game-')) document.getElementById(hash.slice(1))?.scrollIntoView({block:'center'});
  }, [ready, hash]);
  if (round.isLoading || refs.isLoading) return <Spinner />;
  if (round.error || refs.error) return <Alert tone="error">{(round.error || refs.error)?.message}</Alert>;
  return <section className="mt-4 space-y-3">
    <Link className="link text-sm" to="/admin/arbitros">Gestionar árbitros de la temporada</Link>
    {!round.data?.games.length && <p>No hay partidos en esta jornada.</p>}
    {round.data?.games.map((g) => <div key={g.id} id={`game-${g.id}`} className="space-y-2">
      <GameEditor game={g} season={season} referees={refs.data ?? []} locked={['FINISHED', 'CANCELLED'].includes(round.data!.status)} />
      <Link className="btn btn-primary btn-sm" to={`/admin/partidos/${g.id}/acta`}>Estadísticas y acta</Link>
      <Card className="p-3"><HistoricalResult game={g} roundStatus={round.data!.status} /></Card>
    </div>)}
  </section>;
}
