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
  id: string;
  name: string;
}

export interface CategoriaEntrada {
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

export type MotivoDescanso = 'ODD_TEAMS' | 'CAPACITY' | 'MANUAL';

export interface PartidoPropuesto {
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
  peso: (a: string, b: string) => number
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
    }

    for (let j = i + 1; j < n; j++) {
      if (mask & (1 << j)) continue;
      if (!permitido(teams[i], teams[j])) continue;
      const siguiente = mask | (1 << i) | (1 << j);
      const valor = mejor[mask] + VALOR_PARTIDO + peso(teams[i], teams[j]);
      if (valor > mejor[siguiente]) {
        mejor[siguiente] = valor;
        desde[siguiente] = mask;
        conQuien[siguiente] = j;
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
 * Solo se permiten enfrentamientos con el mínimo de encuentros previos:
 * en la primera vuelta eso son los que nunca se han visto. Cuando ya no
 * queda ninguno posible con ese mínimo, se amplía en uno y empieza la
 * vuelta siguiente. Nadie repite rival mientras le quede alguien nuevo.
 */
const emparejarCategoria = (
  cat: CategoriaEntrada,
  h: Historial
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
    // Preferir a quien más ha descansado: así el descanso rota en lugar
    // de caerle siempre al mismo.
    (cuenta(h.descansos, a) + cuenta(h.descansos, b)) * 100 -
    // Y, a igualdad, al par que menos veces se ha visto.
    vistos(a, b) * 10;

  const maximoPosible = Math.floor(ids.length / 2);

  // Se prueba con el mínimo y se amplía solo si no alcanza para llenar
  // la noche. Ampliar antes de tiempo repetiría rivales sin necesidad.
  for (let techo = minimo; techo <= minimo + ids.length; techo++) {
    const { pares, libres } = emparejar(
      ids,
      (a, b) => vistos(a, b) <= techo,
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
  partidos: { home: string; away: string }[],
  fields: EquipoRef[],
  slots: string[],
  h: Historial,
  earliestTimes: Record<string, string> = {},
  fieldSlots: Record<string, string[]> = {},
  previousGames: PartidoPropuesto[] = []
): ({ fieldId: string; fieldName: string; time: string } | null)[] => {
  const huecos: { fieldId: string; fieldName: string; time: string }[] = [];
  for (const time of slots) {
    for (const f of fields) if (!fieldSlots[f.id] || fieldSlots[f.id].includes(time)) huecos.push({ fieldId: f.id, fieldName: f.name, time });
  }

  const libres = new Set(huecos.map((_, i) => i));
  const asignado: ({ fieldId: string; fieldName: string; time: string } | null)[] = [];

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
  }

  return asignado;
};

export const proponerJornada = (entrada: EntradaPropuesta): Propuesta => {
  const { categories, fields, slots, history: h } = entrada;
  const capacidad = fields.reduce((n, f) => n + slots.filter(t => !entrada.fieldSlots?.[f.id] || entrada.fieldSlots[f.id].includes(t)).length, 0);
  const warnings: string[] = [];

  const nombre = new Map<string, string>();
  const categoriaDe = new Map<string, CategoriaEntrada>();
  for (const cat of categories) {
    for (const t of cat.teams) {
      nombre.set(t.id, t.name);
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
        reason: 'ODD_TEAMS',
        totalAfter: cuenta(h.descansos, solo.id) + 1,
      });
      warnings.push(`${cat.name} tiene un solo equipo: no hay con quién emparejarlo.`);
      continue;
    }

    const { pares, libres } = emparejarCategoria(cat, h);

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
        reason: 'ODD_TEAMS',
        totalAfter: cuenta(h.descansos, id) + 1,
      });
    }
    if (cat.teams.length % 2 === 1) {
      warnings.push(
        `${cat.name} tiene ${cat.teams.length} equipos (impar): uno descansa cada jornada.`
      );
    }
  }

  // ---- Capacidad de la noche ----
  // Si los partidos posibles no caben en (campos x horarios), alguien se
  // queda fuera. Se sacan primero los equipos que MENOS han descansado,
  // porque son los que pueden permitirse la noche libre sin desbalancear.
  if (candidatos.length > capacidad) {
    const sobran = candidatos.length - capacidad;
    const porDescansoAcumulado = [...candidatos].sort(
      (x, y) =>
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
  } else if (candidatos.length < capacidad && candidatos.length > 0) {
    const libres = capacidad - candidatos.length;
    warnings.push(
      `Sobran ${libres} ${libres === 1 ? 'espacio' : 'espacios'} de los ${capacidad} de la noche.`
    );
  }

  if (fields.length === 0) warnings.push('No hay campos activos en la temporada.');
  if (slots.length === 0) warnings.push('Esta jornada no tiene horarios definidos.');

  // ---- Campo y horario ----
  const huecos = repartirHuecos(
    candidatos.map((c) => ({ home: c.home, away: c.away })),
    fields,
    slots,
    h,
    entrada.earliestTimes,
    entrada.fieldSlots,
    entrada.previousGames
  );

  const games: PartidoPropuesto[] = candidatos.map((c, i) => ({
    categoryId: c.cat.id,
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
        `la primera vuelta ya está completa.`
    );
  }

  return {
    roundNumber: entrada.roundNumber,
    scheduledDate: entrada.scheduledDate,
    capacity: capacidad,
    games,
    byes: descansos,
    warnings,
  };
};
