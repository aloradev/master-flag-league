export const SITE: string;
export interface PageMeta { title: string; description: string; url: string; image: string; robots: string }
export function publicPath(path: string): boolean;
export function metadata(path: string, data?: unknown, origin?: string, overrides?: {title?: string; description?: string; image?: string}): PageMeta;
export function publicEndpoint(path: string): string | null;
export function escapeHtml(value: unknown): string;
export function metadataTags(meta: PageMeta): string;
