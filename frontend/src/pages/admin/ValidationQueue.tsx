import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../../lib/api';
import type { QueuePlayer, ValidationQueue as Queue } from '../../lib/types';
import { Alert, Button, Card, EmptyState, Spinner, Stat } from '../../components/ui';
import { StatusBadge } from '../../components/StatusBadge';
import { AuthImage, PlayerAvatar } from '../../components/AuthImage';
import { IconCheckCircle } from '../../components/icons';

type Action = 'APPROVE' | 'REJECT' | 'REQUEST_CORRECTION';

const DOC_LABELS: Record<string, string> = {
  PHOTO: 'Fotografía',
  ID_FRONT: 'ID frente',
  ID_BACK: 'ID reverso',
};

/** Motivos frecuentes: evitan escribir lo mismo decenas de veces. */
const QUICK_REASONS = [
  'La fotografía de la identificación no es legible. Favor de volver a cargarla.',
  'La fotografía del jugador no muestra el rostro con claridad.',
  'El documento subido no corresponde a una identificación oficial.',
  'La identificación está vencida.',
];

const ReviewCard = ({ player, onDone }: { player: QueuePlayer; onDone: () => void }) => {
  const [mode, setMode] = useState<'idle' | 'reject' | 'correction'>('idle');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const review = useMutation({
    mutationFn: (input: { action: Action; reason?: string }) =>
      api.post(`/admin/players/${player.id}/review`, input),
    onSuccess: () => {
      setError(null);
      onDone();
    },
    onError: (err) =>
      setError(err instanceof ApiError ? err.message : 'No se pudo registrar la decisión'),
  });

  const submitReason = (action: Action) => {
    if (!reason.trim()) return;
    review.mutate({ action, reason: reason.trim() });
  };

  return (
    <Card className="overflow-hidden">
      {/* Franja con el color del equipo */}
      <div className="h-1" style={{ backgroundColor: player.team_color }} />

      <div className="space-y-3 p-4">
        <div className="flex items-start gap-3">
          <PlayerAvatar
            avatarUrl={player.avatar_url}
            name={player.full_name}
            jersey={player.jersey_number}
            size="md"
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              {player.jersey_number != null && (
                <span className="tabular text-sm font-bold text-base-content/50">
                  #{player.jersey_number}
                </span>
              )}
              <p className="truncate font-semibold">{player.full_name}</p>
            </div>
            <p className="text-sm text-base-content/60">
              {player.team_name} · {player.category_name}
              {player.position && ` · ${player.position}`}
            </p>
            <div className="mt-1.5">
              <StatusBadge status={player.status} />
            </div>
          </div>
        </div>

        {/* Si ya se le pidió corrección antes, el admin necesita ese contexto */}
        {player.last_reason && player.status === 'CORRECTIONS_REQUIRED' && (
          <p className="rounded-field bg-base-300/60 px-3 py-2 text-xs text-base-content/70">
            <span className="font-medium">Última observación:</span> {player.last_reason}
          </p>
        )}

        {/* Documentos — el admin decide viéndolos, sin abrir otra pantalla */}
        {player.documents.length > 0 && (
          <div className="grid max-w-md grid-cols-3 gap-2">
            {player.documents.map((doc) => (
              <div key={doc.id}>
                <AuthImage
                  fileUrl={doc.url}
                  alt={DOC_LABELS[doc.type] ?? doc.type}
                  mimeType={doc.mime_type}
                  className="aspect-4/3 w-full rounded-field"
                  thumbnail
                />
                <p className="mt-1 truncate text-center text-xs text-base-content/50">
                  {DOC_LABELS[doc.type] ?? doc.type}
                  {doc.version > 1 && ` · v${doc.version}`}
                </p>
              </div>
            ))}
          </div>
        )}

        {player.missing_documents.length > 0 && (
          <Alert tone="warning">
            Falta {player.missing_documents.map((d) => d.label).join(', ')}. No se puede
            aprobar hasta que el manager la cargue.
          </Alert>
        )}

        {error && <Alert tone="error">{error}</Alert>}

        {/* Acciones */}
        {mode === 'idle' ? (
          <div className="flex flex-wrap gap-2">
            <Button
              tone="success"
              onClick={() => review.mutate({ action: 'APPROVE' })}
              loading={review.isPending}
              disabled={!player.ready_to_review}
              title={player.ready_to_review ? undefined : 'Falta documentación por cargar'}
              className="flex-1 sm:flex-none"
            >
              {review.isPending ? 'Aprobando…' : 'Aprobar'}
            </Button>
            <Button
              tone="warning"
              outline
              onClick={() => {
                setMode('correction');
                setReason('');
              }}
              disabled={review.isPending}
              className="flex-1 sm:flex-none"
            >
              Pedir corrección
            </Button>
            <Button
              tone="error"
              outline
              onClick={() => {
                setMode('reject');
                setReason('');
              }}
              disabled={review.isPending}
              className="flex-1 sm:flex-none"
            >
              Rechazar
            </Button>
          </div>
        ) : (
          <div className="space-y-2 rounded-field bg-base-300/40 p-3">
            <p className="text-sm font-medium">
              {mode === 'correction'
                ? '¿Qué debe corregir el manager?'
                : 'Motivo del rechazo'}
            </p>

            <div className="flex flex-wrap gap-1.5">
              {QUICK_REASONS.map((quick) => (
                <button
                  key={quick}
                  type="button"
                  onClick={() => setReason(quick)}
                  className="rounded-full border border-base-content/20 px-2.5 py-1 text-left text-xs text-base-content/70 hover:border-primary hover:text-primary"
                >
                  {quick.length > 44 ? `${quick.slice(0, 44)}…` : quick}
                </button>
              ))}
            </div>

            <textarea
              className="textarea textarea-bordered w-full text-sm"
              rows={3}
              placeholder="El manager verá exactamente este mensaje."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              autoFocus
            />

            <div className="flex gap-2">
              <Button
                tone="ghost"
                size="sm"
                onClick={() => setMode('idle')}
                disabled={review.isPending}
                className="flex-1"
              >
                Cancelar
              </Button>
              <Button
                tone={mode === 'correction' ? 'warning' : 'error'}
                size="sm"
                onClick={() =>
                  submitReason(mode === 'correction' ? 'REQUEST_CORRECTION' : 'REJECT')
                }
                loading={review.isPending}
                disabled={!reason.trim()}
                className="flex-1"
              >
                {review.isPending ? 'Enviando…' : 'Enviar y notificar'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
};

export default function ValidationQueue() {
  const queryClient = useQueryClient();
  const [onlyReady, setOnlyReady] = useState(false);

  const queue = useQuery({
    queryKey: ['validation-queue'],
    queryFn: () => api.get<Queue>('/admin/validation/queue'),
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['validation-queue'] });
    void queryClient.invalidateQueries({ queryKey: ['validation-stats'] });
  };

  if (queue.isLoading) return <Spinner label="Cargando la cola de revisión…" />;
  if (queue.isError) return <Alert tone="error">No se pudo cargar la cola de validación.</Alert>;

  const data = queue.data!;
  const players = onlyReady ? data.players.filter((p) => p.ready_to_review) : data.players;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="text-xl font-bold">Validación de jugadores</h1>
        <p className="text-sm text-base-content/60">
          Registros esperando decisión, del más antiguo al más reciente.
        </p>
      </div>

      <div className="grid max-w-md grid-cols-3 gap-2">
        <Stat value={data.total} label="En cola" />
        <Stat value={data.ready_to_review} label="Listos" tone="success" />
        <Stat value={data.awaiting_documents} label="Sin documentos" tone="warning" />
      </div>

      {data.awaiting_documents > 0 && (
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="checkbox checkbox-sm checkbox-primary"
            checked={onlyReady}
            onChange={(e) => setOnlyReady(e.target.checked)}
          />
          Mostrar solo los que puedo resolver ahora
        </label>
      )}

      {players.length === 0 ? (
        <Card>
          <EmptyState
            icon={<IconCheckCircle size={40} />}
            title={data.total === 0 ? 'No hay nada por revisar' : 'Nada listo por ahora'}
            description={
              data.total === 0
                ? 'Cuando los managers registren jugadores, aparecerán aquí.'
                : 'Los registros en cola esperan que el manager cargue su documentación.'
            }
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {players.map((player) => (
            <ReviewCard key={player.id} player={player} onDone={refresh} />
          ))}
        </div>
      )}
    </div>
  );
}
