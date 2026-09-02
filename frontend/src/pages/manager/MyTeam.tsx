import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import type { TeamDetail, TeamSummary } from '../../lib/types';
import { Card, Spinner, Alert, EmptyState, Stat } from '../../components/ui';
import { StatusBadge, EligibilityBadge } from '../../components/StatusBadge';
import { PlayerAvatar } from '../../components/AuthImage';

const playerName = (p: TeamDetail['roster'][number]) =>
  `${p.first_name} ${p.last_name_paternal}`;

export default function MyTeam() {
  const teams = useQuery({
    queryKey: ['teams'],
    queryFn: () => api.get<TeamSummary[]>('/teams'),
  });

  const teamId = teams.data?.[0]?.id;

  const team = useQuery({
    queryKey: ['team', teamId],
    queryFn: () => api.get<TeamDetail>(`/teams/${teamId}`),
    enabled: Boolean(teamId),
  });

  if (teams.isLoading || team.isLoading) return <Spinner label="Cargando tu equipo…" />;

  if (teams.isError || team.isError) {
    return <Alert tone="error">No se pudo cargar la información de tu equipo.</Alert>;
  }

  if (!teamId) {
    return (
      <EmptyState
        icon="🛡️"
        title="Todavía no tienes un equipo asignado"
        description="La administración de la liga debe asignarte como encargado antes de que puedas registrar jugadores."
      />
    );
  }

  const data = team.data!;
  const summary = data.registration_summary;

  // Req. 30: alertas concretas y accionables, no un panel decorativo.
  const needsAttention = data.roster.filter(
    (p) => p.status === 'CORRECTIONS_REQUIRED' || p.status === 'REJECTED'
  );
  const deadline = data.registration_deadline
    ? new Date(`${data.registration_deadline}T12:00:00`)
    : null;
  const daysLeft = deadline
    ? Math.ceil((deadline.getTime() - Date.now()) / 86_400_000)
    : null;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      {/* Encabezado con la identidad del equipo */}
      <div className="flex items-center gap-4">
        <div
          className="flex size-14 shrink-0 items-center justify-center rounded-box text-lg font-bold"
          style={{ backgroundColor: data.color_primary }}
        >
          {data.short_name ?? data.name.slice(0, 3).toUpperCase()}
        </div>
        <div className="min-w-0">
          <h1 className="truncate text-xl font-bold">{data.name}</h1>
          <p className="text-sm text-base-content/60">
            {data.category_name} · {data.season_name}
          </p>
        </div>
      </div>

      {/* ESTADO DE REGISTRO (req. 29) — todo calculado por el sistema */}
      <section>
        <h2 className="mb-2 text-sm font-semibold text-base-content/70">Estado de registro</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat value={summary.total} label="Jugadores" />
          <Stat value={summary.eligible} label="Elegibles" tone="success" />
          <Stat value={summary.pending} label="En revisión" tone="warning" />
          <Stat value={summary.corrections + summary.rejected} label="Por corregir" tone="error" />
        </div>
      </section>

      {/* Alertas */}
      <div className="space-y-2">
        {needsAttention.length > 0 && (
          <Alert tone="error" title={`${needsAttention.length} jugador(es) requieren tu atención`}>
            <ul className="mt-1 space-y-0.5">
              {needsAttention.map((p) => (
                <li key={p.id}>
                  <Link
                    to={`/equipo/jugadores/${p.id}`}
                    className="underline decoration-dotted underline-offset-2"
                  >
                    {playerName(p)}
                  </Link>
                </li>
              ))}
            </ul>
          </Alert>
        )}

        {summary.total > 0 && summary.total === summary.eligible && (
          <Alert tone="success">
            Todos tus jugadores están aprobados y habilitados para jugar.
          </Alert>
        )}

        {daysLeft != null && daysLeft >= 0 && daysLeft <= 14 && (
          <Alert tone="warning">
            {daysLeft === 0
              ? 'Hoy es el último día para registrar jugadores.'
              : `Quedan ${daysLeft} día(s) para el cierre de registro (${deadline!.toLocaleDateString(
                  'es-MX',
                  { day: 'numeric', month: 'long' }
                )}).`}
          </Alert>
        )}

        {daysLeft != null && daysLeft < 0 && (
          <Alert tone="info">
            El periodo de registro cerró. Para dar de alta a alguien más necesitas
            autorización de la administración.
          </Alert>
        )}
      </div>

      {/* Plantilla */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-base-content/70">Plantilla</h2>
          <Link to="/equipo/jugadores/nuevo" className="btn btn-primary btn-sm">
            Agregar jugador
          </Link>
        </div>

        {data.roster.length === 0 ? (
          <Card>
            <EmptyState
              icon="👥"
              title="Aún no hay jugadores"
              description="Registra a tu primer jugador y sube su documentación para que administración lo valide."
              action={
                <Link to="/equipo/jugadores/nuevo" className="btn btn-primary btn-sm">
                  Agregar jugador
                </Link>
              }
            />
          </Card>
        ) : (
          <ul className="space-y-2">
            {data.roster.map((player) => (
              <Card as="li" key={player.id}>
                <Link
                  to={`/equipo/jugadores/${player.id}`}
                  className="flex items-center gap-3 p-3 transition-colors hover:bg-base-300/40"
                >
                  <PlayerAvatar
                    photoUrl={player.photo_url}
                    name={playerName(player)}
                    jersey={player.jersey_number}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      {player.jersey_number != null && (
                        <span className="tabular text-sm font-bold text-base-content/50">
                          #{player.jersey_number}
                        </span>
                      )}
                      <span className="truncate font-medium">{playerName(player)}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <StatusBadge status={player.status} />
                      {player.position && (
                        <span className="text-xs text-base-content/50">{player.position}</span>
                      )}
                    </div>
                  </div>
                  <EligibilityBadge isEligible={player.is_eligible} />
                </Link>
              </Card>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
