import { mkdir, writeFile, readFile, unlink } from 'fs/promises';
import { dirname, join, extname } from 'path';
import { v2 as cloudinary } from 'cloudinary';
import { newPrefixedId } from '../utils/id.js';

/**
 * ALMACENAMIENTO — DOS NIVELES DELIBERADOS
 *
 * No todas las imágenes de la liga tienen el mismo riesgo, así que no
 * comparten tratamiento:
 *
 *   PRIVADO   identificaciones y el original de la fotografía.
 *             La base guarda una clave opaca, no una URL. El archivo
 *             sale únicamente por GET /documents/:id/file, que valida
 *             sesión y equipo, y audita cada vista (req. 12).
 *
 *   PÚBLICO   avatares derivados y logos de equipo.
 *             Son URLs normales, cacheables por el navegador y usables
 *             en perfiles públicos y tarjetas para redes.
 *
 * Poner los avatares en el nivel público no es un descuido, es lo que
 * hace posible el perfil público y evita que cada plantilla dispare una
 * petición autenticada por jugador. El original privado se conserva
 * como respaldo del registro; lo que se publica es un derivado de 512 px
 * sin metadatos EXIF.
 */

export type StorageDriver = 'local' | 'cloudinary';

export interface CredencialesCloudinary {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
  /** De dónde salieron: importa para diagnosticar. */
  origen: 'tres-variables' | 'CLOUDINARY_URL';
}

/**
 * Lee las credenciales de Cloudinary de las DOS formas en que la gente
 * las configura.
 *
 * El panel de Cloudinary muestra como principal una sola línea:
 *
 *   CLOUDINARY_URL=cloudinary://<api_key>:<api_secret>@<cloud_name>
 *
 * Es lo que uno copia, y es lo que su propio SDK lee por omisión. Este
 * código solo miraba las tres variables separadas, así que quien pegara
 * la URL —lo natural— acababa con almacenamiento local sin saberlo: la
 * aplicación arrancaba bien y las imágenes se guardaban en el disco
 * efímero de Render, que se borra en cada despliegue. Silencioso y con
 * pérdida de datos, la peor combinación.
 *
 * Las tres variables sueltas ganan si están, porque son más explícitas.
 */
export const credencialesCloudinary = (): CredencialesCloudinary | null => {
  const limpiar = (v?: string) => (v ?? '').trim();

  const cloudName = limpiar(process.env.CLOUDINARY_NAME);
  const apiKey = limpiar(process.env.CLOUDINARY_API_KEY);
  const apiSecret = limpiar(process.env.CLOUDINARY_API_SECRET);
  if (cloudName && apiKey && apiSecret) {
    return { cloudName, apiKey, apiSecret, origen: 'tres-variables' };
  }

  const url = limpiar(process.env.CLOUDINARY_URL);
  if (url) {
    // cloudinary://<api_key>:<api_secret>@<cloud_name>
    const m = /^cloudinary:\/\/([^:]+):([^@]+)@(.+)$/.exec(url);
    if (m) {
      return { apiKey: m[1], apiSecret: m[2], cloudName: m[3], origen: 'CLOUDINARY_URL' };
    }
  }

  return null;
};

/**
 * Cloudinary se activa solo con las credenciales COMPLETAS.
 *
 * Antes bastaban el nombre y la llave, así que con el secreto olvidado la
 * aplicación arrancaba diciendo "Almacenaje: cloudinary" y cada subida
 * moría con un 403 traducido a "Error interno del servidor". El fallo
 * aparecía media hora después del despliegue, cuando alguien intentaba
 * subir un escudo, y sin ninguna pista de dónde venía.
 */
export const activeDriver = (): StorageDriver =>
  credencialesCloudinary() ? 'cloudinary' : 'local';

const PRIVATE_DIR = process.env.PRIVATE_UPLOAD_DIR || join(process.cwd(), 'storage', 'private');
const PUBLIC_DIR = process.env.PUBLIC_UPLOAD_DIR || join(process.cwd(), 'storage', 'public');

/** Prefijo con el que la API sirve los archivos públicos en modo local. */
export const PUBLIC_ROUTE = '/media';

/**
 * Traduce el fallo de Cloudinary a algo que se pueda actuar.
 *
 * Sin esto, un 403 por una llave mal copiada llega al usuario como
 * "Error interno del servidor" y al log como un objeto sin contexto. El
 * mensaje es la única pista que va a tener quien lo reciba, así que
 * nombra la variable de entorno que hay que revisar.
 */
export class StorageError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = 'StorageError';
  }
}

const traducirFalloDeCloudinary = (error: unknown): StorageError => {
  const codigo = (error as { http_code?: number })?.http_code;
  const detalle = (error as { message?: string })?.message ?? String(error);

  if (codigo === 401 || codigo === 403) {
    return new StorageError(
      'El almacenamiento de imágenes (Cloudinary) rechazó la petición. ' +
        'Revisa CLOUDINARY_NAME, CLOUDINARY_API_KEY y CLOUDINARY_API_SECRET en el servidor.',
      error
    );
  }
  if (codigo === 420 || codigo === 429) {
    return new StorageError(
      'El almacenamiento de imágenes rechazó la petición por exceso de uso. ' +
        'Vuelve a intentarlo en unos minutos.',
      error
    );
  }
  if (codigo === 400) {
    return new StorageError(
      `El almacenamiento de imágenes rechazó el archivo: ${detalle}`,
      error
    );
  }
  return new StorageError(
    `No se pudo guardar la imagen en el almacenamiento: ${detalle}`,
    error
  );
};

{
  // Se configuran los valores YA LIMPIOS: un espacio o un salto de línea
  // al final —lo que deja el panel de Render al pegar— produce un 401
  // que no se distingue de una llave equivocada.
  const cred = credencialesCloudinary();
  if (cred) {
    cloudinary.config({
      cloud_name: cred.cloudName,
      api_key: cred.apiKey,
      api_secret: cred.apiSecret,
      secure: true,
    });
  }
}

export interface StoredFile {
  storageKey: string;
  driver: StorageDriver;
  size: number;
  mimeType: string;
}

export interface StoredPublicFile extends StoredFile {
  /** URL lista para usar en un atributo src. */
  url: string;
}

const extensionFor = (mimeType: string, originalName = ''): string => {
  const fromName = extname(originalName);
  if (fromName) return fromName;
  return (
    {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/webp': '.webp',
      'application/pdf': '.pdf',
    }[mimeType] ?? ''
  );
};

// ─────────────────────────── NIVEL PRIVADO ───────────────────────────

export const putFile = async (
  buffer: Buffer,
  mimeType: string,
  originalName: string,
  folder: string
): Promise<StoredFile> => {
  const driver = activeDriver();
  const key = `${folder}/${newPrefixedId('doc')}${extensionFor(mimeType, originalName)}`;

  if (driver === 'cloudinary') {
    const uploaded = await new Promise<any>((resolve, reject) => {
      cloudinary.uploader
        .upload_stream(
          {
            public_id: key.replace(/\.[^.]+$/, ''),
            // `private` impide el acceso anónimo aunque se filtre la URL.
            type: 'private',
            resource_type: mimeType === 'application/pdf' ? 'raw' : 'image',
            folder: 'mfl/privado',
          },
          (error, result) => (error ? reject(traducirFalloDeCloudinary(error)) : resolve(result))
        )
        .end(buffer);
    });

    return { storageKey: uploaded.public_id, driver, size: buffer.length, mimeType };
  }

  const fullPath = join(PRIVATE_DIR, key);
  await mkdir(dirname(fullPath), { recursive: true });
  await writeFile(fullPath, buffer);

  return { storageKey: key, driver, size: buffer.length, mimeType };
};

export const getFile = async (storageKey: string): Promise<Buffer> => {
  if (activeDriver() === 'cloudinary') {
    const signedUrl = cloudinary.utils.private_download_url(storageKey, 'jpg', {
      expires_at: Math.floor(Date.now() / 1000) + 60,
    });
    const response = await fetch(signedUrl);
    if (!response.ok) throw new Error(`Cloudinary respondió ${response.status}`);
    return Buffer.from(await response.arrayBuffer());
  }

  // Bloquea traversal: la clave no puede salir del directorio privado.
  if (storageKey.includes('..')) throw new Error('Clave de almacenamiento inválida');
  return readFile(join(PRIVATE_DIR, storageKey));
};

// ─────────────────────────── NIVEL PÚBLICO ───────────────────────────

/**
 * Guarda un derivado público y devuelve su URL.
 *
 * `folder` agrupa por tipo (avatares, logos) y el nombre del archivo
 * lleva un identificador aleatorio: aunque la URL sea pública, no se
 * puede adivinar a partir del id del jugador.
 */
export const putPublicFile = async (
  buffer: Buffer,
  mimeType: string,
  folder: string
): Promise<StoredPublicFile> => {
  const driver = activeDriver();
  const key = `${folder}/${newPrefixedId('img')}${extensionFor(mimeType)}`;

  if (driver === 'cloudinary') {
    const uploaded = await new Promise<any>((resolve, reject) => {
      cloudinary.uploader
        .upload_stream(
          {
            public_id: key.replace(/\.[^.]+$/, ''),
            type: 'upload',
            resource_type: 'image',
            folder: 'mfl/publico',
          },
          (error, result) => (error ? reject(traducirFalloDeCloudinary(error)) : resolve(result))
        )
        .end(buffer);
    });

    return {
      storageKey: uploaded.public_id,
      driver,
      size: buffer.length,
      mimeType,
      url: uploaded.secure_url,
    };
  }

  const fullPath = join(PUBLIC_DIR, key);
  await mkdir(dirname(fullPath), { recursive: true });
  await writeFile(fullPath, buffer);

  return {
    storageKey: key,
    driver,
    size: buffer.length,
    mimeType,
    url: `${PUBLIC_ROUTE}/${key}`,
  };
};

export const publicDir = (): string => PUBLIC_DIR;

// ─────────────────────────────── BORRADO ───────────────────────────────

export const deleteFile = async (
  storageKey: string,
  visibility: 'private' | 'public' = 'private'
): Promise<void> => {
  try {
    if (activeDriver() === 'cloudinary') {
      await cloudinary.uploader.destroy(storageKey, {
        type: visibility === 'private' ? 'private' : 'upload',
      });
      return;
    }
    if (storageKey.includes('..')) return;
    await unlink(join(visibility === 'private' ? PRIVATE_DIR : PUBLIC_DIR, storageKey));
  } catch (err) {
    console.error('[storage] No se pudo eliminar:', err instanceof Error ? err.message : err);
  }
};
