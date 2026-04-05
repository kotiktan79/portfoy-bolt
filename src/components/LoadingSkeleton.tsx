export function LoadingSkeleton() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-1/4"></div>
      <div className="space-y-3">
        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded"></div>
        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-5/6"></div>
        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-4/6"></div>
      </div>
    </div>
  );
}

export function CardSkeleton() {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 border border-slate-200 dark:border-gray-700 animate-pulse">
      <div className="flex items-center justify-between mb-4">
        <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-1/3"></div>
        <div className="h-6 w-6 bg-gray-200 dark:bg-gray-700 rounded"></div>
      </div>
      <div className="space-y-3">
        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded"></div>
        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-5/6"></div>
        <div className="h-20 bg-gray-200 dark:bg-gray-700 rounded"></div>
      </div>
    </div>
  );
}

export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-3 animate-pulse">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-4 p-4 bg-white dark:bg-gray-800 rounded-lg">
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/6"></div>
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/6"></div>
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/6"></div>
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/6"></div>
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/6"></div>
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/6"></div>
        </div>
      ))}
    </div>
  );
}
