import { api } from './api';

// ─────────────────────────────── TIPOS ────────────────────────────────────

export type ConceptoCargo = 'INSCRIPTION' | 'ROUND' | 'FINE' | 'OTHER';
export type EstadoCargo = 'PAID' | 'PARTIAL' | 'OVERDUE' | 'PENDING' | 'CANCELLED';
export type MetodoPago = 'CASH' | 'TRANSFER' | 'CARD' | 'OTHER';
export type CategoriaGasto =
  | 'REFEREES' | 'FIELDS' | 'EQUIPMENT' | 'AWARDS' | 'ADMIN' | 'OTHER';

export interface Cargo {
  id: string;
  season_id: string;
  team_id: string;
  team_name: string;
  concept: ConceptoCargo;
  concept_label: string;
  description: string | null;
  amount_cents: number;
  paid_cents: number;
  balance_cents: number;
  due_date: string;
  round_id: string | null;
  round_number: number | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  status: EstadoCargo;
  created_at: string;
}

export interface Pago {
  id: string;
  team_id: string;
  team_name: string;
  fee_id: string;
  amount_cents: number;
  paid_on: string;
  method: MetodoPago;
  method_label: string;
  reference: string | null;
  notes: string | null;
  voided_at: string | null;
  void_reason: string | null;
  concept: ConceptoCargo;
  concept_label: string;
  fee_description: string | null;
  recorded_by_name: string | null;
}

export interface Gasto {
  id: string;
  season_id: string;
  category: CategoriaGasto;
  category_label: string;
  description: string;
  amount_cents: number;
  spent_on: string;
  round_id: string | null;
  round_number: number | null;
  referee_id: string | null;
  referee_name: string | null;
  voided_at: string | null;
  void_reason: string | null;
  recorded_by_name: string | null;
}

export interface CuentaEquipo {
  team_id: string;
  team_name: string;
  short_name: string | null;
  logo_url: string | null;
  category_id: string;
  category_name: string;
  charged_cents: number;
  paid_cents: number;
  balance_cents: number;
  overdue_cents: number;
  overdue_count: number;
  next_due_date: string | null;
  status: 'CLEAR' | 'PENDING' | 'OVERDUE';
}

export interface Balance {
  income_cents: number;
  expected_cents: number;
  receivable_cents: number;
  overdue_cents: number;
  expenses_cents: number;
  net_cents: number;
  collection_rate: number;
  by_concept: { concept: string; label: string; charged_cents: number; paid_cents: number }[];
  by_expense_category: { category: string; label: string; amount_cents: number }[];
  referees: {
    id: string; name: string; paid_cents: number;
    payments_count: number; games_worked: number;
  }[];
}

export interface EstadoDeCuenta {
  team: {
    id: string; name: string; short_name: string | null;
    logo_url: string | null; season_id: string; category_name: string;
  };
  summary: CuentaEquipo | null;
  fees: Cargo[];
  payments: Pago[];
}

export interface ReglasFinanzas {
  currency: string;
  inscription_cents: number;
  round_fee_cents: number;
  referee_fee_cents: number;
}

export interface Proyeccion {
  inscription_cents: number;
  round_fee_cents: number;
  rounds_planned: number;
  rounds_published: number;
  total_per_team_cents: number;
  committed_per_team_cents: number;
}

export interface Catalogo {
  concepts: Record<string, string>;
  methods: Record<string, string>;
  expense_categories: Record<string, string>;
  rules: ReglasFinanzas | null;
  projection: Proyeccion | null;
}

export interface ResultadoBorrado {
  deleted: number;
  kept_with_payments: number;
  deleted_cents: number;
  kept_teams: string[];
}

export interface ResultadoGeneracion {
  created: number;
  skipped: number;
  amount_cents: number;
  total_cents: number;
  due_date: string;
  detail: { team_id: string; team_name: string; created: boolean; reason?: string }[];
}

// ─────────────────────────────── LLAMADAS ─────────────────────────────────

const q = (filtros: Record<string, string | undefined>) => {
  const s = Object.entries(filtros)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}=${encodeURIComponent(v as string)}`)
    .join('&');
  return s ? `?${s}` : '';
};

export const finance = {
  reset: (seasonId: string, confirmation: string) => api.post<{ fees: number; payments: number; expenses: number }>('/finance/reset', { seasonId, confirmation }),
  catalog: (seasonId?: string) => api.get<Catalogo>(`/finance/catalog${q({ seasonId })}`),
  fees: (filtros: { seasonId?: string; teamId?: string; concept?: string; pending?: string }) =>
    api.get<Cargo[]>(`/finance/fees${q(filtros)}`),
  createFee: (datos: {
    teamId: string; concept: string; description?: string; amount: string; dueDate: string;
  }) => api.post<Cargo>('/finance/fees', datos),
  updateFee: (id: string, datos: { concept: string; description: string; amount: string; dueDate: string }) => api.put<Cargo>(`/finance/fees/${id}`, datos),
  cancelFee: (id: string, reason: string) =>
    api.post<{ id: string }>(`/finance/fees/${id}/cancel`, { reason }),
  deleteFee: (id: string) =>
    api.del<{ id: string; team_name: string; amount_cents: number }>(`/finance/fees/${id}`),
  deleteUnpaid: (seasonId: string, concept?: string, roundId?: string) =>
    api.post<ResultadoBorrado>('/finance/fees/delete-unpaid', { seasonId, concept, roundId }),
  updateSettings: (datos: {
    seasonId: string;
    inscription?: string;
    roundFee?: string;
    refereeFee?: string;
    roundsPlanned?: string;
  }) => api.put<{ rules: ReglasFinanzas; projection: Proyeccion }>('/finance/settings', datos),
  generateInscription: (seasonId: string) =>
    api.post<ResultadoGeneracion>('/finance/fees/generate-inscription', { seasonId }),
  generateRound: (roundId: string) =>
    api.post<ResultadoGeneracion>(`/finance/fees/generate-round/${roundId}`),

  payments: (filtros: { seasonId?: string; teamId?: string; feeId?: string }) =>
    api.get<Pago[]>(`/finance/payments${q(filtros)}`),
  createPayment: (datos: {
    feeId: string; amount: string; paidOn?: string; method?: string;
    reference?: string; notes?: string;
  }) => api.post<{ id: string; amount_cents: number; fee: Cargo }>('/finance/payments', datos),
  voidPayment: (id: string, reason: string) =>
    api.post<{ id: string; fee: Cargo }>(`/finance/payments/${id}/void`, { reason }),

  expenses: (filtros: { seasonId?: string; category?: string }) =>
    api.get<Gasto[]>(`/finance/expenses${q(filtros)}`),
  createExpense: (datos: {
    seasonId: string; category: string; description: string; amount: string;
    spentOn?: string; roundId?: string; refereeId?: string;
  }) => api.post<Gasto>('/finance/expenses', datos),
  voidExpense: (id: string, reason: string) =>
    api.post<{ id: string }>(`/finance/expenses/${id}/void`, { reason }),

  accounts: (seasonId: string) => api.get<CuentaEquipo[]>(`/finance/accounts${q({ seasonId })}`),
  statement: (teamId: string) => api.get<EstadoDeCuenta>(`/finance/teams/${teamId}/statement`),
  balance: (seasonId: string) => api.get<Balance>(`/finance/balance${q({ seasonId })}`),
};

// ─────────────────────────────── DINERO ───────────────────────────────────

/**
 * Centavos → "$2,500.00".
 *
 * Se arma a mano en lugar de usar toLocaleString por lo mismo que las
 * fechas: depende de los datos de idioma del navegador y en algunos
 * Android devuelve otro formato. Una cifra de dinero mal separada se
 * lee mal, y aquí se leen muchas seguidas.
 */
export const pesos = (centavos: number | null | undefined): string => {
  const c = Math.round(Number(centavos ?? 0));
  const negativo = c < 0;
  const abs = Math.abs(c);
  const enteros = Math.floor(abs / 100);
  const decimales = String(abs % 100).padStart(2, '0');
  const conSeparador = String(enteros).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${negativo ? '−' : ''}$${conSeparador}.${decimales}`;
};

/** Sin centavos, para los totales grandes de un tablero. */
export const pesosCortos = (centavos: number | null | undefined): string => {
  const c = Math.round(Number(centavos ?? 0));
  const negativo = c < 0;
  const enteros = Math.round(Math.abs(c) / 100);
  return `${negativo ? '−' : ''}$${String(enteros).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
};

export const ETIQUETA_CARGO: Record<EstadoCargo, { texto: string; tono: string }> = {
  PAID: { texto: 'Pagado', tono: 'badge-success' },
  PARTIAL: { texto: 'Parcial', tono: 'badge-warning' },
  OVERDUE: { texto: 'Vencido', tono: 'badge-error' },
  PENDING: { texto: 'Pendiente', tono: 'badge-ghost' },
  CANCELLED: { texto: 'Cancelado', tono: 'badge-ghost' },
};

export const ETIQUETA_CUENTA: Record<CuentaEquipo['status'], { texto: string; tono: string }> = {
  CLEAR: { texto: 'Al día', tono: 'badge-success' },
  PENDING: { texto: 'Debe', tono: 'badge-warning' },
  OVERDUE: { texto: 'Vencido', tono: 'badge-error' },
};
