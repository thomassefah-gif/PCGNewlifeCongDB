import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { CheckCircle2, Info, X, XCircle } from 'lucide-react';
import clsx from 'clsx';

export type ToastType = 'success' | 'error' | 'info';

interface ToastMessage {
  id: number;
  type: ToastType;
  message: string;
}

interface ToastContextValue {
  showToast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const showToast = useCallback((message: string, type: ToastType = 'info') => {
    const id = Date.now() + Math.random();
    setToasts((current) => [...current, { id, type, message }]);
    window.setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== id)), 4000);
  }, []);
  const contextValue = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      <div aria-live="polite" className="fixed bottom-4 right-4 z-[120] flex w-[min(92vw,380px)] flex-col gap-2">
        {toasts.map(({ id, type, message }) => {
          const Icon = type === 'success' ? CheckCircle2 : type === 'error' ? XCircle : Info;
          return (
            <div
              key={id}
              role={type === 'error' ? 'alert' : 'status'}
              className={clsx(
                'flex items-start gap-3 rounded-xl border bg-white px-4 py-3 shadow-lg',
                type === 'success' && 'border-success/20 text-success',
                type === 'error' && 'border-danger/20 text-danger',
                type === 'info' && 'border-primary/20 text-primaryDark',
              )}
            >
              <Icon aria-hidden="true" className="mt-0.5 shrink-0" size={18} />
              <p className="flex-1 text-sm font-medium text-slate-800">{message}</p>
              <button
                type="button"
                aria-label="Dismiss notification"
                onClick={() => setToasts((current) => current.filter((toast) => toast.id !== id))}
                className="text-slate-400 hover:text-slate-700"
              >
                <X aria-hidden="true" size={16} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used within a ToastProvider.');
  return context;
}
