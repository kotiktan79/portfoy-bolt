import { useState, useEffect, useRef } from 'react';
import {
  TrendingUp, Plus, RefreshCw, Moon, Sun, Bell,
  Activity, Download, Shield, Palette,
  PieChart, Database, Brain,
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
  onShowAllocation: () => void;
  onShowAIAdvisor: () => void;
  onShowPerformance: () => void;
  onShowResearch?: () => void;
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
  onShowAllocation,
  onShowAIAdvisor,
  onShowPerformance,
  onShowResearch,
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
        return 'Canlı';
      case 'connecting':
        return 'Bağlanıyor';
      case 'error':
        return 'Hata';
      default:
        return 'Cevrimdisi';
    }
  };

  const navItems = [
    { label: 'AI Danışman', onClick: onShowAIAdvisor, icon: Activity },
    { label: 'Araştırma', onClick: onShowResearch || (() => {}), icon: Brain },
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
        <>
          <div
            onClick={() => setMobileMenuOpen(false)}
            className="lg:hidden fixed inset-0 bg-black/50 z-40 animate-fade-in"
          />
          <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-900 rounded-t-3xl z-50 shadow-2xl animate-slide-up safe-area-inset-bottom max-h-[85vh] overflow-y-auto">
            <div className="pt-3 pb-1">
              <div className="mx-auto w-10 h-1 rounded-full bg-gray-300 dark:bg-gray-700" />
            </div>
            <div className="flex items-center justify-between px-5 py-3">
              <h3 className="text-base font-bold text-gray-900 dark:text-white">Hızlı Erişim</h3>
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
                aria-label="Kapat"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal-trigger actions */}
            <div className="px-4 pb-3">
              <p className="t-eyebrow mb-2 px-1">İşlemler</p>
              <div className="grid grid-cols-2 gap-2">
                <DrawerItem icon={Bell} label="Alarmlar" tone="amber" onClick={() => { onShowAlerts(); setMobileMenuOpen(false); }} />
                <DrawerItem icon={Target} label="Hızlı Rebalance" tone="brand" onClick={() => { onShowRebalanceModal(); setMobileMenuOpen(false); }} />
                <DrawerItem icon={Download} label="Yedekle / Aktar" tone="accent" onClick={() => { onShowExport(); setMobileMenuOpen(false); }} />
                <DrawerItem icon={Database} label="Backup / Restore" tone="brand" onClick={() => { onShowBackup(); setMobileMenuOpen(false); }} />
                <DrawerItem icon={Shield} label="2FA Güvenlik" tone="amber" onClick={() => { onShow2FA(); setMobileMenuOpen(false); }} />
                <DrawerItem icon={Palette} label="Tema Değiştir" tone="brand" onClick={() => { onThemeCycle(); setMobileMenuOpen(false); }} />
              </div>
            </div>

            {/* Settings strip */}
            <div className="px-4 pb-4 border-t border-slate-100 dark:border-gray-800 pt-3">
              <p className="t-eyebrow mb-2 px-1">Ayarlar</p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { onToggleDark(); }}
                  className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-slate-100 dark:bg-gray-800 text-slate-700 dark:text-gray-300 text-sm font-semibold active:bg-slate-200 dark:active:bg-gray-700"
                >
                  {isDark ? <Sun size={16} /> : <Moon size={16} />}
                  {isDark ? 'Açık Mod' : 'Karanlık'}
                </button>
                <button
                  onClick={() => setLanguage(language === 'tr' ? 'en' : 'tr')}
                  className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-slate-100 dark:bg-gray-800 text-slate-700 dark:text-gray-300 text-sm font-bold active:bg-slate-200 dark:active:bg-gray-700"
                >
                  🌐 {language === 'tr' ? 'EN' : 'TR'}
                </button>
                {!notificationsEnabled && (
                  <button
                    onClick={() => { onEnableNotifications(); setMobileMenuOpen(false); }}
                    className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 text-sm font-semibold active:bg-amber-200"
                  >
                    <Bell size={16} />
                    Bildirim
                  </button>
                )}
              </div>
              <button
                onClick={() => { clearCache(); setMobileMenuOpen(false); }}
                className="w-full mt-2 flex items-center justify-center gap-2 py-2.5 rounded-xl text-red-600 dark:text-red-400 text-xs font-semibold hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
              >
                <Trash2 size={14} />
                Cache Temizle
              </button>
            </div>
          </div>
        </>
      )}
    </header>
  );
}

interface DrawerItemProps {
  icon: typeof Bell;
  label: string;
  tone: 'brand' | 'accent' | 'amber';
  onClick: () => void;
}

function DrawerItem({ icon: Icon, label, tone, onClick }: DrawerItemProps) {
  const toneClass =
    tone === 'amber' ? 'bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400' :
    tone === 'accent' ? 'bg-accent-100 dark:bg-accent-950/40 text-accent-700 dark:text-accent-400' :
    'bg-brand-100 dark:bg-brand-950/40 text-brand-700 dark:text-brand-400';

  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-1.5 py-3 px-2 rounded-2xl bg-slate-50 dark:bg-gray-800/50 text-gray-700 dark:text-gray-300 active:bg-slate-100 dark:active:bg-gray-800 transition-colors"
    >
      <div className={`p-2 rounded-xl ${toneClass}`}>
        <Icon size={18} />
      </div>
      <span className="text-xs font-medium text-center leading-tight">{label}</span>
    </button>
  );
}
