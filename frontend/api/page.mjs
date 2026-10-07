import { readFile } from 'node:fs/promises';
import { metadata, metadataTags, publicEndpoint, publicPath } from '../src/lib/pageMetadata.mjs';

export default async function handler(req, res) {
  const path = new URL(req.url, 'https://local.invalid').searchParams.get('path') || '/';
  if (!publicPath(path)) return res.status(404).end('Not found');
  let data;
  let unavailable = false;
  const endpoint = publicEndpoint(path);
  if (endpoint) {
    try {
      const base = (process.env.VITE_API_URL || 'https://mfl-api.onrender.com').replace(/\/+$/, '');
      const response = await fetch(`${base}/api/v1${endpoint}`, { signal: AbortSignal.timeout(6000) });
      if (!response.ok) { res.statusCode = response.status === 404 ? 404 : 503; unavailable = true; }
      else { const payload = await response.json(); data = payload.data; }
    } catch { res.statusCode = 503; unavailable = true; }
  }
  const meta = metadata(path, data);
  if (unavailable) meta.robots = 'noindex, nofollow';
  const template = await readFile(new URL('../dist/index.html', import.meta.url), 'utf8');
  const html = template.replace(/<title>[\s\S]*?<\/title>/i, '').replace(/<meta\s+(?:name|property)="(?:description|robots|og:[^"]+|twitter:[^"]+)"[^>]*>/gi, '').replace(/<link\s+rel="canonical"[^>]*>/gi, '').replace('</head>', `${metadataTags(meta)}\n</head>`);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', unavailable || path === '/favoritos' ? 'no-store' : 'public, max-age=0, s-maxage=60, stale-while-revalidate=120');
  res.end(html);
}
