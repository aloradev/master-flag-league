import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { metadata, publicPath } from '../lib/pageMetadata.mjs';

export function PageMetadata({ title, description, image }: { title?: string; description?: string; image?: string }) {
  const { pathname } = useLocation();
  useEffect(() => {
    const meta = metadata(pathname, undefined, undefined, { title, description, image });
    document.title = meta.title;
    const set = (key: string, value: string, property = false) => {
      const attr = property ? 'property' : 'name';
      let element = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
      if (!element) { element = document.createElement('meta'); element.setAttribute(attr, key); document.head.append(element); }
      element.content = value;
    };
    set('description', meta.description); set('robots', meta.robots);
    for (const key of ['title', 'description', 'image'] as const) { set(`og:${key}`, meta[key], true); set(`twitter:${key}`, meta[key]); }
    set('og:url', meta.url, true); set('og:image:alt', meta.title, true);
    let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!canonical) { canonical = document.createElement('link'); canonical.rel = 'canonical'; document.head.append(canonical); }
    canonical.href = meta.url;
  }, [pathname, title, description, image]);
  return null;
}
export function PrivateMetadata() {
  const { pathname } = useLocation();
  return publicPath(pathname) ? null : <PageMetadata title="Acceso a la liga" description="Espacio privado de Master Flag League." />;
}
