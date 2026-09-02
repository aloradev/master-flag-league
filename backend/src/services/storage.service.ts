import { mkdir, writeFile, readFile, unlink } from 'fs/promises';
import { dirname, join, extname } from 'path';
import { v2 as cloudinary } from 'cloudinary';
import { newPrefixedId } from '../utils/id.js';

/**
 * REQ. 12 — PRIVACIDAD DE DOCUMENTOS
 *
 * Las identificaciones son datos personales sensibles. Por eso:
 *   · Nunca se guardan en una carpeta pública ni se devuelve una URL directa.
 *   · La base de datos guarda una `storage_key` opaca, no una URL.
 *   · El archivo se entrega solo por GET /documents/:id/file, que valida sesión y rol.
 *
 * Dos drivers según el entorno:
 *   local       — disco privado fuera de cualquier carpeta estática (desarrollo)
 *   cloudinary  — recursos de tipo `private` con URL firmada de vida corta
 */

export type StorageDriver = 'local' | 'cloudinary';

export const activeDriver = (): StorageDriver =>
  process.env.CLOUDINARY_NAME && process.env.CLOUDINARY_API_KEY ? 'cloudinary' : 'local';

const PRIVATE_DIR = process.env.PRIVATE_UPLOAD_DIR || join(process.cwd(), 'storage', 'private');

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

const extensionFor = (mimeType: string, originalName: string): string => {
  const fromName = extname(originalName);
  if (fromName) return fromName;
  return { 'image/jpeg': '.jpg', 'image/png': '.png', 'application/pdf': '.pdf' }[mimeType] ?? '';
};

/** Guarda un archivo y devuelve su clave opaca. */
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
            folder: 'mfl',
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
    };
  }

  const fullPath = join(PRIVATE_DIR, key);
  await mkdir(dirname(fullPath), { recursive: true });
  await writeFile(fullPath, buffer);

  return { storageKey: key, driver, size: buffer.length, mimeType };
};

/** Lee un archivo para entregarlo por el endpoint autenticado. */
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

export const deleteFile = async (storageKey: string): Promise<void> => {
  try {
    if (activeDriver() === 'cloudinary') {
      await cloudinary.uploader.destroy(storageKey, { type: 'private' });
      return;
    }
    if (storageKey.includes('..')) return;
    await unlink(join(PRIVATE_DIR, storageKey));
  } catch (err) {
    console.error('[storage] No se pudo eliminar:', err instanceof Error ? err.message : err);
  }
};
