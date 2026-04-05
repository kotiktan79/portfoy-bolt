import { useState, useEffect, useRef } from 'react';
import {
  TrendingUp, Plus, RefreshCw, Moon, Sun, Bell, BarChart3,
  Wifi, WifiOff, Activity, Download, Tv, Shield, Palette,
  PieChart, Scale, Zap, Database, ChevronDown, Settings,
  Target, Menu, X, Trash2, MoreHorizontal
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
  onShowRebalanceModal,
  onEnableNotifications,
  onThemeCycle,
}: DashboardHeaderProps) {
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
    { label: 'Analitik', onClick: onShowAnalytics, icon: BarChart3 },
    { label: 'Dağılım', onClick: onShowAllocation, icon: PieChart },
    { label: 'Rebalance', onClick: onShowRebalancing, icon: Scale },
    { label: 'Senaryo', onClick: onShowScenario, icon: Zap },
  ];

  return (
    <header
      className={`relative border-b transition-colors ${
        isDark
          ? 'bg-gray-900 border-gray-800'
          : 'bg-white border-gray-200'
      }`}
    >
      <div className="px-4 md:px-6 h-16 flex items-center justify-between gap-4">
        {/* Left: Logo + status dot */}
        <div className="flex items-center gap-2.5 min-w-0">
          <img src="/logo.svg" alt="Tandor Finans" className="w-9 h-9 rounded-lg flex-shrink-0" />
          <h1
            className={`text-lg font-bold tracking-tight truncate ${
              isDark ? 'text-gray-100' : 'text-gray-900'
            }`}
          >
            <span className="text-amber-500">Tandor</span> Finans
          </h1>
          {/* Connection status dot */}
          <div className="flex items-center gap-1.5" title={statusLabel()}>
            <span className={`inline-block w-2 h-2 rounded-full ${statusDotColor()}`} />
          </div>
        </div>

        {/* Center: Desktop navigation */}
        <nav className="hidden lg:flex items-center gap-1">
          {navItems.map((item) => (
            <button
              key={item.label}
              onClick={item.onClick}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                isDark
                  ? 'text-gray-400 hover:text-gray-100 hover:bg-gray-800'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>

        {/* Right: Actions (desktop) */}
        <div className="hidden lg:flex items-center gap-1.5">
          {/* Language toggle */}
          <button
            onClick={() => setLanguage(language === 'tr' ? 'en' : 'tr')}
            aria-label="Dil değiştir"
            className={`px-2.5 py-1.5 rounded-md text-xs font-bold transition-colors ${
              isDark
                ? 'text-gray-400 hover:text-gray-100 hover:bg-gray-800'
                : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
            }`}
          >
            {language === 'tr' ? 'EN' : 'TR'}
          </button>

          {/* Theme toggle */}
          <button
            onClick={onToggleDark}
            aria-label={isDark ? 'Aydınlık moda geç' : 'Karanlık moda geç'}
            className={`p-2 rounded-md transition-colors ${
              isDark
                ? 'text-gray-400 hover:text-gray-100 hover:bg-gray-800'
                : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
            }`}
          >
            {isDark ? <Sun size={18} /> : <Moon size={18} />}
          </button>

          {/* Refresh */}
          <button
            onClick={onRefresh}
            disabled={refreshing}
            aria-label="Fiyatları yenile"
            className={`p-2 rounded-md transition-colors disabled:opacity-40 ${
              isDark
                ? 'text-gray-400 hover:text-gray-100 hover:bg-gray-800'
                : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
            }`}
          >
            <RefreshCw size={18} className={refreshing ? 'animate-spin' : ''} />
          </button>

          {/* More menu */}
          <div className="relative" ref={moreMenuRef}>
            <button
              onClick={() => setMoreMenuOpen(!moreMenuOpen)}
              aria-label="Daha fazla"
              className={`p-2 rounded-md transition-colors ${
                isDark
                  ? 'text-gray-400 hover:text-gray-100 hover:bg-gray-800'
                  : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
              }`}
            >
              <MoreHorizontal size={18} />
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
                    <Download size={16} className="text-blue-500" />
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
                    <Palette size={16} className="text-pink-500" />
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

          {/* Divider */}
          <div
            className={`h-6 w-px mx-1 ${
              isDark ? 'bg-gray-700' : 'bg-gray-200'
            }`}
          />

          {/* Primary action: Add asset */}
          <button
            onClick={onAddHolding}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-semibold text-sm"
          >
            <Plus size={16} />
            Varlık Ekle
          </button>
        </div>

        {/* Right: Mobile controls */}
        <div className="flex lg:hidden items-center gap-2">
          <button
            onClick={onRefresh}
            disabled={refreshing}
            aria-label="Fiyatları yenile"
            className={`p-2 rounded-md transition-colors disabled:opacity-40 ${
              isDark
                ? 'text-gray-400 hover:text-gray-100 hover:bg-gray-800'
                : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
            }`}
          >
            <RefreshCw size={18} className={refreshing ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={onAddHolding}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-semibold text-sm"
          >
            <Plus size={16} />
            Ekle
          </button>
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Menüyü aç"
            className={`p-2 rounded-md transition-colors ${
              isDark
                ? 'text-gray-400 hover:text-gray-100 hover:bg-gray-800'
                : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
            }`}
          >
            {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
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
              onClick={() => { onShowRebalanceModal(); setMobileMenuOpen(false); }}
              className={`flex items-center gap-2.5 px-3 min-h-[44px] rounded-lg text-sm font-medium transition-colors ${
                isDark
                  ? 'text-gray-300 hover:bg-gray-800 hover:text-white'
                  : 'text-gray-700 hover:bg-white hover:text-gray-900'
              }`}
            >
              <Target size={18} className="flex-shrink-0" /> Hızlı Rebalance
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
