import type { Response } from 'express';
import { v2 as cloudinary } from 'cloudinary';
import { asyncHandler } from '../middleware/errorHandler.js';
import type { AuthRequest } from '../middleware/auth.js';
import { credencialesCloudinary } from '../services/storage.service.js';
import {
  informeDeAlmacenamiento,
  diagnosticarPing,
  type Ping,
} from '../services/diagnostics.service.js';

/**
 * GET /api/v1/admin/diagnostics/storage
 *
 * Responde en una petición qué credenciales de imágenes llegaron al
 * servidor, si tienen mala pinta y si Cloudinary las acepta. Sustituye
 * a adivinar cuál de tres variables está mal.
 *
 * No revela secretos: la llave y el secreto salen enmascarados. El
 * nombre del cloud sí se muestra completo, porque no es secreto —va en
 * la URL de cada imagen pública— y es el que más se equivoca.
 *
 * La lógica vive en `diagnostics.service.ts`; aquí solo queda lo que
 * necesita la red.
 */
export const storageDiagnostics = asyncHandler(async (_req: AuthRequest, res: Response) => {
  const informe = informeDeAlmacenamiento();
  const cred = credencialesCloudinary();

  // En modo local el informe ya trae su propio diagnóstico: no hay a
  // quién preguntarle.
  if (!cred) {
    return res.json({ success: true, data: { ...informe, ping: null } });
  }

  /**
   * `ping` valida las credenciales sin subir ni gastar nada. Es la
   * diferencia entre "creo que están bien" y saberlo.
   */
  let ping: Ping;
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

  res.json({
    success: true,
    data: { ...informe, ping, diagnosis: diagnosticarPing(cred, ping) },
  });
});
