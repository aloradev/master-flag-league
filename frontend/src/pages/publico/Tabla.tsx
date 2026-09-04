import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { Card, EmptyState, Spinner } from '../../components/ui';
import { IconTrophy } from '../../components/icons';
import { TeamCrest } from '../../components/AuthImage';
import type { StandingsGroup } from '../../lib/competition';
import { Marco, BotonCompartir } from './Marco';

interface TablaPublica {
  season: { id: string; name: string; year: number };
  categories: StandingsGroup[];
}

/** G / E / P en el color del resultado: cinco casillas leen mejor que un texto. */
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

export default function TablaPublicaPage() {
  const consulta = useQuery({
    queryKey: ['publico-tabla'],
    queryFn: () => api.get<TablaPublica>('/public/standings'),
    retry: false,
  });

  if (consulta.isLoading) return <Marco titulo="Tabla general"><Spinner /></Marco>;

  if (consulta.isError || !consulta.data) {
    return (
      <Marco titulo="Tabla general">
        <EmptyState
          icon={<IconTrophy size={40} />}
          title="Todavía no hay temporada activa"
          description="Cuando arranque la temporada, la tabla aparecerá aquí."
        />
      </Marco>
    );
  }

  const { season, categories } = consulta.data;
  const conEquipos = categories.filter((g) => g.rows.length > 0);

  const mensaje =
    `Tabla general — ${season.name}\n\n` +
    conEquipos
      .map(
        (g) =>
          `${g.category.name}\n` +
          g.rows
            .map((f) => `${f.position}. ${f.team_name} — ${f.points} pts (${f.played} JJ)`)
            .join('\n')
      )
      .join('\n\n') +
    `\n\nTabla completa: ${window.location.origin}/tabla`;

  return (
    <Marco
      titulo="Tabla general"
      subtitulo={season.name}
      acciones={conEquipos.length > 0 ? <BotonCompartir texto={mensaje} /> : undefined}
    >
      {conEquipos.length === 0 ? (
        <EmptyState
          icon={<IconTrophy size={40} />}
          title="Todavía no se juega nada"
          description="La tabla se llena con el primer partido terminado."
        />
      ) : (
        <div className="space-y-5">
          {conEquipos.map((g) => (
            <section key={g.category.id}>
              <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
                {g.category.color && (
                  <span
                    className="size-2.5 rounded-full"
                    style={{ backgroundColor: g.category.color }}
                    aria-hidden
                  />
                )}
                {g.category.name}
              </h2>

              {/* En 390 px no caben nueve columnas. En lugar de encogerlas o
                  dejar que la tabla se mueva de lado —donde lo primero que
                  se sale de la pantalla es PTS, justo lo que la gente
                  abre a ver—, se eligen columnas por prioridad, con los
                  mismos cortes que la tabla de la aplicación. */}
              <Card className="overflow-x-auto">
                <table className="table table-sm">
                  <thead>
                    <tr>
                      <th className="w-8 text-center">#</th>
                      <th>Equipo</th>
                      <th className="hidden text-center sm:table-cell" title="Juegos jugados">JJ</th>
                      <th className="hidden text-center sm:table-cell" title="Ganados">G</th>
                      <th className="hidden text-center sm:table-cell" title="Empatados">E</th>
                      <th className="hidden text-center sm:table-cell" title="Perdidos">P</th>
                      <th className="text-center" title="Diferencia de puntos">DIF</th>
                      <th className="text-center">PTS</th>
                      <th className="hidden text-center lg:table-cell">Últimos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.rows.map((f) => (
                      <tr key={f.team_id}>
                        <td className="tabular text-center font-bold">{f.position}</td>
                        <td>
                          <div className="flex items-center gap-2">
                            <TeamCrest
                              name={f.team_name}
                              shortName={f.short_name}
                              logoUrl={f.logo_url}
                              className="size-7"
                            />
                            <span className="min-w-0 truncate font-medium">{f.team_name}</span>
                          </div>
                        </td>
                        <td className="tabular hidden text-center sm:table-cell">{f.played}</td>
                        <td className="tabular hidden text-center sm:table-cell">{f.wins}</td>
                        <td className="tabular hidden text-center sm:table-cell">{f.draws}</td>
                        <td className="tabular hidden text-center sm:table-cell">{f.losses}</td>
                        <td className="tabular text-center">
                          {f.point_diff > 0 ? `+${f.point_diff}` : f.point_diff}
                        </td>
                        <td className="tabular text-center font-bold">{f.points}</td>
                        <td className="hidden lg:table-cell">
                          <Forma form={f.form} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            </section>
          ))}
        </div>
      )}
    </Marco>
  );
}
