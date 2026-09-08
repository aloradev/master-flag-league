/** Orden de siembra estándar, con pases directos para las mejores semillas. */
export function seedSlots(ids: string[]): (string | null)[] {
  if (![3, 4, 6, 8, 10, 12].includes(ids.length) || new Set(ids).size !== ids.length) throw new Error('Selecciona 3, 4, 6, 8, 10 o 12 equipos distintos');
  const size = 2 ** Math.ceil(Math.log2(ids.length));
  let order = [1, 2];
  while (order.length < size) order = order.flatMap((n) => [n, order.length * 2 + 1 - n]);
  return order.map((n) => ids[n - 1] ?? null);
}

export function advanceSlots(slots: (string | null)[], games: { slot: number; status: string; home_team_id: string; away_team_id: string; home_score: number; away_score: number }[]): string[] {
  const next: string[] = [];
  for (let i = 0; i < slots.length; i += 2) {
    const [home, away] = slots.slice(i, i + 2);
    if (!home || !away) { if (home || away) next.push((home || away)!); else throw new Error('Llave vacía'); continue; }
    const g = games.find((g) => g.slot === i / 2);
    if (!g || !['FINISHED', 'WALKOVER'].includes(g.status)) throw new Error('Faltan partidos por terminar');
    if (g.home_team_id !== home || g.away_team_id !== away) throw new Error('Los equipos del partido no coinciden con la llave');
    if (g.home_score === g.away_score) throw new Error('Resuelve el empate en cancha antes de avanzar');
    next.push(g.home_score > g.away_score ? home : away);
  }
  return next;
}
