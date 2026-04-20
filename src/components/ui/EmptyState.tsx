import { LucideIcon } from 'lucide-react';
import { ReactNode } from 'react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon: Icon, title, description, action, className = '' }: EmptyStateProps) {
  return (
    <div className={`flex flex-col items-center justify-center py-10 px-4 text-center ${className}`}>
      <div className="mb-3 p-3 rounded-2xl bg-slate-100 dark:bg-gray-800">
        <Icon className="w-8 h-8 text-slate-400 dark:text-gray-500" />
      </div>
      <p className="t-h3">{title}</p>
      {description && <p className="t-caption mt-1 max-w-sm">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
