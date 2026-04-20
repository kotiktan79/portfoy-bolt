import { LucideIcon } from 'lucide-react';
import { ReactNode } from 'react';
import { cn } from '../../lib/cn';

type CardVariant = 'primary' | 'secondary';
type IconTone = 'brand' | 'accent' | 'slate';

interface CardProps {
  variant?: CardVariant;
  className?: string;
  children: ReactNode;
}

export function Card({ variant = 'secondary', className, children }: CardProps) {
  return (
    <div className={cn(variant === 'primary' ? 'card-primary' : 'card-secondary', className)}>
      {children}
    </div>
  );
}

interface CardHeaderProps {
  icon?: LucideIcon;
  iconTone?: IconTone;
  title: string;
  subtitle?: ReactNode;
  rightSlot?: ReactNode;
  onClick?: () => void;
  className?: string;
}

export function CardHeader({
  icon: Icon,
  iconTone = 'brand',
  title,
  subtitle,
  rightSlot,
  onClick,
  className,
}: CardHeaderProps) {
  const toneClass =
    iconTone === 'accent' ? 'icon-badge-accent' :
    iconTone === 'slate' ? 'icon-badge-slate' :
    'icon-badge-brand';

  const Wrapper = onClick ? 'button' : 'div';

  return (
    <Wrapper
      onClick={onClick}
      className={cn(
        'card-header w-full text-left',
        onClick && 'hover:bg-slate-50 dark:hover:bg-gray-800/30 transition-colors cursor-pointer',
        className
      )}
    >
      {Icon && (
        <div className={cn('icon-badge', toneClass)}>
          <Icon size={18} />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <h3 className="t-h3">{title}</h3>
        {subtitle && <div className="t-caption mt-0.5">{subtitle}</div>}
      </div>
      {rightSlot}
    </Wrapper>
  );
}

export function CardBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('card-body', className)}>{children}</div>;
}
