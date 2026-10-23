/**
 * GENERADOR DE ENFRENTAMIENTOS
 *
 * Módulo puro: no toca la base ni el reloj. Recibe los equipos, la
 * capacidad de la noche y el historial; devuelve una propuesta. Así se
 * puede probar con 2, 3, 17 equipos sin levantar nada.
 *
 * No genera el calendario completo de la temporada, sino la PRÓXIMA
 * jornada a partir de lo ya jugado. Es más trabajo que calcular un
 * round-robin de una sola vez, pero es lo que aguanta la realidad: un
 * equipo que se inscribe en la jornada 4, uno que se va, un partido
 * pospuesto. Un calendario fijo se rompe con el primer cambio.
 */

export interface EquipoRef {
  clubName?: string | null;
  id: string;
  name: string;
}

export interface CategoriaEntrada {
  mixed?: boolean;
  id: string;
  name: string;
  teams: EquipoRef[];
}

export interface Historial {
  /** Veces que un par ya se enfrentó, con clave `pairKey`. */
  vecesEnfrentados: Record<string, number>;
  /** Descansos acumulados por equipo. */
  descansos: Record<string, number>;
  /** Partidos como local y como visitante, por equipo. */
  comoLocal: Record<string, number>;
  comoVisitante: Record<string, number>;
  /** Veces que el equipo jugó en cada horario: `equipo -> "19:00" -> n`. */
  porHorario: Record<string, Record<string, number>>;
  /** Veces que el equipo jugó en cada campo. */
  porCampo: Record<string, Record<string, number>>;
}

export interface EntradaPropuesta {
  roundRobinLegs?: 1 | 2;
  clubReservations?: ClubReservation[];
  firstLegPendingCategoryIds?: string[];
  recoveryDeficits?: Record<string, number>;
  previousGames?: PartidoPropuesto[];
  earliestTimes?: Record<string, string>;
  roundNumber: number;
  scheduledDate: string;
  categories: CategoriaEntrada[];
  fields: EquipoRef[];
  /** Horarios de ESTA jornada, en formato "HH:MM". Varían entre jornadas. */
  slots: string[];
  fieldSlots?: Record<string, string[]>;
  history: Historial;
}

export type MotivoDescanso = 'ODD_TEAMS' | 'CAPACITY' | 'MANUAL' | 'FIRST_LEG';

export interface PartidoPropuesto {
  mixed?: boolean;
  homeClub?: string;
  awayClub?: string;
  postponedGameId?: string;
  recovery?: boolean;
  categoryId: string;
  categoryName: string;
  homeTeamId: string;
  homeTeamName: string;
  awayTeamId: string;
  awayTeamName: string;
  fieldId: string | null;
  fieldName: string | null;
  time: string | null;
  /** Vuelta de este enfrentamiento: 1 la primera vez que se ven. */
  meeting: number;
}

export interface DescansoPropuesto {
  teamId: string;
  teamName: string;
  categoryId: string;
  categoryName: string;
  reason: MotivoDescanso;
  /** Descansos que acumulará el equipo contando este. */
  totalAfter: number;
}

export interface Propuesta {
  clubReservations?: ClubReservation[];
  availableSlots?: {fieldId:string;fieldName:string;time:string}[];
  recoveries?: { teamId: string; teamName: string; pending: number; scheduled: number }[];
  manual?: boolean;
  roundNumber: number;
  scheduledDate: string;
  capacity: number;
  games: PartidoPropuesto[];
  byes: DescansoPropuesto[];
  warnings: string[];
}

/** Clave estable de un par, sin importar el orden en que llegue. */
export const pairKey = (a: string, b: string): string =>
  a < b ? `${a}|${b}` : `${b}|${a}`;

export interface ClubReservation { club:string; categoryId:string; time:string; mixed?:boolean }
export const clubKey = (name:string) => name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
export const isMixedCategory = (name:string) => /(^| )(mixto|mixta|mixed)( |$)/.test(clubKey(name));
export const hasClubConflict = (clubs:string[],categoryId:string,time:string,reservations:ClubReservation[],mixed=false) =>
  reservations.some(r=>r.time===time && r.categoryId!==categoryId && (mixed || r.mixed) && clubs.includes(r.club));

export const historialVacio = (): Historial => ({
  vecesEnfrentados: {},
  descansos: {},
  comoLocal: {},
  comoVisitante: {},
  porHorario: {},
  porCampo: {},
});

const cuenta = (mapa: Record<string, number>, clave: string): number => mapa[clave] ?? 0;

/**
 * Emparejamiento de peso máximo por programación dinámica sobre máscaras
 * de bits.
 *
 * Se podría emparejar de forma voraz —ordenar y tomar de arriba— y sería
 * mucho más corto, pero un voraz deja descansos evitables: con 6 equipos
 * puede formar 2 partidos donde sí caben 3, y a un equipo se le explica
 * mal que descansó porque el algoritmo eligió mal. Este devuelve el
 * máximo demostrable.
 *
 * El coste es 2^n estados. Con 20 equipos en una categoría son un millón,
 * que se recorre en milisegundos; por encima de eso ninguna noche tendría
 * campos para acomodarlos, así que se corta y se avisa.
 */
export const LIMITE_EQUIPOS_POR_CATEGORIA = 20;

const emparejar = (
  teams: string[],
  permitido: (a: string, b: string) => boolean,
  peso: (a: string, b: string) => number,
  maxPairs = Infinity
): { pares: [string, string][]; libres: string[] } => {
  const n = teams.length;
  if (n < 2) return { pares: [], libres: [...teams] };

  const total = 1 << n;
  // Un partido vale más que cualquier suma de preferencias, así que
  // primero se maximiza la cantidad de partidos y solo después la calidad.
  const VALOR_PARTIDO = 1_000_000;

  const mejor = new Float64Array(total).fill(Number.NEGATIVE_INFINITY);
  const desde = new Int32Array(total).fill(-1);
  const conQuien = new Int32Array(total).fill(-1);
  const pairCounts = new Int32Array(total);
  mejor[0] = 0;

  for (let mask = 0; mask < total; mask++) {
    if (mejor[mask] === Number.NEGATIVE_INFINITY) continue;

    // Se resuelve siempre el primer equipo libre: evita explorar el mismo
    // emparejamiento en distintos órdenes.
    let i = 0;
    while (i < n && mask & (1 << i)) i++;
    if (i === n) continue;

    const dejarLibre = mask | (1 << i);
    if (mejor[mask] > mejor[dejarLibre]) {
      mejor[dejarLibre] = mejor[mask];
      desde[dejarLibre] = mask;
      conQuien[dejarLibre] = -1;
      pairCounts[dejarLibre] = pairCounts[mask];
    }

    for (let j = i + 1; j < n; j++) {
      if (pairCounts[mask] >= maxPairs) break;
      if (mask & (1 << j)) continue;
      if (!permitido(teams[i], teams[j])) continue;
      const siguiente = mask | (1 << i) | (1 << j);
      const valor = mejor[mask] + VALOR_PARTIDO + peso(teams[i], teams[j]);
      if (valor > mejor[siguiente]) {
        mejor[siguiente] = valor;
        desde[siguiente] = mask;
        conQuien[siguiente] = j;
        pairCounts[siguiente] = pairCounts[mask]+1;
      }
    }
  }

  const pares: [string, string][] = [];
  const libres: string[] = [];
  let mask = total - 1;
  while (mask > 0) {
    const anterior = desde[mask];
    if (anterior < 0) break;
    const j = conQuien[mask];
    const cambiados = mask ^ anterior;
    // El bit más bajo que cambió es el equipo que se estaba resolviendo.
    const i = 31 - Math.clz32(cambiados & -cambiados);
    if (j < 0) libres.push(teams[i]);
    else pares.push([teams[i], teams[j]]);
    mask = anterior;
  }

  return { pares: pares.reverse(), libres: libres.reverse() };
};

/**
 * Decide quién es local. Gana el puesto quien ha sido local menos veces;
 * si van iguales, quien ha sido visitante más veces. Sin esto un equipo
 * puede terminar la temporada siendo siempre visitante por puro azar del
 * orden en que se generaron las jornadas.
 */
const orientar = (
  a: string,
  b: string,
  h: Historial
): { home: string; away: string } => {
  const localA = cuenta(h.comoLocal, a);
  const localB = cuenta(h.comoLocal, b);
  if (localA !== localB) return localA < localB ? { home: a, away: b } : { home: b, away: a };
  const visA = cuenta(h.comoVisitante, a);
  const visB = cuenta(h.comoVisitante, b);
  if (visA !== visB) return visA > visB ? { home: a, away: b } : { home: b, away: a };
  return { home: a, away: b };
};

/**
 * Empareja una categoría.
 *
 * Mientras falten cruces de primera vuelta en la categoría, solo admite
 * rivales nuevos, incluso si algunos equipos quedan sin cruce disponible.
 * Después busca llenar la jornada con el menor número de repeticiones.
 */
const emparejarCategoria = (
  cat: CategoriaEntrada,
  h: Historial,
  deficits: Record<string, number> = {},
  spareCapacity = false,
  firstLegPending = false,
  capacity = Infinity,
  maxMeetings = Infinity
): { pares: [string, string][]; libres: string[]; encuentroMinimo: number } => {
  const ids = cat.teams.map((t) => t.id);
  if (ids.length < 2) return { pares: [], libres: ids, encuentroMinimo: 0 };

  const vistos = (a: string, b: string) => cuenta(h.vecesEnfrentados, pairKey(a, b));

  let minimo = Infinity;
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) minimo = Math.min(minimo, vistos(ids[i], ids[j]));
  }
  if (!Number.isFinite(minimo)) minimo = 0;

  const peso = (a: string, b: string) =>
    Math.min(100, (deficits[a] ?? 0) + (deficits[b] ?? 0)) * 1000 +
    // Leave the pair of trailing teams available for an extra fixture.
    (spareCapacity ? -1 : 1) * Math.min(deficits[a] ?? 0, deficits[b] ?? 0) * 50 +
    // Preferir a quien más ha descansado: así el descanso rota en lugar
    // de caerle siempre al mismo.
    (cuenta(h.descansos, a) + cuenta(h.descansos, b)) * 100 -
    // Y, a igualdad, al par que menos veces se ha visto.
    vistos(a, b) * 10;

  const maximoPosible = Math.floor(ids.length / 2);

  if (firstLegPending) {
    const {pares,libres}=emparejar(ids,(a,b)=>vistos(a,b)===0,peso,capacity);
    return {pares,libres,encuentroMinimo:0};
  }

  // Se prueba con el mínimo y se amplía solo si no alcanza para llenar
  // la noche. Ampliar antes de tiempo repetiría rivales sin necesidad.
  for (let techo = minimo; techo <= minimo + ids.length; techo++) {
    const { pares, libres } = emparejar(
      ids,
      (a, b) => vistos(a, b) <= techo && vistos(a, b) < maxMeetings,
      peso
    );
    if (pares.length === maximoPosible || techo === minimo + ids.length) {
      return { pares, libres, encuentroMinimo: techo };
    }
  }
  return { pares: [], libres: ids, encuentroMinimo: minimo };
};

/**
 * Reparte los partidos entre campo y horario.
 *
 * Cada partido va al hueco que menos repite lo que a esos dos equipos ya
 * les tocó: si un equipo lleva tres jornadas cerrando la noche, se le
 * cede el primer horario. Es la diferencia entre un calendario correcto y
 * uno que además nadie siente injusto.
 */
const repartirHuecos = (
  partidos: { home: string; away: string; categoryId:string; clubs:string[]; mixed:boolean }[],
  fields: EquipoRef[],
  slots: string[],
  h: Historial,
  earliestTimes: Record<string, string> = {},
  fieldSlots: Record<string, string[]> = {},
  previousGames: PartidoPropuesto[] = [],
  clubReservations:ClubReservation[] = []
): ({ fieldId: string; fieldName: string; time: string } | null)[] => {
  const huecos: { fieldId: string; fieldName: string; time: string }[] = [];
  for (const time of slots) {
    for (const f of fields) if (!fieldSlots[f.id] || fieldSlots[f.id].includes(time)) huecos.push({ fieldId: f.id, fieldName: f.name, time });
  }

  const libres = new Set(huecos.map((_, i) => i));
  const asignado: ({ fieldId: string; fieldName: string; time: string } | null)[] = [];
  const reserved=[...clubReservations];

  const veces = (mapa: Record<string, Record<string, number>>, equipo: string, clave: string) =>
    mapa[equipo]?.[clave] ?? 0;

  for (const p of partidos) {
    let elegido = -1;
    let mejorCoste = Infinity;
    let mejorRepeticion = Infinity;
    const anterior = previousGames.find(g => pairKey(g.homeTeamId, g.awayTeamId) === pairKey(p.home, p.away));
    for (const idx of libres) {
      const hueco = huecos[idx];
      if (hueco.time < (earliestTimes[p.home] ?? '') || hueco.time < (earliestTimes[p.away] ?? '')) continue;
      if (hasClubConflict(p.clubs,p.categoryId,hueco.time,reserved,p.mixed)) continue;
      const horarioHome = veces(h.porHorario, p.home, hueco.time);
      const horarioAway = veces(h.porHorario, p.away, hueco.time);
      const campoHome = veces(h.porCampo, p.home, hueco.fieldId);
      const campoAway = veces(h.porCampo, p.away, hueco.fieldId);
      const coste =
        // Repetir horario se siente más que repetir campo: no es lo
        // mismo alternar cancha que cerrar la noche tres jornadas seguidas.
        (horarioHome * horarioHome + horarioAway * horarioAway) * 4 +
        campoHome * campoHome +
        campoAway * campoAway;
      // A igualdad de coste gana el hueco más temprano, que es el orden
      // natural en que se llena una noche.
      const repeticion = anterior ? Number(anterior.time === hueco.time) * 2 +
        Number(anterior.time === hueco.time && anterior.fieldId === hueco.fieldId) : 0;
      if (repeticion < mejorRepeticion || (repeticion === mejorRepeticion && coste < mejorCoste)) {
        mejorRepeticion = repeticion;
        mejorCoste = coste;
        elegido = idx;
      }
    }
    if (elegido < 0) {
      asignado.push(null);
      continue;
    }
    libres.delete(elegido);
    asignado.push(huecos[elegido]);
    reserved.push(...p.clubs.map(club=>({club,categoryId:p.categoryId,time:huecos[elegido].time,mixed:p.mixed})));
  }

  return asignado;
};

export const proponerJornada = (entrada: EntradaPropuesta): Propuesta => {
  const { categories, fields, slots, history: h } = entrada;
  const capacidad = fields.reduce((n, f) => n + slots.filter(t => !entrada.fieldSlots?.[f.id] || entrada.fieldSlots[f.id].includes(t)).length, 0);
  const warnings: string[] = [];
  const firstLeg = new Set(entrada.firstLegPendingCategoryIds ?? categories.filter(cat=>
    cat.teams.some((a,i)=>cat.teams.slice(i+1).some(b=>cuenta(h.vecesEnfrentados,pairKey(a.id,b.id))===0))).map(c=>c.id));

  const nombre = new Map<string, string>();
  const clubs = new Map<string,string>();
  const categoriaDe = new Map<string, CategoriaEntrada>();
  for (const cat of categories) {
    for (const t of cat.teams) {
      nombre.set(t.id, t.name);
      clubs.set(t.id,clubKey(t.clubName?.trim() || t.name));
      categoriaDe.set(t.id, cat);
    }
  }

  interface Candidato {
    cat: CategoriaEntrada;
    home: string;
    away: string;
    meeting: number;
  }

  const candidatos: Candidato[] = [];
  const descansos: DescansoPropuesto[] = [];

  for (const cat of categories) {
    if (cat.teams.length > LIMITE_EQUIPOS_POR_CATEGORIA) {
      warnings.push(
        `${cat.name} tiene ${cat.teams.length} equipos y el generador admite hasta ` +
          `${LIMITE_EQUIPOS_POR_CATEGORIA}. Conviene dividirla en dos grupos.`
      );
      continue;
    }
    if (cat.teams.length === 0) continue;
    if (cat.teams.length === 1) {
      const solo = cat.teams[0];
      descansos.push({
        teamId: solo.id,
        teamName: solo.name,
        categoryId: cat.id,
        categoryName: cat.name,
        reason: firstLeg.has(cat.id) ? 'FIRST_LEG' : 'ODD_TEAMS',
        totalAfter: cuenta(h.descansos, solo.id) + 1,
      });
      warnings.push(`${cat.name} tiene un solo equipo: no hay con quién emparejarlo.`);
      continue;
    }

    const { pares, libres } = emparejarCategoria(cat, h, entrada.recoveryDeficits,
      capacidad > categories.reduce((sum,c)=>sum+Math.floor(c.teams.length/2),0),firstLeg.has(cat.id),capacidad,entrada.roundRobinLegs);

    for (const [a, b] of pares) {
      const { home, away } = orientar(a, b, h);
      candidatos.push({
        cat,
        home,
        away,
        meeting: cuenta(h.vecesEnfrentados, pairKey(a, b)) + 1,
      });
    }
    for (const id of libres) {
      descansos.push({
        teamId: id,
        teamName: nombre.get(id) ?? id,
        categoryId: cat.id,
        categoryName: cat.name,
        reason: firstLeg.has(cat.id) && pares.length<Math.floor(cat.teams.length/2) ? 'FIRST_LEG' : 'ODD_TEAMS',
        totalAfter: cuenta(h.descansos, id) + 1,
      });
    }
    if (cat.teams.length % 2 === 1) {
      warnings.push(
        `${cat.name} tiene ${cat.teams.length} equipos (impar): uno descansa cada jornada.`
      );
    }
    if (firstLeg.has(cat.id) && pares.length<Math.floor(cat.teams.length/2)) warnings.push(`${cat.name}: se prioriza cerrar la primera vuelta. No se repiten rivales para llenar espacios; revisa los cruces pendientes y la disponibilidad.`);
  }

  // ---- Capacidad de la noche ----
  // Si los partidos posibles no caben en (campos x horarios), alguien se
  // queda fuera. Se sacan primero los equipos que MENOS han descansado,
  // porque son los que pueden permitirse la noche libre sin desbalancear.
  if (candidatos.length > capacidad) {
    if (!firstLeg.size && Object.values(entrada.recoveryDeficits ?? {}).some(n=>n>0)) {
      // With limited capacity, choose the teams before optimizing full-night
      // pairings; otherwise a trailing team can be split into a discarded pair.
      const ranked = categories.filter(c=>c.teams.length<=LIMITE_EQUIPOS_POR_CATEGORIA).flatMap(cat=>
        cat.teams.flatMap((a,i)=>cat.teams.slice(i+1).filter(b=>cuenta(h.vecesEnfrentados,pairKey(a.id,b.id)) < (entrada.roundRobinLegs ?? Infinity) && (!firstLeg.has(cat.id)||cuenta(h.vecesEnfrentados,pairKey(a.id,b.id))===0)).map(b=>({cat,a,b}))));
      const deficit = (id:string)=>entrada.recoveryDeficits?.[id] ?? 0;
      ranked.sort((x,y)=>Number(cuenta(h.vecesEnfrentados,pairKey(x.a.id,x.b.id))>0)-Number(cuenta(h.vecesEnfrentados,pairKey(y.a.id,y.b.id))>0) ||
        (deficit(y.a.id)+deficit(y.b.id))-(deficit(x.a.id)+deficit(x.b.id)) ||
        cuenta(h.vecesEnfrentados,pairKey(x.a.id,x.b.id))-cuenta(h.vecesEnfrentados,pairKey(y.a.id,y.b.id)) ||
        (cuenta(h.descansos,y.a.id)+cuenta(h.descansos,y.b.id))-(cuenta(h.descansos,x.a.id)+cuenta(h.descansos,x.b.id)));
      const selected = new Set<string>();
      candidatos.length=0;
      for (const {cat,a,b} of ranked) {
        if (selected.has(a.id)||selected.has(b.id)) continue;
        selected.add(a.id);selected.add(b.id);
        const {home,away}=orientar(a.id,b.id,h);
        candidatos.push({cat,home,away,meeting:cuenta(h.vecesEnfrentados,pairKey(home,away))+1});
      }
      descansos.length=0;
      for (const [id,cat] of categoriaDe) if (!selected.has(id)) descansos.push({teamId:id,teamName:nombre.get(id)!,categoryId:cat.id,categoryName:cat.name,reason:firstLeg.has(cat.id)?'FIRST_LEG':'ODD_TEAMS',totalAfter:cuenta(h.descansos,id)+1});
    }
    const sobran = candidatos.length - capacidad;
    const porDescansoAcumulado = [...candidatos].sort(
      (x, y) =>
        Number(x.meeting===1)-Number(y.meeting===1) ||
        ((entrada.recoveryDeficits?.[x.home] ?? 0) + (entrada.recoveryDeficits?.[x.away] ?? 0) -
        (entrada.recoveryDeficits?.[y.home] ?? 0) - (entrada.recoveryDeficits?.[y.away] ?? 0)) * 10000 +
        cuenta(h.descansos, x.home) +
        cuenta(h.descansos, x.away) -
        (cuenta(h.descansos, y.home) + cuenta(h.descansos, y.away))
    );
    const fuera = new Set(porDescansoAcumulado.slice(0, sobran));

    for (const c of fuera) {
      for (const id of [c.home, c.away]) {
        descansos.push({
          teamId: id,
          teamName: nombre.get(id) ?? id,
          categoryId: c.cat.id,
          categoryName: c.cat.name,
          reason: 'CAPACITY',
          totalAfter: cuenta(h.descansos, id) + 1,
        });
      }
    }
    warnings.push(
      `Caben ${capacidad} partidos según la disponibilidad de los campos y ` +
        `se pueden jugar ${candidatos.length}. ${sobran} ` +
        `${sobran === 1 ? 'partido queda' : 'partidos quedan'} fuera y ` +
        `${sobran * 2} equipos descansan por falta de espacio. ` +
        `Agregar un horario o habilitar más campos amplía la capacidad.`
    );

    for (const c of fuera) candidatos.splice(candidatos.indexOf(c), 1);
  } else if (!entrada.recoveryDeficits && candidatos.length < capacidad && candidatos.length > 0) {
    const libres = capacidad - candidatos.length;
    warnings.push(
      `Sobran ${libres} ${libres === 1 ? 'espacio' : 'espacios'} de los ${capacidad} de la noche.`
    );
  }

  if (fields.length === 0) warnings.push('No hay campos activos en la temporada.');
  if (slots.length === 0) warnings.push('Esta jornada no tiene horarios definidos.');

  // ---- Campo y horario ----
  const huecos = repartirHuecos(
    candidatos.map((c) => ({ home: c.home, away: c.away,categoryId:c.cat.id,clubs:[clubs.get(c.home)!,clubs.get(c.away)!],mixed:c.cat.mixed ?? isMixedCategory(c.cat.name) })),
    fields,
    slots,
    h,
    entrada.earliestTimes,
    entrada.fieldSlots,
    entrada.previousGames,
    entrada.clubReservations
  );

  const games: PartidoPropuesto[] = candidatos.map((c, i) => ({
    categoryId: c.cat.id,
    mixed:c.cat.mixed ?? isMixedCategory(c.cat.name),
    homeClub:clubs.get(c.home),awayClub:clubs.get(c.away),
    categoryName: c.cat.name,
    homeTeamId: c.home,
    homeTeamName: nombre.get(c.home) ?? c.home,
    awayTeamId: c.away,
    awayTeamName: nombre.get(c.away) ?? c.away,
    fieldId: huecos[i]?.fieldId ?? null,
    fieldName: huecos[i]?.fieldName ?? null,
    time: huecos[i]?.time ?? null,
    meeting: c.meeting,
  }));
  for (const game of games.filter((g) => !g.time)) {
    warnings.push(`Sin horario compatible: ${game.homeTeamName} vs ${game.awayTeamName}. Ajusta la disponibilidad antes de guardar.`);
  }

  // Fill spare slots with at most one extra match per team. Both teams must
  // have a deficit, so recovery does not create a new lead for another team.
  const deficits = entrada.recoveryDeficits ?? {};
  const extra = new Map<string, number>();
  const appearances = (id: string) => games.filter(g => g.time && [g.homeTeamId, g.awayTeamId].includes(id)).length;
  const usedPair = (a: string, b: string) => games.some(g => pairKey(g.homeTeamId, g.awayTeamId) === pairKey(a, b));
  const occupied = (fieldId: string, time: string) => games.some(g => g.fieldId === fieldId && g.time === time);
  const busy = (id: string, time: string) => games.some(g => g.time === time && [g.homeTeamId, g.awayTeamId].includes(id));
  const pairs = categories.flatMap(cat => cat.teams.flatMap((a, i) => cat.teams.slice(i + 1).map(b => ({ cat, a, b }))))
    .filter(({cat,a,b}) => cuenta(h.vecesEnfrentados,pairKey(a.id,b.id)) < (entrada.roundRobinLegs ?? Infinity) && deficits[a.id] > 0 && deficits[b.id] > 0 &&
      (!firstLeg.has(cat.id)||cuenta(h.vecesEnfrentados,pairKey(a.id,b.id))===0))
    .sort((x,y) => (deficits[y.a.id]+deficits[y.b.id])-(deficits[x.a.id]+deficits[x.b.id]) ||
      cuenta(h.vecesEnfrentados,pairKey(x.a.id,x.b.id))-cuenta(h.vecesEnfrentados,pairKey(y.a.id,y.b.id)));
  for (const {cat,a,b} of pairs) {
    if ((extra.get(a.id) ?? 0) || (extra.get(b.id) ?? 0) || appearances(a.id) !== 1 || appearances(b.id) !== 1 || usedPair(a.id,b.id)) continue;
    const slot = [...new Set(slots)].sort().flatMap(time => fields.map(field => ({time,field}))).filter(({time,field}) =>
      (!entrada.fieldSlots?.[field.id] || entrada.fieldSlots[field.id].includes(time)) && !occupied(field.id,time) &&
      !hasClubConflict([clubs.get(a.id)!,clubs.get(b.id)!],cat.id,time,[...(entrada.clubReservations ?? []),...games.filter(g=>g.time).flatMap(g=>[g.homeClub!,g.awayClub!].map(club=>({club,categoryId:g.categoryId,time:g.time!,mixed:g.mixed})))],cat.mixed ?? isMixedCategory(cat.name)) &&
      time >= (entrada.earliestTimes?.[a.id] ?? '') && time >= (entrada.earliestTimes?.[b.id] ?? '') && !busy(a.id,time) && !busy(b.id,time))
      .sort((x,y)=>{
        const cost = (slot:{time:string;field:EquipoRef}) => [a.id,b.id].reduce((sum,id)=>sum+
          (h.porHorario[id]?.[slot.time] ?? 0)**2*4+(h.porCampo[id]?.[slot.field.id] ?? 0)**2,0);
        return cost(x)-cost(y);
      })[0];
    if (!slot) continue;
    const {home,away} = orientar(a.id,b.id,h);
    games.push({ categoryId:cat.id, categoryName:cat.name, homeTeamId:home,homeTeamName:nombre.get(home)!,
      mixed:cat.mixed ?? isMixedCategory(cat.name),
      homeClub:clubs.get(home),awayClub:clubs.get(away),
      awayTeamId:away,awayTeamName:nombre.get(away)!,fieldId:slot.field.id,fieldName:slot.field.name,time:slot.time,
      meeting:cuenta(h.vecesEnfrentados,pairKey(home,away))+1,recovery:true });
    extra.set(a.id,1);extra.set(b.id,1);
  }
  const playing = new Set(games.filter(g=>g.time).flatMap(g=>[g.homeTeamId,g.awayTeamId]));
  for (let i=descansos.length-1;i>=0;i--) if (playing.has(descansos[i].teamId)) descansos.splice(i,1);
  const recoveries = [...nombre].filter(([id]) => deficits[id]>0).map(([teamId,teamName]) => ({teamId,teamName,pending:deficits[teamId],scheduled:extra.get(teamId) ?? 0}));
  for (const r of recoveries) warnings.push(`${r.teamName}: ${r.pending} partido(s) por recuperar; ${r.scheduled} recuperación(es) propuesta(s).${r.scheduled ? '' : ' No hay rival pendiente y espacio compatible; revisa la programación manual.'}`);

  // Se ordena como se vive la noche: por hora y luego por campo.
  games.sort((a, b) => (a.time ?? '99').localeCompare(b.time ?? '99') ||
    (a.fieldName ?? '').localeCompare(b.fieldName ?? ''));

  if (entrada.previousGames?.length && games.length === entrada.previousGames.length && games.every(g =>
    entrada.previousGames!.some(old => pairKey(old.homeTeamId, old.awayTeamId) === pairKey(g.homeTeamId, g.awayTeamId) && old.time === g.time && old.fieldId === g.fieldId))) {
    warnings.push('No se encontró otra distribución compatible. Ajusta la disponibilidad o edita la propuesta manualmente.');
  }
  const repetidos = games.filter((g) => g.meeting > 1).length;
  if (repetidos > 0) {
    warnings.push(
      `${repetidos} ${repetidos === 1 ? 'enfrentamiento se repite' : 'enfrentamientos se repiten'}: ` +
        `la primera vuelta ya está completa en esas categorías.`
    );
  }

  return {
    ...(entrada.recoveryDeficits ? { recoveries } : {}),
    roundNumber: entrada.roundNumber,
    scheduledDate: entrada.scheduledDate,
    capacity: capacidad,
    games,
    byes: descansos,
    warnings,
  };
};
