import { Home, TrendingUp, PieChart, Settings, Scale, Zap } from 'lucide-react';

interface MobileBottomNavProps {
  onNavigate: (page: string) => void;
  currentPage?: string;
}

export default function MobileBottomNav({ onNavigate, currentPage = 'home' }: MobileBottomNavProps) {
  const navItems = [
    { id: 'home', icon: Home, label: 'Ana Sayfa' },
    { id: 'analytics', icon: TrendingUp, label: 'Analitik' },
    { id: 'allocation', icon: PieChart, label: 'Dağılım' },
    { id: 'rebalance', icon: Scale, label: 'Rebalance' },
    { id: 'scenario', icon: Zap, label: 'Senaryo' },
    { id: 'settings', icon: Settings, label: 'Ayarlar' },
  ];

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 z-50 safe-area-inset-bottom">
      <div className="grid grid-cols-5 gap-1 px-2 py-2">
        {navItems.slice(0, 5).map((item) => {
          const Icon = item.icon;
          const isActive = currentPage === item.id;

          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={`flex flex-col items-center justify-center py-2 px-1 rounded-lg transition-all ${
                isActive
                  ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400'
                  : 'text-gray-600 dark:text-gray-400 active:bg-gray-100 dark:active:bg-gray-800'
              }`}
            >
              <Icon className="w-5 h-5 mb-1" />
              <span className="text-xs font-medium">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
