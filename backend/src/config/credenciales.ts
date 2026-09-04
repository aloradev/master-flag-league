/**
 * Credenciales de Cloudinary — lectura pura.
 *
 * Vive aparte de `storage.service.ts` por una razón concreta: ese módulo
 * importa el SDK de Cloudinary, y el SDK **revienta al importarse** si
 * `CLOUDINARY_URL` no empieza con `cloudinary://`. Un typo en esa
 * variable tumbaba la API entera con un stack de Node en el log de
 * Render, antes de que ninguna validación pudiera decir qué revisar.
 * Este archivo no importa nada, así que la comprobación del arranque
 * puede usarlo antes de que el SDK se cargue.
 */

export type Entorno = Record<string, string | undefined>;

export interface CredencialesCloudinary {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
  /** De dónde salieron: importa para diagnosticar. */
  origen: 'tres-variables' | 'CLOUDINARY_URL';
}

/**
 * Lee las credenciales de las DOS formas en que la gente las configura.
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
export const credencialesCloudinary = (
  env: Entorno = process.env
): CredencialesCloudinary | null => {
  const limpiar = (v?: string) => (v ?? '').trim();

  const cloudName = limpiar(env.CLOUDINARY_NAME);
  const apiKey = limpiar(env.CLOUDINARY_API_KEY);
  const apiSecret = limpiar(env.CLOUDINARY_API_SECRET);
  if (cloudName && apiKey && apiSecret) {
    return { cloudName, apiKey, apiSecret, origen: 'tres-variables' };
  }

  const url = limpiar(env.CLOUDINARY_URL);
  if (url) {
    // cloudinary://<api_key>:<api_secret>@<cloud_name>
    const m = /^cloudinary:\/\/([^:]+):([^@]+)@(.+)$/.exec(url);
    if (m) {
      return { apiKey: m[1], apiSecret: m[2], cloudName: m[3], origen: 'CLOUDINARY_URL' };
    }
  }

  return null;
};
