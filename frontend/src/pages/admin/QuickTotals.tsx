import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { nombreCompleto, type GameDetail } from '../../lib/competition';
import { Alert, Button, Field } from '../../components/ui';

type Row = { key: string; teamId: string; playerId: string; eventType: string; count: string; totalYards: string };
type Payload = { action: string; version: number; batchId: string; reason: string; expectedEventIds: string[]; rows: { teamId: string; playerId: string | null; eventType: string; count: number; totalYards: number | null }[] };
export default function QuickTotals({ game, disabled, onBusyChange }: { game: GameDetail; disabled: boolean; onBusyChange: (busy: boolean) => void }) {
  const qc = useQueryClient();
  const [rows, setRows] = useState<Row[]>([]);
  const [reason, setReason] = useState('');
  const [review, setReview] = useState<{ payload: Payload; summary: string[]; score: string } | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const active = game.events.filter(e => !e.voided_at);
  const teamName = (id: string) => id === game.home_team_id ? game.home_team_name : game.away_team_name;
  const roster = (id: string) => id === game.home_team_id ? game.rosters.home : game.rosters.away;
  const existing = (r: Row) => active.filter(e => e.team_id === r.teamId && (e.player_id || '') === r.playerId && e.event_type === r.eventType);
  const update = (key: string, patch: Partial<Row>, identity = false) => setRows(all => all.map(old => {
    if (old.key !== key) return old;
    const next = { ...old, ...patch };
    if (identity) {
      const events = existing(next);
      next.count = String(events.reduce((n, e) => n + (e.quantity ?? 1), 0));
      next.totalYards = events.some(e => e.yards != null) ? String(events.reduce((n, e) => n + (e.yards ?? 0), 0)) : '';
    }
    return next;
  }));
  function preview() {
    setError(''); setSuccess('');
    try {
      if (!reason.trim() || !rows.length) throw new Error('Agrega filas e indica la fuente del acta.');
      const seen = new Set<string>();
      const points = new Map([game.home_team_id, game.away_team_id].map(id => [id, active.filter(e => e.team_id === id).reduce((n, e) => n + e.points, 0)]));
      const summary: string[] = [];
      const totals = rows.map(r => {
        const play = game.plays[r.eventType];
        const count = Number(r.count);
        const totalYards = r.totalYards === '' ? null : Number(r.totalYards);
        const key = JSON.stringify([r.teamId, r.playerId, r.eventType]);
        if (seen.has(key)) throw new Error('Hay filas repetidas para el mismo jugador y estadística.');
        seen.add(key);
        if (!r.count.trim() || !Number.isInteger(count) || count < 0 || count > 100) throw new Error('Cada total debe ser un entero entre 0 y 100.');
        if (play.needsPlayer && !r.playerId) throw new Error('Selecciona el jugador de cada estadística.');
        if (totalYards !== null && (!Number.isInteger(totalYards) || Math.abs(totalYards) > 100 * count)) throw new Error('Revisa las yardas acumuladas: hasta 100 por acción.');
        const old = existing(r);
        points.set(r.teamId, points.get(r.teamId)! - old.reduce((n, e) => n + e.points, 0) + play.points * count);
        const p = roster(r.teamId).find(p => p.id === r.playerId);
        summary.push(`${teamName(r.teamId)} · ${p ? nombreCompleto(p) : 'Equipo'} · ${play.label}: ${old.reduce((n, e) => n + (e.quantity ?? 1), 0)} → ${count}${['PASS_COMPLETE', 'RECEPTION', 'RUSH'].includes(r.eventType) ? ` · yardas: ${old.some(e => e.yards != null) ? old.reduce((n, e) => n + (e.yards ?? 0), 0) : 'sin registrar'} → ${totalYards ?? 'sin registrar'}` : ''}`);
        return { teamId: r.teamId, playerId: r.playerId || null, eventType: r.eventType, count, totalYards };
      });
      if (points.get(game.home_team_id)! > game.home_score || points.get(game.away_team_id)! > game.away_score) throw new Error('Los puntos, incluyendo lo ya capturado, superan el marcador oficial.');
      setReview({ payload: { action: 'BULK', version: 2, batchId: crypto.randomUUID(), reason: reason.trim(), rows: totals, expectedEventIds: active.map(e => e.id) }, summary, score: `${points.get(game.home_team_id)} – ${points.get(game.away_team_id)}` });
    } catch (e) { setError((e as Error).message); }
  }
  async function save() {
    if (!review || lock.current) return;
    lock.current = true; setBusy(true); onBusyChange(true); setError('');
    try {
      await api.post(`/admin/games/${game.id}/historical-statistics`, review.payload);
      setRows([]); setReview(null); setSuccess('Totales guardados. Puedes continuar con otros jugadores o completar las estadísticas.');
      await Promise.all(['game', 'round', 'rounds', 'statistics', 'player-stats', 'public-player-stats', 'rankings', 'public-game', 'publico-jornada', 'admin-pending'].map(key => qc.invalidateQueries({ queryKey: [key] })));
    } catch (e) { setError((e as Error).message); }
    finally { lock.current = false; setBusy(false); onBusyChange(false); }
  }
  return <details className="rounded border border-base-300 p-3">
    <summary className="cursor-pointer font-semibold">Captura rápida desde el acta</summary>
    <p className="my-2 text-sm">Escribe el total final por jugador. Sustituye lo capturado para estas filas; las demás estadísticas se conservan. Usa cero para retirar un total.</p>
    {error && <Alert tone="error">{error}</Alert>}
    {success && <Alert tone="success">{success}</Alert>}
    <fieldset disabled={disabled || busy || !!review} className="space-y-3">
      {rows.map((r, i) => <div key={r.key} className="grid gap-2 rounded border border-base-300 p-3 sm:grid-cols-2">
        <Field label={`Equipo · fila ${i + 1}`}><select className="select select-bordered w-full" value={r.teamId} onChange={e => update(r.key, { teamId: e.target.value, playerId: '' }, true)}>{[game.home_team_id, game.away_team_id].map(id => <option key={id} value={id}>{teamName(id)}</option>)}</select></Field>
        <Field label="Jugador"><select className="select select-bordered w-full" value={r.playerId} onChange={e => update(r.key, { playerId: e.target.value }, true)}><option value="">{game.plays[r.eventType].needsPlayer ? 'Selecciona jugador' : 'Sin jugador'}</option>{roster(r.teamId).map(p => <option key={p.id} value={p.id}>{nombreCompleto(p)}{p.jersey_number != null ? ` · #${p.jersey_number}` : ''}</option>)}</select></Field>
        <Field label="Estadística"><select className="select select-bordered w-full" value={r.eventType} onChange={e => update(r.key, { eventType: e.target.value }, true)}>{Object.entries(game.plays).map(([id, p]) => <option key={id} value={id}>{p.label}</option>)}</select></Field>
        <Field label="Total del acta"><input className="input input-bordered w-full" type="number" min={0} max={100} step={1} value={r.count} onChange={e => update(r.key, { count: e.target.value })} /></Field>
        {['PASS_COMPLETE', 'RECEPTION', 'RUSH'].includes(r.eventType) && <Field label="Yardas totales (opcional)" hint="Ejemplo: 3 recepciones y 42 yardas acumuladas."><input className="input input-bordered w-full" type="number" step={1} value={r.totalYards} onChange={e => update(r.key, { totalYards: e.target.value })} /></Field>}
        <Button size="sm" tone="ghost" onClick={() => setRows(all => all.filter(row => row.key !== r.key))}>Quitar fila {i + 1}</Button>
      </div>)}
      <Button size="sm" disabled={rows.length >= 200} onClick={() => setRows(all => [...all, { key: crypto.randomUUID(), teamId: game.home_team_id, playerId: '', eventType: 'TOUCHDOWN', count: '', totalYards: '' }])}>Agregar estadística</Button>
      <Field label="Fuente o motivo de estos totales"><textarea className="textarea textarea-bordered w-full" maxLength={1000} value={reason} onChange={e => setReason(e.target.value)} /></Field>
      <Button size="sm" disabled={!rows.length || !reason.trim()} onClick={preview}>Revisar totales</Button>
    </fieldset>
    {review && <div className="mt-3 space-y-3">
      <h4 className="font-semibold">Revisa los cambios antes de guardar</h4>
      <ul className="space-y-2 text-sm">{review.summary.map((s, i) => <li key={i}>{s}</li>)}</ul>
      <p>Puntos al guardar: {review.score} · Marcador oficial: {game.home_score} – {game.away_score}</p>
      <Button size="sm" disabled={disabled} loading={busy} onClick={() => void save()}>{error ? 'Reintentar guardado' : 'Confirmar totales'}</Button>
      <Button size="sm" tone="ghost" disabled={busy || disabled} onClick={() => { setReview(null); setError(''); }}>Volver a editar</Button>
    </div>}
  </details>;
}
