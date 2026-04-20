import { Home, BarChart3, PieChart, Brain, FileText } from 'lucide-react';

interface MobileBottomNavProps {
  onNavigate: (page: string) => void;
  currentPage?: string;
}

export default function MobileBottomNav({ onNavigate, currentPage = 'home' }: MobileBottomNavProps) {
  const navItems = [
    { id: 'home', icon: Home, label: 'Ana Sayfa' },
    { id: 'report', icon: FileText, label: 'Rapor' },
    { id: 'analytics', icon: BarChart3, label: 'Analitik' },
    { id: 'ai', icon: Brain, label: 'AI' },
    { id: 'allocation', icon: PieChart, label: 'Dağılım' },
  ];

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 z-50 safe-area-inset-bottom">
      <div className="grid grid-cols-5 gap-1 px-2 pt-1.5 pb-1">
        {navItems.slice(0, 5).map((item) => {
          const Icon = item.icon;
          const isActive = currentPage === item.id;

          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={`flex flex-col items-center justify-center min-h-[44px] py-1.5 px-1 rounded-lg transition-all ${
                isActive
                  ? 'bg-brand-50 dark:bg-brand-900/20 text-brand-600 dark:text-brand-400'
                  : 'text-gray-600 dark:text-gray-400 active:bg-gray-100 dark:active:bg-gray-800'
              }`}
            >
              <Icon className="w-5 h-5 mb-0.5" strokeWidth={isActive ? 2.5 : 2} />
              <span className={`text-[10px] leading-tight ${isActive ? 'font-semibold' : 'font-medium'}`}>{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
