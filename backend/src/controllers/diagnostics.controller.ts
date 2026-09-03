import type { Response } from 'express';
import { v2 as cloudinary } from 'cloudinary';
import { asyncHandler } from '../middleware/errorHandler.js';
import type { AuthRequest } from '../middleware/auth.js';
import { activeDriver, credencialesCloudinary, publicDir } from '../services/storage.service.js';

/**
 * DIAGNÓSTICO DEL ALMACENAMIENTO
 *
 * Existe porque "Error interno del servidor" al subir una foto se
 * convirtió en media hora de adivinar cuál de tres variables estaba
 * mal. Este endpoint responde eso en una petición: qué credenciales
 * llegaron, si tienen mala pinta, y si Cloudinary las acepta.
 *
 * No revela secretos: la llave y el secreto salen enmascarados. El
 * nombre del cloud sí se muestra completo, porque no es secreto —va en
 * la URL de cada imagen pública— y es el que más se equivoca.
 */

const enmascarar = (valor: string): string => {
  if (valor.length <= 6) return '•'.repeat(valor.length);
  return `${valor.slice(0, 3)}${'•'.repeat(Math.min(12, valor.length - 6))}${valor.slice(-3)}`;
};

interface Hallazgo {
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
const revisarFormato = (): Hallazgo[] => {
  const hallazgos: Hallazgo[] = [];
  const crudo = (k: string) => process.env[k] ?? '';

  for (const clave of [
    'CLOUDINARY_NAME',
    'CLOUDINARY_API_KEY',
    'CLOUDINARY_API_SECRET',
    'CLOUDINARY_URL',
  ]) {
    const v = crudo(clave);
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
          `variable CLOUDINARY_URL, o repártela en las tres: el nombre, la llave y el secreto por separado.`,
      });
    }
  }

  const cred = credencialesCloudinary();
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

/** GET /api/v1/admin/diagnostics/storage */
export const storageDiagnostics = asyncHandler(async (_req: AuthRequest, res: Response) => {
  const driver = activeDriver();
  const cred = credencialesCloudinary();
  const presentes = Object.fromEntries(
    ['CLOUDINARY_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET', 'CLOUDINARY_URL'].map(
      (k) => [k, Boolean(process.env[k])]
    )
  );

  const hallazgos = revisarFormato();

  if (driver === 'local') {
    const faltantes = ['CLOUDINARY_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'].filter(
      (k) => !process.env[k]
    );
    return res.json({
      success: true,
      data: {
        driver,
        variables_presentes: presentes,
        credenciales: null,
        findings: hallazgos,
        ping: null,
        diagnosis:
          'El almacenamiento está en modo LOCAL: las imágenes se guardan en el disco de ' +
          'Render, que se borra en cada despliegue. ' +
          (presentes.CLOUDINARY_URL
            ? 'Hay una CLOUDINARY_URL pero no se pudo interpretar; revisa que tenga la forma ' +
              'cloudinary://llave:secreto@nombre.'
            : `Faltan: ${faltantes.join(', ')}. Alternativa: definir solo CLOUDINARY_URL.`),
        carpeta_local: publicDir(),
      },
    });
  }

  /**
   * `ping` valida las credenciales sin subir ni gastar nada. Es la
   * diferencia entre "creo que están bien" y saberlo.
   */
  let ping: { ok: boolean; http_code?: number; message?: string };
  try {
    await cloudinary.api.ping();
    ping = { ok: true };
  } catch (e) {
    const err = e as { http_code?: number; message?: string; error?: { message?: string } };
    ping = {
      ok: false,
      http_code: err?.http_code,
      message: err?.error?.message ?? err?.message ?? String(e),
    };
  }

  let diagnosis: string;
  if (ping.ok) {
    diagnosis =
      `Cloudinary responde y acepta las credenciales. El almacenamiento de imágenes ` +
      `funciona (cloud "${cred!.cloudName}", leídas de ${cred!.origen}).`;
  } else if (ping.http_code === 401) {
    diagnosis =
      'Cloudinary rechazó las credenciales (401). La llave o el secreto no corresponden ' +
      `al cloud "${cred!.cloudName}". Cópialas de nuevo del panel de Cloudinary: ` +
      'Settings → API Keys, y verifica que sean del mismo entorno que ese cloud.';
  } else if (ping.http_code === 404) {
    diagnosis =
      `Cloudinary no encuentra el cloud "${cred!.cloudName}" (404). Ese nombre no existe: ` +
      'revísalo en el panel, arriba a la derecha, como "Cloud name".';
  } else {
    diagnosis =
      `Cloudinary no aceptó la petición${ping.http_code ? ` (${ping.http_code})` : ''}: ` +
      `${ping.message}`;
  }

  res.json({
    success: true,
    data: {
      driver,
      variables_presentes: presentes,
      credenciales: {
        origen: cred!.origen,
        cloud_name: cred!.cloudName,
        api_key: enmascarar(cred!.apiKey),
        api_key_largo: cred!.apiKey.length,
        api_secret: enmascarar(cred!.apiSecret),
        api_secret_largo: cred!.apiSecret.length,
      },
      findings: hallazgos,
      ping,
      diagnosis,
    },
  });
});
