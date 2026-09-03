import { query } from '../config/database.js';
import { newPrefixedId } from '../utils/id.js';

/**
 * FINANZAS
 *
 * Regla de la casa: el dinero se guarda en CENTAVOS ENTEROS y se suma
 * con enteros. Nada de punto flotante y nada de NUMERIC convertido con
 * parseFloat; un centavo perdido en una suma es un reclamo que no se
 * puede explicar.
 *
 * Y el estado de un cargo NUNCA se captura: es `cargo - pagos vigentes`
 * comparado contra la fecha de vencimiento. Nadie marca "PAGADO"; se
 * registra un pago y el estado sigue solo.
 */

export type ConceptoCargo = 'INSCRIPTION' | 'ROUND' | 'FINE' | 'OTHER';
export type EstadoCargo = 'PAID' | 'PARTIAL' | 'OVERDUE' | 'PENDING' | 'CANCELLED';
export type MetodoPago = 'CASH' | 'TRANSFER' | 'CARD' | 'OTHER';
export type CategoriaGasto =
  | 'REFEREES' | 'FIELDS' | 'EQUIPMENT' | 'AWARDS' | 'ADMIN' | 'OTHER';

export const CONCEPTOS: Record<ConceptoCargo, string> = {
  INSCRIPTION: 'Inscripción',
  ROUND: 'Arbitraje por partido',
  FINE: 'Multa',
  OTHER: 'Otro',
};

export const METODOS: Record<MetodoPago, string> = {
  CASH: 'Efectivo',
  TRANSFER: 'Transferencia',
  CARD: 'Tarjeta',
  OTHER: 'Otro',
};

export const CATEGORIAS_GASTO: Record<CategoriaGasto, string> = {
  REFEREES: 'Arbitraje',
  FIELDS: 'Renta de campos',
  EQUIPMENT: 'Equipo y material',
  AWARDS: 'Premiación',
  ADMIN: 'Administración',
  OTHER: 'Otros',
};

export interface ReglasFinanzas {
  currency: string;
  inscription_cents: number;
  round_fee_cents: number;
  referee_fee_cents: number;
}

export interface ProyeccionTemporada {
  inscription_cents: number;
  round_fee_cents: number;
  /** Jornadas que la liga planea jugar. Sale de los ajustes de competencia. */
  rounds_planned: number;
  /** Jornadas ya publicadas: lo que de verdad se puede cobrar hoy. */
  rounds_published: number;
  /** inscripción + arbitraje × jornadas planeadas. */
  total_per_team_cents: number;
  /** Lo mismo con las jornadas ya publicadas. */
  committed_per_team_cents: number;
}

/**
 * Cuánto va a pagar un equipo en toda la temporada.
 *
 * El total NO es un monto fijo: es inscripción + arbitraje × partidos
 * jugados, así que depende del formato del torneo. Es la primera
 * pregunta de un encargado al inscribirse —"¿cuánto voy a pagar en
 * total?"— y hasta ahora había que sacarla con calculadora.
 *
 * Se distinguen dos cifras a propósito: lo PLANEADO (con las jornadas
 * que la liga piensa jugar) y lo COMPROMETIDO (con las ya publicadas).
 * La primera sirve para informar al equipo; la segunda es la única que
 * el sistema puede cobrar hoy.
 */
export const proyeccionDeTemporada = async (
  seasonId: string
): Promise<ProyeccionTemporada> => {
  const [reglas, comp, publicadas] = await Promise.all([
    cargarReglasFinanzas(seasonId),
    query(`SELECT value FROM settings WHERE season_id = $1 AND key = 'competition'`, [seasonId]),
    query(
      `SELECT COUNT(*)::int AS n FROM rounds
       WHERE season_id = $1 AND status NOT IN ('DRAFT', 'CANCELLED')`,
      [seasonId]
    ),
  ]);

  const planeadas = Number(comp.rows[0]?.value?.rounds_planned ?? 0);
  const yaPublicadas = publicadas.rows[0].n;

  return {
    inscription_cents: reglas.inscription_cents,
    round_fee_cents: reglas.round_fee_cents,
    rounds_planned: planeadas,
    rounds_published: yaPublicadas,
    total_per_team_cents: reglas.inscription_cents + reglas.round_fee_cents * planeadas,
    committed_per_team_cents: reglas.inscription_cents + reglas.round_fee_cents * yaPublicadas,
  };
};

const POR_OMISION: ReglasFinanzas = {
  currency: 'MXN',
  inscription_cents: 0,
  round_fee_cents: 0,
  referee_fee_cents: 0,
};

/**
 * Lee los montos de `settings`.
 *
 * Los valores por omisión son CERO, no una cantidad inventada: cobrarle
 * a doce equipos una inscripción que nadie configuró sería peor que no
 * cobrar nada. Los generadores se niegan a correr si el monto es cero y
 * lo dicen.
 */
export const cargarReglasFinanzas = async (seasonId: string): Promise<ReglasFinanzas> => {
  const r = await query(
    `SELECT value FROM settings WHERE season_id = $1 AND key = 'finance'`,
    [seasonId]
  );
  return { ...POR_OMISION, ...(r.rows[0]?.value ?? {}) };
};

/** Estado de un cargo, derivado. Ver el comentario de arriba. */
export const estadoDeCargo = (
  amountCents: number,
  paidCents: number,
  dueDate: string,
  cancelledAt: string | null,
  hoy = new Date()
): EstadoCargo => {
  if (cancelledAt) return 'CANCELLED';
  if (paidCents >= amountCents) return 'PAID';
  // Se compara solo la fecha: un cargo que vence hoy no está vencido
  // hasta mañana, y comparar con la hora lo marcaría vencido a las 00:01.
  const vence = new Date(`${String(dueDate).slice(0, 10)}T23:59:59Z`);
  const ahora = new Date(`${hoy.toISOString().slice(0, 10)}T00:00:00Z`);
  if (ahora > vence) return 'OVERDUE';
  return paidCents > 0 ? 'PARTIAL' : 'PENDING';
};

export interface CargoConSaldo {
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

const CARGO_COLUMNS = `f.id, f.season_id, f.team_id, f.concept, f.description,
  f.amount_cents, to_char(f.due_date, 'YYYY-MM-DD') AS due_date, f.round_id,
  f.cancelled_at, f.cancel_reason, f.created_at`;

/**
 * Cargos con su saldo ya calculado.
 *
 * La suma de pagos se hace en SQL con enteros y se filtra por
 * `voided_at IS NULL`: un pago anulado no reduce la deuda, pero se
 * conserva para poder explicar la corrección.
 */
export const cargosConSaldo = async (filtros: {
  seasonId?: string;
  teamId?: string;
  teamIds?: string[];
  concept?: string;
  soloPendientes?: boolean;
}): Promise<CargoConSaldo[]> => {
  const r = await query(
    `SELECT ${CARGO_COLUMNS},
            t.name AS team_name,
            ro.number AS round_number,
            COALESCE((SELECT SUM(p.amount_cents)::int FROM payments p
                      WHERE p.fee_id = f.id AND p.voided_at IS NULL), 0) AS paid_cents
     FROM fees f
     JOIN teams t ON t.id = f.team_id
     LEFT JOIN rounds ro ON ro.id = f.round_id
     WHERE ($1::text IS NULL OR f.season_id = $1)
       AND ($2::text IS NULL OR f.team_id = $2)
       AND ($3::text[] IS NULL OR f.team_id = ANY($3))
       AND ($4::text IS NULL OR f.concept = $4)
     ORDER BY f.due_date, t.name, f.created_at`,
    [
      filtros.seasonId ?? null,
      filtros.teamId ?? null,
      filtros.teamIds && filtros.teamIds.length > 0 ? filtros.teamIds : null,
      filtros.concept ?? null,
    ]
  );

  const filas = r.rows.map((f) => ({
    ...f,
    concept_label: CONCEPTOS[f.concept as ConceptoCargo] ?? f.concept,
    paid_cents: f.paid_cents,
    balance_cents: f.cancelled_at ? 0 : Math.max(0, f.amount_cents - f.paid_cents),
    status: estadoDeCargo(f.amount_cents, f.paid_cents, f.due_date, f.cancelled_at),
  })) as CargoConSaldo[];

  return filtros.soloPendientes
    ? filas.filter((f) => f.status === 'PENDING' || f.status === 'PARTIAL' || f.status === 'OVERDUE')
    : filas;
};

export interface EstadoDeCuenta {
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
  /** Cargos vencidos con saldo: el número que de verdad se persigue. */
  overdue_count: number;
  next_due_date: string | null;
  status: 'CLEAR' | 'PENDING' | 'OVERDUE';
}

/**
 * Estado de cuenta por equipo.
 *
 * Los equipos sin un solo cargo aparecen igual, en ceros, en lugar de
 * desaparecer: un equipo ausente de la lista se lee como "no debe" y
 * puede ser "nunca se le cobró", que es un problema distinto.
 */
export const estadosDeCuenta = async (
  seasonId: string,
  teamIds?: string[]
): Promise<EstadoDeCuenta[]> => {
  const r = await query(
    `SELECT t.id AS team_id, t.name AS team_name, t.short_name, t.logo_url,
            t.category_id, c.name AS category_name,
            COALESCE(SUM(f.amount_cents) FILTER (WHERE f.cancelled_at IS NULL), 0)::int
              AS charged_cents,
            COALESCE(SUM(pg.pagado) FILTER (WHERE f.cancelled_at IS NULL), 0)::int
              AS paid_cents,
            COALESCE(SUM(GREATEST(f.amount_cents - COALESCE(pg.pagado, 0), 0))
                     FILTER (WHERE f.cancelled_at IS NULL AND f.due_date < CURRENT_DATE), 0)::int
              AS overdue_cents,
            COUNT(*) FILTER (WHERE f.cancelled_at IS NULL
                               AND f.due_date < CURRENT_DATE
                               AND f.amount_cents > COALESCE(pg.pagado, 0))::int
              AS overdue_count,
            to_char(MIN(f.due_date) FILTER (WHERE f.cancelled_at IS NULL
                                              AND f.amount_cents > COALESCE(pg.pagado, 0)),
                    'YYYY-MM-DD') AS next_due_date
     FROM teams t
     JOIN categories c ON c.id = t.category_id
     LEFT JOIN fees f ON f.team_id = t.id
     LEFT JOIN LATERAL (
       SELECT COALESCE(SUM(p.amount_cents), 0)::int AS pagado
       FROM payments p WHERE p.fee_id = f.id AND p.voided_at IS NULL
     ) pg ON TRUE
     WHERE t.season_id = $1
       AND t.status = 'ACTIVE'
       AND ($2::text[] IS NULL OR t.id = ANY($2))
     GROUP BY t.id, t.name, t.short_name, t.logo_url, t.category_id, c.name, c.sort_order
     ORDER BY c.sort_order, t.name`,
    [seasonId, teamIds && teamIds.length > 0 ? teamIds : null]
  );

  return r.rows.map((f) => {
    const balance = Math.max(0, f.charged_cents - f.paid_cents);
    return {
      ...f,
      balance_cents: balance,
      status: balance === 0 ? 'CLEAR' : f.overdue_cents > 0 ? 'OVERDUE' : 'PENDING',
    } as EstadoDeCuenta;
  });
};

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
}

/**
 * Balance de la temporada.
 *
 * `income` es dinero que YA entró; `expected` es lo que se cobró en
 * papel. Se separan a propósito: un balance que sume lo facturado como
 * si estuviera cobrado hace ver a la liga con dinero que no tiene.
 */
export const balanceDeTemporada = async (seasonId: string): Promise<Balance> => {
  const [porConcepto, gastos] = await Promise.all([
    query(
      `SELECT f.concept,
              SUM(f.amount_cents)::int AS charged_cents,
              COALESCE(SUM((SELECT COALESCE(SUM(p.amount_cents), 0)
                            FROM payments p
                            WHERE p.fee_id = f.id AND p.voided_at IS NULL)), 0)::int
                AS paid_cents,
              COALESCE(SUM(
                CASE WHEN f.due_date < CURRENT_DATE
                     THEN GREATEST(f.amount_cents -
                            (SELECT COALESCE(SUM(p.amount_cents), 0) FROM payments p
                             WHERE p.fee_id = f.id AND p.voided_at IS NULL), 0)
                     ELSE 0 END), 0)::int AS overdue_cents
       FROM fees f
       WHERE f.season_id = $1 AND f.cancelled_at IS NULL
       GROUP BY f.concept`,
      [seasonId]
    ),
    query(
      `SELECT category, SUM(amount_cents)::int AS amount_cents
       FROM expenses
       WHERE season_id = $1 AND voided_at IS NULL
       GROUP BY category`,
      [seasonId]
    ),
  ]);

  const expected = porConcepto.rows.reduce((s, x) => s + x.charged_cents, 0);
  const income = porConcepto.rows.reduce((s, x) => s + x.paid_cents, 0);
  const overdue = porConcepto.rows.reduce((s, x) => s + x.overdue_cents, 0);
  const egresos = gastos.rows.reduce((s, x) => s + x.amount_cents, 0);

  return {
    income_cents: income,
    expected_cents: expected,
    receivable_cents: Math.max(0, expected - income),
    overdue_cents: overdue,
    expenses_cents: egresos,
    net_cents: income - egresos,
    collection_rate: expected > 0 ? Math.round((income / expected) * 1000) / 10 : 0,
    by_concept: porConcepto.rows.map((x) => ({
      concept: x.concept,
      label: CONCEPTOS[x.concept as ConceptoCargo] ?? x.concept,
      charged_cents: x.charged_cents,
      paid_cents: x.paid_cents,
    })),
    by_expense_category: gastos.rows.map((x) => ({
      category: x.category,
      label: CATEGORIAS_GASTO[x.category as CategoriaGasto] ?? x.category,
      amount_cents: x.amount_cents,
    })),
  };
};

// ─────────────────────── GENERADORES DE CARGOS ────────────────────────────

export interface ResultadoGeneracion {
  created: number;
  skipped: number;
  amount_cents: number;
  total_cents: number;
  due_date: string;
  detail: { team_id: string; team_name: string; created: boolean; reason?: string }[];
}

/**
 * Genera el cargo de inscripción para todos los equipos activos.
 *
 * El vencimiento es el cierre de registro de la temporada; si no lo
 * tiene, la fecha de arranque. No se pide como parámetro porque ya está
 * en la base y dos copias de la misma fecha acaban contradiciéndose.
 *
 * Correrlo dos veces no cobra doble: el índice único lo impide y aquí se
 * cuenta como "ya tenía".
 */
export const generarCargosDeInscripcion = async (
  seasonId: string,
  userId: string
): Promise<ResultadoGeneracion> => {
  const reglas = await cargarReglasFinanzas(seasonId);
  if (reglas.inscription_cents <= 0) {
    throw new Error(
      'El monto de inscripción está en cero. Configúralo en los ajustes de la temporada antes de generar los cargos.'
    );
  }

  const t = await query(
    `SELECT to_char(COALESCE(registration_deadline, start_date), 'YYYY-MM-DD') AS vence
     FROM seasons WHERE id = $1`,
    [seasonId]
  );
  const vence = t.rows[0]?.vence;
  if (!vence) throw new Error('La temporada no tiene fecha de cierre de registro ni de arranque.');

  const equipos = await query(
    `SELECT id, name FROM teams WHERE season_id = $1 AND status = 'ACTIVE' ORDER BY name`,
    [seasonId]
  );

  const detail: ResultadoGeneracion['detail'] = [];
  let created = 0;
  let skipped = 0;

  for (const eq of equipos.rows) {
    const ya = await query(
      `SELECT 1 FROM fees
       WHERE season_id = $1 AND team_id = $2 AND concept = 'INSCRIPTION' AND cancelled_at IS NULL`,
      [seasonId, eq.id]
    );
    if (ya.rows.length > 0) {
      skipped++;
      detail.push({ team_id: eq.id, team_name: eq.name, created: false, reason: 'Ya tenía cargo' });
      continue;
    }
    await query(
      `INSERT INTO fees (id, season_id, team_id, concept, description, amount_cents, due_date, created_by)
       VALUES ($1, $2, $3, 'INSCRIPTION', $4, $5, $6, $7)`,
      [
        newPrefixedId('fee'),
        seasonId,
        eq.id,
        'Inscripción de temporada',
        reglas.inscription_cents,
        vence,
        userId,
      ]
    );
    created++;
    detail.push({ team_id: eq.id, team_name: eq.name, created: true });
  }

  return {
    created,
    skipped,
    amount_cents: reglas.inscription_cents,
    total_cents: created * reglas.inscription_cents,
    due_date: vence,
    detail,
  };
};

/**
 * Genera el cargo de arbitraje de una jornada, solo para los equipos que
 * JUEGAN esa noche.
 *
 * Los que descansan no pagan arbitraje: es el caso que un cobro manual
 * equivoca siempre, porque quien captura mira la lista de equipos y no
 * la de partidos.
 *
 * El vencimiento es la fecha de la jornada.
 */
export const generarCargosDeJornada = async (
  roundId: string,
  userId: string
): Promise<ResultadoGeneracion> => {
  const ro = await query(
    `SELECT id, season_id, number, to_char(scheduled_date, 'YYYY-MM-DD') AS fecha, status
     FROM rounds WHERE id = $1`,
    [roundId]
  );
  const round = ro.rows[0];
  if (!round) throw new Error('Jornada no encontrada');
  if (round.status === 'DRAFT') {
    throw new Error('La jornada está en borrador: publícala antes de cobrarla.');
  }

  const reglas = await cargarReglasFinanzas(round.season_id);
  if (reglas.round_fee_cents <= 0) {
    throw new Error(
      'El costo de arbitraje por jornada está en cero. Configúralo en los ajustes de la temporada.'
    );
  }

  const equipos = await query(
    `SELECT DISTINCT t.id, t.name
     FROM games g
     JOIN teams t ON t.id IN (g.home_team_id, g.away_team_id)
     WHERE g.round_id = $1 AND g.status <> 'CANCELLED'
     ORDER BY t.name`,
    [roundId]
  );

  const detail: ResultadoGeneracion['detail'] = [];
  let created = 0;
  let skipped = 0;

  for (const eq of equipos.rows) {
    const ya = await query(
      `SELECT 1 FROM fees
       WHERE round_id = $1 AND team_id = $2 AND concept = 'ROUND' AND cancelled_at IS NULL`,
      [roundId, eq.id]
    );
    if (ya.rows.length > 0) {
      skipped++;
      detail.push({ team_id: eq.id, team_name: eq.name, created: false, reason: 'Ya tenía cargo' });
      continue;
    }
    await query(
      `INSERT INTO fees (id, season_id, team_id, concept, description, amount_cents,
                         due_date, round_id, created_by)
       VALUES ($1, $2, $3, 'ROUND', $4, $5, $6, $7, $8)`,
      [
        newPrefixedId('fee'),
        round.season_id,
        eq.id,
        `Arbitraje jornada ${round.number}`,
        reglas.round_fee_cents,
        round.fecha,
        roundId,
        userId,
      ]
    );
    created++;
    detail.push({ team_id: eq.id, team_name: eq.name, created: true });
  }

  return {
    created,
    skipped,
    amount_cents: reglas.round_fee_cents,
    total_cents: created * reglas.round_fee_cents,
    due_date: round.fecha,
    detail,
  };
};

/**
 * Lo que ya se le pagó a cada árbitro, para no llevarlo en un cuaderno.
 * Sale de los gastos con categoría de arbitraje atados a un árbitro.
 */
export const pagosPorArbitro = async (seasonId: string) => {
  const r = await query(
    `SELECT rf.id, rf.name,
            COALESCE(SUM(e.amount_cents) FILTER (WHERE e.voided_at IS NULL), 0)::int AS paid_cents,
            COUNT(e.id) FILTER (WHERE e.voided_at IS NULL)::int AS payments_count,
            (SELECT COUNT(*)::int FROM game_referees gr
             JOIN games g ON g.id = gr.game_id
             JOIN rounds r2 ON r2.id = g.round_id
             WHERE gr.referee_id = rf.id AND r2.season_id = $1
               AND g.status IN ('FINISHED', 'WALKOVER')) AS games_worked
     FROM referees rf
     LEFT JOIN expenses e ON e.referee_id = rf.id AND e.season_id = $1
     WHERE rf.season_id = $1
     GROUP BY rf.id, rf.name
     ORDER BY rf.name`,
    [seasonId]
  );
  return r.rows;
};
