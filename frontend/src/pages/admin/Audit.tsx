import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { Alert, Card, EmptyState, Spinner } from '../../components/ui';
import { IconClipboard } from '../../components/icons';

interface AuditLog {
  id: string;
  user_email: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  ip_address: string | null;
  created_at: string;
}

interface AuditResponse {
  data: AuditLog[];
  meta: { total: number; limit: number; offset: number };
}

/** Etiquetas en español; las acciones sin traducir se muestran tal cual. */
const ACTION_LABELS: Record<string, string> = {
  CREATE_USER: 'Creó un usuario',
  UPDATE_USER: 'Modificó un usuario',
  RESET_PASSWORD: 'Restableció una contraseña',
  CHANGE_PASSWORD: 'Cambió su contraseña',
  CREATE_TEAM: 'Creó un equipo',
  UPDATE_TEAM: 'Modificó un equipo',
  ASSIGN_MANAGER: 'Asignó un encargado',
  REMOVE_MANAGER: 'Removió un encargado',
  CREATE_PLAYER: 'Registró un jugador',
  UPDATE_PLAYER: 'Modificó un jugador',
  UPLOAD_DOCUMENT: 'Subió un documento',
  VIEW_DOCUMENT: 'Consultó una identificación',
  REVIEW_PLAYER_APPROVE: 'Aprobó un jugador',
  REVIEW_PLAYER_REJECT: 'Rechazó un jugador',
  REVIEW_PLAYER_REQUEST_CORRECTION: 'Solicitó una corrección',
  REVIEW_PLAYER_BLOCK: 'Bloqueó un jugador',
  CREATE_SEASON: 'Creó una temporada',
  UPDATE_SEASON: 'Modificó la temporada',
  CREATE_CATEGORY: 'Creó una categoría',
  UPDATE_CATEGORY: 'Modificó una categoría',
  CREATE_FIELD: 'Creó un campo',
  UPDATE_FIELD: 'Modificó un campo',
  UPDATE_SETTING: 'Cambió la configuración',
};

/** Acciones sensibles que conviene distinguir de un vistazo. */
const CRITICAL = new Set([
  'VIEW_DOCUMENT',
  'REVIEW_PLAYER_APPROVE',
  'REVIEW_PLAYER_REJECT',
  'REVIEW_PLAYER_BLOCK',
  'UPDATE_USER',
  'RESET_PASSWORD',
  'UPDATE_SETTING',
]);

const FILTERS = [
  { label: 'Todo', value: '' },
  { label: 'Aprobaciones', value: 'REVIEW_PLAYER' },
  { label: 'Documentos', value: 'DOCUMENT' },
  { label: 'Usuarios', value: 'USER' },
  { label: 'Equipos', value: 'TEAM' },
  { label: 'Configuración', value: 'SETTING' },
];

/** Muestra solo los campos que cambiaron; el resto es ruido. */
const Diff = ({
  before,
  after,
}: {
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
}) => {
  const keys = [...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])];

  const changes = keys.filter((key) => {
    const from = before?.[key];
    const to = after?.[key];
    if (to === undefined || to === null) return false;
    return JSON.stringify(from) !== JSON.stringify(to);
  });

  if (changes.length === 0) return null;

  const show = (value: unknown) => {
    if (value === undefined || value === null) return '—';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  };

  return (
    <dl className="mt-1.5 space-y-0.5 text-xs">
      {changes.slice(0, 6).map((key) => (
        <div key={key} className="flex flex-wrap gap-1">
          <dt className="text-base-content/40">{key}:</dt>
          <dd className="text-base-content/70">
            {before?.[key] !== undefined && (
              <>
                <span className="line-through opacity-50">{show(before[key])}</span>
                <span className="mx-1 opacity-40">→</span>
              </>
            )}
            <span>{show(after?.[key])}</span>
          </dd>
        </div>
      ))}
    </dl>
  );
};

export default function AdminAudit() {
  const [filter, setFilter] = useState('');
  const [page, setPage] = useState(0);
  const pageSize = 50;

  const logs = useQuery({
    queryKey: ['audit', filter, page],
    queryFn: () => {
      const params = new URLSearchParams({
        limit: String(pageSize),
        offset: String(page * pageSize),
      });
      if (filter) params.set('action', filter);
      // Este endpoint devuelve data y meta, así que se pide sin desenvolver.
      return api.get<AuditResponse['data']>(`/admin/audit?${params}`);
    },
  });

  if (logs.isLoading) return <Spinner />;
  if (logs.isError) {
    return <Alert tone="error">No se pudo cargar la bitácora.</Alert>;
  }

  const rows = logs.data ?? [];

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="text-xl font-bold">Auditoría</h1>
        <p className="text-sm text-base-content/60">
          Registro de acciones críticas. Es de solo lectura: no se puede editar ni borrar.
        </p>
      </div>

      <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar">
        {FILTERS.map((option) => (
          <button
            key={option.value}
            onClick={() => {
              setFilter(option.value);
              setPage(0);
            }}
            className={`min-h-11 shrink-0 rounded-full border px-3 py-2 text-xs ${
              filter === option.value
                ? 'border-primary bg-primary/15 text-primary'
                : 'border-base-content/20 text-base-content/60'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={<IconClipboard size={40} />}
            title="Sin registros en este filtro"
            description="Las acciones sobre jugadores, documentos y usuarios se registran automáticamente."
          />
        </Card>
      ) : (
        <>
          <Card className="divide-y divide-base-300">
            {rows.map((log) => (
              <div key={log.id} className="px-3 py-2.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm">
                      {CRITICAL.has(log.action) && (
                        <span
                          className="mr-1.5 inline-block size-1.5 rounded-full bg-warning align-middle"
                          aria-label="Acción sensible"
                        />
                      )}
                      <span className="font-medium">
                        {ACTION_LABELS[log.action] ?? log.action}
                      </span>
                    </p>
                    <p className="mt-0.5 truncate text-xs text-base-content/50">
                      {log.user_email ?? 'sistema'}
                      {log.entity_type && ` · ${log.entity_type}`}
                    </p>
                    <Diff before={log.old_value} after={log.new_value} />
                  </div>
                  <time
                    className="shrink-0 text-xs text-base-content/40"
                    dateTime={log.created_at}
                  >
                    {new Date(log.created_at).toLocaleDateString('es-MX', {
                      day: 'numeric',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </time>
                </div>
              </div>
            ))}
          </Card>

          <div className="flex items-center justify-between">
            <button
              onClick={() => setPage((current) => Math.max(0, current - 1))}
              className="btn btn-sm"
              disabled={page === 0}
            >
              Anterior
            </button>
            <span className="text-xs text-base-content/50">Página {page + 1}</span>
            <button
              onClick={() => setPage((current) => current + 1)}
              className="btn btn-sm"
              disabled={rows.length < pageSize}
            >
              Siguiente
            </button>
          </div>
        </>
      )}
    </div>
  );
}
