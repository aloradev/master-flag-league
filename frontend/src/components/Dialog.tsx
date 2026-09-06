import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/** Diálogo nativo: contiene el foco, bloquea el fondo y admite Escape. */
export function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const dialog = ref.current!;
    dialog.showModal();
    return () => { dialog.close(); previous?.focus(); };
  }, []);
  return createPortal(<dialog ref={ref} aria-label={title}
    onCancel={(e) => { e.preventDefault(); onClose(); }}
    className="mfl-hoja fixed inset-x-0 bottom-0 top-auto m-0 mx-auto max-h-[85dvh] w-full max-w-lg overflow-y-auto rounded-t-box border border-base-300 bg-base-200 p-4 text-base-content shadow-xl backdrop:bg-black/60">
    <header className="mb-4 flex items-center justify-between gap-3"><h2 className="font-bold">{title}</h2>
      <button autoFocus className="btn btn-ghost min-h-11" onClick={onClose}>Cerrar</button></header>
    <div className="space-y-3">{children}</div>
  </dialog>, document.body);
}
