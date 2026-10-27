import { useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

let openDialogs = 0;
let previousOverflow = '';

/** Diálogo nativo: contiene el foco, bloquea el fondo y admite Escape. */
export function Dialog({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const dialog = ref.current!;
    if (openDialogs++ === 0) {
      previousOverflow = document.documentElement.style.overflow;
      document.documentElement.style.overflow = 'hidden';
    }
    dialog.showModal();
    return () => {
      dialog.close();
      if (--openDialogs === 0) document.documentElement.style.overflow = previousOverflow;
      previous?.focus({ preventScroll: true });
    };
  }, []);
  const keepFocus = (event: KeyboardEvent<HTMLDialogElement>) => {
    if (event.key !== 'Tab') return;
    const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(
      'button, a[href], input, select, textarea, [tabindex], [contenteditable="true"]'
    )).filter(element => element.tabIndex >= 0 && !element.matches(':disabled') && element.getClientRects().length > 0);
    const first = controls[0];
    const last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  };
  return createPortal(<dialog ref={ref} aria-label={title}
    onKeyDown={keepFocus}
    onCancel={(e) => { e.preventDefault(); onClose(); }}
    className={`mfl-hoja fixed inset-x-0 bottom-0 top-auto m-0 mx-auto max-h-[85dvh] w-full ${wide ? 'max-w-3xl' : 'max-w-lg'} overflow-y-auto rounded-t-box sm:top-1/2 sm:bottom-auto sm:-translate-y-1/2 sm:rounded-box border border-base-300 bg-base-200 p-4 text-base-content shadow-xl backdrop:bg-black/60`}>
    <header className="mb-4 flex items-center justify-between gap-3"><h2 className="font-bold">{title}</h2>
      <button autoFocus type="button" aria-label={`Cerrar: ${title}`} className="btn btn-ghost min-h-11 shrink-0" onClick={onClose}>Cerrar</button></header>
    <div className="space-y-3">{children}</div>
  </dialog>, document.body);
}
