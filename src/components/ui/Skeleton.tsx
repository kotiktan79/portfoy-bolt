import { cn } from '../../lib/cn';

interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      className={cn(
        'animate-pulse rounded-md bg-slate-200 dark:bg-gray-800',
        className
      )}
    />
  );
}

export function SkeletonChart({ height = 220 }: { height?: number }) {
  return (
    <div
      className="animate-pulse rounded-xl bg-gradient-to-b from-slate-100 to-slate-200 dark:from-gray-800 dark:to-gray-900 w-full"
      style={{ height }}
    />
  );
}

export function SkeletonRow({ cols = 4 }: { cols?: number }) {
  return (
    <div className="flex items-center gap-2 py-2">
      {Array.from({ length: cols }).map((_, i) => (
        <Skeleton key={i} className={cn('h-3', i === 0 ? 'w-20' : 'flex-1')} />
      ))}
    </div>
  );
}

export function SkeletonCard() {
  return (
    <div className="card-secondary p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Skeleton className="h-9 w-9 rounded-xl" />
        <div className="flex-1 space-y-1.5">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-2.5 w-48" />
        </div>
      </div>
      <SkeletonChart height={160} />
    </div>
  );
}
