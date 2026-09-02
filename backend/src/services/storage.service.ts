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

export const activeDriver = (): StorageDriver =>
  process.env.CLOUDINARY_NAME && process.env.CLOUDINARY_API_KEY ? 'cloudinary' : 'local';

const PRIVATE_DIR = process.env.PRIVATE_UPLOAD_DIR || join(process.cwd(), 'storage', 'private');
const PUBLIC_DIR = process.env.PUBLIC_UPLOAD_DIR || join(process.cwd(), 'storage', 'public');

/** Prefijo con el que la API sirve los archivos públicos en modo local. */
export const PUBLIC_ROUTE = '/media';

if (activeDriver() === 'cloudinary') {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
  });
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
          (error, result) => (error ? reject(error) : resolve(result))
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
          (error, result) => (error ? reject(error) : resolve(result))
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
