import { useEffect, useId, useRef, useState } from 'react';
import { IconClipboard, IconMore } from './icons';

export function ShareLink({ texto }: { texto: string }) {
  const url = window.location.href;
  const id = useId();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const latest = useRef(url);
  latest.current = url;
  useEffect(() => { setMessage(''); setError(''); }, [texto, url]);
  const copy = async () => {
    setMessage(''); setError('');
    try {
      await navigator.clipboard.writeText(url);
      if (latest.current === url) setMessage('Enlace copiado.');
    } catch {
      if (latest.current === url) setError('No se pudo copiar el enlace.');
    }
  };
  const share = async () => {
    if (busy) return;
    setBusy(true); setMessage(''); setError('');
    try {
      const text = texto.endsWith(url) ? texto.slice(0, -url.length).trim() : texto;
      await navigator.share({ title: document.title, text, url });
    } catch (cause) {
      if (latest.current === url && !(cause instanceof DOMException && cause.name === 'AbortError')) setError('No se pudo compartir el enlace.');
    } finally { setBusy(false); }
  };
  return <details className="public-link-share" onToggle={event => { if (!event.currentTarget.open) { setMessage(''); setError(''); } }}>
    <summary className="btn btn-sm btn-primary">Compartir enlace</summary>
    <div className="public-link-share-options">
      {typeof navigator.share === 'function' && <button type="button" className="btn btn-sm btn-outline" disabled={busy} onClick={() => void share()}><IconMore />Otras aplicaciones</button>}
      <button type="button" className="btn btn-sm btn-outline" disabled={busy} onClick={() => void copy()}><IconClipboard />Copiar enlace</button>
      <a className="btn btn-sm btn-outline" href={`https://wa.me/?text=${encodeURIComponent(texto)}`} target="_blank" rel="noopener noreferrer">WhatsApp</a>
      {message && <p role="status" className="text-sm">{message}</p>}
      {error && <div><p role="alert" className="text-sm text-error">{error}</p><label className="sr-only" htmlFor={id}>Enlace para compartir</label><input id={id} className="input mt-2 w-full" readOnly value={url} onFocus={event => event.target.select()} /></div>}
    </div>
  </details>;
}
