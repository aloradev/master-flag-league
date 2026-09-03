/**
 * Validación del entorno al arrancar.
 *
 * Sin esto, una variable faltante en producción no impide que el servidor
 * arranque: se descubre después, cuando cada petición devuelve 500 con un
 * mensaje genérico y hay que adivinar por qué. Fallar en el arranque
 * convierte eso en una línea clara en el log de despliegue de Render.
 */

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
    key: 'CLOUDINARY_NAME',
    required: false,
    message:
      'Sin Cloudinary (las tres variables: NAME, API_KEY y API_SECRET) los documentos ' +
      'se guardan en el disco de Render, que es EFÍMERO: las identificaciones de los ' +
      'jugadores se borran en cada despliegue.',
  },
  {
    key: 'RESEND_API_KEY',
    required: false,
    message:
      'Sin Resend las notificaciones se registran en consola en lugar de enviarse. ' +
      'Los managers no se enterarán de documentos rechazados.',
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
   * Ahora, si hay ALGUNA de las tres, se exigen las tres: es la
   * diferencia entre enterarse en el log del despliegue y enterarse por
   * un encargado que no puede subir su logo.
   */
  const cloudinaryKeys = ['CLOUDINARY_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'];
  const cloudinaryPuestas = cloudinaryKeys.filter((k) => process.env[k]);
  if (cloudinaryPuestas.length > 0 && cloudinaryPuestas.length < cloudinaryKeys.length) {
    const faltan = cloudinaryKeys.filter((k) => !process.env[k]);
    problems.push(
      `  ✗ Cloudinary a medias — están ${cloudinaryPuestas.join(', ')} y falta(n) ` +
        `${faltan.join(', ')}. Con las tres o con ninguna: a medias, la aplicación ` +
        `arranca y cada subida de imagen falla con un 403.`
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
