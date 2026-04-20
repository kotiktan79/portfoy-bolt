import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  TrendingUp, Plus, RefreshCw, Moon, Sun, Bell, BarChart3,
  Activity, Download, Shield, Palette,
  PieChart, Scale, Zap, Database,
  Target, Menu, X, Trash2, MoreHorizontal, Wallet, Eye, Globe
} from 'lucide-react';
import { ConnectionStatus } from '../services/priceService';
import { useLanguage } from '../contexts/LanguageContext';

interface DashboardHeaderProps {
  connectionStatus: ConnectionStatus;
  refreshing: boolean;
  isDark: boolean;
  notificationsEnabled: boolean;
  onToggleDark: () => void;
  onRefresh: () => void;
  onAddHolding: () => void;
  onShowAlerts: () => void;
  onShowExport: () => void;
  onShowBackup: () => void;
  onShow2FA: () => void;
  onShowAnalytics: () => void;
  onShowAllocation: () => void;
  onShowRebalancing: () => void;
  onShowScenario: () => void;
  onShowAIAdvisor: () => void;
  onShowPerformance: () => void;
  onShowRebalanceModal: () => void;
  onEnableNotifications: () => void;
  onThemeCycle: () => void;
}

export function DashboardHeader({
  connectionStatus,
  refreshing,
  isDark,
  notificationsEnabled,
  onToggleDark,
  onRefresh,
  onAddHolding,
  onShowAlerts,
  onShowExport,
  onShowBackup,
  onShow2FA,
  onShowAnalytics,
  onShowAllocation,
  onShowRebalancing,
  onShowScenario,
  onShowAIAdvisor,
  onShowPerformance,
  onShowRebalanceModal,
  onEnableNotifications,
  onThemeCycle,
}: DashboardHeaderProps) {
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const { language, setLanguage } = useLanguage();
  const moreMenuRef = useRef<HTMLDivElement>(null);

  // Close "more" menu when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) {
        setMoreMenuOpen(false);
      }
    }
    if (moreMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [moreMenuOpen]);

  const clearCache = async () => {
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((r) => r.unregister()));
    }
    window.location.reload();
  };

  const statusDotColor = (): string => {
    switch (connectionStatus) {
      case 'connected':
        return 'bg-green-500';
      case 'connecting':
        return 'bg-yellow-500 animate-pulse';
      case 'error':
        return 'bg-red-500';
      default:
        return 'bg-gray-400';
    }
  };

  const statusLabel = (): string => {
    switch (connectionStatus) {
      case 'connected':
        return 'Canli';
      case 'connecting':
        return 'Baglaniyor';
      case 'error':
        return 'Hata';
      default:
        return 'Cevrimdisi';
    }
  };

  const navItems = [
    { label: 'AI Danışman', onClick: onShowAIAdvisor, icon: Activity },
    { label: 'Piyasa', onClick: () => navigate('/market'), icon: Globe },
    { label: 'Analitik', onClick: onShowAnalytics, icon: BarChart3 },
    { label: 'Performans', onClick: onShowPerformance, icon: TrendingUp },
    { label: 'Dağılım', onClick: onShowAllocation, icon: PieChart },
  ];

  const iconBtn = 'p-2 rounded-xl text-slate-500 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-gray-800 transition-colors';

  return (
    <header className="sticky top-0 z-30 bg-white/85 dark:bg-gray-900/85 backdrop-blur-lg border-b border-slate-200 dark:border-gray-800">
      <div className="px-4 md:px-6 h-16 flex items-center justify-between gap-4">
        {/* Left: Logo + brand + status */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center shadow-md shadow-brand-500/20 flex-shrink-0">
            <TrendingUp size={18} className="text-white" strokeWidth={2.5} />
          </div>
          <div className="min-w-0">
            <h1 className="text-base font-bold tracking-tight truncate leading-none text-slate-900 dark:text-white">
              <span className="bg-gradient-to-r from-brand-600 to-accent-600 bg-clip-text text-transparent">Tandor</span> Finans
            </h1>
            <div className="flex items-center gap-1 mt-0.5" title={statusLabel()}>
              <span className={`inline-block w-1.5 h-1.5 rounded-full ${statusDotColor()}`} />
              <span className="text-[10px] text-slate-500 dark:text-gray-400">{statusLabel()}</span>
            </div>
          </div>
        </div>

        {/* Center: Desktop navigation */}
        <nav className="hidden lg:flex items-center gap-1">
          {navItems.map((item) => (
            <button
              key={item.label}
              onClick={item.onClick}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-slate-600 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-gray-800 transition-colors"
            >
              <item.icon size={14} strokeWidth={2} />
              {item.label}
            </button>
          ))}
        </nav>

        {/* Right: Actions (desktop) */}
        <div className="hidden lg:flex items-center gap-1">
          <button
            onClick={() => setLanguage(language === 'tr' ? 'en' : 'tr')}
            aria-label="Dil değiştir"
            className="px-2 py-1.5 rounded-xl text-[11px] font-bold text-slate-500 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-gray-800 transition-colors"
          >
            {language === 'tr' ? 'EN' : 'TR'}
          </button>

          <button onClick={onToggleDark} aria-label={isDark ? 'Aydınlık' : 'Karanlık'} className={iconBtn}>
            {isDark ? <Sun size={17} /> : <Moon size={17} />}
          </button>

          <button onClick={onRefresh} disabled={refreshing} aria-label="Yenile" className={`${iconBtn} disabled:opacity-40`}>
            <RefreshCw size={17} className={refreshing ? 'animate-spin' : ''} />
          </button>

          {/* More menu */}
          <div className="relative" ref={moreMenuRef}>
            <button
              onClick={() => setMoreMenuOpen(!moreMenuOpen)}
              aria-label="Daha fazla"
              className={iconBtn}
            >
              <MoreHorizontal size={17} />
            </button>
            {moreMenuOpen && (
              <div
                className={`absolute right-0 top-full mt-2 w-52 rounded-lg shadow-lg ring-1 z-50 overflow-hidden ${
                  isDark
                    ? 'bg-gray-800 ring-gray-700'
                    : 'bg-white ring-gray-200'
                }`}
              >
                <div className="py-1">
                  <button
                    onClick={() => { onShowAlerts(); setMoreMenuOpen(false); }}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                      isDark
                        ? 'text-gray-300 hover:bg-gray-700 hover:text-white'
                        : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'
                    }`}
                  >
                    <Bell size={16} className="text-yellow-500" />
                    Alarmlar
                  </button>
                  <button
                    onClick={() => { onShowExport(); setMoreMenuOpen(false); }}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                      isDark
                        ? 'text-gray-300 hover:bg-gray-700 hover:text-white'
                        : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'
                    }`}
                  >
                    <Download size={16} className="text-brand-500" />
                    Dışa/İçe Aktar
                  </button>
                  <button
                    onClick={() => { onShowBackup(); setMoreMenuOpen(false); }}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                      isDark
                        ? 'text-gray-300 hover:bg-gray-700 hover:text-white'
                        : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'
                    }`}
                  >
                    <Database size={16} className="text-green-500" />
                    Yedekle/Geri Yükle
                  </button>
                  <button
                    onClick={() => { onShow2FA(); setMoreMenuOpen(false); }}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                      isDark
                        ? 'text-gray-300 hover:bg-gray-700 hover:text-white'
                        : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'
                    }`}
                  >
                    <Shield size={16} className="text-red-500" />
                    2FA Güvenlik
                  </button>
                  <button
                    onClick={() => { onThemeCycle(); setMoreMenuOpen(false); }}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                      isDark
                        ? 'text-gray-300 hover:bg-gray-700 hover:text-white'
                        : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'
                    }`}
                  >
                    <Palette size={16} className="text-brand-500" />
                    Tema Değiştir
                  </button>
                </div>
                <div
                  className={`border-t py-1 ${
                    isDark ? 'border-gray-700' : 'border-gray-100'
                  }`}
                >
                  {!notificationsEnabled && (
                    <button
                      onClick={() => { onEnableNotifications(); setMoreMenuOpen(false); }}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                        isDark
                          ? 'text-amber-400 hover:bg-gray-700'
                          : 'text-amber-600 hover:bg-gray-50'
                      }`}
                    >
                      <Bell size={16} />
                      Bildirimleri Etkinleştir
                    </button>
                  )}
                  <button
                    onClick={() => { clearCache(); setMoreMenuOpen(false); }}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                      isDark
                        ? 'text-red-400 hover:bg-gray-700 hover:text-red-300'
                        : 'text-red-500 hover:bg-red-50 hover:text-red-600'
                    }`}
                  >
                    <Trash2 size={16} />
                    Cache Temizle
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="h-6 w-px mx-1 bg-slate-200 dark:bg-gray-700" />

          <button
            onClick={onAddHolding}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-gradient-to-br from-brand-600 to-brand-700 hover:from-brand-500 hover:to-brand-600 text-white rounded-xl shadow-md shadow-brand-500/20 hover:shadow-brand-500/40 transition-all font-semibold text-sm hover-lift"
          >
            <Plus size={15} />
            Varlık Ekle
          </button>
        </div>

        {/* Right: Mobile controls */}
        <div className="flex lg:hidden items-center gap-1">
          <button onClick={onRefresh} disabled={refreshing} aria-label="Yenile" className={`${iconBtn} disabled:opacity-40`}>
            <RefreshCw size={17} className={refreshing ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={onAddHolding}
            className="flex items-center gap-1 px-2.5 py-1.5 bg-gradient-to-br from-brand-600 to-brand-700 text-white rounded-lg shadow-md shadow-brand-500/20 font-semibold text-xs"
          >
            <Plus size={14} />
            Ekle
          </button>
          <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} aria-label="Menü" className={iconBtn}>
            {mobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileMenuOpen && (
        <div
          className={`lg:hidden border-t px-4 py-3 ${
            isDark ? 'bg-gray-900 border-gray-800' : 'bg-gray-50 border-gray-200'
          }`}
        >
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
            {/* Navigation items */}
            <button
              onClick={() => { onShowAIAdvisor(); setMobileMenuOpen(false); }}
              className={`flex items-center gap-2.5 px-3 min-h-[44px] rounded-lg text-sm font-medium transition-colors ${
                isDark
                  ? 'text-gray-300 hover:bg-gray-800 hover:text-white'
                  : 'text-gray-700 hover:bg-white hover:text-gray-900'
              }`}
            >
              <Activity size={18} className="flex-shrink-0" /> AI Danışman
            </button>
            <button
              onClick={() => { onShowAnalytics(); setMobileMenuOpen(false); }}
              className={`flex items-center gap-2.5 px-3 min-h-[44px] rounded-lg text-sm font-medium transition-colors ${
                isDark
                  ? 'text-gray-300 hover:bg-gray-800 hover:text-white'
                  : 'text-gray-700 hover:bg-white hover:text-gray-900'
              }`}
            >
              <BarChart3 size={18} className="flex-shrink-0" /> Analitik
            </button>
            <button
              onClick={() => { onShowAllocation(); setMobileMenuOpen(false); }}
              className={`flex items-center gap-2.5 px-3 min-h-[44px] rounded-lg text-sm font-medium transition-colors ${
                isDark
                  ? 'text-gray-300 hover:bg-gray-800 hover:text-white'
                  : 'text-gray-700 hover:bg-white hover:text-gray-900'
              }`}
            >
              <PieChart size={18} className="flex-shrink-0" /> Dağılım
            </button>
            <button
              onClick={() => { onShowRebalancing(); setMobileMenuOpen(false); }}
              className={`flex items-center gap-2.5 px-3 min-h-[44px] rounded-lg text-sm font-medium transition-colors ${
                isDark
                  ? 'text-gray-300 hover:bg-gray-800 hover:text-white'
                  : 'text-gray-700 hover:bg-white hover:text-gray-900'
              }`}
            >
              <Scale size={18} className="flex-shrink-0" /> Rebalance
            </button>
            <button
              onClick={() => { onShowScenario(); setMobileMenuOpen(false); }}
              className={`flex items-center gap-2.5 px-3 min-h-[44px] rounded-lg text-sm font-medium transition-colors ${
                isDark
                  ? 'text-gray-300 hover:bg-gray-800 hover:text-white'
                  : 'text-gray-700 hover:bg-white hover:text-gray-900'
              }`}
            >
              <Zap size={18} className="flex-shrink-0" /> Senaryo
            </button>
            <button
              onClick={() => { onShowPerformance(); setMobileMenuOpen(false); }}
              className={`flex items-center gap-2.5 px-3 min-h-[44px] rounded-lg text-sm font-medium transition-colors ${
                isDark
                  ? 'text-gray-300 hover:bg-gray-800 hover:text-white'
                  : 'text-gray-700 hover:bg-white hover:text-gray-900'
              }`}
            >
              <TrendingUp size={18} className="flex-shrink-0" /> Performans
            </button>
            <button
              onClick={() => { navigate('/binance'); setMobileMenuOpen(false); }}
              className={`flex items-center gap-2.5 px-3 min-h-[44px] rounded-lg text-sm font-medium transition-colors ${
                isDark
                  ? 'text-gray-300 hover:bg-gray-800 hover:text-white'
                  : 'text-gray-700 hover:bg-white hover:text-gray-900'
              }`}
            >
              <Wallet size={18} className="flex-shrink-0" /> Binance
            </button>
            <button
              onClick={() => { navigate('/watchlist'); setMobileMenuOpen(false); }}
              className={`flex items-center gap-2.5 px-3 min-h-[44px] rounded-lg text-sm font-medium transition-colors ${
                isDark
                  ? 'text-gray-300 hover:bg-gray-800 hover:text-white'
                  : 'text-gray-700 hover:bg-white hover:text-gray-900'
              }`}
            >
              <Eye size={18} className="flex-shrink-0" /> İzleme
            </button>

            {/* Divider */}
            <div
              className={`col-span-2 sm:col-span-3 border-t my-1 ${
                isDark ? 'border-gray-800' : 'border-gray-200'
              }`}
            />

            {/* Utility items */}
            <button
              onClick={() => { onShowAlerts(); setMobileMenuOpen(false); }}
              className={`flex items-center gap-2.5 px-3 min-h-[44px] rounded-lg text-sm font-medium transition-colors ${
                isDark
                  ? 'text-gray-300 hover:bg-gray-800 hover:text-white'
                  : 'text-gray-700 hover:bg-white hover:text-gray-900'
              }`}
            >
              <Bell size={18} className="flex-shrink-0" /> Alarmlar
            </button>
            <button
              onClick={() => { onShowRebalanceModal(); setMobileMenuOpen(false); }}
              className={`flex items-center gap-2.5 px-3 min-h-[44px] rounded-lg text-sm font-medium transition-colors ${
                isDark
                  ? 'text-gray-300 hover:bg-gray-800 hover:text-white'
                  : 'text-gray-700 hover:bg-white hover:text-gray-900'
              }`}
            >
              <Target size={18} className="flex-shrink-0" /> Hızlı Rebalance
            </button>
            <button
              onClick={() => { onShowExport(); setMobileMenuOpen(false); }}
              className={`flex items-center gap-2.5 px-3 min-h-[44px] rounded-lg text-sm font-medium transition-colors ${
                isDark
                  ? 'text-gray-300 hover:bg-gray-800 hover:text-white'
                  : 'text-gray-700 hover:bg-white hover:text-gray-900'
              }`}
            >
              <Download size={18} className="flex-shrink-0" /> Dışa Aktar
            </button>
            <button
              onClick={() => { onToggleDark(); setMobileMenuOpen(false); }}
              className={`flex items-center gap-2.5 px-3 min-h-[44px] rounded-lg text-sm font-medium transition-colors ${
                isDark
                  ? 'text-gray-300 hover:bg-gray-800 hover:text-white'
                  : 'text-gray-700 hover:bg-white hover:text-gray-900'
              }`}
            >
              {isDark ? <Sun size={18} className="flex-shrink-0" /> : <Moon size={18} className="flex-shrink-0" />}
              {isDark ? 'Açık Mod' : 'Karanlık Mod'}
            </button>
            <button
              onClick={() => setLanguage(language === 'tr' ? 'en' : 'tr')}
              className={`flex items-center gap-2.5 px-3 min-h-[44px] rounded-lg text-sm font-bold transition-colors ${
                isDark
                  ? 'text-gray-300 hover:bg-gray-800 hover:text-white'
                  : 'text-gray-700 hover:bg-white hover:text-gray-900'
              }`}
            >
              {language === 'tr' ? '🌐 EN' : '🌐 TR'}
            </button>
            <button
              onClick={() => { clearCache(); setMobileMenuOpen(false); }}
              className={`flex items-center gap-2.5 px-3 min-h-[44px] rounded-lg text-sm font-medium transition-colors ${
                isDark
                  ? 'text-red-400 hover:bg-red-900/30'
                  : 'text-red-500 hover:bg-red-50'
              }`}
            >
              <Trash2 size={18} className="flex-shrink-0" /> Cache Temizle
            </button>
          </div>
        </div>
      )}
    </header>
  );
}
