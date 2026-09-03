import type { Response } from 'express';
import { query } from '../config/database.js';
import { AppError, asyncHandler } from '../middleware/errorHandler.js';
import { audit } from '../services/audit.service.js';
import { newPrefixedId } from '../utils/id.js';
import { ROLES, type AuthRequest } from '../middleware/auth.js';
import {
  CATEGORIAS_GASTO,
  CONCEPTOS,
  METODOS,
  balanceDeTemporada,
  cargarReglasFinanzas,
  cargosConSaldo,
  estadosDeCuenta,
  generarCargosDeInscripcion,
  generarCargosDeJornada,
  pagosPorArbitro,
} from '../services/finance.service.js';

const puedeEscribir = (req: AuthRequest) =>
  [ROLES.SUPER_ADMIN, ROLES.FINANCE_ADMIN].includes((req.user?.role ?? '') as never);

const esAdmin = (req: AuthRequest) =>
  [ROLES.SUPER_ADMIN, ROLES.SPORTS_ADMIN, ROLES.FINANCE_ADMIN].includes(
    (req.user?.role ?? '') as never
  );

/**
 * Un encargado solo ve el dinero de SU equipo.
 *
 * Se devuelven los equipos que administra para filtrar con ellos, en
 * lugar de comprobar el rol y confiar en que el parámetro venga bien:
 * un `teamId` en la URL lo escribe quien quiera.
 */
const alcanceDeEquipos = (req: AuthRequest): string[] | undefined => {
  if (esAdmin(req)) return undefined;
  return req.managedTeamIds ?? [];
};

const exigirEscritura = (req: AuthRequest) => {
  if (!puedeEscribir(req)) {
    throw new AppError(
      'Solo el Super Administrador y el Administrador Financiero pueden mover dinero',
      403
    );
  }
};

/**
 * Convierte pesos a centavos enteros.
 *
 * Se acepta "2500", "2500.50" o 2500.5 y se redondea al centavo. El
 * redondeo va aquí, en la frontera, y no en la base de datos ni en la
 * pantalla: así solo hay un lugar donde el dinero deja de ser texto.
 */
const aCentavos = (valor: unknown, campo = 'amount'): number => {
  if (valor === null || valor === undefined || valor === '') {
    throw new AppError(`Falta ${campo}`, 400);
  }
  const n = typeof valor === 'number' ? valor : Number(String(valor).replace(/[$,\s]/g, ''));
  if (!Number.isFinite(n)) throw new AppError(`${campo} no es una cantidad válida`, 400);
  if (n <= 0) throw new AppError(`${campo} debe ser mayor que cero`, 400);
  const centavos = Math.round(n * 100);
  if (centavos > 2_000_000_000) throw new AppError(`${campo} es demasiado grande`, 400);
  return centavos;
};

// ─────────────────────────────── CATÁLOGOS ────────────────────────────────

/** GET /api/v1/finance/catalog */
export const getCatalog = asyncHandler(async (req: AuthRequest, res: Response) => {
  const seasonId = req.query.seasonId as string | undefined;
  const rules = seasonId ? await cargarReglasFinanzas(seasonId) : null;
  res.json({
    success: true,
    data: {
      concepts: CONCEPTOS,
      methods: METODOS,
      expense_categories: CATEGORIAS_GASTO,
      rules,
    },
  });
});

// ─────────────────────────────── CARGOS ───────────────────────────────────

/** GET /api/v1/finance/fees?seasonId=&teamId=&concept=&pending=1 */
export const listFees = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { seasonId, teamId, concept, pending } = req.query as Record<string, string>;
  const alcance = alcanceDeEquipos(req);

  if (alcance && alcance.length === 0) {
    return res.json({ success: true, data: [] });
  }
  if (alcance && teamId && !alcance.includes(teamId)) {
    throw new AppError('Ese equipo no es tuyo', 403);
  }

  const data = await cargosConSaldo({
    seasonId,
    teamId,
    teamIds: alcance,
    concept,
    soloPendientes: pending === '1' || pending === 'true',
  });
  res.json({ success: true, data });
});

/** POST /api/v1/finance/fees */
export const createFee = asyncHandler(async (req: AuthRequest, res: Response) => {
  exigirEscritura(req);
  const { teamId, concept, description, amount, dueDate } = req.body ?? {};

  if (!teamId || !concept || !dueDate) {
    throw new AppError('teamId, concept y dueDate son obligatorios', 400);
  }
  if (!Object.prototype.hasOwnProperty.call(CONCEPTOS, concept)) {
    throw new AppError(`Concepto inválido. Válidos: ${Object.keys(CONCEPTOS).join(', ')}`, 400);
  }
  const amountCents = aCentavos(amount, 'amount');

  const eq = await query(`SELECT season_id, name FROM teams WHERE id = $1`, [teamId]);
  if (!eq.rows[0]) throw new AppError('Equipo no encontrado', 404);

  const id = newPrefixedId('fee');
  try {
    await query(
      `INSERT INTO fees (id, season_id, team_id, concept, description, amount_cents, due_date, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [id, eq.rows[0].season_id, teamId, concept, description ?? null, amountCents, dueDate, req.user!.id]
    );
  } catch (e) {
    if ((e as Error).message?.includes('uq_fees_inscripcion')) {
      throw new AppError(`${eq.rows[0].name} ya tiene un cargo de inscripción vigente`, 409);
    }
    throw e;
  }

  await audit(req, {
    action: 'CREATE_FEE',
    entityType: 'fee',
    entityId: id,
    newValue: { teamId, concept, amountCents, dueDate },
  });

  const [cargo] = await cargosConSaldo({ teamId });
  res.status(201).json({
    success: true,
    data: (await cargosConSaldo({ teamId })).find((f) => f.id === id) ?? cargo,
  });
});

/**
 * POST /api/v1/finance/fees/:id/cancel
 *
 * Se cancela, no se borra, y solo si no tiene pagos: un cargo con dinero
 * aplicado que desaparece deja el pago huérfano y la cuenta sin cuadrar.
 */
export const cancelFee = asyncHandler(async (req: AuthRequest, res: Response) => {
  exigirEscritura(req);
  const { id } = req.params;
  const { reason } = req.body ?? {};

  const f = await query(`SELECT * FROM fees WHERE id = $1`, [id]);
  const cargo = f.rows[0];
  if (!cargo) throw new AppError('Cargo no encontrado', 404);
  if (cargo.cancelled_at) return res.json({ success: true, data: { id, already_cancelled: true } });

  const pagos = await query(
    `SELECT COALESCE(SUM(amount_cents), 0)::int AS total
     FROM payments WHERE fee_id = $1 AND voided_at IS NULL`,
    [id]
  );
  if (pagos.rows[0].total > 0) {
    throw new AppError(
      `Este cargo ya tiene ${(pagos.rows[0].total / 100).toFixed(2)} pagados. ` +
        `Anula primero los pagos si de verdad hay que cancelarlo.`,
      409
    );
  }

  await query(
    `UPDATE fees SET cancelled_at = NOW(), cancelled_by = $1, cancel_reason = $2, updated_at = NOW()
     WHERE id = $3`,
    [req.user!.id, reason ?? null, id]
  );

  await audit(req, {
    action: 'CANCEL_FEE',
    entityType: 'fee',
    entityId: id,
    oldValue: { amount_cents: cargo.amount_cents, concept: cargo.concept },
    newValue: { reason },
  });

  res.json({ success: true, data: { id, cancelled: true } });
});

/** POST /api/v1/finance/fees/generate-inscription */
export const generateInscriptionFees = asyncHandler(async (req: AuthRequest, res: Response) => {
  exigirEscritura(req);
  const seasonId = (req.body ?? {}).seasonId ?? req.query.seasonId;
  if (!seasonId) throw new AppError('Falta seasonId', 400);

  let resultado;
  try {
    resultado = await generarCargosDeInscripcion(String(seasonId), req.user!.id);
  } catch (e) {
    throw new AppError((e as Error).message, 400);
  }

  await audit(req, {
    action: 'GENERATE_INSCRIPTION_FEES',
    entityType: 'season',
    entityId: String(seasonId),
    newValue: { created: resultado.created, total_cents: resultado.total_cents },
  });

  res.json({ success: true, data: resultado });
});

/** POST /api/v1/finance/fees/generate-round/:roundId */
export const generateRoundFees = asyncHandler(async (req: AuthRequest, res: Response) => {
  exigirEscritura(req);
  const { roundId } = req.params;

  let resultado;
  try {
    resultado = await generarCargosDeJornada(roundId, req.user!.id);
  } catch (e) {
    throw new AppError((e as Error).message, 400);
  }

  await audit(req, {
    action: 'GENERATE_ROUND_FEES',
    entityType: 'round',
    entityId: roundId,
    newValue: { created: resultado.created, total_cents: resultado.total_cents },
  });

  res.json({ success: true, data: resultado });
});

// ─────────────────────────────── PAGOS ────────────────────────────────────

/** GET /api/v1/finance/payments?seasonId=&teamId=&feeId= */
export const listPayments = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { seasonId, teamId, feeId } = req.query as Record<string, string>;
  const alcance = alcanceDeEquipos(req);
  if (alcance && alcance.length === 0) return res.json({ success: true, data: [] });
  if (alcance && teamId && !alcance.includes(teamId)) {
    throw new AppError('Ese equipo no es tuyo', 403);
  }

  const r = await query(
    `SELECT p.id, p.season_id, p.team_id, p.fee_id, p.amount_cents,
            to_char(p.paid_on, 'YYYY-MM-DD') AS paid_on,
            p.method, p.reference, p.notes, p.voided_at, p.void_reason, p.created_at,
            t.name AS team_name, f.concept, f.description AS fee_description,
            u.name AS recorded_by_name
     FROM payments p
     JOIN teams t ON t.id = p.team_id
     JOIN fees f ON f.id = p.fee_id
     LEFT JOIN users u ON u.id = p.recorded_by
     WHERE ($1::text IS NULL OR p.season_id = $1)
       AND ($2::text IS NULL OR p.team_id = $2)
       AND ($3::text IS NULL OR p.fee_id = $3)
       AND ($4::text[] IS NULL OR p.team_id = ANY($4))
     ORDER BY p.paid_on DESC, p.created_at DESC`,
    [seasonId ?? null, teamId ?? null, feeId ?? null, alcance && alcance.length > 0 ? alcance : null]
  );

  res.json({
    success: true,
    data: r.rows.map((p) => ({
      ...p,
      concept_label: CONCEPTOS[p.concept as keyof typeof CONCEPTOS] ?? p.concept,
      method_label: METODOS[p.method as keyof typeof METODOS] ?? p.method,
    })),
  });
});

/**
 * POST /api/v1/finance/payments
 *
 * Se rechaza el pago que excede el saldo del cargo. Podría aceptarse y
 * dejarlo en negativo, pero un sobrepago casi siempre es un dedazo —un
 * cero de más— y descubrirlo al cerrar la temporada es peor que
 * corregirlo aquí. El mensaje dice cuánto falta de verdad.
 */
export const createPayment = asyncHandler(async (req: AuthRequest, res: Response) => {
  exigirEscritura(req);
  const { feeId, amount, paidOn, method, reference, notes } = req.body ?? {};
  if (!feeId) throw new AppError('Falta feeId: todo pago va contra un cargo', 400);
  const amountCents = aCentavos(amount, 'amount');

  if (method && !Object.prototype.hasOwnProperty.call(METODOS, method)) {
    throw new AppError(`Método inválido. Válidos: ${Object.keys(METODOS).join(', ')}`, 400);
  }

  const f = await query(
    `SELECT f.*, t.name AS team_name,
            COALESCE((SELECT SUM(p.amount_cents)::int FROM payments p
                      WHERE p.fee_id = f.id AND p.voided_at IS NULL), 0) AS pagado
     FROM fees f JOIN teams t ON t.id = f.team_id
     WHERE f.id = $1`,
    [feeId]
  );
  const cargo = f.rows[0];
  if (!cargo) throw new AppError('Cargo no encontrado', 404);
  if (cargo.cancelled_at) throw new AppError('Ese cargo está cancelado', 409);

  const saldo = cargo.amount_cents - cargo.pagado;
  if (saldo <= 0) {
    throw new AppError(`Ese cargo ya está pagado completo (${CONCEPTOS[cargo.concept as keyof typeof CONCEPTOS]})`, 409);
  }
  if (amountCents > saldo) {
    throw new AppError(
      `El pago excede el saldo. A ${cargo.team_name} le faltan ` +
        `$${(saldo / 100).toFixed(2)} de este cargo, no $${(amountCents / 100).toFixed(2)}.`,
      400
    );
  }

  const id = newPrefixedId('pay');
  await query(
    `INSERT INTO payments (id, season_id, team_id, fee_id, amount_cents, paid_on,
                           method, reference, notes, recorded_by)
     VALUES ($1, $2, $3, $4, $5, COALESCE($6::date, CURRENT_DATE), $7, $8, $9, $10)`,
    [
      id,
      cargo.season_id,
      cargo.team_id,
      feeId,
      amountCents,
      paidOn ?? null,
      method ?? 'CASH',
      reference ?? null,
      notes ?? null,
      req.user!.id,
    ]
  );

  await audit(req, {
    action: 'CREATE_PAYMENT',
    entityType: 'payment',
    entityId: id,
    newValue: { feeId, teamId: cargo.team_id, amountCents, method: method ?? 'CASH', reference },
  });

  const actualizado = (await cargosConSaldo({ teamId: cargo.team_id })).find((x) => x.id === feeId);
  res.status(201).json({
    success: true,
    data: { id, amount_cents: amountCents, fee: actualizado },
  });
});

/** POST /api/v1/finance/payments/:id/void */
export const voidPayment = asyncHandler(async (req: AuthRequest, res: Response) => {
  exigirEscritura(req);
  const { id } = req.params;
  const { reason } = req.body ?? {};
  if (!reason) {
    throw new AppError('Anular un pago exige un motivo: es dinero que alguien entregó', 400);
  }

  const p = await query(`SELECT * FROM payments WHERE id = $1`, [id]);
  const pago = p.rows[0];
  if (!pago) throw new AppError('Pago no encontrado', 404);
  if (pago.voided_at) return res.json({ success: true, data: { id, already_voided: true } });

  await query(
    `UPDATE payments SET voided_at = NOW(), voided_by = $1, void_reason = $2 WHERE id = $3`,
    [req.user!.id, reason, id]
  );

  await audit(req, {
    action: 'VOID_PAYMENT',
    entityType: 'payment',
    entityId: id,
    oldValue: { amount_cents: pago.amount_cents, team_id: pago.team_id },
    newValue: { reason },
  });

  const actualizado = (await cargosConSaldo({ teamId: pago.team_id })).find(
    (x) => x.id === pago.fee_id
  );
  res.json({ success: true, data: { id, voided: true, fee: actualizado } });
});

// ─────────────────────────────── GASTOS ───────────────────────────────────

/** GET /api/v1/finance/expenses?seasonId= */
export const listExpenses = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!esAdmin(req)) throw new AppError('Los gastos de la liga son de administración', 403);
  const { seasonId, category } = req.query as Record<string, string>;

  const r = await query(
    `SELECT e.id, e.season_id, e.category, e.description, e.amount_cents,
            to_char(e.spent_on, 'YYYY-MM-DD') AS spent_on,
            e.round_id, e.referee_id, e.voided_at, e.void_reason, e.created_at,
            ro.number AS round_number, rf.name AS referee_name, u.name AS recorded_by_name
     FROM expenses e
     LEFT JOIN rounds ro ON ro.id = e.round_id
     LEFT JOIN referees rf ON rf.id = e.referee_id
     LEFT JOIN users u ON u.id = e.recorded_by
     WHERE ($1::text IS NULL OR e.season_id = $1)
       AND ($2::text IS NULL OR e.category = $2)
     ORDER BY e.spent_on DESC, e.created_at DESC`,
    [seasonId ?? null, category ?? null]
  );

  res.json({
    success: true,
    data: r.rows.map((e) => ({
      ...e,
      category_label: CATEGORIAS_GASTO[e.category as keyof typeof CATEGORIAS_GASTO] ?? e.category,
    })),
  });
});

/** POST /api/v1/finance/expenses */
export const createExpense = asyncHandler(async (req: AuthRequest, res: Response) => {
  exigirEscritura(req);
  const { seasonId, category, description, amount, spentOn, roundId, refereeId } = req.body ?? {};

  if (!seasonId || !category || !description) {
    throw new AppError('seasonId, category y description son obligatorios', 400);
  }
  if (!Object.prototype.hasOwnProperty.call(CATEGORIAS_GASTO, category)) {
    throw new AppError(`Categoría inválida. Válidas: ${Object.keys(CATEGORIAS_GASTO).join(', ')}`, 400);
  }
  const amountCents = aCentavos(amount, 'amount');

  const id = newPrefixedId('exp');
  await query(
    `INSERT INTO expenses (id, season_id, category, description, amount_cents, spent_on,
                           round_id, referee_id, recorded_by)
     VALUES ($1, $2, $3, $4, $5, COALESCE($6::date, CURRENT_DATE), $7, $8, $9)`,
    [id, seasonId, category, description, amountCents, spentOn ?? null,
     roundId ?? null, refereeId ?? null, req.user!.id]
  );

  await audit(req, {
    action: 'CREATE_EXPENSE',
    entityType: 'expense',
    entityId: id,
    newValue: { category, amountCents, description, refereeId },
  });

  const r = await query(`SELECT * FROM expenses WHERE id = $1`, [id]);
  res.status(201).json({ success: true, data: r.rows[0] });
});

/** POST /api/v1/finance/expenses/:id/void */
export const voidExpense = asyncHandler(async (req: AuthRequest, res: Response) => {
  exigirEscritura(req);
  const { id } = req.params;
  const { reason } = req.body ?? {};
  if (!reason) throw new AppError('Anular un gasto exige un motivo', 400);

  const e = await query(`SELECT * FROM expenses WHERE id = $1`, [id]);
  if (!e.rows[0]) throw new AppError('Gasto no encontrado', 404);
  if (e.rows[0].voided_at) return res.json({ success: true, data: { id, already_voided: true } });

  await query(
    `UPDATE expenses SET voided_at = NOW(), voided_by = $1, void_reason = $2 WHERE id = $3`,
    [req.user!.id, reason, id]
  );
  await audit(req, {
    action: 'VOID_EXPENSE',
    entityType: 'expense',
    entityId: id,
    oldValue: { amount_cents: e.rows[0].amount_cents },
    newValue: { reason },
  });
  res.json({ success: true, data: { id, voided: true } });
});

// ────────────────────────── VISTAS AGREGADAS ──────────────────────────────

/**
 * GET /api/v1/finance/accounts?seasonId=
 *
 * Cuentas por cobrar. Es la pantalla que se abre para saber a quién hay
 * que llamar, así que se ordena por lo vencido y no por nombre.
 */
export const getAccounts = asyncHandler(async (req: AuthRequest, res: Response) => {
  const seasonId = req.query.seasonId as string | undefined;
  if (!seasonId) throw new AppError('Falta seasonId', 400);

  const alcance = alcanceDeEquipos(req);
  if (alcance && alcance.length === 0) return res.json({ success: true, data: [] });

  const cuentas = await estadosDeCuenta(seasonId, alcance);
  const ordenadas = esAdmin(req)
    ? [...cuentas].sort(
        (a, b) => b.overdue_cents - a.overdue_cents || b.balance_cents - a.balance_cents
      )
    : cuentas;
  res.json({ success: true, data: ordenadas });
});

/** GET /api/v1/finance/teams/:teamId/statement?seasonId= */
export const getTeamStatement = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { teamId } = req.params;
  const alcance = alcanceDeEquipos(req);
  if (alcance && !alcance.includes(teamId)) throw new AppError('Ese equipo no es tuyo', 403);

  const eq = await query(
    `SELECT t.id, t.name, t.short_name, t.logo_url, t.season_id, c.name AS category_name
     FROM teams t JOIN categories c ON c.id = t.category_id WHERE t.id = $1`,
    [teamId]
  );
  const equipo = eq.rows[0];
  if (!equipo) throw new AppError('Equipo no encontrado', 404);

  const [cargos, cuentas, pagos] = await Promise.all([
    cargosConSaldo({ teamId }),
    estadosDeCuenta(equipo.season_id, [teamId]),
    query(
      `SELECT p.id, p.fee_id, p.amount_cents, to_char(p.paid_on, 'YYYY-MM-DD') AS paid_on,
              p.method, p.reference, p.voided_at, u.name AS recorded_by_name
       FROM payments p LEFT JOIN users u ON u.id = p.recorded_by
       WHERE p.team_id = $1 ORDER BY p.paid_on DESC, p.created_at DESC`,
      [teamId]
    ),
  ]);

  res.json({
    success: true,
    data: {
      team: equipo,
      summary: cuentas[0] ?? null,
      fees: cargos,
      payments: pagos.rows.map((p) => ({
        ...p,
        method_label: METODOS[p.method as keyof typeof METODOS] ?? p.method,
      })),
    },
  });
});

/** GET /api/v1/finance/balance?seasonId= */
export const getBalance = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!esAdmin(req)) throw new AppError('El balance de la liga es de administración', 403);
  const seasonId = req.query.seasonId as string | undefined;
  if (!seasonId) throw new AppError('Falta seasonId', 400);

  const [balance, arbitros] = await Promise.all([
    balanceDeTemporada(seasonId),
    pagosPorArbitro(seasonId),
  ]);
  res.json({ success: true, data: { ...balance, referees: arbitros } });
});
