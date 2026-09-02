import type { PlayerStatus } from '../lib/types';

/**
 * Semáforo de estado (req. 7). Los mismos colores en toda la plataforma:
 * 🟡 pendiente · 🟢 aprobado · 🔴 rechazado o corrección · ⚫ bloqueado
 */
const STATUS_MAP: Record<PlayerStatus, { label: string; className: string; dot: string }> = {
  PENDING: {
    label: 'Pendiente',
    className: 'border-warning/40 bg-warning/10 text-warning',
    dot: 'bg-warning',
  },
  APPROVED: {
    label: 'Aprobado',
    className: 'border-success/40 bg-success/10 text-success',
    dot: 'bg-success',
  },
  CORRECTIONS_REQUIRED: {
    label: 'Requiere corrección',
    className: 'border-error/40 bg-error/10 text-error',
    dot: 'bg-error',
  },
  REJECTED: {
    label: 'Rechazado',
    className: 'border-error/40 bg-error/10 text-error',
    dot: 'bg-error',
  },
  BLOCKED: {
    label: 'Bloqueado',
    className: 'border-base-content/25 bg-base-300 text-base-content/70',
    dot: 'bg-base-content/50',
  },
};

export const StatusBadge = ({ status }: { status: PlayerStatus }) => {
  const config = STATUS_MAP[status] ?? STATUS_MAP.PENDING;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${config.className}`}
    >
      <span className={`size-1.5 rounded-full ${config.dot}`} aria-hidden />
      {config.label}
    </span>
  );
};

/**
 * Elegibilidad — lo único que necesita ver el árbitro.
 * Deriva del estado y la documentación; nunca se captura a mano.
 */
export const EligibilityBadge = ({
  isEligible,
  size = 'sm',
}: {
  isEligible: boolean;
  size?: 'sm' | 'lg';
}) => {
  const big = size === 'lg';
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border font-semibold ${
        big ? 'px-4 py-1.5 text-sm' : 'px-2.5 py-0.5 text-xs'
      } ${
        isEligible
          ? 'border-success/50 bg-success/15 text-success'
          : 'border-error/50 bg-error/15 text-error'
      }`}
    >
      <span
        className={`rounded-full ${big ? 'size-2.5' : 'size-2'} ${
          isEligible ? 'bg-success' : 'bg-error'
        }`}
        aria-hidden
      />
      {isEligible ? 'Elegible' : 'No elegible'}
    </span>
  );
};
