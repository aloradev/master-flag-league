import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { Season } from '../lib/types';
import { Alert, Card, EmptyState, Spinner } from '../components/ui';
import { IconFootball } from '../components/icons';
import { TeamCrest } from '../components/AuthImage';
import { competition, type StandingRow } from '../lib/competition';

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
          <div><h2 className="font-bold">Sistema de puntuación</h2><p className="mt-1 text-sm text-base-content/70">Victoria <strong>3 pts</strong> · empate <strong>1 pt</strong> · derrota <strong>0 pts</strong>.</p></div>
          <span className="badge badge-primary badge-outline">3–1–0</span>
        </div>
        <p className="mt-2 text-xs text-base-content/60">Desempates: victorias, diferencia, puntos a favor y enfrentamiento directo.</p>
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

            <Card className="overflow-x-auto">
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

      {conJuego && <p className="text-xs text-base-content/50">Orden: victorias, diferencia de puntos, puntos a favor y enfrentamiento directo. El sistema de puntos queda desactivado por ahora.</p>}
    </div>
  );
}
