import { useState } from 'react';
import { Link } from 'react-router-dom';
import RoundGames from './RoundGames';
import ManualRound from './ManualRound';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import type { Season, TeamSummary } from '../../lib/types';
import { Alert, Button, Card, EmptyState, Spinner } from '../../components/ui';
import { IconFootball, IconPlus, IconWarning } from '../../components/icons';
import {
  competition,
  ETIQUETA_JORNADA,
  MOTIVO_DESCANSO,
  fechaLarga,
  hora12,
  type Proposal,
} from '../../lib/competition';

/**
 * GESTIÓN DE JORNADAS
 *
 * El botón calcula una PROPUESTA y no guarda nada. El administrador ve
 * los enfrentamientos, los horarios, los campos y quién descansa —con el
 * motivo— antes de que exista una sola fila en la base; si no le gusta,
 * recalcula y no queda basura que borrar.
 *
 * Los avisos del generador se muestran completos y arriba: "no caben 9
 * partidos en 6 espacios, agregar un horario libera 2" es la información
 * con la que se toma la decisión, no una nota al pie.
 */
export default function AdminRounds() {
  const qc = useQueryClient();
  const [propuesta, setPropuesta] = useState<Proposal | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fecha, setFecha] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [manual, setManual] = useState(false);
  const [rests, setRests] = useState<string[]>([]);
  const [earliest, setEarliest] = useState<Record<string, string>>({});

  const season = useQuery({
    queryKey: ['season-active'],
    queryFn: () => api.get<Season>('/seasons/active'),
    retry: false,
  });
  const seasonId = season.data?.id;
  const teams = useQuery({ queryKey: ['round-teams', seasonId],
    queryFn: () => api.get<TeamSummary[]>(`/teams?seasonId=${seasonId}`), enabled: Boolean(seasonId) });

  const jornadas = useQuery({
    queryKey: ['rounds', seasonId],
    queryFn: () => competition.rounds(seasonId),
    enabled: Boolean(seasonId),
  });

  const proponer = useMutation({
    mutationFn: () => competition.propose(seasonId!, fecha || undefined, undefined, rests, earliest),
    onSuccess: (p) => {
      setPropuesta(p);
      setFecha(p.scheduledDate);
      setError(null);
    },
    onError: (e: Error) => setError(e.message),
  });

  const guardar = useMutation({
    mutationFn: () => competition.createRound(seasonId!, propuesta ? { ...propuesta, scheduledDate: fecha } : undefined),
    onSuccess: () => {
      setPropuesta(null);
      setError(null);
      void qc.invalidateQueries({ queryKey: ['rounds', seasonId] });
    },
    onError: (e: Error) => setError(e.message),
  });

  const publicar = useMutation({
    mutationFn: (id: string) => competition.publishRound(id),
    onSuccess: () => {
      setError(null);
      void qc.invalidateQueries({ queryKey: ['rounds', seasonId] });
    },
    onError: (e: Error) => setError(e.message),
  });

  const descartar = useMutation({
    mutationFn: (id: string) => competition.deleteRound(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['rounds', seasonId] }),
    onError: (e: Error) => setError(e.message),
  });

  if (season.isLoading) return <Spinner />;
  if (season.error) return <Alert tone="error">No hay temporada activa.</Alert>;

  const lista = jornadas.data ?? [];
  const porFecha = propuesta
    ? [...new Set(propuesta.games.map((g) => g.time))].sort()
    : [];

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Jornadas</h1>
          <p className="text-sm text-base-content/60">
            {season.data?.name} · {season.data?.fields.length} campos
          </p>
        </div>
        <Button
          tone="primary"
          loading={proponer.isPending}
          disabled={!seasonId || manual}
          onClick={() => proponer.mutate()}
        >
          <IconPlus size={16} />
          Generar próxima jornada
        </Button>
        <Button disabled={!seasonId || manual || proponer.isPending || guardar.isPending} onClick={() => { setManual(true); setPropuesta(null); setError(null); }}>Crear jornada manual</Button>
      </header>

      {error && <Alert tone="error">{error}</Alert>}
      {manual && season.data && <ManualRound season={season.data} onCancel={() => setManual(false)} onSaved={() => {
        setManual(false); void qc.invalidateQueries({ queryKey: ['rounds', seasonId] });
      }} />}
      {!manual && <Card className="space-y-3 p-4">
        <h2 className="font-semibold">Disponibilidad para esta jornada</h2>
        <p className="text-sm text-base-content/70">Selecciona descansos por decisión administrativa y la hora más temprana de cada equipo. Después genera o recalcula. Los horarios finales se ajustan en “Programación y árbitros” al guardar el borrador.</p>
        {teams.isError && <Alert tone="error">No se pudieron cargar los equipos.</Alert>}
        {teams.data?.filter((t) => t.status === 'ACTIVE').map((t) => <div key={t.id} className="flex flex-wrap items-center gap-3 border-b border-base-300 py-2">
          <span className="min-w-0 flex-1 text-sm">{t.name} · {t.category_name}</span>
          {Number(t.players_total) === 0 && <span className="text-xs text-warning">Plantilla pendiente</span>}
          {Number(t.players_total) > 0 && season.data?.require_approval_to_play && Number(t.players_eligible) === 0 && <span className="text-xs text-warning">Sin jugadores elegibles aún</span>}
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="checkbox checkbox-sm"
            checked={rests.includes(t.id)} onChange={(e) => { setRests(e.target.checked ? [...rests, t.id] : rests.filter((id) => id !== t.id)); setPropuesta(null); }} />Descansa</label>
          <label className="text-xs">Disponible desde
            <input type="time" className="input input-sm ml-2" disabled={rests.includes(t.id)} value={earliest[t.id] ?? ''}
              onChange={(e) => { const next = { ...earliest }; if (e.target.value) next[t.id] = e.target.value; else delete next[t.id]; setEarliest(next); setPropuesta(null); }} />
          </label>
        </div>)}
      </Card>}

      {/* ─────────── PROPUESTA ─────────── */}
      {propuesta && (
        <Card className="space-y-4 p-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold">
                Propuesta: jornada {propuesta.roundNumber}
              </h2>
              <p className="text-sm text-base-content/60">
                {propuesta.games.length} de {propuesta.capacity} espacios de la noche
              </p>
            </div>
            <label className="text-xs">
              <span className="mb-1 block font-semibold text-base-content/70">Fecha</span>
              <input
                type="date"
                className="input input-bordered input-sm"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
              />
            </label>
          </div>

          {propuesta.warnings.length > 0 && (
            <div className="space-y-2">
              {propuesta.warnings.map((w) => (
                <Alert key={w} tone="warning">
                  <span className="flex items-start gap-2">
                    <IconWarning size={16} />
                    <span>{w}</span>
                  </span>
                </Alert>
              ))}
            </div>
          )}

          {porFecha.map((hora) => (
            <section key={hora} className="space-y-1.5">
              <h3 className="tabular text-sm font-bold">{hora ? hora12(hora) : 'Sin horario compatible'}</h3>
              <ul className="space-y-1.5">
                {propuesta.games
                  .filter((g) => g.time === hora)
                  .map((g) => (
                    <li
                      key={`${g.homeTeamId}-${g.awayTeamId}`}
                      className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-field
                                 border border-base-300/60 bg-base-100/60 px-3 py-2 text-sm"
                    >
                      <span className="w-20 shrink-0 text-[11px] font-semibold text-base-content/60">
                        {g.fieldName}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="font-medium">{g.homeTeamName}</span>
                        <span className="text-base-content/40"> vs </span>
                        <span className="font-medium">{g.awayTeamName}</span>
                      </span>
                      <span className="badge badge-ghost badge-sm">{g.categoryName}</span>
                      {g.meeting > 1 && (
                        <span className="badge badge-warning badge-sm">
                          {g.meeting}º encuentro
                        </span>
                      )}
                    </li>
                  ))}
              </ul>
            </section>
          ))}

          {propuesta.byes.length > 0 && (
            <section className="space-y-1.5">
              <h3 className="text-sm font-bold">Descansan ({propuesta.byes.length})</h3>
              <ul className="space-y-1">
                {propuesta.byes.map((b) => (
                  <li
                    key={b.teamId}
                    className="flex flex-wrap items-center gap-2 rounded-field border
                               border-base-300/60 px-3 py-1.5 text-sm"
                  >
                    <span className="min-w-0 flex-1 truncate font-medium">{b.teamName}</span>
                    <span className="badge badge-ghost badge-sm">{b.categoryName}</span>
                    <span className="text-[11px] text-base-content/60">
                      {MOTIVO_DESCANSO[b.reason] ?? b.reason} · le quedarán {b.totalAfter}{' '}
                      {b.totalAfter === 1 ? 'descanso' : 'descansos'}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <div className="flex flex-wrap gap-2 border-t border-base-300/60 pt-3">
            <Button tone="success" disabled={!fecha} loading={guardar.isPending} onClick={() => guardar.mutate()}>
              Guardar como borrador
            </Button>
            <Button
              tone="neutral"
              outline
              loading={proponer.isPending}
              onClick={() => proponer.mutate()}
            >
              Recalcular
            </Button>
            <Button tone="ghost" onClick={() => setPropuesta(null)}>
              Descartar
            </Button>
          </div>

          <p className="text-xs text-base-content/50">
            Nada de esto existe todavía en la base. Al guardar queda como borrador, que
            solo ve administración; al publicar se hace visible para encargados y
            árbitros, y empieza a contar para el historial del generador.
          </p>
        </Card>
      )}

      {/* ─────────── JORNADAS EXISTENTES ─────────── */}
      {jornadas.isLoading && <Spinner />}

      {!jornadas.isLoading && lista.length === 0 && !propuesta && (
        <EmptyState
          icon={<IconFootball size={40} />}
          title="Sin jornadas todavía"
          description="Genera la primera: el sistema calcula los enfrentamientos, los horarios, los campos y los descansos a partir de los equipos inscritos."
        />
      )}

      {lista.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-bold">Jornadas de la temporada</h2>
          <ul className="space-y-2">
            {lista.map((j) => {
              const etiqueta = ETIQUETA_JORNADA[j.status];
              return (
                <Card as="li" key={j.id} className="p-3">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="text-sm font-bold">Jornada {j.number}</span>
                    <span className={`badge badge-sm ${etiqueta.tono}`}>{etiqueta.texto}</span>
                    <span className="text-xs text-base-content/60">
                      {fechaLarga(j.scheduled_date)}
                    </span>
                    <span className="ml-auto text-xs text-base-content/55">
                      {j.games_count} {j.games_count === 1 ? 'partido' : 'partidos'}
                      {j.byes_count > 0 && ` · ${j.byes_count} descansan`}
                      {j.finished_count > 0 && ` · ${j.finished_count} cerrados`}
                    </span>
                  </div>

                  {j.slots.length > 0 && (
                    <p className="mt-1 text-[11px] text-base-content/50">
                      {j.slots.map(hora12).join(' · ')}
                    </p>
                  )}

                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button size="xs" onClick={() => setEditingId(editingId === j.id ? null : j.id)}>
                      {editingId === j.id ? 'Cerrar edición' : 'Programación y árbitros'}
                    </Button>
                    <Link to="/jornadas" className="btn btn-xs btn-ghost">
                      Ver partidos
                    </Link>

                    {/* Compartir la jornada publicada.
                        `wa.me` abre WhatsApp con el mensaje escrito: sin
                        costo por mensaje, sin plantillas que aprobar y sin
                        exigir un negocio constituido, que es lo que pide la
                        API de Meta. El enlace apunta a /jornada SIN id, así
                        que el mismo mensaje sigue sirviendo cuando se
                        publique la jornada siguiente. */}
                    {j.status !== 'DRAFT' && (
                      <a
                        href={`https://wa.me/?text=${encodeURIComponent(
                          `${j.name || `Jornada ${j.number}`} ya está publicada.\n` +
                            `Partidos, campos y horarios: ${window.location.origin}/jornada`
                        )}`}
                        target="_blank"
                        rel="noreferrer"
                        className="btn btn-xs btn-primary"
                      >
                        Compartir por WhatsApp
                      </a>
                    )}
                    {j.status === 'DRAFT' && (
                      <>
                        <Button
                          size="xs"
                          tone="success"
                          loading={publicar.isPending && publicar.variables === j.id}
                          onClick={() => publicar.mutate(j.id)}
                        >
                          Publicar
                        </Button>
                        <Button
                          size="xs"
                          tone="error"
                          outline
                          loading={descartar.isPending && descartar.variables === j.id}
                          onClick={() => descartar.mutate(j.id)}
                        >
                          Descartar
                        </Button>
                      </>
                    )}
                  </div>
                  {editingId === j.id && season.data && <RoundGames id={j.id} season={season.data} />}
                </Card>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
