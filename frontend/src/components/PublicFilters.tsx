import type { ReactNode } from 'react';
import { IconCircleX } from './icons';

export function PublicFilters({ label, activeCount, onClear, children, threeColumns = false }: {
  label: string; activeCount: number; onClear: () => void; children: ReactNode; threeColumns?: boolean;
}) {
  return <section aria-label={label} className="public-filters">
    <div className="public-filters-heading"><div className="flex flex-wrap items-center gap-2"><h2 className="text-sm font-bold">Filtros</h2><span role="status" className="text-xs text-base-content/65">{activeCount ? `${activeCount} ${activeCount === 1 ? 'activo' : 'activos'}` : 'Sin filtros activos'}</span></div><button type="button" className="btn btn-sm btn-ghost min-h-11" disabled={!activeCount} onClick={onClear}><IconCircleX size={16} />Limpiar filtros</button></div>
    <div className={`public-filters-grid ${threeColumns ? 'public-filters-three' : ''}`}>{children}</div>
  </section>;
}
