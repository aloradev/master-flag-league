import TeamOverview from './TeamOverview';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import type { TeamDetail, TeamSummary } from '../../lib/types';
import { Card, Spinner, Alert, EmptyState, Stat } from '../../components/ui';
import { StatusBadge, EligibilityBadge } from '../../components/StatusBadge';
import { PlayerAvatar, TeamCrest } from '../../components/AuthImage';
import { IconShield, IconUsers } from '../../components/icons';
import { diasHasta, fechaTexto } from '../../lib/format';
import { activeTeamId, rememberTeam } from '../../lib/teamContext';

const playerName = (p: TeamDetail['roster'][number]) =>
  `${p.first_name} ${p.last_name_paternal}`;

export default function MyTeam() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const huboBaja = searchParams.get('baja') === '1';
  const requestedTeamId = searchParams.get('equipo');

  const teams = useQuery({
    queryKey: ['teams-managed'],
    queryFn: () => api.get<TeamSummary[]>('/teams?managed=true'),
  });

  const teamId =
    teams.data?.find((candidate) => candidate.id === requestedTeamId)?.id ??
    teams.data?.find((candidate) => candidate.id === activeTeamId())?.id ?? teams.data?.[0]?.id;
  const teamQuery = teamId ? `?equipo=${encodeURIComponent(teamId)}` : '';
  if (teamId && activeTeamId() !== teamId) rememberTeam(teamId);

  const team = useQuery({
    queryKey: ['team', teamId],
    queryFn: () => api.get<TeamDetail>(`/teams/${teamId}`),
    enabled: Boolean(teamId),
  });

  if (teams.isLoading || team.isLoading) return <Spinner label="Cargando tu equipo…" />;

  if (teams.isError || team.isError) {
    return <Alert tone="error">No se pudo cargar la información de tu equipo. <button className="link" onClick={() => { void teams.refetch(); void team.refetch(); }}>Reintentar</button></Alert>;
  }

  if (!teamId) {
    return (
      <div className="space-y-4">
      <Link to="/equipo/nuevo" className="btn btn-primary">Inscribir mi equipo</Link>
      <EmptyState
        icon={<IconShield size={40} />}
        title="Comienza con tu equipo"
        description="Inscribe tu equipo o solicita vincular tu cuenta si ya existe en la liga."
      /></div>
    );
  }

  const data = team.data!;
  const summary = data.registration_summary;
  const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const filteredRoster = data.roster.filter(player => normalize(playerName(player) + ' ' + (player.jersey_number ?? '')).includes(normalize(search.trim())));

  // Req. 30: alertas concretas y accionables, no un panel decorativo.
  const needsAttention = data.roster.filter(
    (p) => p.status === 'CORRECTIONS_REQUIRED' || p.status === 'REJECTED'
  );
  const daysLeft = diasHasta(data.registration_deadline);

  return (
    <div className="mx-auto max-w-3xl space-y-5"><Link to="/equipo/nuevo" className="btn btn-outline btn-sm">Inscribir otro equipo</Link>
      {searchParams.get('inscrito') === '1' && <Alert tone="success" title="Equipo registrado">{data.name} · {data.category_name}. Continúa agregando tu plantilla; cada jugador tendrá su expediente para revisión.</Alert>}
      {huboBaja && (
        <Alert tone="success">El jugador quedó fuera del roster y su número está libre.</Alert>
      )}

      {(teams.data?.length ?? 0) > 1 && (
        <label className="block text-sm font-medium">
          Equipo
          <select
            className="select select-bordered mt-1 w-full sm:w-80"
            value={teamId}
            onChange={(event) => {
              const next = new URLSearchParams(searchParams);
              next.set('equipo', event.target.value);
              next.delete('baja');
              rememberTeam(event.target.value);
              setSearchParams(next);
            }}
          >
            {teams.data!.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.name} · {candidate.category_name}
              </option>
            ))}
          </select>
        </label>
      )}

      {/* Encabezado con la identidad del equipo */}
      <div className="flex items-center gap-4">
        <TeamCrest
          logoUrl={data.logo_url}
          name={data.name}
          shortName={data.short_name}
          color={data.color_primary}
          className="size-14 text-lg"
        />
        <div className="min-w-0">
          <h1 className="truncate text-xl font-bold">{data.name}</h1>
          <p className="text-sm text-base-content/60">
            {data.category_name} · {data.season_name}
          </p>
        </div>
      </div>

      <TeamOverview teamId={teamId} seasonId={data.season_id} />
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
                    to={`/equipo/jugadores/${p.id}${teamQuery}`}
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
              : `Quedan ${daysLeft} día(s) para el cierre de registro (${fechaTexto(
                  data.registration_deadline
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

      <div className="grid grid-cols-2 gap-3"><Link to={`/jornadas?equipo=${encodeURIComponent(teamId)}`} className="btn btn-outline">Ver calendario</Link><Link to={`/equipo/pagos${teamQuery}`} className="btn btn-outline">Consultar pagos</Link></div>{/* Plantilla */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-base-content/70">Plantilla</h2>
          <Link to={`/equipo/jugadores/nuevo${teamQuery}`} className="btn btn-primary btn-sm">
            Agregar jugador
          </Link>
        </div>

        {data.roster.length > 0 && <label className="mb-3 block text-sm">Buscar en la plantilla<input type="search" className="input mt-1 w-full" placeholder="Nombre o número de jersey" value={search} onChange={event => setSearch(event.target.value)} /><span className="mt-1 block text-xs text-base-content/60" role="status">{filteredRoster.length} de {data.roster.length} jugadores</span></label>}{data.roster.length > 0 && filteredRoster.length === 0 && <EmptyState title="No encontramos jugadores" description="Prueba con otro nombre o número." action={<button className="btn btn-ghost" onClick={() => setSearch('')}>Limpiar búsqueda</button>} />}{data.roster.length === 0 ? (
          <Card>
            <EmptyState
              icon={<IconUsers size={40} />}
              title="Aún no hay jugadores"
              description="Registra a tu primer jugador y sube su documentación para que administración lo valide."
              action={
                <Link to={`/equipo/jugadores/nuevo${teamQuery}`} className="btn btn-primary btn-sm">
                  Agregar jugador
                </Link>
              }
            />
          </Card>
        ) : (
          <ul className="space-y-2">
            {filteredRoster.map((player) => (
              <Card as="li" key={player.id}>
                <Link
                  to={`/equipo/jugadores/${player.id}${teamQuery}`}
                  className="flex items-center gap-3 p-3 transition-colors hover:bg-base-300/40"
                >
                  <PlayerAvatar
                    avatarUrl={player.avatar_url}
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
