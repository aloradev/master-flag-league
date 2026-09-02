import sharp from 'sharp';

/**
 * DERIVADOS DE IMAGEN
 *
 * Las fotos llegan desde la cámara del celular: 3000×4000 px y 3-5 MB.
 * Servir eso como avatar de 48 px castiga los datos móviles del manager
 * y hace lento cada listado, así que de cada carga se genera un derivado
 * pequeño en WebP.
 *
 * Reencodificar además ELIMINA LOS METADATOS EXIF, y eso importa por
 * privacidad, no solo por peso: una foto tomada con el teléfono trae las
 * coordenadas GPS del lugar donde se tomó —normalmente la casa del
 * jugador— incrustadas en el archivo. Publicar el original tal cual
 * expondría el domicilio de cada jugador de la liga.
 */

export interface Derivative {
  buffer: Buffer;
  mimeType: string;
  width: number;
  height: number;
}

/** Límite de píxeles de entrada: frena imágenes maliciosas de mil megapíxeles. */
const INPUT_LIMITS = { limitInputPixels: 100_000_000 };

/**
 * Avatar del jugador: cuadrado de 512, recortado al centro.
 * Se usa en plantillas, cola de validación, perfil público y tarjetas.
 */
export const makeAvatar = async (input: Buffer): Promise<Derivative> => {
  const image = sharp(input, INPUT_LIMITS).rotate(); // rotate() respeta la orientación EXIF antes de descartarla

  const buffer = await image
    .resize(512, 512, { fit: 'cover', position: 'centre' })
    .webp({ quality: 82, effort: 4 })
    .toBuffer();

  return { buffer, mimeType: 'image/webp', width: 512, height: 512 };
};

/**
 * Logo del equipo: cabe en 512×512 sin recortar y conserva transparencia.
 * Un escudo recortado a cuadrado perdería las puntas.
 */
export const makeLogo = async (input: Buffer): Promise<Derivative> => {
  const image = sharp(input, INPUT_LIMITS).rotate();

  const resized = image.resize(512, 512, {
    fit: 'inside',
    withoutEnlargement: true,
  });

  const buffer = await resized.webp({ quality: 88, effort: 4 }).toBuffer();
  const meta = await sharp(buffer).metadata();

  return {
    buffer,
    mimeType: 'image/webp',
    width: meta.width ?? 512,
    height: meta.height ?? 512,
  };
};

/** Miniatura para las listas de revisión del administrador. */
export const makeThumbnail = async (input: Buffer): Promise<Derivative> => {
  const buffer = await sharp(input, INPUT_LIMITS)
    .rotate()
    .resize(160, 160, { fit: 'cover', position: 'centre' })
    .webp({ quality: 74, effort: 4 })
    .toBuffer();

  return { buffer, mimeType: 'image/webp', width: 160, height: 160 };
};

/** Confirma que el archivo sea una imagen procesable antes de guardarla. */
export const isProcessableImage = async (input: Buffer): Promise<boolean> => {
  try {
    const meta = await sharp(input, INPUT_LIMITS).metadata();
    return Boolean(meta.width && meta.height);
  } catch {
    return false;
  }
};
