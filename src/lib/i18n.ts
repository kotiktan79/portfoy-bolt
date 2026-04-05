export type Language = 'tr' | 'en';

interface Translations {
  [key: string]: {
    tr: string;
    en: string;
  };
}

export const translations: Translations = {
  'app.title': {
    tr: 'Portföy Takip',
    en: 'Portfolio Tracker',
  },
  'app.subtitle': {
    tr: 'Canlı fiyat güncellemeleri',
    en: 'Live price updates',
  },
  'holdings.add': {
    tr: 'Varlık Ekle',
    en: 'Add Asset',
  },
  'holdings.edit': {
    tr: 'Düzenle',
    en: 'Edit',
  },
  'holdings.delete': {
    tr: 'Sil',
    en: 'Delete',
  },
  'holdings.symbol': {
    tr: 'Sembol',
    en: 'Symbol',
  },
  'holdings.asset': {
    tr: 'Varlık',
    en: 'Asset',
  },
  'holdings.quantity': {
    tr: 'Miktar',
    en: 'Quantity',
  },
  'holdings.purchasePrice': {
    tr: 'Alış Fiyatı',
    en: 'Purchase Price',
  },
  'holdings.currentPrice': {
    tr: 'Güncel Fiyat',
    en: 'Current Price',
  },
  'holdings.totalValue': {
    tr: 'Toplam Değer',
    en: 'Total Value',
  },
  'holdings.profitLoss': {
    tr: 'Kar/Zarar',
    en: 'Profit/Loss',
  },
  'holdings.actions': {
    tr: 'İşlemler',
    en: 'Actions',
  },
  'portfolio.totalInvestment': {
    tr: 'Toplam Yatırım',
    en: 'Total Investment',
  },
  'portfolio.currentValue': {
    tr: 'Güncel Değer',
    en: 'Current Value',
  },
  'portfolio.performance': {
    tr: 'Portföy Performansı',
    en: 'Portfolio Performance',
  },
  'portfolio.allocation': {
    tr: 'Varlık Dağılımı',
    en: 'Asset Allocation',
  },
  'status.connected': {
    tr: 'Canlı',
    en: 'Live',
  },
  'status.connecting': {
    tr: 'Bağlanıyor...',
    en: 'Connecting...',
  },
  'status.disconnected': {
    tr: 'Bağlantı Yok',
    en: 'Disconnected',
  },
  'status.error': {
    tr: 'Hata',
    en: 'Error',
  },
  'button.refresh': {
    tr: 'Yenile',
    en: 'Refresh',
  },
  'button.rebalance': {
    tr: 'Rebalance',
    en: 'Rebalance',
  },
  'button.save': {
    tr: 'Kaydet',
    en: 'Save',
  },
  'button.cancel': {
    tr: 'İptal',
    en: 'Cancel',
  },
  'button.close': {
    tr: 'Kapat',
    en: 'Close',
  },
  'button.download': {
    tr: 'İndir',
    en: 'Download',
  },
  'pnl.daily': {
    tr: 'Günlük',
    en: 'Daily',
  },
  'pnl.weekly': {
    tr: 'Haftalık',
    en: 'Weekly',
  },
  'pnl.monthly': {
    tr: 'Aylık',
    en: 'Monthly',
  },
  'chart.rsi': {
    tr: 'RSI Göstergesi',
    en: 'RSI Indicator',
  },
  'chart.macd': {
    tr: 'MACD Göstergesi',
    en: 'MACD Indicator',
  },
  'chart.bollinger': {
    tr: 'Bollinger Bantları',
    en: 'Bollinger Bands',
  },
  'risk.stopLoss': {
    tr: 'Stop-Loss',
    en: 'Stop-Loss',
  },
  'risk.takeProfit': {
    tr: 'Take-Profit',
    en: 'Take-Profit',
  },
  'risk.management': {
    tr: 'Risk Yönetimi',
    en: 'Risk Management',
  },
  'automation.title': {
    tr: 'Otomasyon Ayarları',
    en: 'Automation Settings',
  },
  'automation.autoRebalance': {
    tr: 'Otomatik Rebalance',
    en: 'Auto Rebalance',
  },
  'automation.dca': {
    tr: 'Dollar Cost Averaging',
    en: 'Dollar Cost Averaging',
  },
  'report.portfolio': {
    tr: 'Portföy Raporu',
    en: 'Portfolio Report',
  },
  'report.tax': {
    tr: 'Vergi Raporu',
    en: 'Tax Report',
  },
  'alert.priceAlert': {
    tr: 'Fiyat Alarmı',
    en: 'Price Alert',
  },
  'alert.notifications': {
    tr: 'Bildirimler',
    en: 'Notifications',
  },
  // Navigation
  'nav.home': { tr: 'Ana Sayfa', en: 'Home' },
  'nav.analytics': { tr: 'Gelişmiş Analitik', en: 'Advanced Analytics' },
  'nav.allocation': { tr: 'Varlık Dağılımı', en: 'Asset Allocation' },
  'nav.rebalancing': { tr: 'Portföy Rebalancing', en: 'Portfolio Rebalancing' },
  'nav.scenario': { tr: 'Senaryo Analizi', en: 'Scenario Analysis' },
  'nav.aiAdvisor': { tr: 'AI Danışman', en: 'AI Advisor' },
  'nav.back': { tr: '← Geri', en: '← Back' },
  'nav.backToHome': { tr: 'Ana Sayfaya Dön', en: 'Back to Home' },
  // Dashboard
  'dashboard.portfolio': { tr: 'Varlık Portföyü', en: 'Asset Portfolio' },
  'dashboard.assets': { tr: 'varlık', en: 'assets' },
  'dashboard.loading': { tr: 'Yükleniyor...', en: 'Loading...' },
  'dashboard.noAssets': { tr: 'Henüz varlık eklemediniz', en: 'No assets added yet' },
  'dashboard.noAssetsDesc': { tr: 'Portföyünüzü takip etmeye başlamak için ilk varlığınızı ekleyin', en: 'Add your first asset to start tracking your portfolio' },
  'dashboard.addFirst': { tr: 'İlk Varlığı Ekle', en: 'Add First Asset' },
  'dashboard.chartsTitle': { tr: 'Grafikler & Analizler', en: 'Charts & Analysis' },
  'dashboard.hide': { tr: 'Gizle', en: 'Hide' },
  'dashboard.show': { tr: 'Göster', en: 'Show' },
  'dashboard.periodicPnl': { tr: 'Periyodik PnL', en: 'Periodic PnL' },
  'dashboard.noHistory': { tr: 'Henüz geçmiş veri yok. Lütfen bekleyin...', en: 'No historical data yet. Please wait...' },
  // Status bar
  'status.wsActive': { tr: 'WebSocket Aktif', en: 'WebSocket Active' },
  'status.connectionError': { tr: 'Bağlantı Hatası', en: 'Connection Error' },
  'status.offline': { tr: 'Çevrimdışı', en: 'Offline' },
  'status.lastUpdate': { tr: 'Son', en: 'Last' },
  // Confirm dialog
  'confirm.deleteAsset': { tr: 'Varlığı Sil', en: 'Delete Asset' },
  'confirm.deleteAssetMsg': { tr: 'Bu varlığı silmek istediğinize emin misiniz? Bu işlem geri alınamaz.', en: 'Are you sure you want to delete this asset? This action cannot be undone.' },
  'confirm.delete': { tr: 'Sil', en: 'Delete' },
  // Toast messages
  'toast.assetAdded': { tr: 'başarıyla eklendi!', en: 'added successfully!' },
  'toast.assetUpdated': { tr: 'Varlık başarıyla güncellendi!', en: 'Asset updated successfully!' },
  'toast.assetDeleted': { tr: 'Varlık başarıyla silindi!', en: 'Asset deleted successfully!' },
  'toast.addError': { tr: 'Varlık eklenirken hata oluştu!', en: 'Error adding asset!' },
  'toast.updateError': { tr: 'Varlık güncellenirken hata oluştu!', en: 'Error updating asset!' },
  'toast.deleteError': { tr: 'Varlık silinirken hata oluştu!', en: 'Error deleting asset!' },
  'toast.notificationsEnabled': { tr: 'Bildirimler etkinleştirildi!', en: 'Notifications enabled!' },
  'toast.notificationsDenied': { tr: 'Bildirim izni reddedildi.', en: 'Notification permission denied.' },
  // Mobile nav
  'mobileNav.home': { tr: 'Ana Sayfa', en: 'Home' },
  'mobileNav.analytics': { tr: 'Analitik', en: 'Analytics' },
  'mobileNav.allocation': { tr: 'Dağılım', en: 'Allocation' },
  'mobileNav.rebalance': { tr: 'Rebalance', en: 'Rebalance' },
  'mobileNav.scenario': { tr: 'Senaryo', en: 'Scenario' },
};

let currentLanguage: Language = 'tr';

export function setLanguage(lang: Language) {
  currentLanguage = lang;
  localStorage.setItem('app_language', lang);
}

export function getLanguage(): Language {
  const stored = localStorage.getItem('app_language');
  return (stored === 'en' || stored === 'tr') ? stored : 'tr';
}

export function t(key: string): string {
  const translation = translations[key];
  if (!translation) return key;
  return translation[currentLanguage] || translation.tr || key;
}

export function initLanguage() {
  currentLanguage = getLanguage();
}
