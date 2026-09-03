import type { SVGProps } from 'react';

/**
 * Set de iconos propio.
 *
 * Se dibujan a mano en lugar de usar emoji porque el emoji lo renderiza
 * el sistema operativo: cambia de forma entre Windows, iOS y Android,
 * no hereda el color del tema y arrastra un aspecto informal que choca
 * con una plataforma deportiva. Estos son trazos de 1.75px sobre una
 * caja de 24, con `currentColor`, así que siguen el tema y el estado
 * activo sin más código.
 */

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

const Svg = ({ size = 20, children, ...rest }: IconProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.75}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
    {...rest}
  >
    {children}
  </svg>
);

/** Panel: barras de un tablero. */
export const IconDashboard = (props: IconProps) => (
  <Svg {...props}>
    <path d="M4 20V13" />
    <path d="M9.33 20V4" />
    <path d="M14.67 20V9" />
    <path d="M20 20v-6" />
  </Svg>
);

/** Validación: verificación dentro de un círculo. */
export const IconCheckCircle = (props: IconProps) => (
  <Svg {...props}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M8.5 12.3l2.4 2.4 4.6-4.9" />
  </Svg>
);

/** Equipos: escudo. */
export const IconShield = (props: IconProps) => (
  <Svg {...props}>
    <path d="M12 3.2l7 2.6v5.6c0 4-2.8 7.4-7 9.4-4.2-2-7-5.4-7-9.4V5.8z" />
  </Svg>
);

/** Usuarios: dos personas. */
export const IconUsers = (props: IconProps) => (
  <Svg {...props}>
    <circle cx="9.5" cy="8.5" r="3.3" />
    <path d="M3.5 20c0-3.1 2.7-5.4 6-5.4s6 2.3 6 5.4" />
    <path d="M16.5 6.3a3.3 3.3 0 010 6" />
    <path d="M18 14.9c1.7.7 2.9 2.2 2.9 4.1" />
  </Svg>
);

/** Configuración: engrane simplificado. */
export const IconSettings = (props: IconProps) => (
  <Svg {...props}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 3.5v2.2M12 18.3v2.2M5.5 12H3.3M20.7 12h-2.2M7.4 7.4L5.9 5.9M18.1 18.1l-1.5-1.5M16.6 7.4l1.5-1.5M5.9 18.1l1.5-1.5" />
  </Svg>
);

/** Auditoría: lista en una tablilla. */
export const IconClipboard = (props: IconProps) => (
  <Svg {...props}>
    <path d="M9 4.5H7.5A1.5 1.5 0 006 6v13.5A1.5 1.5 0 007.5 21h9a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H15" />
    <rect x="9" y="3" width="6" height="3" rx="1" />
    <path d="M9.5 11h5M9.5 15h3" />
  </Svg>
);

/** Agregar. */
export const IconPlus = (props: IconProps) => (
  <Svg {...props}>
    <path d="M12 5.5v13M5.5 12h13" />
  </Svg>
);

/** Documento / roster. */
export const IconDocument = (props: IconProps) => (
  <Svg {...props}>
    <path d="M14 3.5H7.5A1.5 1.5 0 006 5v14a1.5 1.5 0 001.5 1.5h9A1.5 1.5 0 0018 19V7.5z" />
    <path d="M14 3.5V7a.5.5 0 00.5.5H18" />
    <path d="M9.5 12.5h5M9.5 16h3" />
  </Svg>
);

/** Balón: partidos y jornadas. */
export const IconFootball = (props: IconProps) => (
  <Svg {...props}>
    <path d="M12 4c4.4 0 8 3.6 8 8s-3.6 8-8 8-8-3.6-8-8 3.6-8 8-8z" />
    <path d="M9 12h6" />
    <path d="M11 10.2v3.6M13 10.2v3.6" />
  </Svg>
);

/** Tema claro. */
export const IconSun = (props: IconProps) => (
  <Svg {...props}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2.8v2M12 19.2v2M2.8 12h2M19.2 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M17 7l1.4-1.4M5.6 18.4L7 17" />
  </Svg>
);

/** Tema oscuro. */
export const IconMoon = (props: IconProps) => (
  <Svg {...props}>
    <path d="M20 14.5A8.2 8.2 0 019.5 4a8.5 8.5 0 1010.5 10.5z" />
  </Svg>
);

/** Seguir al sistema. */
export const IconMonitor = (props: IconProps) => (
  <Svg {...props}>
    <rect x="3" y="4.5" width="18" height="12" rx="1.8" />
    <path d="M9 20.5h6M12 16.5v4" />
  </Svg>
);

/** Advertencia. */
export const IconWarning = (props: IconProps) => (
  <Svg {...props}>
    <path d="M12 4.8l8.2 14.2H3.8z" />
    <path d="M12 10v3.6M12 16.4v.1" />
  </Svg>
);

/** Cerrar sesión. */
export const IconLogout = (props: IconProps) => (
  <Svg {...props}>
    <path d="M14.5 8.5V6a1.5 1.5 0 00-1.5-1.5H6A1.5 1.5 0 004.5 6v12A1.5 1.5 0 006 19.5h7a1.5 1.5 0 001.5-1.5v-2.5" />
    <path d="M10 12h9.5M17 9.2l2.8 2.8-2.8 2.8" />
  </Svg>
);

/** Falta un documento. */
export const IconCircleX = (props: IconProps) => (
  <Svg {...props}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M9.4 9.4l5.2 5.2M14.6 9.4l-5.2 5.2" />
  </Svg>
);

/** Estado vacío genérico: bandeja sin contenido. */
export const IconInbox = (props: IconProps) => (
  <Svg {...props}>
    <path d="M3.5 13.5h4l1.4 2.2h6.2l1.4-2.2h4" />
    <path d="M3.5 13.5L6 5.6a1.5 1.5 0 011.4-1.1h9.2A1.5 1.5 0 0118 5.6l2.5 7.9v3.9a1.5 1.5 0 01-1.5 1.5H5a1.5 1.5 0 01-1.5-1.5z" />
  </Svg>
);

/** Trofeo: la tabla de posiciones. */
export const IconTrophy = (props: IconProps) => (
  <Svg {...props}>
    <path d="M8 4h8v5a4 4 0 01-8 0V4z" />
    <path d="M8 5H5.5A1.5 1.5 0 004 6.5V7a3 3 0 003 3h1" />
    <path d="M16 5h2.5A1.5 1.5 0 0120 6.5V7a3 3 0 01-3 3h-1" />
    <path d="M12 13v3M9 20h6M10 20l.5-4h3l.5 4" />
  </Svg>
);

/** Silbato: pantallas de arbitraje. */
export const IconWhistle = (props: IconProps) => (
  <Svg {...props}>
    <path d="M3.5 11a4.5 4.5 0 014.5-4.5h6l6.5-2v5l-6.5-2" />
    <path d="M8 6.5a4.5 4.5 0 100 9h4.5a4.5 4.5 0 004.5-4.5v-.5H8" />
    <circle cx="8" cy="11" r="1.5" />
  </Svg>
);
