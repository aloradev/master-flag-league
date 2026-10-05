import { ShareCard } from '../../components/ShareCard';
import { useQuery } from '@tanstack/react-query';
import { api, ApiError } from '../../lib/api';
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
          title={consulta.error instanceof ApiError && consulta.error.status === 404 ? 'Todavía no hay temporada activa' : 'No pudimos cargar las posiciones'}
          description="Puedes volver a consultar sin salir de esta página."
          action={<button className="btn btn-primary" onClick={() => void consulta.refetch()}>Reintentar</button>}
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
            .map((f) => `${f.position}. ${f.team_name} — ${f.played} JJ · ${f.wins} JG · DIF ${f.point_diff}`)
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
          <Card className="border-primary/20 bg-primary/5 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><h2 className="font-bold">¿Cómo se ordena la tabla?</h2><p className="mt-1 text-sm text-base-content/70">Primero cuentan las <strong>victorias</strong>, después los puntos a favor y en contra.</p></div>
              <span className="badge badge-primary badge-outline">Formato clásico</span>
            </div>
            <p className="mt-2 text-xs text-base-content/60">El sistema de puntos queda desactivado por ahora. Los empates se resuelven con PF, PC, diferencia y enfrentamiento directo.</p>
          </Card>
          {conEquipos.map((g) => (
            <section key={g.category.id}>
              <h2 className="mb-3 flex items-center gap-3 text-xl font-black uppercase tracking-tight">
                {g.category.color && (
                  <span
                    className="h-7 w-1.5 rounded-full"
                    style={{ backgroundColor: g.category.color }}
                    aria-hidden
                  />
                )}
                {g.category.name}
                <span className="ml-auto text-xs font-medium normal-case tracking-normal text-base-content/60">{g.rows.length} equipos</span>
              </h2>

              {/* En 390 px no caben nueve columnas. En lugar de encogerlas o
                  dejar que la tabla se mueva de lado —donde lo primero que
                  se sale de la pantalla es PTS, justo lo que la gente
                  abre a ver—, se eligen columnas por prioridad, con los
                  mismos cortes que la tabla de la aplicación. */}
              <Card className="overflow-x-auto">
                <table className="table table-sm public-standings">
                  <thead className="bg-primary/10 text-xs uppercase text-base-content/80">
                    <tr>
                      <th className="w-8 text-center">#</th>
                      <th>Equipo</th>
                      <th className="hidden text-center sm:table-cell" title="Juegos jugados">JJ</th>
                      <th className="hidden text-center sm:table-cell" title="Ganados">G</th>
                      <th className="hidden text-center sm:table-cell" title="Empatados">E</th>
                      <th className="hidden text-center sm:table-cell" title="Perdidos">P</th>
                      <th className="text-center" title="Diferencia: puntos a favor menos puntos en contra">DIF</th>
                      <th className="hidden text-center lg:table-cell">Últimos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.rows.map((f) => (
                      <tr key={f.team_id} className={`mfl-standing-row ${f.position <= 3 ? `mfl-podium-${f.position}` : ''}`}>
                        <td className="tabular text-center text-lg font-black text-primary"><span className="mfl-rank-badge">{f.position}</span></td>
                        <td>
                          <div className="flex items-center gap-2">
                            <TeamCrest
                              name={f.team_name}
                              shortName={f.short_name}
                              logoUrl={f.logo_url}
                              className="size-9"
                            />
                            <span className="min-w-0 truncate font-medium">{f.team_name}</span>
                            <span className="sm:hidden text-[11px] text-base-content/55">{f.played} JJ · {f.wins}G · {f.draws}E · {f.losses}P · DIF {f.point_diff > 0 ? '+' : ''}{f.point_diff}</span>
                          </div>
                        </td>
                        <td className="tabular hidden text-center sm:table-cell">{f.played}</td>
                        <td className="tabular hidden text-center sm:table-cell">{f.wins}</td>
                        <td className="tabular hidden text-center sm:table-cell">{f.draws}</td>
                        <td className="tabular hidden text-center sm:table-cell">{f.losses}</td>
                        <td className="tabular text-center">
                          <span className={f.point_diff > 0 ? 'text-success font-bold' : f.point_diff < 0 ? 'text-error' : ''}>{f.point_diff > 0 ? `+${f.point_diff}` : f.point_diff}</span>
                        </td>
                        <td className="hidden lg:table-cell">
                          <Forma form={f.form} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card><div className="mt-3"><ShareCard title={`Posiciones · ${g.category.name}`} subtitle={season.name} lines={[]} table={{ headers: ['POS','EQUIPO','JJ','JG','JE','JP','PF','PC','DIF'], rows: g.rows.map(row => [String(row.position), row.team_name, String(row.played), String(row.wins), String(row.draws), String(row.losses), String(row.points_for), String(row.points_against), String(row.point_diff)]) }} filename={`mfl-posiciones-${g.category.id}`} url={`${window.location.origin}/tabla`} /></div>
            </section>
          ))}
        </div>
      )}
    </Marco>
  );
}
