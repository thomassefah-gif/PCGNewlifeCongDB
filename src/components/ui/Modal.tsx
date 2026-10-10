import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';
import clsx from 'clsx';

export type ModalMaxWidth = 'sm' | 'md' | 'lg' | 'xl' | '2xl';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  maxWidth?: ModalMaxWidth;
}

const widths: Record<ModalMaxWidth, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  '2xl': 'max-w-2xl',
};

export default function Modal({ isOpen, onClose, title, children, maxWidth = 'md' }: ModalProps) {
  useEffect(() => {
    if (!isOpen) return;

    const previousOverflow = document.body.style.overflow;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-slate-950/50 p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        className={clsx('my-auto w-full overflow-hidden rounded-2xl bg-white shadow-2xl', widths[maxWidth])}
      >
        <header className="flex items-center justify-between gap-4 border-b border-stone-200 bg-accent px-5 py-4 sm:px-6">
          <h2 id="modal-title" className="text-base font-semibold text-slate-900">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-white hover:text-slate-900"
          >
            <X aria-hidden="true" size={18} />
          </button>
        </header>
        <div className="p-5 sm:p-6">{children}</div>
      </section>
    </div>
  );
}
