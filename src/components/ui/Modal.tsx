import { useEffect, ReactNode } from 'react';
import { X, LucideIcon } from 'lucide-react';

interface ModalProps {
  isOpen?: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  iconTone?: 'brand' | 'accent' | 'slate';
  size?: 'sm' | 'md' | 'lg' | 'xl';
  children: ReactNode;
  footer?: ReactNode;
}

const SIZE_CLASSES: Record<NonNullable<ModalProps['size']>, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
};

export function Modal({
  isOpen = true,
  onClose,
  title,
  subtitle,
  icon: Icon,
  iconTone = 'brand',
  size = 'md',
  children,
  footer,
}: ModalProps) {
  useEffect(() => {
    if (!isOpen) return;
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onEsc);
    const original = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onEsc);
      document.body.style.overflow = original;
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const toneClass =
    iconTone === 'accent' ? 'icon-badge-accent' :
    iconTone === 'slate' ? 'icon-badge-slate' :
    'icon-badge-brand';

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div
        onClick={onClose}
        className="fixed inset-0 bg-black/50 backdrop-blur-sm animate-fade-in"
      />
      <div
        role="dialog"
        aria-modal="true"
        className={`relative w-full ${SIZE_CLASSES[size]} max-h-[90vh] bg-white dark:bg-gray-900 rounded-t-3xl sm:rounded-2xl shadow-2xl ring-1 ring-slate-200 dark:ring-gray-800 animate-slide-up sm:animate-scale-in overflow-hidden flex flex-col`}
      >
        <div className="flex items-center gap-3 p-4 border-b border-slate-200 dark:border-gray-800 flex-shrink-0">
          {Icon && (
            <div className={`icon-badge ${toneClass}`}>
              <Icon size={18} />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h3 className="t-h3">{title}</h3>
            {subtitle && <p className="t-caption mt-0.5">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-slate-100 dark:hover:bg-gray-800 transition-colors flex-shrink-0"
            aria-label="Kapat"
          >
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {children}
        </div>
        {footer && (
          <div className="flex items-center gap-2 p-4 border-t border-slate-200 dark:border-gray-800 flex-shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
