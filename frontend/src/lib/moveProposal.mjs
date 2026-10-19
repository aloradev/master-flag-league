/** Move to an empty slot, or swap the two fixtures atomically. */
export function moveProposal(games, index, target, slots, earliest = {}, clubReservations = []) {
  if (!Number.isInteger(index) || !games[index]) throw new Error('Selecciona el encuentro que quieres mover.');
  if (!slots.some(s=>s.fieldId===target.fieldId && s.time===target.time)) throw new Error('Ese campo y horario no están disponibles.');
  const source=games[index];
  const occupied=games.findIndex((g,i)=>i!==index && g.fieldId===target.fieldId && g.time===target.time);
  if (occupied>=0 && (!source.fieldId || !source.time)) throw new Error('Primero mueve este encuentro a un espacio libre.');
  const result=games.map((game,i)=>i===index ? {...game,...target} : i===occupied
    ? {...game,fieldId:source.fieldId,fieldName:source.fieldName,time:source.time} : game);
  const teams=new Set(), fields=new Set();
  const clubs=[...clubReservations];
  const clubKey=name=>name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  const isMixed=game=>game.mixed ?? /(^| )(mixto|mixta|mixed)( |$)/.test(clubKey(game.categoryName ?? game.categoryId));
  for (const game of result) {
    if (!game.time || !game.fieldId) continue;
    const slot=`${game.fieldId}|${game.time}`;
    if (fields.has(slot)) throw new Error('Ese campo ya tiene un encuentro a esa hora.');
    fields.add(slot);
    const gameClubs=[game.homeClub ?? clubKey(game.homeTeamName),game.awayClub ?? clubKey(game.awayTeamName)];
    if (clubs.some(r=>r.time===game.time && r.categoryId!==game.categoryId && (isMixed(game) || r.mixed || /(^| )(mixto|mixta|mixed)( |$)/.test(clubKey(r.categoryId))) && gameClubs.includes(r.club)))
      throw new Error('El mixto no puede coincidir con varonil o femenil del mismo club. El cambio no se aplicó.');
    clubs.push(...gameClubs.map(club=>({club,categoryId:game.categoryId,time:game.time,mixed:isMixed(game)})));
    for (const [id,name] of [[game.homeTeamId,game.homeTeamName],[game.awayTeamId,game.awayTeamName]]) {
      if (game.time < (earliest[id] ?? '')) throw new Error(`${name} está disponible desde las ${earliest[id]}.`);
      const key=`${id}|${game.time}`;
      if (teams.has(key)) throw new Error(`${name} ya tiene otro encuentro a esa hora. El cambio no se aplicó.`);
      teams.add(key);
    }
  }
  return result;
}
