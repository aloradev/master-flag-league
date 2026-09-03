import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import type { Season } from '../../lib/types';
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

  const season = useQuery({
    queryKey: ['season-active'],
    queryFn: () => api.get<Season>('/seasons/active'),
    retry: false,
  });
  const seasonId = season.data?.id;

  const jornadas = useQuery({
    queryKey: ['rounds', seasonId],
    queryFn: () => competition.rounds(seasonId),
    enabled: Boolean(seasonId),
  });

  const proponer = useMutation({
    mutationFn: () => competition.propose(seasonId!, fecha || undefined),
    onSuccess: (p) => {
      setPropuesta(p);
      setFecha(p.scheduledDate);
      setError(null);
    },
    onError: (e: Error) => setError(e.message),
  });

  const guardar = useMutation({
    mutationFn: () => competition.createRound(seasonId!, propuesta ?? undefined),
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
          disabled={!seasonId}
          onClick={() => proponer.mutate()}
        >
          <IconPlus size={16} />
          Generar próxima jornada
        </Button>
      </header>

      {error && <Alert tone="error">{error}</Alert>}

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
              <h3 className="tabular text-sm font-bold">{hora12(hora)}</h3>
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
            <Button tone="success" loading={guardar.isPending} onClick={() => guardar.mutate()}>
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
                    <Link to="/jornadas" className="btn btn-xs btn-ghost">
                      Ver partidos
                    </Link>
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
                </Card>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
