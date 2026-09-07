import { query } from '../config/database.js';

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
  const addWeeks = (date: string, weeks: number) => {
    const d = new Date(`${date}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + weeks * 7);
    return d.toISOString().slice(0, 10);
  };
  let end = addWeeks(row.start, count - 1);
  for (const round of row.rounds) {
    const candidate = addWeeks(round.date, Math.max(0, count - round.number));
    if (candidate > end) end = candidate;
  }
  return end;
}
