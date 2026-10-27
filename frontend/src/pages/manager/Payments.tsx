import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../lib/api';
import type { TeamSummary } from '../../lib/types';
import { Alert, Card, EmptyState, Spinner, Stat } from '../../components/ui';
import { IconCheckCircle, IconWarning } from '../../components/icons';
import { TeamCrest } from '../../components/AuthImage';
import { fechaCorta, fechaLarga } from '../../lib/competition';
import { ETIQUETA_CARGO, finance, pesos, pesosCortos } from '../../lib/finance';
import { activeTeamId, rememberTeam } from '../../lib/teamContext';

/**
 * ESTADO DE CUENTA DEL EQUIPO
 *
 * Solo lectura, a propósito: el encargado necesita saber qué debe y por
 * qué, no registrar sus propios pagos. Lo primero que se ve es el saldo;
 * debajo, cada cargo con su concepto, su vencimiento y lo que ya
 * entregó, porque «¿de qué es este cobro?» es la pregunta que llega al
 * administrador cuando la cifra aparece sola.
 */
export default function ManagerPayments() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTeamId = searchParams.get('equipo');
  const equipos = useQuery({
    queryKey: ['teams-mine'],
    queryFn: () => api.get<TeamSummary[]>('/teams?managed=true'),
  });

  const teamId =
    equipos.data?.find((candidate) => candidate.id === requestedTeamId)?.id ??
    equipos.data?.find((candidate) => candidate.id === activeTeamId())?.id ??
    equipos.data?.[0]?.id;

  const estado = useQuery({
    queryKey: ['fin-statement', teamId],
    queryFn: () => finance.statement(teamId!),
    enabled: Boolean(teamId),
  });

  if (equipos.isLoading || estado.isLoading) return <Spinner label="Cargando tu estado de cuenta…" />;
  if (equipos.error) return <Alert tone="error">{(equipos.error as Error).message}</Alert>;
  if (!teamId) {
    return (
      <EmptyState
        title="No tienes un equipo asignado"
        description="Pide a administración que te asigne a tu equipo para ver su estado de cuenta."
      />
    );
  }
  if (estado.error) return <Alert tone="error">{(estado.error as Error).message}</Alert>;

  const d = estado.data!;
  const resumen = d.summary;
  const vigentes = d.fees.filter((f) => f.status !== 'CANCELLED');
  const pendientes = vigentes.filter((f) => f.balance_cents > 0);
  const pagosVigentes = d.payments.filter((p) => !p.voided_at);

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      {(equipos.data?.length ?? 0) > 1 && (
        <label className="block text-sm font-medium">
          Equipo
          <select
            className="select select-bordered mt-1 w-full sm:w-80"
            value={teamId}
            onChange={(event) => { rememberTeam(event.target.value); setSearchParams({ equipo: event.target.value }); }}
          >
            {equipos.data!.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.name} · {candidate.category_name}
              </option>
            ))}
          </select>
        </label>
      )}
      <header className="flex items-center gap-3">
        <TeamCrest
          name={d.team.name}
          shortName={d.team.short_name}
          logoUrl={d.team.logo_url}
          className="size-11"
        />
        <div>
          <h1 className="text-xl font-bold leading-tight">Estado de cuenta</h1>
          <p className="text-sm text-base-content/60">
            {d.team.name} · {d.team.category_name}
          </p>
        </div>
      </header>

      {resumen && (
        <>
          {resumen.balance_cents === 0 && vigentes.length > 0 && (
            <Alert tone="success" title="Estás al día">
              No hay nada pendiente de pago.
            </Alert>
          )}
          {resumen.overdue_cents > 0 && (
            <Alert tone="error" title={`${pesos(resumen.overdue_cents)} vencidos`}>
              {resumen.overdue_count === 1
                ? 'Hay un cargo cuyo plazo ya pasó.'
                : `Hay ${resumen.overdue_count} cargos cuyo plazo ya pasó.`}{' '}
              Ponte en contacto con la administración de la liga para regularizarlo.
            </Alert>
          )}

          <div className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-3">
            <Stat value={pesosCortos(resumen.charged_cents)} label="Total del período" />
            <Stat value={pesosCortos(resumen.paid_cents)} label="Pagado" tone="success" />
            <Stat
              value={pesosCortos(resumen.balance_cents)}
              label="Saldo"
              tone={resumen.overdue_cents > 0 ? 'error' : resumen.balance_cents > 0 ? 'warning' : 'success'}
            />
          </div>

          {resumen.next_due_date && resumen.balance_cents > 0 && (
            <p className="text-sm text-base-content/70">
              Próximo vencimiento: <strong>{fechaLarga(resumen.next_due_date)}</strong>
            </p>
          )}
        </>
      )}

      {vigentes.length === 0 && (
        <EmptyState
          icon={<IconCheckCircle size={40} />}
          title="Sin cargos por ahora"
          description="Cuando la liga genere la inscripción o el arbitraje de una jornada, aparecerán aquí con su fecha límite."
        />
      )}

      {vigentes.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-bold">
            Cargos {pendientes.length > 0 && (
              <span className="font-normal text-base-content/60">
                · {pendientes.length} por pagar
              </span>
            )}
          </h2>
          <ul className="space-y-2">
            {vigentes.map((f) => {
              const e = ETIQUETA_CARGO[f.status];
              return (
                <Card as="li" key={f.id} className="p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">
                        {f.description || f.concept_label}
                      </p>
                      <p className="text-xs text-base-content/60">
                        Vence {fechaLarga(f.due_date)}
                      </p>
                    </div>
                    <span className={`badge badge-sm ${e.tono}`}>{e.texto}</span>
                  </div>

                  <dl className="mt-2 grid grid-cols-3 gap-2 border-t border-base-300/60 pt-2 text-xs">
                    <div>
                      <dt className="text-base-content/50">Monto</dt>
                      <dd className="tabular font-semibold">{pesos(f.amount_cents)}</dd>
                    </div>
                    <div>
                      <dt className="text-base-content/50">Pagado</dt>
                      <dd className="tabular font-semibold text-success">{pesos(f.paid_cents)}</dd>
                    </div>
                    <div>
                      <dt className="text-base-content/50">Saldo</dt>
                      <dd
                        className={`tabular font-semibold ${
                          f.balance_cents > 0 ? 'text-warning' : ''
                        }`}
                      >
                        {pesos(f.balance_cents)}
                      </dd>
                    </div>
                  </dl>
                </Card>
              );
            })}
          </ul>
        </section>
      )}

      {pagosVigentes.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-bold">Pagos registrados</h2>
          <p className="text-xs text-base-content/60 sm:hidden">Desliza la tabla para ver todos los datos del pago.</p>
          <Card role="region" aria-label="Pagos registrados" tabIndex={0} className="overflow-x-auto">
            <table className="table table-sm min-w-[30rem]">
              <thead>
                <tr className="text-[11px] uppercase">
                  <th>Fecha</th>
                  <th>Concepto</th>
                  <th>Método</th>
                  <th className="text-right">Monto</th>
                </tr>
              </thead>
              <tbody>
                {pagosVigentes.map((p) => (
                  <tr key={p.id}>
                    <td className="tabular whitespace-nowrap text-xs">{fechaCorta(p.paid_on)}</td>
                    <td className="text-xs">
                      {p.fee_description || p.concept_label}
                      {p.reference && (
                        <span className="block text-[11px] text-base-content/50">
                          Ref. {p.reference}
                        </span>
                      )}
                    </td>
                    <td className="text-xs">{p.method_label}</td>
                    <td className="tabular text-right text-sm font-semibold">
                      {pesos(p.amount_cents)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          <p className="text-xs text-base-content/50">
            Si falta un pago que ya entregaste, avisa a la administración de la liga: los
            registra quien lo recibe.
          </p>
        </section>
      )}

      {d.payments.some((p) => p.voided_at) && (
        <details className="text-xs">
          <summary className="cursor-pointer font-semibold text-base-content/70">
            Pagos anulados ({d.payments.filter((p) => p.voided_at).length})
          </summary>
          <ul className="mt-2 space-y-1">
            {d.payments
              .filter((p) => p.voided_at)
              .map((p) => (
                <li key={p.id} className="flex items-start gap-2 text-base-content/60">
                  <IconWarning size={14} />
                  <span>
                    <span className="tabular font-semibold line-through">
                      {pesos(p.amount_cents)}
                    </span>{' '}
                    · {p.void_reason ?? 'sin motivo registrado'}
                  </span>
                </li>
              ))}
          </ul>
        </details>
      )}
    </div>
  );
}
