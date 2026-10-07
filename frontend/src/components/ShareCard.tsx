import { useEffect, useId, useRef, useState } from 'react';
import { IconDocument, IconPlus } from './icons';
import { downloadFile } from '../lib/calendarExport';
import { renderSocialCard, socialPages, type SocialCardData, type SocialFormat } from '../lib/socialCard';

export function ShareCard(props: SocialCardData & { filename: string }) {
  const id = useId();
  const [format, setFormat] = useState<SocialFormat>('portrait');
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState('');
  const [prepared, setPrepared] = useState<File | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const generation = useRef(0);
  const panel = useRef<HTMLDetailsElement>(null);
  const identity = JSON.stringify([props, format, page]);
  const latestIdentity = useRef(identity);
  latestIdentity.current = identity;
  const pages = socialPages(props, format);
  const selectedPage = Math.min(page, pages.count - 1);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  useEffect(() => { generation.current++; setBusy(false); setPreview(''); setPrepared(null); setUnavailable(false); setError(''); }, [identity]);
  useEffect(() => () => { generation.current++; }, []);
  const generate = async (action: 'preview' | 'download' | 'share') => {
    if (busy) return;
    setBusy(true); setError('');
    const operation = ++generation.current;
    try {
      if (action === 'share' && prepared) {
        if (!navigator.canShare?.({ files: [prepared] })) { setUnavailable(true); setPrepared(null); return; }
        await navigator.share({ files: [prepared], title: props.title });
        return;
      }
      const blob = await renderSocialCard(props, format, selectedPage);
      if (generation.current !== operation || latestIdentity.current !== identity || !panel.current?.open) return;
      const filename = `${props.filename}-${format}-${selectedPage + 1}.png`;
      if (action === 'preview') {
        if (panel.current?.open && latestIdentity.current === identity) setPreview(URL.createObjectURL(blob));
      }
      else if (action === 'download') downloadFile(blob, filename);
      else {
        const file = new File([blob], filename, { type: 'image/png' });
        if (navigator.canShare?.({ files: [file] })) setPrepared(file);
        else setUnavailable(true);
      }
    } catch (cause) { if (generation.current === operation && latestIdentity.current === identity && !(cause instanceof DOMException && cause.name === 'AbortError')) setError(action === 'share' && prepared ? 'No se pudo compartir la imagen.' : 'No se pudo crear la imagen.'); }
    finally { if (generation.current === operation) setBusy(false); }
  };
  return <details ref={panel} className="public-share-panel" onToggle={event => { if (!event.currentTarget.open) { generation.current++; setBusy(false); setPreview(''); setPrepared(null); setUnavailable(false); setError(''); } }}>
    <summary><IconDocument size={18} /><span>Compartir imagen</span><IconPlus size={16} className="public-share-toggle" /></summary>
    <div className="public-share-content space-y-3">
    <div className="public-share-options"><div className="min-w-0"><label htmlFor={`${id}-format`} className="text-xs font-semibold">Formato</label><select id={`${id}-format`} className="select select-sm mt-1 block w-full min-h-11" disabled={busy} value={format} onChange={event => { setFormat(event.target.value as SocialFormat); setPage(0); setPreview(''); }}><option value="portrait">Publicación · 1080 × 1350</option><option value="story">Historia · 1080 × 1920</option><option value="square">Cuadrado · 1080 × 1080</option></select></div>
      {pages.count > 1 && <div><label htmlFor={`${id}-page`} className="text-xs font-semibold">Página</label><select id={`${id}-page`} className="select select-sm mt-1 block" disabled={busy} value={selectedPage} onChange={event => { setPage(Number(event.target.value)); setPreview(''); }}>{Array.from({ length: pages.count }, (_, index) => <option key={index} value={index}>{index + 1} de {pages.count}</option>)}</select></div>}
    </div>
    <div className="flex flex-wrap gap-2"><button type="button" className="btn btn-sm btn-ghost min-h-11" disabled={busy} onClick={() => void generate('preview')}>Vista previa</button>
      <button type="button" className="btn btn-sm btn-outline min-h-11" disabled={busy} onClick={() => void generate('download')}>Descargar tarjeta</button>
      {typeof navigator.share === 'function' && typeof navigator.canShare === 'function' && !unavailable && <button type="button" className="btn btn-sm btn-primary min-h-11" disabled={busy} onClick={() => void generate('share')}>{prepared ? 'Compartir imagen' : 'Preparar imagen'}</button>}
    </div>
    {busy && <p role="status" className="text-xs">Generando imagen...</p>}
    {unavailable && <p role="status" className="text-sm">Compartir imagen no está disponible en este dispositivo.</p>}
    {preview && <div><img src={preview} alt={`Vista previa: ${props.title} · página ${selectedPage + 1}`} className="max-h-[65vh] max-w-full border border-base-300 object-contain" /><button type="button" className="btn btn-sm btn-ghost mt-2" onClick={() => setPreview('')}>Cerrar vista previa</button></div>}
    {error && <p role="alert" className="text-sm text-error">{error}</p>}
    </div>
  </details>;
}
