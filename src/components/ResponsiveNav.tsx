import { useState } from 'react';
import { Menu, X, TrendingUp } from 'lucide-react';

interface ResponsiveNavProps {
  children: React.ReactNode;
  title?: string;
}

export function ResponsiveNav({ children, title = 'Portföy Takip' }: ResponsiveNavProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <div className="lg:hidden fixed top-0 left-0 right-0 bg-white dark:bg-gray-800 border-b border-slate-200 dark:border-gray-700 z-40">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="text-blue-600" size={24} />
            <h1 className="text-lg font-bold text-gray-900 dark:text-white">{title}</h1>
          </div>
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            aria-label="Toggle menu"
          >
            {isOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>

        {isOpen && (
          <div className="border-t border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg">
            <div className="px-4 py-3 space-y-2">
              {children}
            </div>
          </div>
        )}
      </div>

      <div className="hidden lg:flex items-center gap-2">
        {children}
      </div>
    </>
  );
}
