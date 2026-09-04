import {
  activeDriver,
  credencialesCloudinary,
  publicDir,
  type CredencialesCloudinary,
  type Entorno,
  type StorageDriver,
} from './storage.service.js';

/**
 * DIAGNÓSTICO DEL ALMACENAMIENTO — la parte que no habla con la red.
 *
 * Vive fuera del controlador porque es donde está toda la lógica que
 * puede equivocarse, y así se prueba cada combinación de variables sin
 * levantar un servidor por caso.
 *
 * Existe porque "Error interno del servidor" al subir una foto se
 * convirtió en media hora de adivinar cuál de tres variables estaba
 * mal.
 */

const CLAVES = [
  'CLOUDINARY_NAME',
  'CLOUDINARY_API_KEY',
  'CLOUDINARY_API_SECRET',
  'CLOUDINARY_URL',
] as const;

const TRES = ['CLOUDINARY_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'] as const;

/**
 * Enmascara dejando ver lo justo para reconocer el valor sin revelarlo.
 *
 * Un secreto corto se tapa entero: mostrar 3 de 8 caracteres no ayuda a
 * nadie a identificarlo y sí ayuda a quien lo esté adivinando.
 */
export const enmascarar = (valor: string): string => {
  if (valor.length <= 6) return '•'.repeat(valor.length);
  return `${valor.slice(0, 3)}${'•'.repeat(Math.min(12, valor.length - 6))}${valor.slice(-3)}`;
};

export interface Hallazgo {
  gravedad: 'error' | 'aviso';
  mensaje: string;
}

/**
 * Revisiones que NO necesitan hablar con Cloudinary.
 *
 * Cubren los errores de captura reales: pegar la URL completa en la
 * variable equivocada, confundir la llave con el secreto, usar el correo
 * como nombre del cloud, o dejar un espacio al final —que el panel de
 * Render conserva y produce un 401 idéntico al de una llave equivocada.
 */
export const revisarFormato = (env: Entorno = process.env): Hallazgo[] => {
  const hallazgos: Hallazgo[] = [];

  for (const clave of CLAVES) {
    const v = env[clave] ?? '';
    if (!v) continue;
    if (v !== v.trim()) {
      hallazgos.push({
        gravedad: 'error',
        mensaje:
          `${clave} tiene espacios o un salto de línea al principio o al final. ` +
          `Produce el mismo 401 que una llave equivocada. Bórralo y vuelve a pegarla sin el salto.`,
      });
    }
    if (v.trim().startsWith('cloudinary://') && clave !== 'CLOUDINARY_URL') {
      hallazgos.push({
        gravedad: 'error',
        mensaje:
          `${clave} contiene la URL completa (cloudinary://...). Esa línea va en la ` +
          `variable CLOUDINARY_URL, o repártela en las tres: el nombre, la llave y el ` +
          `secreto por separado.`,
      });
    }
  }

  /**
   * Una CLOUDINARY_URL que no se puede interpretar es el peor caso: la
   * aplicación arranca, el driver cae a local y las imágenes se van al
   * disco efímero. Silencioso y con pérdida de datos.
   */
  const url = (env.CLOUDINARY_URL ?? '').trim();
  if (url && !credencialesCloudinary(env)) {
    hallazgos.push({
      gravedad: 'error',
      mensaje:
        'CLOUDINARY_URL está definida pero no tiene la forma ' +
        'cloudinary://llave:secreto@nombre, así que no se está usando. Revisa que no ' +
        'le falte el prefijo, los dos puntos o la arroba.',
    });
  }

  const cred = credencialesCloudinary(env);
  if (!cred) return hallazgos;

  if (cred.cloudName.includes('@') || cred.cloudName.includes('.')) {
    hallazgos.push({
      gravedad: 'error',
      mensaje:
        `El nombre del cloud es "${cred.cloudName}" y parece un correo o un dominio. ` +
        `Debe ser el nombre corto que aparece en el panel de Cloudinary como "Cloud name".`,
    });
  }

  // La llave de Cloudinary son dígitos; el secreto, alfanumérico.
  const llaveSoloDigitos = /^\d+$/.test(cred.apiKey);
  const secretoSoloDigitos = /^\d+$/.test(cred.apiSecret);

  if (!llaveSoloDigitos && secretoSoloDigitos) {
    hallazgos.push({
      gravedad: 'error',
      mensaje:
        'La llave y el secreto parecen invertidos: la API key de Cloudinary son solo ' +
        'dígitos y el secreto es alfanumérico. Aquí llegaron al revés.',
    });
  } else if (!llaveSoloDigitos) {
    hallazgos.push({
      gravedad: 'aviso',
      mensaje:
        'La API key no son solo dígitos, y las de Cloudinary sí lo son. Revisa que no ' +
        'se haya copiado algo de más.',
    });
  }

  if (cred.apiKey.length < 10) {
    hallazgos.push({
      gravedad: 'aviso',
      mensaje: `La API key tiene ${cred.apiKey.length} caracteres; las de Cloudinary suelen tener 15.`,
    });
  }
  if (cred.apiSecret.length < 20) {
    hallazgos.push({
      gravedad: 'aviso',
      mensaje:
        `El secreto tiene ${cred.apiSecret.length} caracteres; los de Cloudinary suelen ` +
        `tener 27. Es el que más se corta al copiar.`,
    });
  }

  return hallazgos;
};

export interface InformeAlmacenamiento {
  driver: StorageDriver;
  variables_presentes: Record<string, boolean>;
  credenciales: {
    origen: CredencialesCloudinary['origen'];
    cloud_name: string;
    api_key: string;
    api_key_largo: number;
    api_secret: string;
    api_secret_largo: number;
  } | null;
  findings: Hallazgo[];
  /** Solo en modo local: dónde acaban los archivos mientras tanto. */
  carpeta_local?: string;
  /** Solo en modo local: ya es concluyente sin preguntarle a Cloudinary. */
  diagnosis?: string;
}

/**
 * Todo lo que se puede saber sin red. En modo local el diagnóstico ya
 * es definitivo; en modo Cloudinary lo cierra el ping del controlador.
 */
export const informeDeAlmacenamiento = (env: Entorno = process.env): InformeAlmacenamiento => {
  const driver = activeDriver(env);
  const cred = credencialesCloudinary(env);
  const variables_presentes = Object.fromEntries(CLAVES.map((k) => [k, Boolean(env[k])]));
  const findings = revisarFormato(env);

  if (!cred) {
    const faltantes = TRES.filter((k) => !env[k]);
    return {
      driver,
      variables_presentes,
      credenciales: null,
      findings,
      carpeta_local: publicDir(),
      diagnosis:
        'El almacenamiento está en modo LOCAL: las imágenes se guardan en el disco de ' +
        'Render, que se borra en cada despliegue. ' +
        (env.CLOUDINARY_URL
          ? 'Hay una CLOUDINARY_URL pero no se pudo interpretar; revisa que tenga la ' +
            'forma cloudinary://llave:secreto@nombre.'
          : `Faltan: ${faltantes.join(', ')}. Alternativa: definir solo CLOUDINARY_URL.`),
    };
  }

  return {
    driver,
    variables_presentes,
    credenciales: {
      origen: cred.origen,
      cloud_name: cred.cloudName,
      api_key: enmascarar(cred.apiKey),
      api_key_largo: cred.apiKey.length,
      api_secret: enmascarar(cred.apiSecret),
      api_secret_largo: cred.apiSecret.length,
    },
    findings,
  };
};

export interface Ping {
  ok: boolean;
  http_code?: number;
  message?: string;
}

/** Traduce la respuesta de Cloudinary a algo sobre lo que se pueda actuar. */
export const diagnosticarPing = (cred: CredencialesCloudinary, ping: Ping): string => {
  if (ping.ok) {
    return (
      `Cloudinary responde y acepta las credenciales. El almacenamiento de imágenes ` +
      `funciona (cloud "${cred.cloudName}", leídas de ${cred.origen}).`
    );
  }
  if (ping.http_code === 401) {
    return (
      'Cloudinary rechazó las credenciales (401). La llave o el secreto no corresponden ' +
      `al cloud "${cred.cloudName}". Cópialas de nuevo del panel de Cloudinary: ` +
      'Settings → API Keys, y verifica que sean del mismo entorno que ese cloud.'
    );
  }
  if (ping.http_code === 404) {
    return (
      `Cloudinary no encuentra el cloud "${cred.cloudName}" (404). Ese nombre no existe: ` +
      'revísalo en el panel, arriba a la derecha, como "Cloud name".'
    );
  }
  return (
    `Cloudinary no aceptó la petición${ping.http_code ? ` (${ping.http_code})` : ''}: ` +
    `${ping.message}`
  );
};
