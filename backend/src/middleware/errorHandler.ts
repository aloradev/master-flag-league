import type { Request, Response, NextFunction, RequestHandler } from 'express';

/** Error de negocio con código HTTP explícito. */
export class AppError extends Error {
  constructor(
    message: string,
    public statusCode = 400,
    public details?: unknown
  ) {
    super(message);
    this.name = 'AppError';
  }
}

/** Envuelve handlers async para que sus rechazos lleguen al error handler. */
export const asyncHandler =
  (fn: (req: any, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

export const notFound = (req: Request, res: Response) => {
  res.status(404).json({ success: false, error: `Ruta no encontrada: ${req.method} ${req.path}` });
};

export const errorHandler = (
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
) => {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      success: false,
      error: err.message,
      ...(err.details ? { details: err.details } : {}),
    });
  }

  // Violaciones de integridad de PostgreSQL traducidas a mensajes útiles.
  const pgCode = (err as any).code;
  if (pgCode === '23505') {
    return res.status(409).json({ success: false, error: 'El registro ya existe' });
  }
  if (pgCode === '23502') {
    return res.status(400).json({ success: false, error: 'Falta un campo obligatorio' });
  }
  if (pgCode === '23503') {
    return res.status(400).json({ success: false, error: 'Referencia inválida a otro registro' });
  }
  if (pgCode === '23514') {
    return res.status(400).json({ success: false, error: 'Valor no permitido' });
  }

  console.error('[error]', err);
  res.status(500).json({ success: false, error: 'Error interno del servidor' });
};
