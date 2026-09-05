/**
 * Validación del entorno al arrancar.
 *
 * Sin esto, una variable faltante en producción no impide que el servidor
 * arranque: se descubre después, cuando cada petición devuelve 500 con un
 * mensaje genérico y hay que adivinar por qué. Fallar en el arranque
 * convierte eso en una línea clara en el log de despliegue de Render.
 */

import { credencialesCloudinary } from './credenciales.js';

/**
 * GUARDA PREVIA AL SDK DE CLOUDINARY.
 *
 * El SDK se autoconfigura al importarse y, si `CLOUDINARY_URL` no empieza
 * con `cloudinary://`, lanza desde el cuerpo del módulo. Como los imports
 * de un módulo ES se evalúan antes que su código, esa excepción ocurría
 * antes de cualquier validación: la API no arrancaba y el log de Render
 * mostraba un stack de Node en lugar de decir qué variable revisar.
 *
 * Por eso esto se ejecuta al importar este archivo —no dentro de
 * `validateEnvironment()`— y por eso `./config/env.js` debe ser el PRIMER
 * import de `index.ts`. Este módulo no importa el SDK, así que llega
 * antes que él.
 */
const urlCloudinary = (process.env.CLOUDINARY_URL ?? '').trim();
if (urlCloudinary && !credencialesCloudinary({ CLOUDINARY_URL: urlCloudinary })) {
  console.error(
    '\n❌ CLOUDINARY_URL mal escrita\n\n' +
      '  Debe tener exactamente esta forma:\n' +
      '    cloudinary://<api_key>:<api_secret>@<cloud_name>\n\n' +
      '  La copias completa del panel de Cloudinary, en Settings → API Keys.\n' +
      '  Alternativa: borrar CLOUDINARY_URL y definir las tres por separado\n' +
      '  (CLOUDINARY_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET).\n'
  );
  process.exit(1);
}

interface Check {
  key: string;
  /** Sin ella la aplicación no puede funcionar: se aborta el arranque. */
  required: boolean;
  message: string;
  valid?: (value: string) => boolean;
}

const CHECKS: Check[] = [
  {
    key: 'JWT_SECRET',
    required: true,
    message: 'Secreto para firmar sesiones. Render lo genera solo.',
    valid: (v) => v.length >= 16,
  },
  {
    key: 'FRONTEND_URL',
    required: true,
    message:
      'URL del frontend en Vercel. Sin ella CORS bloquea todas las llamadas ' +
      'y la pantalla de acceso parece muerta.',
  },
];

/**
 * La base admite dos formas de configurarse —cadena única o variables
 * sueltas—, así que se exige una de las dos y no una en concreto.
 */
const hasDatabaseConfig = (): boolean =>
  Boolean(process.env.DATABASE_URL) ||
  Boolean(process.env.DB_HOST && process.env.DB_NAME);

/** No detienen el arranque, pero degradan la plataforma de forma silenciosa. */
const WARNINGS: Check[] = [
  {
    key: 'RESEND_API_KEY',
    required: false,
    message:
      'Sin Resend los correos quedan en cola y agotarán sus reintentos. ' +
      'Los managers no se enterarán de documentos rechazados.',
  },
  {
    key: 'EMAIL_FROM',
    required: false,
    message:
      'Define un remitente de un dominio verificado en Resend, por ejemplo ' +
      'Master Flag League <noreply@tu-dominio-verificado.com>.',
  },
];

/**
 * Revisa el entorno. En producción aborta si falta algo indispensable;
 * en desarrollo solo informa, para no estorbar el trabajo local.
 */
export const validateEnvironment = (): void => {
  const isProduction = process.env.NODE_ENV === 'production';
  if (!isProduction) return;

  const problems: string[] = [];

  if (!hasDatabaseConfig()) {
    problems.push(
      '  ✗ DATABASE_URL — falta. Cadena de conexión de Neon (usa la variante ' +
        'con -pooler). Alternativa: definir DB_HOST, DB_NAME, DB_USER y DB_PASSWORD.'
    );
  }

  for (const check of CHECKS) {
    const value = process.env[check.key];
    if (!value) {
      problems.push(`  ✗ ${check.key} — falta. ${check.message}`);
    } else if (check.valid && !check.valid(value)) {
      problems.push(`  ✗ ${check.key} — valor inválido. ${check.message}`);
    }
  }

  /**
   * Cloudinary a medias es peor que sin Cloudinary.
   *
   * Antes solo se avisaba de CLOUDINARY_NAME, así que con el nombre
   * puesto y el secreto olvidado la aplicación arrancaba sin decir nada
   * y cada subida de imagen devolvía "Error interno del servidor". El
   * fallo aparecía cuando alguien intentaba subir un escudo, no al
   * desplegar.
   *
   * Ahora la comprobación no cuenta variables sino credenciales: hay dos
   * formas válidas de configurarlas —las tres sueltas o una sola
   * CLOUDINARY_URL— y contar nombres rompía las dos. Con una URL válida
   * más un CLOUDINARY_NAME olvidado de un intento anterior, la versión
   * que contaba variables se negaba a arrancar teniendo todo lo que
   * necesitaba; y con una URL mal escrita como única configuración, no
   * decía nada y las imágenes se iban al disco efímero.
   */
  const cloudinaryKeys = [
    'CLOUDINARY_NAME',
    'CLOUDINARY_API_KEY',
    'CLOUDINARY_API_SECRET',
    'CLOUDINARY_URL',
  ];
  const cloudinaryPuestas = cloudinaryKeys.filter((k) => process.env[k]);

  if (credencialesCloudinary()) {
    // Completas por cualquiera de las dos vías: nada que decir.
  } else if (cloudinaryPuestas.length > 0) {
    const tresPuestas = cloudinaryPuestas.filter((k) => k !== 'CLOUDINARY_URL');
    const faltan = cloudinaryKeys
      .filter((k) => k !== 'CLOUDINARY_URL')
      .filter((k) => !process.env[k]);
    problems.push(
      `  ✗ Cloudinary a medias — está(n) ${cloudinaryPuestas.join(', ')} pero no alcanzan ` +
        `para armar las credenciales. ` +
        (process.env.CLOUDINARY_URL
          ? `CLOUDINARY_URL no tiene la forma cloudinary://llave:secreto@nombre` +
            (tresPuestas.length > 0
              ? `, y las sueltas están incompletas (falta(n) ${faltan.join(', ')}).`
              : '.')
          : `Falta(n) ${faltan.join(', ')}. Alternativa: definir solo CLOUDINARY_URL.`) +
        ` Con todo o con nada: a medias, la aplicación arranca y cada subida de imagen ` +
        `falla con un 403.`
    );
  } else {
    console.warn(
      '⚠️  Sin Cloudinary (las tres variables NAME, API_KEY y API_SECRET, o una sola ' +
        'CLOUDINARY_URL) los documentos se guardan en el disco de Render, que es ' +
        'EFÍMERO: las identificaciones de los jugadores se borran en cada despliegue.'
    );
  }

  for (const check of WARNINGS) {
    if (!process.env[check.key]) {
      console.warn(`⚠️  ${check.key} sin definir. ${check.message}`);
    }
  }

  if (problems.length > 0) {
    console.error(
      '\n❌ No se puede arrancar: faltan variables de entorno\n\n' +
        problems.join('\n') +
        '\n\nDefínelas en el panel de Render y vuelve a desplegar.\n' +
        'Ver DESPLIEGUE.md para la lista completa.\n'
    );
    process.exit(1);
  }
};
