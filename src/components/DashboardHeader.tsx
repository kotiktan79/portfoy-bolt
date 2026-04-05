import { useState } from 'react';
import {
  TrendingUp, Plus, RefreshCw, Moon, Sun, Bell, BarChart3,
  Wifi, WifiOff, Activity, Download, Tv, Shield, Palette,
  PieChart, Scale, Zap, Database, ChevronDown, Settings,
  Target, Menu, X, Trash2, Globe
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

  const connectionBadge = () => {
    if (connectionStatus === 'connected') {
      return (
        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-green-500/20 border border-green-500/40 rounded-full">
          <Activity className="text-green-400 animate-pulse" size={14} />
          <span className="text-green-300 text-xs font-semibold">Canlı</span>
        </div>
      );
    }
    if (connectionStatus === 'connecting') {
      return (
        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-yellow-500/20 border border-yellow-500/40 rounded-full">
          <Wifi className="text-yellow-400 animate-pulse" size={14} />
          <span className="text-yellow-300 text-xs font-semibold">Bağlanıyor</span>
        </div>
      );
    }
    if (connectionStatus === 'error') {
      return (
        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/20 border border-red-500/40 rounded-full">
          <WifiOff className="text-red-400" size={14} />
          <span className="text-red-300 text-xs font-semibold">Hata</span>
        </div>
      );
    }
    return (
      <div className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-500/20 border border-gray-500/40 rounded-full">
        <WifiOff className="text-gray-400" size={14} />
        <span className="text-gray-300 text-xs font-semibold">Çevrimdışı</span>
      </div>
    );
  };

  return (
    <div className="bg-gradient-to-r from-blue-700 via-blue-600 to-blue-700 shadow-2xl relative overflow-hidden">
      <div className="absolute inset-0 bg-grid-white/[0.04] bg-[size:20px_20px] pointer-events-none"></div>
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-blue-300/30 to-transparent"></div>

      <div className="relative px-4 md:px-6 py-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex-shrink-0 p-2.5 bg-white/20 rounded-xl backdrop-blur-sm shadow-lg border border-white/20">
              <TrendingUp className="text-white" size={24} />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl md:text-2xl font-bold text-white tracking-tight truncate">Portföy Takip</h1>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-blue-100 text-xs font-medium">Canlı fiyat güncellemeleri</span>
                <div className="hidden sm:block">{connectionBadge()}</div>
              </div>
            </div>
          </div>

          <div className="hidden lg:flex items-center gap-2 flex-wrap justify-end">
            <button
              onClick={onShowAIAdvisor}
              className="flex items-center gap-1.5 px-3 py-2 bg-gradient-to-r from-sky-500 to-cyan-500 hover:from-sky-600 hover:to-cyan-600 text-white rounded-lg transition-all font-semibold text-sm shadow-lg hover:shadow-xl hover:scale-105"
            >
              <Activity size={16} />
              AI Danışman
            </button>
            <button
              onClick={onShowAnalytics}
              className="flex items-center gap-1.5 px-3 py-2 bg-white/15 hover:bg-white/25 text-white rounded-lg transition-all text-sm border border-white/20 hover:scale-105"
            >
              <BarChart3 size={16} />
              Analitik
            </button>
            <button
              onClick={onShowAllocation}
              className="flex items-center gap-1.5 px-3 py-2 bg-white/15 hover:bg-white/25 text-white rounded-lg transition-all text-sm border border-white/20 hover:scale-105"
            >
              <PieChart size={16} />
              Dağılım
            </button>
            <button
              onClick={onShowRebalancing}
              className="flex items-center gap-1.5 px-3 py-2 bg-white/15 hover:bg-white/25 text-white rounded-lg transition-all text-sm border border-white/20 hover:scale-105"
            >
              <Scale size={16} />
              Rebalance
            </button>
            <button
              onClick={onShowScenario}
              className="flex items-center gap-1.5 px-3 py-2 bg-white/15 hover:bg-white/25 text-white rounded-lg transition-all text-sm border border-white/20 hover:scale-105"
            >
              <Zap size={16} />
              Senaryo
            </button>
            <a
              href="/dashboard.html"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-2 bg-white/15 hover:bg-white/25 text-white rounded-lg transition-all text-sm border border-white/20 hover:scale-105"
            >
              <Tv size={16} />
              Dashboard
            </a>

            <div className="h-6 w-px bg-white/20 mx-1"></div>

            <div className="relative">
              <button
                onClick={() => setMoreMenuOpen(!moreMenuOpen)}
                className="flex items-center gap-1.5 px-3 py-2 bg-white/15 hover:bg-white/25 text-white rounded-lg transition-all text-sm border border-white/20 hover:scale-105"
              >
                <Settings size={16} />
                <ChevronDown size={14} className={`transition-transform ${moreMenuOpen ? 'rotate-180' : ''}`} />
              </button>
              {moreMenuOpen && (
                <div className="absolute right-0 top-full mt-2 w-48 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl z-50 overflow-hidden">
                  <button onClick={() => { onShowAlerts(); setMoreMenuOpen(false); }} className="w-full flex items-center gap-3 px-4 py-3 text-gray-300 hover:bg-gray-800 hover:text-white transition-colors text-sm">
                    <Bell size={16} className="text-yellow-400" /> Fiyat Alarmları
                  </button>
                  <button onClick={() => { onShowExport(); setMoreMenuOpen(false); }} className="w-full flex items-center gap-3 px-4 py-3 text-gray-300 hover:bg-gray-800 hover:text-white transition-colors text-sm">
                    <Download size={16} className="text-blue-400" /> Dışa/İçe Aktar
                  </button>
                  <button onClick={() => { onShowBackup(); setMoreMenuOpen(false); }} className="w-full flex items-center gap-3 px-4 py-3 text-gray-300 hover:bg-gray-800 hover:text-white transition-colors text-sm">
                    <Database size={16} className="text-green-400" /> Yedekle/Geri Yükle
                  </button>
                  <button onClick={() => { onShow2FA(); setMoreMenuOpen(false); }} className="w-full flex items-center gap-3 px-4 py-3 text-gray-300 hover:bg-gray-800 hover:text-white transition-colors text-sm">
                    <Shield size={16} className="text-red-400" /> 2FA Güvenlik
                  </button>
                  <button onClick={() => { onThemeCycle(); setMoreMenuOpen(false); }} className="w-full flex items-center gap-3 px-4 py-3 text-gray-300 hover:bg-gray-800 hover:text-white transition-colors text-sm">
                    <Palette size={16} className="text-pink-400" /> Tema Değiştir
                  </button>
                  <div className="border-t border-gray-700">
                    {!notificationsEnabled && (
                      <button onClick={() => { onEnableNotifications(); setMoreMenuOpen(false); }} className="w-full flex items-center gap-3 px-4 py-3 text-amber-300 hover:bg-gray-800 transition-colors text-sm">
                        <Bell size={16} /> Bildirimleri Etkinleştir
                      </button>
                    )}
                    <button onClick={() => { clearCache(); setMoreMenuOpen(false); }} className="w-full flex items-center gap-3 px-4 py-3 text-red-400 hover:bg-gray-800 hover:text-red-300 transition-colors text-sm">
                      <Trash2 size={16} /> Cache Temizle & Yenile
                    </button>
                  </div>
                </div>
              )}
            </div>

            <button
              onClick={() => setLanguage(language === 'tr' ? 'en' : 'tr')}
              aria-label="Dil değiştir"
              className="p-2 bg-white/15 hover:bg-white/25 text-white rounded-lg transition-all border border-white/20 hover:scale-105 text-xs font-bold"
            >
              {language === 'tr' ? 'EN' : 'TR'}
            </button>
            <button
              onClick={onToggleDark}
              aria-label={isDark ? 'Aydınlık moda geç' : 'Karanlık moda geç'}
              className="p-2 bg-white/15 hover:bg-white/25 text-white rounded-lg transition-all border border-white/20 hover:scale-105"
            >
              {isDark ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <button
              onClick={onRefresh}
              disabled={refreshing}
              aria-label="Fiyatları yenile"
              className="p-2 bg-white/15 hover:bg-white/25 text-white rounded-lg transition-all border border-white/20 hover:scale-105 disabled:opacity-50 disabled:hover:scale-100"
            >
              <RefreshCw size={18} className={refreshing ? 'animate-spin' : ''} />
            </button>
            <button
              onClick={onAddHolding}
              className="flex items-center gap-1.5 px-4 py-2 bg-white text-blue-700 rounded-lg hover:bg-blue-50 transition-all font-bold text-sm shadow-lg hover:shadow-xl hover:scale-105"
            >
              <Plus size={18} />
              Varlık Ekle
            </button>
          </div>

          <div className="flex lg:hidden items-center gap-2">
            <div className="sm:hidden">{connectionBadge()}</div>
            <button
              onClick={onRefresh}
              disabled={refreshing}
              aria-label="Fiyatları yenile"
              className="p-2 bg-white/15 hover:bg-white/25 text-white rounded-lg transition-all border border-white/20"
            >
              <RefreshCw size={18} className={refreshing ? 'animate-spin' : ''} />
            </button>
            <button
              onClick={onAddHolding}
              className="flex items-center gap-1.5 px-3 py-2 bg-white text-blue-700 rounded-lg hover:bg-blue-50 transition-all font-bold text-sm shadow-lg"
            >
              <Plus size={16} />
              Ekle
            </button>
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 bg-white/15 hover:bg-white/25 text-white rounded-lg transition-all border border-white/20"
            >
              {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>

        {mobileMenuOpen && (
          <div className="lg:hidden mt-4 pt-4 border-t border-white/20 grid grid-cols-2 sm:grid-cols-3 gap-2">
            <button onClick={() => { onShowAIAdvisor(); setMobileMenuOpen(false); }} className="flex items-center gap-2 px-3 py-2.5 bg-white/15 hover:bg-white/25 text-white rounded-lg text-sm border border-white/20 transition-all">
              <Activity size={15} /> AI Danışman
            </button>
            <button onClick={() => { onShowAnalytics(); setMobileMenuOpen(false); }} className="flex items-center gap-2 px-3 py-2.5 bg-white/15 hover:bg-white/25 text-white rounded-lg text-sm border border-white/20 transition-all">
              <BarChart3 size={15} /> Analitik
            </button>
            <button onClick={() => { onShowAllocation(); setMobileMenuOpen(false); }} className="flex items-center gap-2 px-3 py-2.5 bg-white/15 hover:bg-white/25 text-white rounded-lg text-sm border border-white/20 transition-all">
              <PieChart size={15} /> Dağılım
            </button>
            <button onClick={() => { onShowRebalancing(); setMobileMenuOpen(false); }} className="flex items-center gap-2 px-3 py-2.5 bg-white/15 hover:bg-white/25 text-white rounded-lg text-sm border border-white/20 transition-all">
              <Scale size={15} /> Rebalance
            </button>
            <button onClick={() => { onShowScenario(); setMobileMenuOpen(false); }} className="flex items-center gap-2 px-3 py-2.5 bg-white/15 hover:bg-white/25 text-white rounded-lg text-sm border border-white/20 transition-all">
              <Zap size={15} /> Senaryo
            </button>
            <a href="/dashboard.html" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 px-3 py-2.5 bg-white/15 hover:bg-white/25 text-white rounded-lg text-sm border border-white/20 transition-all">
              <Tv size={15} /> Dashboard
            </a>
            <button onClick={() => { onShowAlerts(); setMobileMenuOpen(false); }} className="flex items-center gap-2 px-3 py-2.5 bg-white/15 hover:bg-white/25 text-white rounded-lg text-sm border border-white/20 transition-all">
              <Bell size={15} /> Alarmlar
            </button>
            <button onClick={() => { onShowExport(); setMobileMenuOpen(false); }} className="flex items-center gap-2 px-3 py-2.5 bg-white/15 hover:bg-white/25 text-white rounded-lg text-sm border border-white/20 transition-all">
              <Download size={15} /> Dışa Aktar
            </button>
            <button onClick={() => { onToggleDark(); setMobileMenuOpen(false); }} className="flex items-center gap-2 px-3 py-2.5 bg-white/15 hover:bg-white/25 text-white rounded-lg text-sm border border-white/20 transition-all">
              {isDark ? <Sun size={15} /> : <Moon size={15} />}
              {isDark ? 'Açık Mod' : 'Karanlık Mod'}
            </button>
            <button onClick={() => { onShowRebalanceModal(); setMobileMenuOpen(false); }} className="flex items-center gap-2 px-3 py-2.5 bg-white/15 hover:bg-white/25 text-white rounded-lg text-sm border border-white/20 transition-all">
              <Target size={15} /> Hızlı Rebalance
            </button>
            <button onClick={() => { clearCache(); setMobileMenuOpen(false); }} className="flex items-center gap-2 px-3 py-2.5 bg-red-500/20 hover:bg-red-500/30 text-red-300 rounded-lg text-sm border border-red-500/30 transition-all">
              <Trash2 size={15} /> Cache Temizle
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
