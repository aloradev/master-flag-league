import type { Response } from 'express';
import multer from 'multer';
import { query, withTransaction } from '../config/database.js';
import { AppError, asyncHandler } from '../middleware/errorHandler.js';
import { audit } from '../services/audit.service.js';
import { newPrefixedId } from '../utils/id.js';
import { canAccessTeam, type AuthRequest } from '../middleware/auth.js';
import { putFile, putPublicFile, getFile } from '../services/storage.service.js';
import { makeAvatar, isProcessableImage } from '../services/image.service.js';
import { refreshEligibility, documentLabel } from '../services/eligibility.service.js';

const VALID_TYPES = ['PHOTO', 'ID_FRONT', 'ID_BACK'];
const DEFAULT_MAX_MB = 5;

/** Multer en memoria: se valida antes de escribir en almacenamiento. */
export const uploadMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // techo duro; el límite real viene de settings
}).single('file');

interface DocumentSettings {
  allowed_mime?: string[];
  max_size_mb?: number;
  required?: string[];
}

const loadDocumentSettings = async (seasonId: string): Promise<DocumentSettings> => {
  const result = await query<{ value: DocumentSettings }>(
    `SELECT value FROM settings WHERE season_id = $1 AND key = 'documents' LIMIT 1`,
    [seasonId]
  );
  return result.rows[0]?.value ?? {};
};

/**
 * POST /api/v1/players/:id/documents
 * Sube o reemplaza un documento. La versión anterior se conserva (req. 11).
 */
export const uploadDocument = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id: playerId } = req.params;
  const documentType = String(req.body?.documentType ?? '').toUpperCase();
  const file = (req as any).file as
    | { buffer: Buffer; mimetype: string; originalname: string; size: number }
    | undefined;

  if (!file) throw new AppError('No se recibió ningún archivo', 400);
  if (!VALID_TYPES.includes(documentType)) {
    throw new AppError(`documentType debe ser uno de: ${VALID_TYPES.join(', ')}`, 400);
  }

  const playerResult = await query<{
    team_id: string;
    season_id: string;
    status: string;
  }>(
    'SELECT team_id, season_id, status FROM players WHERE id = $1 AND removed_at IS NULL',
    [playerId]
  );

  const player = playerResult.rows[0];
  if (!player) throw new AppError('Jugador no encontrado', 404);
  if (!canAccessTeam(req, player.team_id)) {
    throw new AppError('No tienes acceso a este jugador', 403);
  }

  // Req. 6: validar formato y tamaño contra la configuración de la temporada.
  const settings = await loadDocumentSettings(player.season_id);
  const requiredDocuments = settings.required?.filter((type) => VALID_TYPES.includes(type)) ?? VALID_TYPES;
  if (!requiredDocuments.includes(documentType)) {
    throw new AppError(
      `${documentLabel(documentType)} no está habilitada para la temporada actual`,
      400
    );
  }
  const allowedMime = settings.allowed_mime ?? ['image/jpeg', 'image/png', 'application/pdf'];
  const maxBytes = (settings.max_size_mb ?? DEFAULT_MAX_MB) * 1024 * 1024;

  if (!allowedMime.includes(file.mimetype)) {
    throw new AppError(
      `Formato no permitido (${file.mimetype}). Usa: ${allowedMime.join(', ')}`,
      400
    );
  }
  if (file.size > maxBytes) {
    throw new AppError(
      `El archivo pesa ${(file.size / 1024 / 1024).toFixed(1)} MB y el máximo es ${
        settings.max_size_mb ?? DEFAULT_MAX_MB
      } MB`,
      400
    );
  }
  if (file.size === 0) throw new AppError('El archivo está vacío', 400);

  // La fotografía debe ser una imagen real: un PDF no sirve como avatar.
  if (documentType === 'PHOTO') {
    if (!file.mimetype.startsWith('image/')) {
      throw new AppError('La fotografía debe ser una imagen JPG o PNG, no un PDF', 400);
    }
    if (!(await isProcessableImage(file.buffer))) {
      throw new AppError('El archivo no es una imagen válida o está dañado', 400);
    }
  }

  const stored = await putFile(file.buffer, file.mimetype, file.originalname, playerId);

  /**
   * De la fotografía se publica un derivado, no el original.
   *
   * El original queda en el nivel privado como respaldo del registro.
   * Lo que se muestra en plantillas, cola de revisión y perfil público
   * es un WebP de 512 px reencodificado, que además ya no lleva los
   * metadatos EXIF —y con ellos, las coordenadas GPS del lugar donde se
   * tomó la foto, normalmente el domicilio del jugador.
   */
  let publicAvatarUrl: string | null = null;
  if (documentType === 'PHOTO') {
    try {
      const avatar = await makeAvatar(file.buffer);
      const published = await putPublicFile(avatar.buffer, avatar.mimeType, 'avatares');
      publicAvatarUrl = published.url;
    } catch (err) {
      // Un fallo aquí no debe tumbar la carga: el documento ya se guardó
      // y la elegibilidad depende de eso, no del avatar.
      console.error('[documents] No se pudo generar el avatar:', err);
    }
  }

  const previous = await query<{ id: string; version: number }>(
    `SELECT id, version FROM player_documents
     WHERE player_id = $1 AND document_type = $2 AND is_current = TRUE`,
    [playerId, documentType]
  );
  const previousDoc = previous.rows[0];
  const version = (previousDoc?.version ?? 0) + 1;
  const documentId = newPrefixedId('pdoc');

  await withTransaction(async (q) => {
    // El historial se conserva: la versión anterior deja de ser vigente.
    if (previousDoc) {
      await q('UPDATE player_documents SET is_current = FALSE WHERE id = $1', [previousDoc.id]);
    }

    await q(
      `INSERT INTO player_documents
        (id, player_id, document_type, file_url, storage_key, mime_type, file_size,
         version, is_current, status, uploaded_by_user_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,TRUE,'PENDING',$9)`,
      [
        documentId,
        playerId,
        documentType,
        // La "URL" es siempre el endpoint autenticado, nunca el archivo directo.
        `/api/v1/documents/${documentId}/file`,
        stored.storageKey,
        stored.mimeType,
        stored.size,
        version,
        req.user!.id,
      ]
    );

    // Al corregir documentación el jugador vuelve a la cola de revisión.
    if (player.status === 'CORRECTIONS_REQUIRED' || player.status === 'REJECTED') {
      await q(
        `UPDATE players SET status = 'PENDING', updated_at = NOW() WHERE id = $1`,
        [playerId]
      );
    }
  });

  if (documentType === 'PHOTO') {
    await query('UPDATE players SET photo_url = $1, avatar_url = COALESCE($2, avatar_url) WHERE id = $3', [
      `/api/v1/documents/${documentId}/file`,
      publicAvatarUrl,
      playerId,
    ]);
  }

  const eligibility = await refreshEligibility(playerId);

  await audit(req, {
    action: 'UPLOAD_DOCUMENT',
    entityType: 'player_document',
    entityId: documentId,
    oldValue: previousDoc ? { documentId: previousDoc.id, version: previousDoc.version } : null,
    newValue: { playerId, documentType, version, size: stored.size },
  });

  res.status(201).json({
    success: true,
    data: { id: documentId, documentType, version, eligibility, avatarUrl: publicAvatarUrl },
    message: `${documentLabel(documentType)} cargada correctamente`,
  });
});

/**
 * GET /api/v1/documents/:id/file
 * Única puerta de acceso a un documento. Valida sesión, alcance y audita la vista.
 */
export const serveDocument = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  const result = await query<{
    storage_key: string;
    mime_type: string;
    player_id: string;
    team_id: string;
    document_type: string;
  }>(
    `SELECT d.storage_key, d.mime_type, d.player_id, d.document_type, p.team_id
     FROM player_documents d JOIN players p ON p.id = d.player_id
     WHERE d.id = $1`,
    [id]
  );

  const doc = result.rows[0];
  if (!doc) throw new AppError('Documento no encontrado', 404);
  if (!canAccessTeam(req, doc.team_id)) {
    throw new AppError('No tienes acceso a este documento', 403);
  }

  let buffer: Buffer;
  try {
    buffer = await getFile(doc.storage_key, doc.mime_type);
  } catch (err) {
    console.error('[documents] Error al leer archivo:', err);
    throw new AppError('El archivo no está disponible', 404);
  }

  // Req. 12: registrar quién visualiza documentación sensible.
  if (doc.document_type !== 'PHOTO') {
    await audit(req, {
      action: 'VIEW_DOCUMENT',
      entityType: 'player_document',
      entityId: id,
      newValue: { playerId: doc.player_id, documentType: doc.document_type },
    });
  }

  res.setHeader('Content-Type', doc.mime_type || 'application/octet-stream');
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  /**
   * El nombre importa: sin él, "guardar como" propone el identificador
   * de la ruta, sin extensión, y el sistema operativo no sabe con qué
   * abrirlo. Con `inline` el navegador lo muestra en lugar de bajarlo.
   */
  const extension = doc.mime_type === 'application/pdf' ? 'pdf' : 'jpg';
  const nombre = `${doc.document_type.toLowerCase()}-${doc.player_id}.${extension}`;
  res.setHeader('Content-Disposition', `inline; filename="${nombre}"`);
  res.send(buffer);
});

/** GET /api/v1/players/:id/documents/history — versiones anteriores (req. 11) */
export const getDocumentHistory = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id: playerId } = req.params;

  const player = await query<{ team_id: string }>('SELECT team_id FROM players WHERE id = $1', [
    playerId,
  ]);
  if (!player.rows[0]) throw new AppError('Jugador no encontrado', 404);
  if (!canAccessTeam(req, player.rows[0].team_id)) {
    throw new AppError('No tienes acceso a este jugador', 403);
  }

  const result = await query(
    `SELECT d.id, d.document_type, d.version, d.is_current, d.status,
            d.mime_type, d.file_size, d.uploaded_at, u.name AS uploaded_by
     FROM player_documents d
     LEFT JOIN users u ON u.id = d.uploaded_by_user_id
     WHERE d.player_id = $1
     ORDER BY d.document_type, d.version DESC`,
    [playerId]
  );

  res.json({ success: true, data: result.rows });
});
