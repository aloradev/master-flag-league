import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Card, EmptyState, Spinner } from '../../components/ui';
import { IconFootball } from '../../components/icons';
import { TeamCrest } from '../../components/AuthImage';
import {
  competition,
  ETIQUETA_PARTIDO,
  fechaLarga,
  hora12,
  type Game,
} from '../../lib/competition';

/**
 * Primera pantalla del árbitro.
 *
 * Llega al campo, abre la aplicación y ve su partido. Sin menús, sin
 * buscar la jornada, sin elegir la categoría: la API ya sabe cuáles le
 * asignaron.
 */
const MyGames = () => {
  const [games, setGames] = useState<Game[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    competition
      .myGames()
      .then(setGames)
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <Alert tone="error">{error}</Alert>;
  if (!games) return <Spinner label="Buscando tus partidos…" />;

  if (games.length === 0) {
    return (
      <EmptyState
        icon={<IconFootball size={40} />}
        title="No tienes partidos asignados"
        description="Cuando administración publique la jornada y te asigne un partido, aparecerá aquí."
      />
    );
  }

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-bold">Mis partidos</h1>
        <p className="text-sm text-base-content/60">
          {games.length === 1 ? 'Tienes un partido asignado' : `Tienes ${games.length} partidos asignados`}
        </p>
      </header>

      <ul className="space-y-3">
        {games.map((g) => {
          const etiqueta = ETIQUETA_PARTIDO[g.status];
          return (
            <Card as="li" key={g.id}>
              <Link
                to={`/arbitro/partido/${g.id}`}
                className="block p-4 transition-colors hover:bg-base-300/40 rounded-box"
              >
                <div className="flex items-center justify-between gap-2">
                  <span
                    className="rounded-field px-2 py-0.5 text-xs font-semibold"
                    style={{ backgroundColor: `${g.category_color}22`, color: g.category_color }}
                  >
                    {g.category_name}
                  </span>
                  <span className={`badge badge-sm ${etiqueta.tono}`}>{etiqueta.texto}</span>
                </div>

                <div className="mt-3 flex items-center gap-3">
                  <TeamCrest name={g.home_team_name} shortName={g.home_short_name}
                    logoUrl={g.home_logo_url} color={g.home_color ?? undefined} className="size-10" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold leading-tight">{g.home_team_name}</p>
                    <p className="text-xs text-base-content/50">vs</p>
                    <p className="truncate font-semibold leading-tight">{g.away_team_name}</p>
                  </div>
                  <TeamCrest name={g.away_team_name} shortName={g.away_short_name}
                    logoUrl={g.away_logo_url} color={g.away_color ?? undefined} className="size-10" />
                </div>

                <dl className="mt-3 grid grid-cols-3 gap-2 border-t border-base-300/60 pt-3 text-xs">
                  <div>
                    <dt className="text-base-content/50">Jornada</dt>
                    <dd className="font-semibold">{g.round_number}</dd>
                  </div>
                  <div>
                    <dt className="text-base-content/50">Campo</dt>
                    <dd className="font-semibold">{g.field_name ?? '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-base-content/50">Hora</dt>
                    <dd className="tabular font-semibold">{hora12(g.scheduled_time)}</dd>
                  </div>
                </dl>
                <p className="mt-2 text-xs text-base-content/50">{fechaLarga(g.scheduled_date)}</p>
              </Link>
            </Card>
          );
        })}
      </ul>
    </div>
  );
};

export default MyGames;
