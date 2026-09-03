import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import type { Season } from '../../lib/types';
import { Alert, Button, Card, EmptyState, Spinner, Stat } from '../../components/ui';
import { IconPlus, IconWarning, IconCheckCircle } from '../../components/icons';
import { TeamCrest } from '../../components/AuthImage';
import { useAuth } from '../../store/auth';
import { competition, fechaCorta, fechaLarga } from '../../lib/competition';
import {
  ETIQUETA_CARGO,
  ETIQUETA_CUENTA,
  finance,
  pesos,
  pesosCortos,
  type Cargo,
  type CuentaEquipo,
} from '../../lib/finance';

type Pestana = 'cuentas' | 'cargos' | 'gastos';

/**
 * FINANZAS DE LA LIGA
 *
 * Se abre en "Cuentas por cobrar" y no en el balance a propósito: el
 * balance se consulta una vez al mes, mientras que a quién hay que
 * llamar se consulta cada semana. La lista viene ordenada por lo
 * vencido, así que el primer renglón es la primera llamada.
 */
export default function AdminFinances() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const puedeEscribir = user?.role === 'SUPER_ADMIN' || user?.role === 'FINANCE_ADMIN';

  const [pestana, setPestana] = useState<Pestana>('cuentas');
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [cobrando, setCobrando] = useState<Cargo | null>(null);
  const [nuevoGasto, setNuevoGasto] = useState(false);
  const [expandido, setExpandido] = useState<string | null>(null);

  const season = useQuery({
    queryKey: ['season-active'],
    queryFn: () => api.get<Season>('/seasons/active'),
    retry: false,
  });
  const seasonId = season.data?.id;

  const invalidar = () => {
    for (const k of ['fin-accounts', 'fin-balance', 'fin-fees', 'fin-expenses']) {
      void qc.invalidateQueries({ queryKey: [k] });
    }
  };

  const catalogo = useQuery({
    queryKey: ['fin-catalog', seasonId],
    queryFn: () => finance.catalog(seasonId),
    enabled: Boolean(seasonId),
  });
  const balance = useQuery({
    queryKey: ['fin-balance', seasonId],
    queryFn: () => finance.balance(seasonId!),
    enabled: Boolean(seasonId),
  });
  const cuentas = useQuery({
    queryKey: ['fin-accounts', seasonId],
    queryFn: () => finance.accounts(seasonId!),
    enabled: Boolean(seasonId),
  });
  const cargos = useQuery({
    queryKey: ['fin-fees', seasonId],
    queryFn: () => finance.fees({ seasonId }),
    enabled: Boolean(seasonId) && pestana === 'cargos',
  });
  const gastos = useQuery({
    queryKey: ['fin-expenses', seasonId],
    queryFn: () => finance.expenses({ seasonId }),
    enabled: Boolean(seasonId) && pestana === 'gastos',
  });
  const jornadas = useQuery({
    queryKey: ['rounds', seasonId],
    queryFn: () => competition.rounds(seasonId),
    enabled: Boolean(seasonId),
  });

  const generarInscripcion = useMutation({
    mutationFn: () => finance.generateInscription(seasonId!),
    onSuccess: (r) => {
      setError(null);
      setAviso(
        r.created === 0
          ? `Todos los equipos ya tenían su cargo de inscripción (${r.skipped}).`
          : `${r.created} cargos de ${pesos(r.amount_cents)} — ${pesos(r.total_cents)} en total, ` +
            `con vencimiento el ${fechaLarga(r.due_date)}.` +
            (r.skipped ? ` ${r.skipped} ya lo tenían.` : '')
      );
      invalidar();
    },
    onError: (e: Error) => { setAviso(null); setError(e.message); },
  });

  const generarJornada = useMutation({
    mutationFn: (roundId: string) => finance.generateRound(roundId),
    onSuccess: (r) => {
      setError(null);
      setAviso(
        r.created === 0
          ? `Esa jornada ya estaba cobrada (${r.skipped} equipos).`
          : `${r.created} cargos de ${pesos(r.amount_cents)} a los equipos que jugaron — ` +
            `${pesos(r.total_cents)} en total.`
      );
      invalidar();
    },
    onError: (e: Error) => { setAviso(null); setError(e.message); },
  });

  if (season.isLoading) return <Spinner />;
  if (season.error) return <Alert tone="error">No hay temporada activa.</Alert>;

  const b = balance.data;
  const reglas = catalogo.data?.rules;
  const sinConfigurar = reglas && reglas.inscription_cents === 0 && reglas.round_fee_cents === 0;
  const cobrables = (jornadas.data ?? []).filter((j) => j.status !== 'DRAFT' && j.status !== 'CANCELLED');

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <header>
        <h1 className="text-xl font-bold">Finanzas</h1>
        <p className="text-sm text-base-content/60">{season.data?.name}</p>
      </header>

      {error && <Alert tone="error">{error}</Alert>}
      {aviso && !error && <Alert tone="success">{aviso}</Alert>}

      {sinConfigurar && (
        <Alert tone="warning" title="Los montos están en cero">
          Configura la inscripción y el costo de arbitraje en los ajustes de la temporada
          antes de generar cargos. El sistema se niega a cobrar una cantidad que nadie
          decidió.
        </Alert>
      )}

      {/* ─────────── BALANCE ─────────── */}
      {b && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat value={pesosCortos(b.income_cents)} label="Cobrado" tone="success" />
            <Stat value={pesosCortos(b.receivable_cents)} label="Por cobrar" tone="warning" />
            <Stat value={pesosCortos(b.expenses_cents)} label="Gastos" tone="error" />
            <Stat
              value={pesosCortos(b.net_cents)}
              label="Neto"
              tone={b.net_cents >= 0 ? 'primary' : 'error'}
            />
          </div>

          <Card className="px-4 py-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm font-semibold">Cobranza</p>
              <p className="text-sm text-base-content/70">
                {pesos(b.income_cents)} de {pesos(b.expected_cents)} facturados
                <span className="ml-2 font-semibold">{b.collection_rate}%</span>
              </p>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-base-300">
              <div
                className="h-full rounded-full bg-success transition-[width]"
                style={{ width: `${Math.min(100, b.collection_rate)}%` }}
              />
            </div>
            {b.overdue_cents > 0 && (
              <p className="mt-2 flex items-center gap-1.5 text-xs text-error">
                <IconWarning size={14} />
                {pesos(b.overdue_cents)} vencidos
              </p>
            )}
            <p className="mt-2 text-xs text-base-content/50">
              «Facturado» es lo que se cobró en papel; «cobrado» es el dinero que ya entró.
              El neto usa lo cobrado, no lo facturado.
            </p>
          </Card>
        </>
      )}

      {/* ─────────── GENERADORES ─────────── */}
      {puedeEscribir && (
        <Card className="space-y-3 p-4">
          <h2 className="text-sm font-bold">Generar cargos</h2>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              tone="primary"
              size="sm"
              loading={generarInscripcion.isPending}
              disabled={!reglas || reglas.inscription_cents === 0}
              onClick={() => generarInscripcion.mutate()}
            >
              <IconPlus size={14} />
              Inscripción a todos los equipos
              {reglas ? ` · ${pesos(reglas.inscription_cents)}` : ''}
            </Button>
          </div>

          {cobrables.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs text-base-content/60">
                Arbitraje por jornada
                {reglas ? ` · ${pesos(reglas.round_fee_cents)} por equipo` : ''} — se cobra solo
                a los equipos que jugaron, no a los que descansaron.
              </p>
              <div className="flex flex-wrap gap-2">
                {cobrables.map((j) => (
                  <Button
                    key={j.id}
                    size="xs"
                    tone="neutral"
                    outline
                    loading={generarJornada.isPending && generarJornada.variables === j.id}
                    disabled={!reglas || reglas.round_fee_cents === 0}
                    onClick={() => generarJornada.mutate(j.id)}
                  >
                    Jornada {j.number} · {fechaCorta(j.scheduled_date)}
                  </Button>
                ))}
              </div>
            </div>
          )}
        </Card>
      )}

      {/* ─────────── PESTAÑAS ─────────── */}
      <div role="tablist" className="tabs tabs-box">
        {([
          ['cuentas', 'Cuentas por cobrar'],
          ['cargos', 'Cargos'],
          ['gastos', 'Gastos'],
        ] as const).map(([id, etiqueta]) => (
          <button
            key={id}
            role="tab"
            type="button"
            onClick={() => setPestana(id)}
            className={`tab ${pestana === id ? 'tab-active' : ''}`}
          >
            {etiqueta}
          </button>
        ))}
      </div>

      {pestana === 'cuentas' && (
        <CuentasPorCobrar
          cuentas={cuentas.data ?? []}
          cargando={cuentas.isLoading}
          expandido={expandido}
          onExpandir={(id) => setExpandido(expandido === id ? null : id)}
          puedeEscribir={puedeEscribir}
          onCobrar={(c) => { setCobrando(c); setError(null); setAviso(null); }}
        />
      )}

      {pestana === 'cargos' && (
        <ListaCargos
          cargos={cargos.data ?? []}
          cargando={cargos.isLoading}
          puedeEscribir={puedeEscribir}
          onCobrar={(c) => { setCobrando(c); setError(null); setAviso(null); }}
          onCancelar={async (c) => {
            const motivo = window.prompt(`Cancelar «${c.concept_label}» de ${c.team_name}. Motivo:`);
            if (!motivo) return;
            try {
              await finance.cancelFee(c.id, motivo);
              setAviso('Cargo cancelado. Queda en el historial, no se borró.');
              invalidar();
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        />
      )}

      {pestana === 'gastos' && (
        <ListaGastos
          gastos={gastos.data ?? []}
          cargando={gastos.isLoading}
          balance={b}
          puedeEscribir={puedeEscribir}
          onNuevo={() => setNuevoGasto(true)}
          onAnular={async (g) => {
            const motivo = window.prompt(`Anular «${g.description}». Motivo:`);
            if (!motivo) return;
            try {
              await finance.voidExpense(g.id, motivo);
              setAviso('Gasto anulado.');
              invalidar();
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        />
      )}

      {cobrando && (
        <HojaCobro
          cargo={cobrando}
          metodos={catalogo.data?.methods ?? {}}
          onCerrar={() => setCobrando(null)}
          onListo={(mensaje) => {
            setCobrando(null);
            setAviso(mensaje);
            invalidar();
          }}
          onError={setError}
        />
      )}

      {nuevoGasto && seasonId && (
        <HojaGasto
          seasonId={seasonId}
          categorias={catalogo.data?.expense_categories ?? {}}
          jornadas={(jornadas.data ?? []).map((j) => ({ id: j.id, number: j.number }))}
          onCerrar={() => setNuevoGasto(false)}
          onListo={(mensaje) => {
            setNuevoGasto(false);
            setAviso(mensaje);
            invalidar();
          }}
          onError={setError}
        />
      )}
    </div>
  );
}

// ────────────────────────── CUENTAS POR COBRAR ────────────────────────────

const CuentasPorCobrar = ({
  cuentas,
  cargando,
  expandido,
  onExpandir,
  puedeEscribir,
  onCobrar,
}: {
  cuentas: CuentaEquipo[];
  cargando: boolean;
  expandido: string | null;
  onExpandir: (id: string) => void;
  puedeEscribir: boolean;
  onCobrar: (c: Cargo) => void;
}) => {
  if (cargando) return <Spinner />;
  if (cuentas.length === 0) {
    return (
      <EmptyState
        icon={<IconCheckCircle size={40} />}
        title="No hay equipos inscritos"
        description="Los estados de cuenta aparecen en cuanto haya equipos en la temporada."
      />
    );
  }

  const deben = cuentas.filter((c) => c.balance_cents > 0);
  const alDia = cuentas.filter((c) => c.balance_cents === 0);

  return (
    <div className="space-y-3">
      {deben.length === 0 && (
        <Alert tone="success">
          Los {cuentas.length} equipos están al día. Nada por cobrar.
        </Alert>
      )}

      <ul className="space-y-2">
        {[...deben, ...alDia].map((c) => {
          const etiqueta = ETIQUETA_CUENTA[c.status];
          const abierto = expandido === c.team_id;
          return (
            <Card as="li" key={c.team_id}>
              <button
                type="button"
                onClick={() => onExpandir(c.team_id)}
                className="flex w-full items-center gap-3 p-3 text-left"
              >
                <TeamCrest
                  name={c.team_name}
                  shortName={c.short_name}
                  logoUrl={c.logo_url}
                  className="size-9"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{c.team_name}</span>
                  <span className="block text-[11px] text-base-content/55">
                    {c.category_name}
                    {c.overdue_count > 0 &&
                      ` · ${c.overdue_count} ${c.overdue_count === 1 ? 'cargo vencido' : 'cargos vencidos'}`}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span
                    className={`tabular block text-sm font-bold ${
                      c.balance_cents > 0 ? 'text-warning' : 'text-success'
                    }`}
                  >
                    {pesos(c.balance_cents)}
                  </span>
                  <span className={`badge badge-xs ${etiqueta.tono}`}>{etiqueta.texto}</span>
                </span>
              </button>

              {abierto && (
                <DetalleEquipo teamId={c.team_id} puedeEscribir={puedeEscribir} onCobrar={onCobrar} />
              )}
            </Card>
          );
        })}
      </ul>
    </div>
  );
};

/**
 * Detalle de un equipo, cargado solo al abrirlo.
 *
 * Con doce equipos, pedir el estado de cuenta de todos por adelantado
 * son doce consultas para ver una. Se pide la que se abre.
 */
const DetalleEquipo = ({
  teamId,
  puedeEscribir,
  onCobrar,
}: {
  teamId: string;
  puedeEscribir: boolean;
  onCobrar: (c: Cargo) => void;
}) => {
  const estado = useQuery({
    queryKey: ['fin-statement', teamId],
    queryFn: () => finance.statement(teamId),
  });

  if (estado.isLoading) return <div className="border-t border-base-300/60 p-3"><Spinner /></div>;
  if (estado.error) {
    return (
      <div className="border-t border-base-300/60 p-3">
        <Alert tone="error">{(estado.error as Error).message}</Alert>
      </div>
    );
  }

  const d = estado.data!;
  const vigentes = d.fees.filter((f) => f.status !== 'CANCELLED');

  return (
    <div className="space-y-2 border-t border-base-300/60 p-3">
      {vigentes.length === 0 ? (
        <p className="text-xs text-base-content/55">
          Este equipo no tiene ningún cargo. No es lo mismo que estar al día.
        </p>
      ) : (
        <ul className="space-y-1">
          {vigentes.map((f) => {
            const e = ETIQUETA_CARGO[f.status];
            return (
              <li
                key={f.id}
                className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-field
                           border border-base-300/60 px-2.5 py-1.5 text-xs"
              >
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">
                    {f.description || f.concept_label}
                  </span>
                  <span className="block text-[11px] text-base-content/55">
                    Vence {fechaCorta(f.due_date)}
                    {f.paid_cents > 0 && ` · pagado ${pesos(f.paid_cents)}`}
                  </span>
                </span>
                <span className="tabular font-semibold">{pesos(f.balance_cents)}</span>
                <span className={`badge badge-xs ${e.tono}`}>{e.texto}</span>
                {puedeEscribir && f.balance_cents > 0 && (
                  <Button size="xs" tone="primary" onClick={() => onCobrar(f)}>
                    Cobrar
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {d.payments.length > 0 && (
        <details>
          <summary className="cursor-pointer text-xs font-semibold text-base-content/70">
            Pagos registrados ({d.payments.filter((p) => !p.voided_at).length})
          </summary>
          <ul className="mt-1 space-y-1">
            {d.payments.map((p) => (
              <li
                key={p.id}
                className={`flex items-center gap-2 text-[11px] ${p.voided_at ? 'opacity-45' : ''}`}
              >
                <span className="tabular w-20 shrink-0 font-semibold">
                  {pesos(p.amount_cents)}
                </span>
                <span className={p.voided_at ? 'line-through' : ''}>
                  {fechaCorta(p.paid_on)} · {p.method_label}
                  {p.reference ? ` · ${p.reference}` : ''}
                </span>
                {p.voided_at && <span className="badge badge-ghost badge-xs">Anulado</span>}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
};

// ────────────────────────────── CARGOS ────────────────────────────────────

const ListaCargos = ({
  cargos,
  cargando,
  puedeEscribir,
  onCobrar,
  onCancelar,
}: {
  cargos: Cargo[];
  cargando: boolean;
  puedeEscribir: boolean;
  onCobrar: (c: Cargo) => void;
  onCancelar: (c: Cargo) => void;
}) => {
  if (cargando) return <Spinner />;
  if (cargos.length === 0) {
    return (
      <EmptyState
        title="Sin cargos todavía"
        description="Genera la inscripción arriba: el sistema crea un cargo por equipo con el vencimiento que ya tiene configurado la temporada."
      />
    );
  }

  return (
    <Card className="overflow-x-auto">
      <table className="table table-sm">
        <thead>
          <tr className="text-[11px] uppercase">
            <th>Equipo</th>
            <th>Concepto</th>
            <th className="text-center">Vence</th>
            <th className="text-right">Monto</th>
            <th className="text-right">Pagado</th>
            <th className="text-right">Saldo</th>
            <th className="text-center">Estado</th>
            {puedeEscribir && <th />}
          </tr>
        </thead>
        <tbody>
          {cargos.map((f) => {
            const e = ETIQUETA_CARGO[f.status];
            return (
              <tr key={f.id} className={f.status === 'CANCELLED' ? 'opacity-45' : undefined}>
                <td className="text-sm font-medium">{f.team_name}</td>
                <td className="text-xs">
                  {f.description || f.concept_label}
                  {f.round_number && (
                    <span className="block text-[11px] text-base-content/50">
                      Jornada {f.round_number}
                    </span>
                  )}
                </td>
                <td className="tabular text-center text-xs">{fechaCorta(f.due_date)}</td>
                <td className="tabular text-right text-xs">{pesos(f.amount_cents)}</td>
                <td className="tabular text-right text-xs">{pesos(f.paid_cents)}</td>
                <td className="tabular text-right text-sm font-semibold">
                  {pesos(f.balance_cents)}
                </td>
                <td className="text-center">
                  <span className={`badge badge-xs ${e.tono}`}>{e.texto}</span>
                </td>
                {puedeEscribir && (
                  <td className="whitespace-nowrap text-right">
                    {f.balance_cents > 0 && (
                      <Button size="xs" tone="primary" onClick={() => onCobrar(f)}>
                        Cobrar
                      </Button>
                    )}
                    {f.status !== 'CANCELLED' && f.paid_cents === 0 && (
                      <Button size="xs" tone="ghost" onClick={() => onCancelar(f)}>
                        Cancelar
                      </Button>
                    )}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
};

// ────────────────────────────── GASTOS ────────────────────────────────────

const ListaGastos = ({
  gastos,
  cargando,
  balance,
  puedeEscribir,
  onNuevo,
  onAnular,
}: {
  gastos: import('../../lib/finance').Gasto[];
  cargando: boolean;
  balance: import('../../lib/finance').Balance | undefined;
  puedeEscribir: boolean;
  onNuevo: () => void;
  onAnular: (g: import('../../lib/finance').Gasto) => void;
}) => {
  if (cargando) return <Spinner />;

  return (
    <div className="space-y-3">
      {puedeEscribir && (
        <Button tone="primary" size="sm" onClick={onNuevo}>
          <IconPlus size={14} />
          Registrar gasto
        </Button>
      )}

      {(balance?.by_expense_category ?? []).length > 0 && (
        <Card className="p-3">
          <p className="mb-2 text-sm font-semibold">Por categoría</p>
          <ul className="space-y-1">
            {balance!.by_expense_category
              .slice()
              .sort((a, c) => c.amount_cents - a.amount_cents)
              .map((c) => (
                <li key={c.category} className="flex items-center gap-2 text-xs">
                  <span className="w-32 shrink-0">{c.label}</span>
                  <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-base-300">
                    <span
                      className="block h-full rounded-full bg-error/70"
                      style={{
                        width: `${Math.round(
                          (c.amount_cents / Math.max(1, balance!.expenses_cents)) * 100
                        )}%`,
                      }}
                    />
                  </span>
                  <span className="tabular w-24 shrink-0 text-right font-semibold">
                    {pesos(c.amount_cents)}
                  </span>
                </li>
              ))}
          </ul>
        </Card>
      )}

      {(balance?.referees ?? []).some((r) => r.games_worked > 0 || r.paid_cents > 0) && (
        <Card className="overflow-x-auto">
          <p className="px-3 pt-3 text-sm font-semibold">Árbitros</p>
          <table className="table table-sm">
            <thead>
              <tr className="text-[11px] uppercase">
                <th>Árbitro</th>
                <th className="text-center">Partidos</th>
                <th className="text-right">Pagado</th>
              </tr>
            </thead>
            <tbody>
              {balance!.referees.map((r) => (
                <tr key={r.id}>
                  <td className="text-sm">{r.name}</td>
                  <td className="tabular text-center text-xs">{r.games_worked}</td>
                  <td className="tabular text-right text-sm font-semibold">
                    {pesos(r.paid_cents)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {gastos.length === 0 ? (
        <EmptyState
          title="Sin gastos registrados"
          description="El arbitraje, la renta de campos y la premiación se anotan aquí para que el neto de la temporada signifique algo."
        />
      ) : (
        <Card className="overflow-x-auto">
          <table className="table table-sm">
            <thead>
              <tr className="text-[11px] uppercase">
                <th className="text-center">Fecha</th>
                <th>Concepto</th>
                <th>Categoría</th>
                <th className="text-right">Monto</th>
                {puedeEscribir && <th />}
              </tr>
            </thead>
            <tbody>
              {gastos.map((g) => (
                <tr key={g.id} className={g.voided_at ? 'opacity-45' : undefined}>
                  <td className="tabular text-center text-xs">{fechaCorta(g.spent_on)}</td>
                  <td className="text-xs">
                    <span className={g.voided_at ? 'line-through' : ''}>{g.description}</span>
                    {(g.referee_name || g.round_number) && (
                      <span className="block text-[11px] text-base-content/50">
                        {[g.referee_name, g.round_number && `Jornada ${g.round_number}`]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    )}
                  </td>
                  <td className="text-xs">{g.category_label}</td>
                  <td className="tabular text-right text-sm font-semibold">
                    {pesos(g.amount_cents)}
                  </td>
                  {puedeEscribir && (
                    <td className="text-right">
                      {!g.voided_at && (
                        <Button size="xs" tone="ghost" onClick={() => onAnular(g)}>
                          Anular
                        </Button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
};

// ─────────────────────── HOJA: REGISTRAR COBRO ────────────────────────────

/**
 * El monto llega precargado con el saldo exacto, que es lo que se cobra
 * el 90% de las veces. Quien reciba un abono lo cambia; quien cobre
 * completo solo confirma, y no puede equivocarse al teclearlo.
 */
const HojaCobro = ({
  cargo,
  metodos,
  onCerrar,
  onListo,
  onError,
}: {
  cargo: Cargo;
  metodos: Record<string, string>;
  onCerrar: () => void;
  onListo: (mensaje: string) => void;
  onError: (m: string) => void;
}) => {
  const [monto, setMonto] = useState((cargo.balance_cents / 100).toFixed(2));
  const [metodo, setMetodo] = useState('CASH');
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [referencia, setReferencia] = useState('');
  const [ocupado, setOcupado] = useState(false);

  const enviar = async () => {
    setOcupado(true);
    try {
      const r = await finance.createPayment({
        feeId: cargo.id,
        amount: monto,
        paidOn: fecha,
        method: metodo,
        reference: referencia || undefined,
      });
      onListo(
        `${pesos(r.amount_cents)} de ${cargo.team_name}. ` +
          (r.fee.balance_cents === 0
            ? 'Cargo liquidado.'
            : `Quedan ${pesos(r.fee.balance_cents)} por cobrar.`)
      );
    } catch (e) {
      onError((e as Error).message);
      onCerrar();
    } finally {
      setOcupado(false);
    }
  };

  return (
    <HojaInferior titulo={`Cobrar a ${cargo.team_name}`} onCerrar={onCerrar}>
      <Card className="px-3 py-2 text-sm">
        <p className="font-semibold">{cargo.description || cargo.concept_label}</p>
        <p className="text-xs text-base-content/60">
          Monto {pesos(cargo.amount_cents)} · pagado {pesos(cargo.paid_cents)} ·{' '}
          <span className="font-semibold">saldo {pesos(cargo.balance_cents)}</span>
        </p>
        <p className="text-xs text-base-content/50">Vence {fechaLarga(cargo.due_date)}</p>
      </Card>

      <label className="block">
        <span className="mb-1 block text-xs font-semibold text-base-content/70">Monto recibido</span>
        <input
          type="number"
          step="0.01"
          min="0.01"
          inputMode="decimal"
          className="input input-bordered w-full text-lg font-semibold"
          value={monto}
          onChange={(e) => setMonto(e.target.value)}
        />
        <span className="mt-1 block text-[11px] text-base-content/50">
          Precargado con el saldo. Cámbialo solo si es un abono parcial.
        </span>
      </label>

      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-base-content/70">Método</span>
          <select
            className="select select-bordered w-full"
            value={metodo}
            onChange={(e) => setMetodo(e.target.value)}
          >
            {Object.entries(metodos).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-base-content/70">Fecha</span>
          <input
            type="date"
            className="input input-bordered w-full"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
          />
        </label>
      </div>

      <label className="block">
        <span className="mb-1 block text-xs font-semibold text-base-content/70">
          Referencia <span className="font-normal opacity-60">(folio, SPEI, recibo)</span>
        </span>
        <input
          type="text"
          className="input input-bordered w-full"
          value={referencia}
          onChange={(e) => setReferencia(e.target.value)}
        />
      </label>

      <Button tone="primary" block loading={ocupado} onClick={enviar}>
        Registrar pago
      </Button>
    </HojaInferior>
  );
};

// ───────────────────── HOJA: REGISTRAR GASTO ──────────────────────────────

const HojaGasto = ({
  seasonId,
  categorias,
  jornadas,
  onCerrar,
  onListo,
  onError,
}: {
  seasonId: string;
  categorias: Record<string, string>;
  jornadas: { id: string; number: number }[];
  onCerrar: () => void;
  onListo: (m: string) => void;
  onError: (m: string) => void;
}) => {
  const [categoria, setCategoria] = useState('REFEREES');
  const [descripcion, setDescripcion] = useState('');
  const [monto, setMonto] = useState('');
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [roundId, setRoundId] = useState('');
  const [refereeId, setRefereeId] = useState('');
  const [ocupado, setOcupado] = useState(false);

  const arbitros = useQuery({
    queryKey: ['referees', seasonId],
    queryFn: () => competition.referees(seasonId),
  });

  const enviar = async () => {
    setOcupado(true);
    try {
      await finance.createExpense({
        seasonId,
        category: categoria,
        description: descripcion,
        amount: monto,
        spentOn: fecha,
        roundId: roundId || undefined,
        refereeId: refereeId || undefined,
      });
      onListo('Gasto registrado.');
    } catch (e) {
      onError((e as Error).message);
      onCerrar();
    } finally {
      setOcupado(false);
    }
  };

  return (
    <HojaInferior titulo="Registrar gasto" onCerrar={onCerrar}>
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-base-content/70">Categoría</span>
          <select
            className="select select-bordered w-full"
            value={categoria}
            onChange={(e) => setCategoria(e.target.value)}
          >
            {Object.entries(categorias).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-base-content/70">Monto</span>
          <input
            type="number"
            step="0.01"
            min="0.01"
            inputMode="decimal"
            className="input input-bordered w-full"
            value={monto}
            onChange={(e) => setMonto(e.target.value)}
          />
        </label>
      </div>

      <label className="block">
        <span className="mb-1 block text-xs font-semibold text-base-content/70">Concepto</span>
        <input
          type="text"
          className="input input-bordered w-full"
          placeholder="Arbitraje jornada 1, renta de campos…"
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
        />
      </label>

      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-base-content/70">Fecha</span>
          <input
            type="date"
            className="input input-bordered w-full"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-base-content/70">
            Jornada <span className="font-normal opacity-60">(opcional)</span>
          </span>
          <select
            className="select select-bordered w-full"
            value={roundId}
            onChange={(e) => setRoundId(e.target.value)}
          >
            <option value="">Ninguna</option>
            {jornadas.map((j) => (
              <option key={j.id} value={j.id}>Jornada {j.number}</option>
            ))}
          </select>
        </label>
      </div>

      {categoria === 'REFEREES' && (
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-base-content/70">
            Árbitro <span className="font-normal opacity-60">(para sumar lo pagado a cada uno)</span>
          </span>
          <select
            className="select select-bordered w-full"
            value={refereeId}
            onChange={(e) => setRefereeId(e.target.value)}
          >
            <option value="">Sin especificar</option>
            {(arbitros.data ?? []).map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </label>
      )}

      <Button
        tone="primary"
        block
        loading={ocupado}
        disabled={!descripcion || !monto}
        onClick={enviar}
      >
        Registrar gasto
      </Button>
    </HojaInferior>
  );
};

const HojaInferior = ({
  titulo,
  children,
  onCerrar,
}: {
  titulo: string;
  children: React.ReactNode;
  onCerrar: () => void;
}) => (
  <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
    {/* El fondo cierra al tocarlo, pero se oculta del árbol de
        accesibilidad: si se anuncia como un botón "Cerrar", quien usa
        lector de pantalla oye dos controles con el mismo nombre y el
        primero es invisible. El botón visible de la cabecera ya cubre
        teclado y lectores. */}
    <div
      aria-hidden="true"
      onClick={onCerrar}
      className="absolute inset-0 bg-black/60"
    />
    <div
      role="dialog"
      aria-label={titulo}
      className="relative max-h-[85vh] w-full max-w-lg space-y-3 overflow-y-auto
                 rounded-t-box border-t border-base-300 bg-base-200 p-4 shadow-2xl
                 sm:rounded-box sm:border"
    >
      <div className="sticky -top-4 -mx-4 -mt-4 mb-1 flex items-center justify-between
                      border-b border-base-300/60 bg-base-200 px-4 py-3">
        <h2 className="text-sm font-bold">{titulo}</h2>
        <Button size="xs" tone="ghost" onClick={onCerrar}>Cerrar</Button>
      </div>
      {children}
    </div>
  </div>
);
