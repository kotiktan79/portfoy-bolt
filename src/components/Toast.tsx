import { useEffect, useState } from 'react';
import { X, CheckCircle, XCircle, AlertCircle, Info } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
  id: string;
  type: ToastType;
  message: string;
  duration?: number;
}

interface ToastProps {
  toast: Toast;
  onClose: (id: string) => void;
}

const ICON_STYLES: Record<ToastType, { Icon: typeof CheckCircle; bar: string; icon: string }> = {
  success: {
    Icon: CheckCircle,
    bar: 'bg-accent-500',
    icon: 'text-accent-600 bg-accent-50 dark:text-accent-400 dark:bg-accent-950/40',
  },
  error: {
    Icon: XCircle,
    bar: 'bg-red-500',
    icon: 'text-red-600 bg-red-50 dark:text-red-400 dark:bg-red-950/40',
  },
  warning: {
    Icon: AlertCircle,
    bar: 'bg-amber-500',
    icon: 'text-amber-600 bg-amber-50 dark:text-amber-400 dark:bg-amber-950/40',
  },
  info: {
    Icon: Info,
    bar: 'bg-brand-500',
    icon: 'text-brand-600 bg-brand-50 dark:text-brand-400 dark:bg-brand-950/40',
  },
};

export function ToastItem({ toast, onClose }: ToastProps) {
  const [progress, setProgress] = useState(100);
  const duration = toast.duration || 5000;
  const style = ICON_STYLES[toast.type];
  const { Icon } = style;

  useEffect(() => {
    const start = Date.now();
    const interval = setInterval(() => {
      const elapsed = Date.now() - start;
      const remaining = Math.max(0, 100 - (elapsed / duration) * 100);
      setProgress(remaining);
      if (remaining === 0) clearInterval(interval);
    }, 30);
    const timer = setTimeout(() => onClose(toast.id), duration);
    return () => {
      clearTimeout(timer);
      clearInterval(interval);
    };
  }, [toast, onClose, duration]);

  return (
    <div
      className="relative flex items-start gap-3 p-3 pr-9 pl-4 rounded-2xl bg-white dark:bg-gray-900 shadow-xl ring-1 ring-slate-200 dark:ring-gray-700 backdrop-blur-sm animate-slide-up overflow-hidden min-w-[280px] max-w-md"
      role="status"
    >
      <div className={`flex-shrink-0 p-1.5 rounded-xl ${style.icon}`}>
        <Icon size={16} strokeWidth={2.2} />
      </div>
      <p className="flex-1 text-sm font-medium text-gray-900 dark:text-gray-100 leading-snug pt-0.5">
        {toast.message}
      </p>
      <button
        onClick={() => onClose(toast.id)}
        className="absolute top-2.5 right-2.5 p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-gray-200 hover:bg-slate-100 dark:hover:bg-gray-800 transition-colors"
        aria-label="Kapat"
      >
        <X className="w-3.5 h-3.5" />
      </button>
      <div className="absolute bottom-0 left-0 h-0.5 w-full bg-slate-100 dark:bg-gray-800">
        <div
          className={`h-full ${style.bar} transition-all duration-100 ease-linear`}
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}

interface ToastContainerProps {
  toasts: Toast[];
  onClose: (id: string) => void;
}

export function ToastContainer({ toasts, onClose }: ToastContainerProps) {
  return (
    <div
      role="alert"
      aria-live="polite"
      className="fixed bottom-20 md:bottom-4 right-4 z-[9999] flex flex-col gap-2 max-w-md pointer-events-none"
    >
      {toasts.map((toast) => (
        <div key={toast.id} className="pointer-events-auto">
          <ToastItem toast={toast} onClose={onClose} />
        </div>
      ))}
    </div>
  );
}
