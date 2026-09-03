import { useState, useRef } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../../lib/api';
import type { DocumentType, PlayerDetail as Player } from '../../lib/types';
import { Alert, Button, Card, Spinner } from '../../components/ui';
import { StatusBadge, EligibilityBadge } from '../../components/StatusBadge';
import { AuthImage, PlayerAvatar } from '../../components/AuthImage';
import { IconCheckCircle, IconCircleX, IconPlus } from '../../components/icons';
import { fileSize } from '../../lib/format';

/** Orden de captura del flujo del manager (req. 48). */
const DOC_ORDER: { type: DocumentType; label: string; help: string }[] = [
  { type: 'PHOTO', label: 'Fotografía del jugador', help: 'Rostro visible, tipo credencial' },
  { type: 'ID_FRONT', label: 'Identificación — frente', help: 'Debe ser legible' },
  { type: 'ID_BACK', label: 'Identificación — reverso', help: 'Debe ser legible' },
];

const DocumentSlot = ({
  playerId,
  type,
  label,
  help,
  document,
  onUploaded,
}: {
  playerId: string;
  type: DocumentType;
  label: string;
  help: string;
  document: Player['documents'][number] | null;
  onUploaded: () => void;
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('documentType', type);
      formData.append('file', file);
      return api.upload(`/players/${playerId}/documents`, formData);
    },
    onSuccess: () => {
      setError(null);
      onUploaded();
    },
    onError: (err) =>
      setError(err instanceof ApiError ? err.message : 'No se pudo subir el archivo'),
  });

  const handleFile = (file?: File) => {
    if (file) upload.mutate(file);
    // Permite volver a elegir el mismo archivo si hubo error.
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <Card className="p-3">
      <div className="flex items-start gap-3">
        {/* Vista previa o marcador */}
        {document ? (
          <AuthImage
            fileUrl={document.file_url}
            alt={label}
            mimeType={document.mime_type}
            className="size-16 shrink-0 rounded-field"
            thumbnail
          />
        ) : (
          <div className="flex size-16 shrink-0 items-center justify-center rounded-field border border-dashed border-base-content/25 text-base-content/30">
            <IconPlus size={22} />
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{label}</p>
              <p className="text-xs text-base-content/50">
                {document
                  ? `Versión ${document.version} · ${fileSize(document.file_size)}`
                  : help}
              </p>
            </div>
            <span className={document ? 'text-success' : 'text-base-content/25'}>
              {document ? <IconCheckCircle size={18} /> : <IconCircleX size={18} />}
            </span>
          </div>

          {document?.review_notes && (
            <p className="mt-1.5 rounded-field bg-error/10 px-2 py-1 text-xs text-error">
              {document.review_notes}
            </p>
          )}

          {error && <p className="mt-1.5 text-xs text-error">{error}</p>}

          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,application/pdf"
            // En celular abre la cámara directamente (req. 48).
            capture={type === 'PHOTO' ? 'user' : 'environment'}
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0])}
          />

          <Button
            type="button"
            size="sm"
            onClick={() => inputRef.current?.click()}
            loading={upload.isPending}
            className="mt-2 w-full sm:w-auto"
          >
            {upload.isPending ? 'Subiendo…' : document ? 'Reemplazar' : 'Subir archivo'}
          </Button>
        </div>
      </div>
    </Card>
  );
};

export default function PlayerDetail() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const isNew = searchParams.get('nuevo') === '1';
  const guardado = searchParams.get('guardado') === '1';
  const volvioARevision = searchParams.get('revision') === '1';
  const queryClient = useQueryClient();

  const player = useQuery({
    queryKey: ['player', id],
    queryFn: () => api.get<Player>(`/players/${id}`),
    enabled: Boolean(id),
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['player', id] });
    void queryClient.invalidateQueries({ queryKey: ['team'] });
  };

  if (player.isLoading) return <Spinner />;
  if (player.isError || !player.data) {
    return <Alert tone="error">No se pudo cargar la información del jugador.</Alert>;
  }

  const data = player.data;
  const lastRejection = data.approval_history.find(
    (entry) => entry.action === 'REQUEST_CORRECTION' || entry.action === 'REJECT'
  );
  const showRejection =
    lastRejection &&
    (data.status === 'CORRECTIONS_REQUIRED' || data.status === 'REJECTED');

  const documentFor = (type: DocumentType) =>
    data.documents.find((doc) => doc.document_type === type) ?? null;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link to="/equipo" className="inline-block text-sm text-base-content/60 hover:text-base-content">
        ← Mi equipo
      </Link>

      {isNew && (
        <Alert tone="info" title="Jugador registrado">
          Ahora sube su fotografía e identificación. Cuando esté completa, administración
          la revisará.
        </Alert>
      )}

      {guardado && <Alert tone="success">Cambios guardados.</Alert>}

      {volvioARevision && (
        <Alert tone="warning" title="El jugador volvió a revisión">
          Cambió su fecha de nacimiento, así que la aprobación anterior ya no respalda el
          expediente. Administración tiene que revisarlo de nuevo; mientras tanto no es
          elegible para jugar.
        </Alert>
      )}

      {/* Identidad y semáforo */}
      <Card className="p-4">
        <div className="flex items-start gap-4">
          <PlayerAvatar avatarUrl={data.avatar_url} name={data.full_name} jersey={data.jersey_number} size="lg" />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              {data.jersey_number != null && (
                <span className="tabular text-lg font-bold text-base-content/50">
                  #{data.jersey_number}
                </span>
              )}
              <h1 className="truncate text-lg font-bold">{data.full_name}</h1>
            </div>
            <p className="text-sm text-base-content/60">
              {data.team_name} · {data.category_name}
              {data.position && ` · ${data.position}`}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <StatusBadge status={data.status} />
              <EligibilityBadge isEligible={data.is_eligible} />
            </div>
          </div>

          <Link to={`/equipo/jugadores/${id}/editar`} className="btn btn-sm shrink-0">
            Editar
          </Link>
        </div>

        {/* Los datos capturados: hasta ahora la ficha no los mostraba, así
            que no había forma de detectar un dedazo sin abrir la base. */}
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-base-300 pt-3 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-xs text-base-content/50">Nacimiento</dt>
            <dd className="tabular">{(data.date_of_birth ?? '').slice(0, 10) || '—'}</dd>
          </div>
          <div>
            <dt className="text-xs text-base-content/50">Posición</dt>
            <dd>{data.position ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-xs text-base-content/50">Teléfono</dt>
            <dd className="tabular truncate">{data.phone ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-xs text-base-content/50">Correo</dt>
            <dd className="truncate">{data.email ?? '—'}</dd>
          </div>
        </dl>

        {!data.is_eligible && data.eligibility.reason && (
          <p className="mt-3 border-t border-base-300 pt-3 text-sm text-base-content/70">
            {data.eligibility.reason}
          </p>
        )}
      </Card>

      {/* Motivo de rechazo o corrección */}
      {showRejection && (
        <Alert
          tone="error"
          title={
            lastRejection.action === 'REQUEST_CORRECTION'
              ? 'Administración solicitó una corrección'
              : 'El registro fue rechazado'
          }
        >
          <p>{lastRejection.reason}</p>
          <p className="mt-1 text-xs opacity-70">
            Sube el documento corregido y volverá automáticamente a revisión.
          </p>
        </Alert>
      )}

      {/* Documentación */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-base-content/70">Documentación</h2>
        {DOC_ORDER.map((doc) => (
          <DocumentSlot
            key={doc.type}
            playerId={data.id}
            type={doc.type}
            label={doc.label}
            help={doc.help}
            document={documentFor(doc.type)}
            onUploaded={refresh}
          />
        ))}
      </section>

      {/* Historial */}
      {data.approval_history.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-base-content/70">Historial</h2>
          <Card className="divide-y divide-base-300">
            {data.approval_history.map((entry, index) => (
              <div key={index} className="px-3 py-2.5 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">
                    {{
                      APPROVE: 'Aprobado',
                      REJECT: 'Rechazado',
                      REQUEST_CORRECTION: 'Corrección solicitada',
                      BLOCK: 'Bloqueado',
                    }[entry.action] ?? entry.action}
                  </span>
                  <span className="shrink-0 text-xs text-base-content/50">
                    {new Date(entry.created_at).toLocaleDateString('es-MX', {
                      day: 'numeric',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
                {entry.reason && (
                  <p className="mt-0.5 text-xs text-base-content/60">{entry.reason}</p>
                )}
                {entry.reviewed_by && (
                  <p className="mt-0.5 text-xs text-base-content/40">Por {entry.reviewed_by}</p>
                )}
              </div>
            ))}
          </Card>
        </section>
      )}
    </div>
  );
}
