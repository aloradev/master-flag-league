/**
 * Logo de la liga.
 *
 * Se sirven tres tamaños en WebP y cada uso pide el más pequeño que le
 * sirva: el original de 2 MB en una barra de navegación de 32 px sería
 * desperdicio puro. El escudo trae su propio fondo oscuro, así que la
 * misma imagen funciona en tema claro y oscuro.
 */
const SOURCES = {
  sm: '/logo-96.webp',
  md: '/logo-256.webp',
  lg: '/logo.webp',
} as const;

interface Props {
  size?: keyof typeof SOURCES;
  className?: string;
  /** Solo en la pantalla de acceso: ahí el logo es el contenido principal. */
  priority?: boolean;
}

export const Logo = ({ size = 'sm', className = '', priority = false }: Props) => (
  <img
    src={SOURCES[size]}
    alt="Master Flag League Cancún"
    className={className}
    loading={priority ? 'eager' : 'lazy'}
    fetchPriority={priority ? 'high' : 'auto'}
    decoding={priority ? 'sync' : 'async'}
    draggable={false}
  />
);
