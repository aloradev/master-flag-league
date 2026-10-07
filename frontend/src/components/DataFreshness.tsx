export function DataFreshness({ label, query }: { label: string; query: {
  dataUpdatedAt: number; isFetching: boolean; isError: boolean; refetch: () => unknown;
} }) {
  if (!query.dataUpdatedAt) return null;
  const date = new Date(query.dataUpdatedAt);
  return <div className="public-data-freshness my-3 text-xs text-base-content/65">
    <p>{label} · Última consulta correcta: <time dateTime={date.toISOString()}>{new Intl.DateTimeFormat('es-MX', { timeZone: 'America/Cancun', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(date)}</time> (Cancún).</p>
    {query.isFetching ? <p>Consultando de nuevo…</p> : query.isError && <div role="status"><p>No se pudo renovar la consulta. Se conserva la información anterior.</p><button type="button" className="btn btn-sm btn-ghost mt-1" aria-label={`Reintentar consulta: ${label}`} onClick={() => void query.refetch()}>Reintentar consulta</button></div>}
  </div>;
}
