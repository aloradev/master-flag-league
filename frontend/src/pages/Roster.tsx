import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { TeamDetail, TeamSummary } from '../lib/types';
import { Alert, Card, Spinner } from '../components/ui';
import { useAuth, isAdmin } from '../store/auth';

/**
 * ROSTER OFICIAL (req. 10)
 *
 * Pensado para imprimirse y entregarse en la mesa el día de partido, así que
 * los estilos de impresión invierten el tema a tinta sobre papel y esconden
 * la navegación. No incluye documentos ni datos personales: la mesa solo
 * necesita número, nombre y si el jugador puede jugar.
 */
export default function Roster() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();

  // El manager llega sin :id — se resuelve su propio equipo.
  const teams = useQuery({
    queryKey: ['teams'],
    queryFn: () => api.get<TeamSummary[]>('/teams'),
    enabled: !id,
  });

  const teamId = id ?? teams.data?.[0]?.id;

  const team = useQuery({
    queryKey: ['team', teamId],
    queryFn: () => api.get<TeamDetail>(`/teams/${teamId}`),
    enabled: Boolean(teamId),
  });

  if (teams.isLoading || team.isLoading) return <Spinner />;
  if (team.isError || !team.data) {
    return <Alert tone="error">No se pudo cargar el roster.</Alert>;
  }

  const data = team.data;
  const eligible = data.roster.filter((player) => player.is_eligible);
  const notEligible = data.roster.filter((player) => !player.is_eligible);
  const backTo = isAdmin(user?.role) ? `/admin/equipos/${teamId}` : '/equipo';

  return (
    <div className="mx-auto max-w-3xl space-y-4 print:max-w-none print:space-y-2">
      <div className="flex items-center justify-between gap-3 print:hidden">
        <Link to={backTo} className="text-sm text-base-content/60 hover:text-base-content">
          ← Volver
        </Link>
        <button onClick={() => window.print()} className="btn btn-sm">
          Imprimir
        </button>
      </div>

      <Card className="p-5 print:border-0 print:bg-transparent print:p-0">
        {/* Encabezado del documento */}
        <div className="flex items-start justify-between gap-4 border-b border-base-300 pb-3 print:border-black/20">
          <div>
            <h1 className="text-lg font-bold print:text-xl">{data.name}</h1>
            <p className="text-sm text-base-content/60 print:text-black/60">
              {data.category_name} · {data.season_name}
            </p>
          </div>
          <div className="text-right text-xs text-base-content/50 print:text-black/50">
            <div>Roster oficial</div>
            <div className="tabular">
              {new Date().toLocaleDateString('es-MX', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
            </div>
          </div>
        </div>

        {/* Resumen */}
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
          <span>
            Total: <strong className="tabular">{data.roster.length}</strong>
          </span>
          <span className="text-success print:text-black">
            Elegibles: <strong className="tabular">{eligible.length}</strong>
          </span>
          {notEligible.length > 0 && (
            <span className="text-error print:text-black">
              No elegibles: <strong className="tabular">{notEligible.length}</strong>
            </span>
          )}
        </div>

        {data.roster.length === 0 ? (
          <p className="py-8 text-center text-sm text-base-content/50">
            Sin jugadores registrados
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-base-300 text-left text-xs uppercase tracking-wide text-base-content/50 print:border-black/20 print:text-black/60">
                  <th className="w-12 py-2 font-medium">Núm.</th>
                  <th className="py-2 font-medium">Jugador</th>
                  <th className="w-14 py-2 font-medium">Pos.</th>
                  <th className="w-24 py-2 text-right font-medium">Estatus</th>
                </tr>
              </thead>
              <tbody>
                {/* Elegibles primero: es lo que la mesa consulta */}
                {[...eligible, ...notEligible].map((player) => (
                  <tr
                    key={player.id}
                    className="border-b border-base-300/50 print:border-black/10"
                  >
                    <td className="tabular py-2 font-bold text-base-content/70 print:text-black">
                      {player.jersey_number ?? '—'}
                    </td>
                    <td className="whitespace-nowrap py-2 pr-3">
                      {player.first_name} {player.last_name_paternal}{' '}
                      {player.last_name_maternal ?? ''}
                    </td>
                    <td className="whitespace-nowrap py-2 text-base-content/60 print:text-black/70">
                      {player.position ?? '—'}
                    </td>
                    <td className="whitespace-nowrap py-2 text-right">
                      {player.is_eligible ? (
                        <span className="font-medium text-success print:text-black">
                          Elegible
                        </span>
                      ) : (
                        <span className="font-medium text-error print:text-black">
                          No elegible
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {notEligible.length > 0 && (
          <p className="mt-4 border-t border-base-300 pt-3 text-xs text-base-content/50 print:border-black/20 print:text-black/60">
            Los jugadores marcados como no elegibles no completaron su registro y no
            pueden participar oficialmente.
          </p>
        )}

        {/* Firmas — solo al imprimir */}
        <div className="mt-10 hidden gap-12 print:flex">
          <div className="flex-1 border-t border-black/40 pt-1 text-xs text-black/60">
            Encargado del equipo
          </div>
          <div className="flex-1 border-t border-black/40 pt-1 text-xs text-black/60">
            Árbitro
          </div>
        </div>
      </Card>
    </div>
  );
}
