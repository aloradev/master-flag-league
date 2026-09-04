/** Tamaño de archivo legible: 840 B, 12.4 KB, 3.1 MB. */
export const fileSize = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

/**
 * Fecha de calendario, venga como venga del servidor.
 *
 * Postgres guarda DATE y el driver lo entrega como `Date`, que al
 * serializarse a JSON llega como "2026-09-12T00:00:00.000Z". Estas
 * pantallas concatenaban "T12:00:00" al valor —pensando en un
 * "2026-09-12" pelón— y producían "…000ZT12:00:00", que es Invalid Date.
 *
 * No era solo el texto feo "inicia el Invalid Date": la resta de días
 * daba NaN, y como `NaN >= 0` es falso, los avisos de "faltan N días
 * para el inicio" y "el registro cierra en N días" no se pintaban nunca.
 * El aviso más importante de la temporada estaba desaparecido.
 *
 * El mediodía evita que el huso de Cancún (UTC-5) corra la fecha un día
 * hacia atrás al formatearla.
 */
export const diaCalendario = (valor?: string | null): Date | null => {
  if (!valor) return null;
  const soloFecha = valor.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(soloFecha)) return null;
  const d = new Date(`${soloFecha}T12:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
};

/** La fecha en palabras, o una raya si el servidor no mandó nada. */
export const fechaTexto = (
  valor?: string | null,
  opciones: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long' }
): string => {
  const d = diaCalendario(valor);
  return d ? d.toLocaleDateString('es-MX', opciones) : '—';
};

/** Días que faltan, redondeando hacia arriba. `null` si no hay fecha. */
export const diasHasta = (valor?: string | null): number | null => {
  const d = diaCalendario(valor);
  return d ? Math.ceil((d.getTime() - Date.now()) / 86_400_000) : null;
};
