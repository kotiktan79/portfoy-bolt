import { ArrowLeft, LucideIcon } from 'lucide-react';
import { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  onBack?: () => void;
  actions?: ReactNode;
}

export function PageHeader({ title, subtitle, icon: Icon, onBack, actions }: PageHeaderProps) {
  const navigate = useNavigate();
  const handleBack = onBack || (() => navigate(-1));

  return (
    <div className="flex items-center justify-between gap-3 mb-6">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <button
          onClick={handleBack}
          className="p-2 rounded-xl bg-white dark:bg-gray-800 text-slate-600 dark:text-gray-400 ring-1 ring-slate-200 dark:ring-gray-700 hover:bg-slate-50 dark:hover:bg-gray-700 hover-lift transition-all"
          aria-label="Geri"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="min-w-0">
          <h1 className="t-h1 flex items-center gap-2">
            {Icon && <Icon className="text-brand-600 dark:text-brand-400" size={26} />}
            {title}
          </h1>
          {subtitle && <p className="t-caption mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex-shrink-0">{actions}</div>}
    </div>
  );
}
