import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { finance, pesos } from '../../lib/finance';
import { type Game, fechaLarga, hora12 } from '../../lib/competition';
import { Card, Alert, Spinner } from '../../components/ui';
import { CalendarActions } from '../../components/CalendarActions';

type Progress = { total: number; documented: number; eligible: number; pending: number;
  players: { id: string; name: string; status: string; is_eligible: boolean; reason: string | null; missing: string[] }[] };
const docs: Record<string, string> = { PHOTO: 'fotografía', ID_FRONT: 'identificación frente', ID_BACK: 'identificación reverso' };
export default function TeamOverview({ teamId, seasonId }: { teamId: string; seasonId: string }) {
  const progress = useQuery({ queryKey: ['registration-status', teamId], queryFn: () => api.get<Progress>(`/teams/${teamId}/registration-status`), refetchInterval: 30000 });
  const games = useQuery({ queryKey: ['team-next-games', teamId, seasonId], queryFn: () => api.get<Game[]>(`/games?teamId=${encodeURIComponent(teamId)}&seasonId=${encodeURIComponent(seasonId)}`), refetchInterval: 30000 });
  const statement = useQuery({ queryKey: ['fin-statement', teamId], queryFn: () => finance.statement(teamId), refetchInterval: 60000 });
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Cancun' }).format(new Date());
  const upcoming = games.data?.filter(g => g.status === 'LIVE' || (g.status === 'SCHEDULED' && g.scheduled_date.slice(0,10) >= today))
    .sort((a,b) => (a.status === 'LIVE' ? -1 : b.status === 'LIVE' ? 1 : (a.scheduled_date + a.scheduled_time).localeCompare(b.scheduled_date + b.scheduled_time)))[0];
  const p = progress.data;
  const next = p?.players.find(player => player.missing.length || ['CORRECTIONS_REQUIRED','REJECTED'].includes(player.status));
  const context = `?equipo=${encodeURIComponent(teamId)}`;
  const debt = statement.data?.summary?.balance_cents ?? 0;
  const steps = p ? [
    { label: 'Cuenta', done: true }, { label: 'Equipo', done: true },
    { label: 'Plantilla iniciada', done: p.total > 0 },
    { label: 'Documentos', done: p.total > 0 && p.documented === p.total },
    { label: 'Jugadores habilitados', done: p.total > 0 && p.eligible === p.total },
  ] : [];
  return <section className="space-y-4" aria-label="Tu siguiente paso">
    <Card className="space-y-4 p-5">
      <h2 className="text-lg font-bold">Tu siguiente paso</h2>
      {progress.isLoading && <Spinner label="Revisando tu avance…" />}
      {progress.error && <Alert tone="error">No pudimos consultar tu avance. <button className="link" onClick={() => void progress.refetch()}>Reintentar</button></Alert>}
      {p && <>
        <ol className="grid grid-cols-2 gap-2 sm:grid-cols-5">{steps.map(step => <li key={step.label} className={`rounded-field border p-3 text-xs ${step.done ? 'border-success/40 bg-success/10' : 'border-base-300'}`}><span className="block font-bold">{step.done ? '✓ Listo' : 'Pendiente'}</span>{step.label}</li>)}</ol>
        <p className="text-sm text-base-content/60">{p.documented} de {p.total} jugadores con documentos completos · {p.eligible} habilitados. El avance se guarda con cada registro y documento enviado.</p>
        {!p.total ? <Link className="btn btn-primary" to={`/equipo/jugadores/nuevo${context}`}>Agregar mi primer jugador</Link>
          : next ? <Link className="btn btn-primary h-auto py-3" to={`/equipo/jugadores/${next.id}${context}`}>Continuar con {next.name}</Link>
          : p.pending ? <Alert>Documentación enviada: {p.pending} jugador(es) esperan revisión de la liga.</Alert>
          : p.eligible === p.total ? <Alert tone="success">Todos los jugadores actuales están habilitados. Consulta tus pagos y las indicaciones de la liga para confirmar la participación.</Alert>
          : <Alert>Hay jugadores sin habilitar. Consulta su ficha para conocer el motivo.</Alert>}
        {!!next?.missing.length && <p className="text-sm">Falta: {next.missing.map(type => docs[type] ?? type).join(', ')}.</p>}
      </>}
    </Card>
    <div className="grid gap-4 sm:grid-cols-2">
      <Card className="space-y-3 p-4"><h2 className="font-bold">Tu próximo partido</h2>
        {games.isLoading ? <Spinner /> : games.error ? <Alert tone="error">No se pudo consultar. <button className="link" onClick={() => void games.refetch()}>Reintentar</button></Alert> : upcoming ? <>
          <p className="font-semibold">{upcoming.home_team_name} vs {upcoming.away_team_name}</p>
          <p className="text-sm">{fechaLarga(upcoming.scheduled_date)} · {hora12(upcoming.scheduled_time)} · {upcoming.field_name ?? 'Sede por confirmar'}</p>
          <CalendarActions game={upcoming} />
        </> : <p className="text-sm text-base-content/60">No tienes próximos partidos publicados. Aquí aparecerá tu siguiente encuentro.</p>}
        <Link className="link text-sm" to={`/jornadas${context}`}>Ver calendario de mi equipo →</Link>
      </Card>
      <Card className="space-y-3 p-4"><h2 className="font-bold">Pagos del equipo</h2>
        {statement.isLoading ? <Spinner /> : statement.error ? <Alert tone="error">No se pudo consultar el saldo. <button className="link" onClick={() => void statement.refetch()}>Reintentar</button></Alert> : <><p className="text-2xl font-black">{pesos(debt)}</p><p className="text-sm text-base-content/60">{debt > 0 ? 'Saldo pendiente registrado.' : 'Sin saldo pendiente registrado. Esto no confirma por sí solo la inscripción.'}</p></>}
        <Link className="btn btn-outline btn-sm" to={`/equipo/pagos${context}`}>Consultar cargos y pagos</Link>
      </Card>
    </div>
  </section>;
}
