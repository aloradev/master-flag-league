import { ShareCard } from '../../components/ShareCard';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../../lib/api';
import { Card, EmptyState, Spinner } from '../../components/ui';
import { IconTrophy } from '../../components/icons';
import { TeamCrest } from '../../components/AuthImage';
import type { StandingsGroup } from '../../lib/competition';
import { Marco, BotonCompartir } from './Marco';

export interface TablaPublica {
  season: { id: string; name: string; year: number };
  categories: StandingsGroup[];
}

/** G / E / P en el color del resultado: cinco casillas leen mejor que un texto. */
const Forma = ({ form }: { form: ('W' | 'D' | 'L')[] }) => {
  if (form.length === 0) return <span className="text-base-content/30">—</span>;
  const estilo = { W: 'bg-success/15', D: 'bg-warning/20', L: 'bg-error/15' };
  const letra = { W: 'G', D: 'E', L: 'P' };
  return (
    <span role="img" aria-label={`Últimos resultados: ${form.map(result => ({ W: 'Ganado', D: 'Empatado', L: 'Perdido' })[result]).join(', ')}`} className="flex gap-1">
      {form.map((r, i) => (
        <span
          key={i}
          title={{ W: 'Ganado', D: 'Empatado', L: 'Perdido' }[r]}
          aria-hidden="true"
          className={`inline-flex size-5 items-center justify-center rounded-[3px]
                      text-[11px] font-bold text-base-content ${estilo[r]}`}
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
    queryFn: ({ signal }) => api.get<TablaPublica>('/public/standings', signal),
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
              <h2 className="mb-3 flex flex-wrap items-center gap-3 text-lg font-bold">
                {g.category.color && (
                  <span
                    className="h-7 w-1.5 rounded-full"
                    style={{ backgroundColor: g.category.color }}
                    aria-hidden
                  />
                )}
                <span className="min-w-0 flex-1 break-words [overflow-wrap:anywhere]">{g.category.name}</span>
                <span className="ml-auto text-xs font-medium normal-case tracking-normal text-base-content/60">{g.rows.length} equipos</span>
              </h2>

              <div className="public-standings-scroll" role="region" aria-label={`Posiciones de ${g.category.name}`} tabIndex={0}>
                <table className="public-standings">
                  <caption className="sr-only">{g.category.name} · {season.name}</caption>
                  <colgroup><col className="standing-rank-column" /><col className="standing-team-column" />{Array.from({ length: 7 }, (_, index) => <col key={index} className="standing-number-column" />)}<col /></colgroup>
                  <thead>
                    <tr>
                      <th scope="col" className="standing-rank" title="Posición">#</th>
                      <th scope="col" className="standing-team">Equipo</th>
                      <th scope="col" title="Juegos jugados">JJ</th>
                      <th scope="col" title="Ganados">G</th>
                      <th scope="col" title="Empatados">E</th>
                      <th scope="col" title="Perdidos">P</th>
                      <th scope="col" title="Puntos a favor">PF</th>
                      <th scope="col" title="Puntos en contra">PC</th>
                      <th scope="col" title="Diferencia: puntos a favor menos puntos en contra">DIF</th>
                      <th scope="col" className="standing-form">Últimos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.rows.map((f) => (
                      <tr key={f.team_id} className={`mfl-standing-row ${f.position <= 3 ? `mfl-podium-${f.position}` : ''}`}>
                        <td className="standing-rank tabular font-bold"><span className="mfl-rank-badge">{f.position}</span></td>
                        <th scope="row" className="standing-team">
                          <div className="flex min-w-0 items-center gap-2">
                            <TeamCrest
                              name={f.team_name}
                              shortName={f.short_name}
                              logoUrl={f.logo_url}
                              className="size-8 shrink-0"
                            />
                            <Link to={`/equipos/${f.team_id}`} className="link min-w-0 break-words font-semibold [overflow-wrap:anywhere]">{f.team_name}</Link>
                          </div>
                          {/* Las columnas completas ya anuncian estos datos a lectores de pantalla. */}
                          <dl className="standing-mobile-balance" aria-hidden="true">
                            {[
                              ['JJ', f.played, 'Juegos jugados'],
                              ['G', f.wins, 'Ganados'],
                              ['E', f.draws, 'Empatados'],
                              ['P', f.losses, 'Perdidos'],
                              ['DIF', f.point_diff > 0 ? `+${f.point_diff}` : f.point_diff, 'Diferencia de puntos'],
                            ].map(([label, value, title]) => <div key={label} className={label === 'DIF' ? 'standing-balance-difference' : undefined}>
                              <dt title={String(title)}>{label}</dt><dd className="tabular">{value}</dd>
                            </div>)}
                          </dl>
                        </th>
                        <td className="tabular">{f.played}</td>
                        <td className="tabular font-semibold">{f.wins}</td>
                        <td className="tabular">{f.draws}</td>
                        <td className="tabular">{f.losses}</td>
                        <td className="tabular">{f.points_for}</td>
                        <td className="tabular">{f.points_against}</td>
                        <td className="tabular">
                          <span className={f.point_diff > 0 ? 'text-success font-bold' : f.point_diff < 0 ? 'text-error' : ''}>{f.point_diff > 0 ? `+${f.point_diff}` : f.point_diff}</span>
                        </td>
                        <td className="standing-form">
                          <Forma form={f.form} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div><div className="mt-3"><ShareCard title={`Posiciones · ${g.category.name}`} subtitle={season.name} lines={[]} table={{ headers: ['POS','EQUIPO','JJ','JG','JE','JP','PF','PC','DIF'], rows: g.rows.map(row => [String(row.position), row.team_name, String(row.played), String(row.wins), String(row.draws), String(row.losses), String(row.points_for), String(row.points_against), String(row.point_diff)]) }} filename={`mfl-posiciones-${g.category.id}`} url={`${window.location.origin}/tabla`} /></div>
            </section>
          ))}
        </div>
      )}
    </Marco>
  );
}
