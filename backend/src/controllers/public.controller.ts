import type { Request, Response } from 'express';
import { query } from '../config/database.js';
import { AppError, asyncHandler } from '../middleware/errorHandler.js';
import { calcularPosiciones } from '../services/competition.service.js';

/**
 * LO QUE SE PUEDE VER SIN SESIÓN.
 *
 * Existe en lugar del aviso por WhatsApp Business API. La API de Meta
 * cobra por mensaje y exige un negocio legalmente constituido con
 * Constancia de Situación Fiscal; los encargados, en cambio, ya están en
 * un grupo de WhatsApp. Lo que faltaba no era un canal nuevo sino algo
 * que pegar en el grupo que ya existe: un enlace que siempre muestre lo
 * vigente. Si cambia un horario, el enlace ya está actualizado y no hay
 * que avisar otra vez.
 *
 * Estos controladores NO reutilizan los autenticados a propósito. Los de
 * administración usan `ro.*` y traen notas internas, quién generó la
 * jornada y los árbitros asignados. Aquí las columnas se enumeran una por
 * una, así que una columna nueva en `rounds` o en `games` no se publica
 * sola: hay que decidirlo.
 *
 * Nada de esto expone jugadores, documentos, finanzas ni nombres de
 * árbitros.
 */

/** Solo lo que hace falta para leer un partido en la calle. */
const COLUMNAS_PARTIDO = `
  g.id, g.category_id, to_char(g.scheduled_time, 'HH24:MI') AS scheduled_time,
  g.status, g.home_score, g.away_score, g.walkover_team_id,
  g.home_team_id, g.away_team_id
`;

const partidos = async (roundId: string) => {
  const r = await query(
    `SELECT ${COLUMNAS_PARTIDO},
            c.name AS category_name, c.color AS category_color,
            f.name AS field_name,
            hl.name AS home_team_name, hl.short_name AS home_short_name,
            hl.logo_url AS home_logo_url, hl.color_primary AS home_color,
            aw.name AS away_team_name, aw.short_name AS away_short_name,
            aw.logo_url AS away_logo_url, aw.color_primary AS away_color
     FROM games g
     JOIN categories c ON c.id = g.category_id
     JOIN teams hl ON hl.id = g.home_team_id
     JOIN teams aw ON aw.id = g.away_team_id
     LEFT JOIN fields f ON f.id = g.field_id
     WHERE g.round_id = $1 AND g.status <> 'CANCELLED'
     ORDER BY g.scheduled_time, f.name, c.sort_order`,
    [roundId]
  );
  return r.rows;
};

const descansos = async (roundId: string) => {
  const r = await query(
    `SELECT rb.team_id, t.name AS team_name, t.short_name, t.logo_url,
            c.name AS category_name
     FROM round_byes rb
     JOIN teams t ON t.id = rb.team_id
     JOIN categories c ON c.id = t.category_id
     WHERE rb.round_id = $1
     ORDER BY c.sort_order, t.name`,
    [roundId]
  );
  return r.rows;
};

/** La temporada vigente. Sin ella no hay nada público que mostrar. */
const temporadaActiva = async () => {
  const r = await query<{ id: string; name: string; year: number }>(
    `SELECT id, name, year FROM seasons WHERE status = 'ACTIVE'
     ORDER BY year DESC, start_date DESC LIMIT 1`
  );
  return r.rows[0] ?? null;
};

/**
 * GET /api/v1/public/round        — la jornada vigente
 * GET /api/v1/public/round/:id    — una en concreto
 *
 * Sin id se elige sola, y ese es el punto: el enlace se pega UNA vez en
 * el grupo y sirve toda la temporada. Se prefiere la jornada en curso o
 * la más próxima sin terminar; si ya terminaron todas, la última.
 */
export const getPublicRound = asyncHandler(async (req: Request, res: Response) => {
  const id = (req.params as Record<string, string>).id;
  const temporada = await temporadaActiva();
  if (!temporada) throw new AppError('Todavía no hay una temporada activa', 404);

  const r = await query(
    `SELECT ro.id, ro.number, ro.name, ro.scheduled_date, ro.status, ro.published_at
     FROM rounds ro
     WHERE ro.season_id = $1
       AND ro.status IN ('PUBLISHED', 'IN_PROGRESS', 'FINISHED')
       AND ($2::text IS NULL OR ro.id = $2)
     ORDER BY
       -- En curso primero; después la más próxima sin terminar; al final,
       -- si ya se jugó todo, la última.
       CASE ro.status WHEN 'IN_PROGRESS' THEN 0 WHEN 'PUBLISHED' THEN 1 ELSE 2 END,
       CASE WHEN ro.status = 'FINISHED' THEN ro.scheduled_date END DESC,
       ro.scheduled_date ASC
     LIMIT 1`,
    [temporada.id, id ?? null]
  );

  const jornada = r.rows[0];
  if (!jornada) throw new AppError('Jornada no encontrada', 404);

  const [juegos, libres] = await Promise.all([partidos(jornada.id), descansos(jornada.id)]);

  res.json({
    success: true,
    data: {
      season: temporada,
      round: jornada,
      games: juegos,
      byes: libres,
    },
  });
});

/**
 * GET /api/v1/public/rounds — el calendario publicado, para navegar.
 */
export const listPublicRounds = asyncHandler(async (_req: Request, res: Response) => {
  const temporada = await temporadaActiva();
  if (!temporada) throw new AppError('Todavía no hay una temporada activa', 404);

  const r = await query(
    `SELECT ro.id, ro.number, ro.name, ro.scheduled_date, ro.status
     FROM rounds ro
     WHERE ro.season_id = $1 AND ro.status IN ('PUBLISHED', 'IN_PROGRESS', 'FINISHED')
     ORDER BY ro.number ASC`,
    [temporada.id]
  );

  res.json({ success: true, data: { season: temporada, rounds: r.rows } });
});

/**
 * GET /api/v1/public/standings — la tabla, agrupada por categoría.
 *
 * Se calcula, nunca se guarda: una tabla almacenada se desincroniza del
 * primer partido que se corrige.
 */
export const getPublicStandings = asyncHandler(async (_req: Request, res: Response) => {
  const temporada = await temporadaActiva();
  if (!temporada) throw new AppError('Todavía no hay una temporada activa', 404);

  const filas = await calcularPosiciones(temporada.id);

  const categorias = await query<{ id: string; name: string; color: string | null }>(
    `SELECT id, name, color FROM categories WHERE season_id = $1 ORDER BY sort_order, name`,
    [temporada.id]
  );

  res.json({
    success: true,
    data: {
      season: temporada,
      categories: categorias.rows.map((c) => ({
        category: { id: c.id, name: c.name, color: c.color },
        rows: filas
          .filter((f) => f.category_id === c.id)
          .map((f, i) => ({ ...f, position: i + 1 })),
      })),
    },
  });
});
