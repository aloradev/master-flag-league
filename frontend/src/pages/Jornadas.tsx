import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { Season } from '../lib/types';
import { Alert, Card, EmptyState, Spinner } from '../components/ui';
import { IconFootball } from '../components/icons';
import { TeamCrest } from '../components/AuthImage';
import {
  competition,
  ETIQUETA_JORNADA,
  ETIQUETA_PARTIDO,
  MOTIVO_DESCANSO,
  fechaLarga,
  hora12,
  type Game,
} from '../lib/competition';

/** Un partido, tal como se ve en el centro de jornada. */
const Partido = ({ g }: { g: Game }) => {
  const etiqueta = ETIQUETA_PARTIDO[g.status];
  const cerrado = g.status === 'FINISHED' || g.status === 'WALKOVER';
  const ganoLocal = cerrado && g.home_score > g.away_score;
  const ganoVisita = cerrado && g.away_score > g.home_score;

  return (
    <Card as="li" className={g.status === 'CANCELLED' ? 'opacity-50' : undefined}>
      <div className="flex items-center justify-between gap-2 border-b border-base-300/60 px-3 py-1.5 text-[11px]">
        <span className="font-semibold" style={{ color: g.category_color }}>
          {g.category_name}
        </span>
        <span className="text-base-content/55">
          {g.field_name ?? 'Sin campo'} · {hora12(g.scheduled_time)}
        </span>
        <span className={`badge badge-xs ${etiqueta.tono}`}>{etiqueta.texto}</span>
      </div>

      <div className="space-y-1 px-3 py-2">
        {[
          { name: g.home_team_name, short: g.home_short_name, logo: g.home_logo_url,
            color: g.home_color, score: g.home_score, gano: ganoLocal },
          { name: g.away_team_name, short: g.away_short_name, logo: g.away_logo_url,
            color: g.away_color, score: g.away_score, gano: ganoVisita },
        ].map((e) => (
          <div key={e.name} className="flex items-center gap-2">
            <TeamCrest
              name={e.name}
              shortName={e.short}
              logoUrl={e.logo}
              color={e.color ?? undefined}
              className="size-7"
            />
            <span className={`min-w-0 flex-1 truncate text-sm ${e.gano ? 'font-bold' : ''}`}>
              {e.name}
            </span>
            {cerrado && (
              <span className={`tabular text-lg ${e.gano ? 'font-black' : 'font-semibold opacity-70'}`}>
                {e.score}
              </span>
            )}
          </div>
        ))}
      </div>

      {g.status === 'WALKOVER' && (
        <p className="border-t border-base-300/60 px-3 py-1.5 text-[11px] text-base-content/60">
          Ganado por incomparecencia{g.notes ? ` · ${g.notes}` : ''}
        </p>
      )}

      {(g.referees ?? []).length > 0 && (
        <p className="border-t border-base-300/60 px-3 py-1.5 text-[11px] text-base-content/55">
          {g.referees!.map((r) => r.name).join(' · ')}
        </p>
      )}
    </Card>
  );
};

/**
 * CENTRO DE JORNADA
 *
 * Una noche de liga entera en una pantalla: qué se juega, a qué hora, en
 * qué campo, quién arbitra y quién descansa. Los descansos se muestran
 * con su motivo porque "¿por qué no jugamos?" es la primera pregunta que
 * llega al administrador.
 */
export default function Jornadas() {
  const [abierta, setAbierta] = useState<string | null>(null);

  const season = useQuery({
    queryKey: ['season-active'],
    queryFn: () => api.get<Season>('/seasons/active'),
    retry: false,
  });
  const seasonId = season.data?.id;

  const jornadas = useQuery({
    queryKey: ['rounds', seasonId],
    queryFn: () => competition.rounds(seasonId),
    enabled: Boolean(seasonId),
  });

  // La jornada abierta por omisión es la primera de la lista (la más
  // reciente): al entrar se quiere ver lo que se juega ahora.
  const lista = jornadas.data ?? [];
  const activaId = abierta ?? lista[0]?.id ?? null;

  const detalle = useQuery({
    queryKey: ['round', activaId],
    queryFn: () => competition.round(activaId!),
    enabled: Boolean(activaId),
  });

  if (season.isLoading || jornadas.isLoading) return <Spinner label="Cargando jornadas…" />;
  if (season.error) return <Alert tone="error">No hay temporada activa.</Alert>;

  if (lista.length === 0) {
    return (
      <EmptyState
        icon={<IconFootball size={40} />}
        title="Todavía no hay jornadas"
        description="Cuando administración publique la primera, aparecerá aquí con horarios, campos y árbitros."
      />
    );
  }

  const d = detalle.data;
  const porCategoria = new Map<string, Game[]>();
  for (const g of d?.games ?? []) {
    if (!porCategoria.has(g.category_name)) porCategoria.set(g.category_name, []);
    porCategoria.get(g.category_name)!.push(g);
  }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-bold">Jornadas</h1>
        <p className="text-sm text-base-content/60">{season.data?.name}</p>
      </header>

      {/* Selector horizontal: en celular se desliza con el pulgar. */}
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {lista.map((j) => {
          const etiqueta = ETIQUETA_JORNADA[j.status];
          const activa = j.id === activaId;
          return (
            <button
              key={j.id}
              type="button"
              onClick={() => setAbierta(j.id)}
              className={`shrink-0 rounded-box border px-3 py-2 text-left transition-colors ${
                activa
                  ? 'border-primary bg-primary/10'
                  : 'border-base-300/70 bg-base-200/60 hover:bg-base-300/40'
              }`}
            >
              <span className="block text-sm font-bold">Jornada {j.number}</span>
              <span className="block text-[11px] text-base-content/55">
                {j.games_count} {j.games_count === 1 ? 'partido' : 'partidos'}
              </span>
              <span className={`badge badge-xs mt-1 ${etiqueta.tono}`}>{etiqueta.texto}</span>
            </button>
          );
        })}
      </div>

      {detalle.isLoading && <Spinner />}
      {detalle.error && <Alert tone="error">{(detalle.error as Error).message}</Alert>}

      {d && (
        <div className="space-y-5">
          <Card className="px-4 py-3">
            <p className="text-sm font-semibold">{d.name ?? `Jornada ${d.number}`}</p>
            <p className="text-sm text-base-content/70">{fechaLarga(d.scheduled_date)}</p>
            {d.slots.length > 0 && (
              <p className="mt-1 text-xs text-base-content/55">
                Horarios: {d.slots.map(hora12).join(' · ')}
              </p>
            )}
            {d.finished_count > 0 && (
              <p className="mt-1 text-xs text-base-content/55">
                {d.finished_count} de {d.games_count} partidos cerrados
              </p>
            )}
            {d.notes && <p className="mt-2 text-xs italic text-base-content/60">{d.notes}</p>}
          </Card>

          {[...porCategoria.entries()].map(([nombre, partidos]) => (
            <section key={nombre} className="space-y-2">
              <h2 className="text-sm font-bold">{nombre}</h2>
              <ul className="grid gap-2 sm:grid-cols-2">
                {partidos.map((g) => (
                  <Partido key={g.id} g={g} />
                ))}
              </ul>
            </section>
          ))}

          {d.byes.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-sm font-bold">Descansan esta jornada</h2>
              <ul className="grid gap-2 sm:grid-cols-2">
                {d.byes.map((b) => (
                  <Card as="li" key={b.team_id} className="flex items-center gap-2 px-3 py-2">
                    <TeamCrest
                      name={b.team_name}
                      shortName={b.short_name}
                      logoUrl={b.logo_url}
                      className="size-7"
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold">{b.team_name}</span>
                      <span className="block text-[11px] text-base-content/55">
                        {b.category_name} · {MOTIVO_DESCANSO[b.reason] ?? b.reason}
                      </span>
                    </span>
                  </Card>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
