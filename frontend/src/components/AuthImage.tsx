import { useEffect, useState } from 'react';
import { fetchProtectedBlob, documentPath } from '../lib/api';

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

  if (mimeType === 'application/pdf') {
    return thumbnail ? (
      <a
        href={objectUrl}
        target="_blank"
        rel="noreferrer"
        className={`${box} flex-col gap-1 text-center hover:bg-base-300/70`}
      >
        <span className="text-2xl" aria-hidden>
          📄
        </span>
        <span className="text-xs text-base-content/60">Ver PDF</span>
      </a>
    ) : (
      <iframe src={objectUrl} title={alt} className={`w-full ${className}`} />
    );
  }

  return thumbnail ? (
    <a href={objectUrl} target="_blank" rel="noreferrer" className={box}>
      <img src={objectUrl} alt={alt} className="size-full object-cover" />
    </a>
  ) : (
    <div className={box}>
      <img src={objectUrl} alt={alt} className="size-full object-contain" />
    </div>
  );
};

/** Avatar del jugador: foto autorizada o sus iniciales. */
export const PlayerAvatar = ({
  photoUrl,
  name,
  jersey,
  size = 'md',
}: {
  photoUrl?: string | null;
  name: string;
  jersey?: number | null;
  size?: 'sm' | 'md' | 'lg';
}) => {
  const dimension = { sm: 'size-9', md: 'size-12', lg: 'size-20' }[size];
  const initials = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();

  if (photoUrl) {
    return (
      <AuthImage
        fileUrl={photoUrl}
        alt={name}
        className={`${dimension} shrink-0 rounded-full`}
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
