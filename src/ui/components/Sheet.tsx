import { useEffect, useRef, type ReactNode } from 'react';

/** Feuille modale (dialog natif : focus piégé, Échap pour fermer, accessible). */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal?.();
    if (!open && d.open) d.close?.();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      aria-label={title}
      className="m-0 mt-auto w-full max-w-none rounded-t-3xl border-t border-line bg-surface p-0 text-text backdrop:bg-black/50 sm:mx-auto sm:mb-auto sm:max-w-lg sm:rounded-3xl"
    >
      {open && (
        <div className="max-h-[85dvh] overflow-y-auto p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl">{title}</h2>
            <button type="button" onClick={onClose} aria-label="Fermer" className="h-9 w-9 rounded-full bg-surface-2 text-lg hover:bg-line">×</button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}
