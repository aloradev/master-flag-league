import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { fetchProtectedBlob, documentPath, mediaUrl } from '../lib/api';
import { IconDocument } from './icons';

/**
 * Visor del documento, dentro de la aplicación.
 *
 * Antes el documento se abría con un enlace a la URL del blob en una
 * pestaña nueva. En escritorio pasa; en celular —que es donde se validan
 * los registros— Safari y Chrome muestran una pestaña en blanco o bajan
 * un archivo sin nombre, y el PDF quedaba imposible de ver. Aquí se
 * muestra en su sitio, y debajo queda siempre el botón de descarga: en
 * iOS el visor incrustado de PDF no funciona y sin esa salida no habría
 * ninguna.
 */
const VisorDocumento = ({
  objectUrl,
  titulo,
  esPdf,
  onCerrar,
}: {
  objectUrl: string;
  titulo: string;
  esPdf: boolean;
  onCerrar: () => void;
}) => {
  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCerrar();
    };
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, [onCerrar]);

  const nombre = `${titulo.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.${esPdf ? 'pdf' : 'jpg'}`;

  /**
   * Se monta en `document.body`, no donde está la miniatura.
   *
   * La miniatura vive dentro de una tarjeta, y la tarjeta lleva
   * `backdrop-blur`: eso la vuelve bloque contenedor de los
   * descendientes `position: fixed`. Sin el portal, `inset-0` medía la
   * tarjeta —356 × 100 px— en lugar de la pantalla: el visor salía
   * recortado, el fondo oscuro no cubría nada, y el encabezado y la
   * barra inferior de la aplicación quedaban encima.
   */
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      {/* Oculto del árbol de accesibilidad: anunciado como botón, se oiría
          un segundo control "Cerrar" invisible antes del real. */}
      <div aria-hidden="true" onClick={onCerrar} className="mfl-fondo absolute inset-0 bg-black/70" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        className="mfl-hoja relative flex max-h-[92vh] w-full max-w-3xl flex-col rounded-t-box
                   border-t border-base-300 bg-base-200 shadow-2xl sm:rounded-box sm:border"
      >
        <div className="flex items-center justify-between border-b border-base-300/60 px-4 py-3">
          <h2 className="truncate text-sm font-bold">{titulo}</h2>
          <button
            type="button"
            onClick={onCerrar}
            className="btn btn-ghost btn-sm min-h-11 px-3"
          >
            Cerrar
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto bg-base-300/40 p-2">
          {esPdf ? (
            <iframe
              src={objectUrl}
              title={titulo}
              className="h-[65vh] w-full rounded-field bg-base-100"
            />
          ) : (
            <img src={objectUrl} alt={titulo} className="mx-auto max-h-[70vh] w-auto rounded-field" />
          )}
        </div>

        <div className="border-t border-base-300/60 p-3">
          <a href={objectUrl} download={nombre} className="btn btn-sm btn-block">
            Descargar
          </a>
          {esPdf && (
            <p className="pt-2 text-center text-xs text-base-content/50">
              Si el PDF no se ve aquí, descárgalo: algunos celulares no lo muestran incrustado.
            </p>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

/**
 * Muestra un documento protegido.
 *
 * Los documentos solo se sirven con cabecera Authorization y una etiqueta
 * <img src> no puede enviarla, así que se descargan como blob y se
 * presentan con una URL de objeto que se revoca al desmontar.
 */
interface Props {
  fileUrl: string;
  alt: string;
  mimeType?: string;
  className?: string;
  /** Vista compacta para listas y colas de revisión. */
  thumbnail?: boolean;
}

export const AuthImage = ({ fileUrl, alt, mimeType, className = '', thumbnail }: Props) => {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [abierto, setAbierto] = useState(false);

  useEffect(() => {
    let active = true;
    let created: string | null = null;

    setError(false);
    setObjectUrl(null);

    fetchProtectedBlob(documentPath(fileUrl))
      .then((url) => {
        if (!active) {
          URL.revokeObjectURL(url);
          return;
        }
        created = url;
        setObjectUrl(url);
      })
      .catch(() => active && setError(true));

    return () => {
      active = false;
      // Libera la memoria del blob al desmontar.
      if (created) URL.revokeObjectURL(created);
    };
  }, [fileUrl]);

  const box = `flex items-center justify-center overflow-hidden bg-base-300 ${className}`;

  if (error) {
    return (
      <div className={box}>
        <span className="p-2 text-center text-xs text-base-content/50">No disponible</span>
      </div>
    );
  }

  if (!objectUrl) {
    return (
      <div className={`${box} animate-pulse`}>
        <span className="loading loading-spinner loading-sm text-base-content/40" />
      </div>
    );
  }

  const esPdf = mimeType === 'application/pdf';

  const visor = abierto ? (
    <VisorDocumento
      objectUrl={objectUrl}
      titulo={alt}
      esPdf={esPdf}
      onCerrar={() => setAbierto(false)}
    />
  ) : null;

  if (!thumbnail) {
    return (
      <div className={box}>
        {esPdf ? (
          <iframe src={objectUrl} title={alt} className="size-full bg-base-100" />
        ) : (
          <img src={objectUrl} alt={alt} className="size-full object-contain" />
        )}
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        aria-haspopup="dialog"
        className={`mfl-toque ${box} ${esPdf ? 'flex-col gap-1 text-center' : ''}`}
        title={`Ver ${alt}`}
      >
        {esPdf ? (
          <>
            <IconDocument size={22} />
            <span className="text-xs text-base-content/60">Ver PDF</span>
          </>
        ) : (
          <img src={objectUrl} alt={alt} className="size-full object-cover" />
        )}
      </button>
      {visor}
    </>
  );
};

/**
 * Avatar del jugador.
 *
 * Usa el derivado PÚBLICO con una etiqueta <img> normal, no la descarga
 * autenticada de AuthImage. La diferencia se nota en una plantilla de
 * veinte jugadores: veinte peticiones con cabecera Authorization, sin
 * caché de navegador y sin poder mostrarse en el perfil público, contra
 * veinte imágenes cacheadas de ~20 KB.
 *
 * AuthImage sigue existiendo, pero solo para las identificaciones.
 */
export const PlayerAvatar = ({
  avatarUrl,
  name,
  jersey,
  size = 'md',
}: {
  avatarUrl?: string | null;
  name: string;
  jersey?: number | null;
  size?: 'sm' | 'md' | 'lg';
}) => {
  const dimension = { sm: 'size-9', md: 'size-12', lg: 'size-20' }[size];
  const resolved = mediaUrl(avatarUrl);

  const initials = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();

  if (resolved) {
    return (
      <img
        src={resolved}
        alt={name}
        width={80}
        height={80}
        loading="lazy"
        decoding="async"
        className={`${dimension} shrink-0 rounded-full bg-base-300 object-cover`}
      />
    );
  }

  return (
    <div
      className={`${dimension} flex shrink-0 items-center justify-center rounded-full bg-base-300 text-sm font-semibold text-base-content/60`}
    >
      {jersey != null ? <span className="tabular">{jersey}</span> : initials}
    </div>
  );
};

/** Logo del equipo, o sus iniciales cuando aún no tiene uno. */
export const TeamCrest = ({
  logoUrl,
  name,
  shortName,
  color,
  className = 'size-12',
}: {
  logoUrl?: string | null;
  name: string;
  shortName?: string | null;
  color?: string;
  className?: string;
}) => {
  const resolved = mediaUrl(logoUrl);

  if (resolved) {
    return (
      <img
        src={resolved}
        alt={name}
        loading="lazy"
        decoding="async"
        className={`${className} shrink-0 rounded-box object-contain`}
      />
    );
  }

  return (
    <div
      className={`${className} flex shrink-0 items-center justify-center rounded-box text-sm font-bold text-white`}
      style={{ backgroundColor: color ?? '#1f2937' }}
    >
      {shortName ?? name.slice(0, 3).toUpperCase()}
    </div>
  );
};
