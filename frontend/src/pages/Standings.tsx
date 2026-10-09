import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { Season } from '../lib/types';
import { Alert, Card, EmptyState, Spinner } from '../components/ui';
import { IconFootball } from '../components/icons';
import { TeamCrest } from '../components/AuthImage';
import { competition, type StandingRow } from '../lib/competition';
import { standingsOrder, standingsLegend, standingsNotes } from '../lib/standingsExplanation';

/** G / E / P en el color del resultado. Cinco casillas leen mejor que un texto. */
const Forma = ({ form }: { form: ('W' | 'D' | 'L')[] }) => {
  if (form.length === 0) return <span className="text-base-content/30">—</span>;
  const estilo = { W: 'bg-success/80', D: 'bg-warning/80', L: 'bg-error/70' };
  const letra = { W: 'G', D: 'E', L: 'P' };
  return (
    <span className="flex gap-0.5">
      {form.map((r, i) => (
        <span
          key={i}
          title={{ W: 'Ganado', D: 'Empatado', L: 'Perdido' }[r]}
          className={`inline-flex size-4 items-center justify-center rounded-[3px]
                      text-[9px] font-bold text-base-100 ${estilo[r]}`}
        >
          {letra[r]}
        </span>
      ))}
    </span>
  );
};

const Fila = ({ f, destacar }: { f: StandingRow; destacar: boolean }) => (
  <tr className={`mfl-standing-row ${destacar ? 'bg-primary/5' : ''} ${f.position <= 3 ? `mfl-podium-${f.position}` : ''}`}>
    <td className="tabular w-8 text-center font-bold"><span className="mfl-rank-badge">{f.position}</span></td>
    <td>
      <div className="flex items-center gap-2">
        <TeamCrest
          name={f.team_name}
          shortName={f.short_name}
          logoUrl={f.logo_url}
          className="size-7"
        />
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold leading-tight">{f.team_name}</span>
          {f.tiebreak_pending && <span className="block text-xs text-warning">Desempate pendiente</span>}
          <span className="block text-[11px] text-base-content/50 sm:hidden">
            {f.played} JJ · {f.wins}G · {f.draws}E · {f.losses}P · DIF {f.point_diff >= 0 ? '+' : ''}{f.point_diff}
          </span>
        </span>
      </div>
    </td>
    <td className="tabular hidden text-center sm:table-cell">{f.played}</td>
    <td className="tabular hidden text-center sm:table-cell">{f.wins}</td>
    <td className="tabular hidden text-center sm:table-cell">{f.draws}</td>
    <td className="tabular hidden text-center sm:table-cell">{f.losses}</td>
    <td className="tabular hidden text-center md:table-cell">{f.points_for}</td>
    <td className="tabular hidden text-center md:table-cell">{f.points_against}</td>
    <td className="tabular text-center">
      {f.point_diff > 0 ? '+' : ''}
      <span className={f.point_diff > 0 ? 'text-success font-bold' : f.point_diff < 0 ? 'text-error' : ''}>{f.point_diff}</span>
    </td>
    <td className="hidden text-center lg:table-cell">
      <Forma form={f.form} />
    </td>
    <td className="tabular hidden text-center md:table-cell text-xs">{f.streak}</td>
  </tr>
);

/**
 * TABLA DE POSICIONES
 *
 * Se calcula en el servidor a partir de los partidos, así que esta
 * pantalla no guarda ni acumula nada: pide y muestra. En celular se
 * esconden las columnas intermedias y quedan las tres que se buscan de
 * verdad —posición, equipo y puntos—; las demás aparecen al ensanchar.
 */
export default function Standings() {
  const [categoria, setCategoria] = useState<string>('');

  const season = useQuery({
    queryKey: ['season-active'],
    queryFn: () => api.get<Season>('/seasons/active'),
    retry: false,
  });

  const seasonId = season.data?.id;
  const tabla = useQuery({
    queryKey: ['standings', seasonId, categoria],
    queryFn: () => competition.standings(seasonId!, categoria || undefined),
    enabled: Boolean(seasonId),
  });

  if (season.isLoading || tabla.isLoading) return <Spinner label="Calculando posiciones…" />;
  if (season.error) return <Alert tone="error">No hay temporada activa.</Alert>;
  if (tabla.error) return <Alert tone="error">{(tabla.error as Error).message}</Alert>;

  const grupos = tabla.data ?? [];
  const conJuego = grupos.some((g) => g.rows.some((f) => f.played > 0));

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Tabla de posiciones</h1>
          <p className="text-sm text-base-content/60">{season.data?.name}</p>
        </div>

        <select
          className="select select-bordered select-sm"
          value={categoria}
          onChange={(e) => setCategoria(e.target.value)}
          aria-label="Categoría"
        >
          <option value="">Todas las categorías</option>
          {season.data?.categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </header>

      {!conJuego && (
        <EmptyState
          icon={<IconFootball size={40} />}
          title="La temporada aún no arranca"
          description="La tabla se llenará sola en cuanto se cierre el primer partido."
        />
      )}

      <Card className="border-primary/20 bg-primary/5 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><h2 className="font-bold">Criterio de posiciones</h2><p className="mt-1 text-sm text-base-content/70">Primero los equipos con partidos jugados. Después se compara el récord y los desempates.</p></div>
          <span className="badge badge-primary badge-outline">Criterio MFL</span>
        </div>
        <p className="mt-2 text-xs text-base-content/60">{standingsOrder}</p>
        <p className="mt-2 text-xs text-base-content/60">{standingsLegend}</p>
        <p className="mt-2 text-xs text-base-content/60">{standingsNotes}</p>
      </Card>

      {conJuego &&
        grupos.map((g) => (
          <section key={g.category.id} className="space-y-2">
            <h2 className="flex items-center gap-2 text-sm font-bold">
              <span
                className="inline-block size-2.5 rounded-full"
                style={{ backgroundColor: g.category.color }}
              />
              {g.category.name}
            </h2>

            <div className="space-y-2 sm:hidden">
              {g.rows.map((f) => <Card key={f.team_id} className={`mfl-mobile-standing p-3 ${f.position <= 3 ? `mfl-podium-${f.position}` : ''}`}>
                <div className="flex items-center gap-3"><span className="mfl-rank-badge text-lg font-black text-primary">{f.position}</span><TeamCrest name={f.team_name} shortName={f.short_name} logoUrl={f.logo_url} className="size-9" /><div className="min-w-0 flex-1"><p className="truncate font-bold">{f.team_name}</p><p className="text-xs text-base-content/60">{f.played} JJ · {f.wins} JG · {f.draws} JE · {f.losses} JP</p></div><span className="text-right"><strong className="block tabular">{f.point_diff > 0 ? '+' : ''}{f.point_diff}</strong><small className="text-[10px] uppercase text-base-content/50">DIF</small></span></div>
                <div className="mt-2 grid grid-cols-3 gap-2 border-t border-base-300/60 pt-2 text-center text-xs"><span><b className="block tabular text-sm">{f.points_for}</b>PF</span><span><b className="block tabular text-sm">{f.points_against}</b>PC</span><span><b className="block text-sm">{f.form.map((r) => r === 'W' ? 'G' : r === 'D' ? 'E' : 'P').join(' ') || '—'}</b>FORMA</span></div>
              </Card>)}
            </div>
            <Card className="hidden overflow-x-auto sm:block">
              <table className="table table-sm">
                <thead>
                  <tr className="text-[11px] uppercase">
                    <th className="text-center">#</th>
                    <th>Equipo</th>
                    <th className="hidden text-center sm:table-cell" title="Jugados">JJ</th>
                    <th className="hidden text-center sm:table-cell" title="Ganados">G</th>
                    <th className="hidden text-center sm:table-cell" title="Empatados">E</th>
                    <th className="hidden text-center sm:table-cell" title="Perdidos">P</th>
                    <th className="hidden text-center md:table-cell" title="Puntos a favor">PF</th>
                    <th className="hidden text-center md:table-cell" title="Puntos en contra">PC</th>
                    <th className="text-center" title="Diferencia">DIF</th>
                    <th className="hidden text-center lg:table-cell">Forma</th>
                    <th className="hidden text-center md:table-cell">Racha</th>
                  </tr>
                </thead>
                <tbody>
                  {g.rows.map((f) => (
                    <Fila key={f.team_id} f={f} destacar={f.position === 1 && f.played > 0} />
                  ))}
                </tbody>
              </table>
            </Card>
          </section>
        ))}

      {conJuego && <p className="text-xs text-base-content/50">{standingsNotes} Los puntos de competición no determinan las posiciones.</p>}
    </div>
  );
}
