import { useState, useEffect } from 'react';
import {
  Home, BarChart3, PieChart, Globe, MoreHorizontal,
  X, Brain, FileText, Scale, Zap, TrendingUp, Eye, Coins,
} from 'lucide-react';

interface MobileBottomNavProps {
  onNavigate: (page: string) => void;
  currentPage?: string;
}

const PRIMARY_TABS = [
  { id: 'home', icon: Home, label: 'Ana Sayfa' },
  { id: 'market', icon: Globe, label: 'Piyasa' },
  { id: 'analytics', icon: BarChart3, label: 'Analitik' },
  { id: 'allocation', icon: PieChart, label: 'Dağılım' },
];

const MORE_ITEMS = [
  { id: 'report', icon: FileText, label: 'Günlük Rapor' },
  { id: 'ai', icon: Brain, label: 'AI Danışman' },
  { id: 'performance', icon: TrendingUp, label: 'Performans' },
  { id: 'rebalance', icon: Scale, label: 'Dengeleme' },
  { id: 'scenario', icon: Zap, label: 'Senaryo' },
  { id: 'watchlist', icon: Eye, label: 'İzleme Listesi' },
  { id: 'binance', icon: Coins, label: 'Binance' },
];

export default function MobileBottomNav({ onNavigate, currentPage = 'home' }: MobileBottomNavProps) {
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    setMoreOpen(false);
  }, [currentPage]);

  const moreActive = MORE_ITEMS.some(item => item.id === currentPage);

  const handleNav = (id: string) => {
    onNavigate(id);
    setMoreOpen(false);
  };

  return (
    <>
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white/95 dark:bg-gray-900/95 backdrop-blur-lg border-t border-gray-200 dark:border-gray-800 z-50 safe-area-inset-bottom shadow-lg">
        <div className="grid grid-cols-5 gap-1 px-2 pt-1.5 pb-1">
          {PRIMARY_TABS.map((item) => {
            const Icon = item.icon;
            const isActive = currentPage === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleNav(item.id)}
                className={`flex flex-col items-center justify-center min-h-[48px] py-1.5 px-1 rounded-xl transition-all ${
                  isActive
                    ? 'bg-brand-50 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400'
                    : 'text-gray-600 dark:text-gray-400 active:bg-gray-100 dark:active:bg-gray-800'
                }`}
              >
                <Icon className="w-5 h-5 mb-0.5" strokeWidth={isActive ? 2.5 : 2} />
                <span className={`text-[10px] leading-tight ${isActive ? 'font-semibold' : 'font-medium'}`}>{item.label}</span>
              </button>
            );
          })}
          <button
            onClick={() => setMoreOpen(true)}
            className={`flex flex-col items-center justify-center min-h-[48px] py-1.5 px-1 rounded-xl transition-all relative ${
              moreActive
                ? 'bg-brand-50 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400'
                : 'text-gray-600 dark:text-gray-400 active:bg-gray-100 dark:active:bg-gray-800'
            }`}
          >
            <MoreHorizontal className="w-5 h-5 mb-0.5" strokeWidth={moreActive ? 2.5 : 2} />
            <span className={`text-[10px] leading-tight ${moreActive ? 'font-semibold' : 'font-medium'}`}>Daha</span>
            {moreActive && (
              <span className="absolute top-1 right-2 w-1.5 h-1.5 rounded-full bg-brand-500" />
            )}
          </button>
        </div>
      </nav>

      {moreOpen && (
        <>
          <div
            onClick={() => setMoreOpen(false)}
            className="md:hidden fixed inset-0 bg-black/50 z-50 animate-fade-in"
          />
          <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-900 rounded-t-3xl z-50 shadow-2xl animate-slide-up safe-area-inset-bottom">
            <div className="pt-3 pb-1">
              <div className="mx-auto w-10 h-1 rounded-full bg-gray-300 dark:bg-gray-700" />
            </div>
            <div className="flex items-center justify-between px-5 py-3">
              <h3 className="text-base font-bold text-gray-900 dark:text-white">Diğer Sayfalar</h3>
              <button
                onClick={() => setMoreOpen(false)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
                aria-label="Kapat"
              >
                <X size={18} />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2 p-4 pb-6">
              {MORE_ITEMS.map((item) => {
                const Icon = item.icon;
                const isActive = currentPage === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => handleNav(item.id)}
                    className={`flex flex-col items-center justify-center py-4 px-2 rounded-2xl transition-all ${
                      isActive
                        ? 'bg-brand-50 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400 ring-1 ring-brand-200 dark:ring-brand-800'
                        : 'bg-slate-50 dark:bg-gray-800/50 text-gray-700 dark:text-gray-300 active:bg-slate-100 dark:active:bg-gray-800'
                    }`}
                  >
                    <Icon className="w-6 h-6 mb-1.5" strokeWidth={isActive ? 2.5 : 2} />
                    <span className="text-xs font-medium text-center leading-tight">{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </>
  );
}
