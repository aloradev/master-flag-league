import { mkdir, writeFile, readFile, unlink } from 'fs/promises';
import { dirname, join, extname } from 'path';
import { v2 as cloudinary } from 'cloudinary';
import { newPrefixedId } from '../utils/id.js';
import {
  credencialesCloudinary,
  type CredencialesCloudinary,
  type Entorno,
} from '../config/credenciales.js';

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

export { credencialesCloudinary };
export type { CredencialesCloudinary, Entorno };

/**
 * Cloudinary se activa solo con las credenciales COMPLETAS.
 *
 * Antes bastaban el nombre y la llave, así que con el secreto olvidado la
 * aplicación arrancaba diciendo "Almacenaje: cloudinary" y cada subida
 * moría con un 403 traducido a "Error interno del servidor". El fallo
 * aparecía media hora después del despliegue, cuando alguien intentaba
 * subir un escudo, y sin ninguna pista de dónde venía.
 */
export const activeDriver = (env: Entorno = process.env): StorageDriver =>
  credencialesCloudinary(env) ? 'cloudinary' : 'local';

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

/**
 * Cloudinary archiva los PDF como `raw` y las imágenes como `image`, y
 * la URL firmada para bajarlos se construye distinto según cuál sea. Se
 * decide en un solo lugar para que subida, descarga y borrado no puedan
 * discrepar: cuando discrepaban, el PDF se subía bien y luego no había
 * manera de verlo.
 */
export const esPdf = (mimeType: string, storageKey = ''): boolean =>
  mimeType === 'application/pdf' || /\.pdf$/i.test(storageKey);

const tipoDeRecurso = (mimeType: string, storageKey = ''): 'image' | 'raw' =>
  esPdf(mimeType, storageKey) ? 'raw' : 'image';

/** Formato REAL del archivo. Pedirle `jpg` a un PDF devuelve un 404. */
const formatoDe = (mimeType: string, storageKey = ''): string => {
  const porMime = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'application/pdf': 'pdf',
  }[mimeType];
  if (porMime) return porMime;
  const ext = extname(storageKey).replace('.', '').toLowerCase();
  return ext || 'jpg';
};

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
            /**
             * Las imágenes llevan el public_id sin extensión —Cloudinary
             * la añade según el formato—, pero un recurso `raw` se
             * direcciona por su nombre completo: quitarle el `.pdf` deja
             * un objeto que después no se encuentra.
             */
            public_id: esPdf(mimeType, key) ? key : key.replace(/\.[^.]+$/, ''),
            // `private` impide el acceso anónimo aunque se filtre la URL.
            type: 'private',
            resource_type: tipoDeRecurso(mimeType, key),
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

/**
 * Descarga el archivo original.
 *
 * `mimeType` no es opcional por comodidad: sin él esta función pedía
 * siempre un `jpg` de tipo `image` con el tipo de entrega por omisión
 * (`upload`), y los documentos se guardan como `private` —y los PDF como
 * `raw`—. Es decir, la URL firmada apuntaba a un objeto que no existe:
 * las identificaciones no se podían ver en cuanto Cloudinary entraba en
 * juego, y el PDF era donde más se notaba.
 */
export const getFile = async (storageKey: string, mimeType = ''): Promise<Buffer> => {
  if (activeDriver() === 'cloudinary') {
    /**
     * Se intenta primero el tipo de recurso que corresponde al mime y,
     * si no aparece, el otro. Los documentos subidos por la versión
     * anterior quedaron archivados con el criterio viejo, y esta función
     * no puede saber cuál fue: probar los dos los recupera sin migrar
     * nada. El segundo intento solo ocurre cuando el primero falla.
     */
    const preferido = tipoDeRecurso(mimeType, storageKey);
    const intentos: Array<'image' | 'raw'> =
      preferido === 'raw' ? ['raw', 'image'] : ['image', 'raw'];

    let ultimoEstado = 0;
    for (const resourceType of intentos) {
      const signedUrl = cloudinary.utils.private_download_url(
        storageKey,
        formatoDe(mimeType, storageKey),
        {
          resource_type: resourceType,
          type: 'private',
          expires_at: Math.floor(Date.now() / 1000) + 60,
        }
      );
      const response = await fetch(signedUrl);
      if (response.ok) return Buffer.from(await response.arrayBuffer());
      ultimoEstado = response.status;
    }

    throw new StorageError(
      `Cloudinary no entregó el archivo (${ultimoEstado}). La clave es "${storageKey}"; ` +
        `revisa en el panel que exista bajo Media Library con acceso "private".`
    );
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
  visibility: 'private' | 'public' = 'private',
  mimeType = ''
): Promise<void> => {
  try {
    if (activeDriver() === 'cloudinary') {
      // Sin el resource_type correcto, `destroy` busca una imagen que no
      // existe, responde "not found" y el PDF se queda ocupando espacio.
      await cloudinary.uploader.destroy(storageKey, {
        type: visibility === 'private' ? 'private' : 'upload',
        resource_type: tipoDeRecurso(mimeType, storageKey),
      });
      return;
    }
    if (storageKey.includes('..')) return;
    await unlink(join(visibility === 'private' ? PRIVATE_DIR : PUBLIC_DIR, storageKey));
  } catch (err) {
    console.error('[storage] No se pudo eliminar:', err instanceof Error ? err.message : err);
  }
};
