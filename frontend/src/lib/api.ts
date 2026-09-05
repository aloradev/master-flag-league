/**
 * Cliente de la API.
 *
 * En desarrollo se usa la ruta relativa /api/v1 y Vite la reenvía al backend;
 * en producción VITE_API_URL apunta al servicio de Render.
 */
const BASE = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api/v1`
  : '/api/v1';

const TOKEN_KEY = 'mfl.token';

export const tokenStore = {
  get: (): string | null => {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set: (token: string) => {
    try {
      localStorage.setItem(TOKEN_KEY, token);
    } catch {
      /* modo privado: la sesión vivirá solo en memoria */
    }
  },
  clear: () => {
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* sin acción */
    }
  },
};

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public details?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Se dispara cuando el token deja de ser válido, para cerrar sesión. */
type UnauthorizedHandler = () => void;
let onUnauthorized: UnauthorizedHandler = () => {};
export const setUnauthorizedHandler = (handler: UnauthorizedHandler) => {
  onUnauthorized = handler;
};

interface RequestOptions {
  accessToken?: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  /** FormData para subida de archivos: no se serializa ni lleva Content-Type. */
  formData?: FormData;
  signal?: AbortSignal;
}

const request = async <T>(path: string, options: RequestOptions = {}): Promise<T> => {
  const headers: Record<string, string> = {};
  const token = options.accessToken ?? tokenStore.get();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';

  const response = await fetch(`${BASE}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.formData ?? (options.body !== undefined ? JSON.stringify(options.body) : undefined),
    signal: options.signal,
  });

  if (response.status === 401) {
    if (options.accessToken !== undefined) {
      throw new ApiError('El enlace temporal venció o no es válido. Solicita un nuevo acceso a administración.', 401);
    }
    // Token vencido o revocado: se cierra la sesión en lugar de dejar
    // al usuario en una pantalla vacía sin explicación.
    onUnauthorized();
    throw new ApiError('Tu sesión expiró. Vuelve a ingresar.', 401);
  }

  const payload = await response.json().catch(() => null);

  if (!response.ok || payload?.success === false) {
    throw new ApiError(
      payload?.error ?? `Error ${response.status}`,
      response.status,
      payload?.details
    );
  }

  return (payload?.data ?? payload) as T;
};

export const api = {
  get: <T>(path: string, signal?: AbortSignal) => request<T>(path, { signal }),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PUT', body }),
  del: <T>(path: string, body?: unknown) => request<T>(path, { method: 'DELETE', body }),
  upload: <T>(path: string, formData: FormData) =>
    request<T>(path, { method: 'POST', formData }),
};

/** Credencial exclusiva del enlace: nunca reemplaza la sesión del administrador. */
export const temporaryApi = (accessToken: string): typeof api => ({
  get: (path, signal) => request(path, { accessToken, signal }),
  post: (path, body) => request(path, { accessToken, method: 'POST', body }),
  put: (path, body) => request(path, { accessToken, method: 'PUT', body }),
  del: (path, body) => request(path, { accessToken, method: 'DELETE', body }),
  upload: (path, formData) => request(path, { accessToken, method: 'POST', formData }),
});

/**
 * Descarga un documento protegido como blob.
 *
 * Los documentos se sirven solo con cabecera Authorization, y una etiqueta
 * <img src> no puede enviarla; por eso se descargan aquí y se muestran con
 * una URL de objeto temporal.
 */
export const fetchProtectedBlob = async (path: string): Promise<string> => {
  const token = tokenStore.get();
  const response = await fetch(path.startsWith('http') ? path : `${BASE}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (!response.ok) {
    throw new ApiError('No se pudo cargar el documento', response.status);
  }
  return URL.createObjectURL(await response.blob());
};

/** Normaliza la URL que guarda el backend (/api/v1/documents/:id/file). */
export const documentPath = (fileUrl: string): string =>
  fileUrl.replace(/^\/api\/v1/, '');

/**
 * Resuelve la URL de un archivo público (avatar, logo).
 *
 * El backend devuelve rutas relativas como /media/avatares/img_x.webp en
 * modo local, y URLs absolutas de Cloudinary en producción. Esta función
 * absorbe la diferencia para que los componentes no tengan que saber cuál
 * de los dos está activo.
 */
export const mediaUrl = (path?: string | null): string | undefined => {
  if (!path) return undefined;
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  const base = import.meta.env.VITE_API_URL ?? '';
  return `${base}${path}`;
};
