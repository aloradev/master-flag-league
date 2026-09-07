import { query } from '../config/database.js';

const addWeeks = (date: string, weeks: number) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + weeks * 7);
  return d.toISOString().slice(0, 10);
};

/** Proyección de fase regular. Incluye jornadas reprogramadas; excluye pruebas y playoffs. */
export async function regularSeasonEnd(seasonId: string): Promise<string | null> {
  const result = await query(`SELECT to_char(s.start_date,'YYYY-MM-DD') AS start,
    st.value->>'rounds_planned' AS planned,
    COALESCE((SELECT json_agg(json_build_object('date',to_char(r.scheduled_date,'YYYY-MM-DD'),'number',r.number))
      FROM rounds r WHERE r.season_id=s.id AND r.round_type='OFFICIAL'
      AND r.playoff_id IS NULL AND r.status <> 'CANCELLED'),'[]') AS rounds
    FROM seasons s LEFT JOIN settings st ON st.season_id=s.id AND st.key='competition'
    WHERE s.id=$1`, [seasonId]);
  const row = result.rows[0];
  const count = Number(row?.planned);
  if (!row || !Number.isInteger(count) || count < 1 || count > 104) return null;
  let end = addWeeks(row.start, count - 1);
  for (const round of row.rounds) {
    const candidate = addWeeks(round.date, Math.max(0, count - round.number));
    if (candidate > end) end = candidate;
  }
  return end;
}

/** Una fase semanal por categoría. Las fechas programadas prevalecen sobre la proyección. */
export async function seasonFinalEstimate(seasonId: string) {
  const regularEnd = await regularSeasonEnd(seasonId);
  const result = await query(`SELECT p.id, c.name AS category_name, p.seeds,
    COALESCE((SELECT json_agg(json_build_object('stage', pg.stage,
      'date', to_char(r.scheduled_date,'YYYY-MM-DD')))
      FROM playoff_games pg JOIN games g ON g.id=pg.game_id
      JOIN rounds r ON r.id=g.round_id WHERE pg.playoff_id=p.id
      AND r.status <> 'CANCELLED' AND g.status <> 'CANCELLED'),'[]') AS games
    FROM playoffs p JOIN categories c ON c.id=p.category_id WHERE p.season_id=$1`, [seasonId]);
  const categories = result.rows.map((p) => {
    const phases = Math.ceil(Math.log2(p.seeds.length));
    let finalDate = regularEnd ? addWeeks(regularEnd, phases) : null;
    for (const game of p.games) {
      const candidate = addWeeks(game.date, Math.max(0, phases - game.stage));
      if (!finalDate || candidate > finalDate) finalDate = candidate;
    }
    const scheduledFinals = p.games.filter((g: { stage: number }) => g.stage === phases)
      .map((g: { date: string }) => g.date).sort();
    if (scheduledFinals.length) finalDate = scheduledFinals.at(-1);
    return { category: p.category_name, phases, final_date: finalDate };
  });
  const dates = categories.map((c) => c.final_date).filter((d): d is string => Boolean(d));
  return { regular_end: regularEnd, final_date: dates.length ? dates.sort().at(-1)! : null,
    categories, assumption: 'Una fase por semana; sujeto a disponibilidad de campos y reprogramaciones.' };
}
