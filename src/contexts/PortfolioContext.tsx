import { createContext, useContext, useEffect, useState, useRef, useMemo, useCallback, ReactNode } from 'react';
import { supabase, Holding, AssetType } from '../lib/supabase';
import { holdingValueTRY, holdingCostTRY, FxRates } from '../lib/fx';
import {
  fetchMultiplePrices,
  isFallbackPrice,
  seedFallbackPrices,
  formatCurrency,
  initializeWebSocketConnection,
  closeWebSocketConnection,
  resetAndReconnectWebSocket,
  subscribeToConnectionStatus,
  subscribeToPriceUpdates,
  fetchUSDTRYRate,
  fetchEURTRYRate,
  ConnectionStatus,
  PriceUpdate
} from '../services/priceService';
import {
  getPnLData,
  getDefaultTargetAllocations,
  getHistoricalSnapshots,
  PnLData,
  PortfolioSnapshot,
} from '../services/analyticsService';
import { checkAndUnlockAchievements } from '../services/achievementService';
import { getAllTransactions, getTotalDividends } from '../services/transactionService';
import { getTotalCashValue } from '../services/cashService';
import { requestNotificationPermission, notifyAchievementUnlocked, getNotificationPermissionStatus } from '../services/notificationService';
import { subscribeToPush } from '../services/pushService';
import { registerServiceWorker, setupInstallPrompt, setupConnectionListener } from '../services/pwaService';
import { startExchangeRateUpdates, stopExchangeRateUpdates } from '../services/currencyService';
import { startHealthMonitoring, stopHealthMonitoring } from '../services/priceMonitor';
import { startPriceAlertMonitor, stopPriceAlertMonitor } from '../services/priceAlertMonitor';
import { stopCacheCleanup } from '../services/cacheService';
import { loadDailyOpenPrices, saveDailyOpenPrices } from '../services/dailyOpenPriceService';
import { computePortfolioMetrics, computeIntradayChange } from '../lib/portfolioMetrics';
import { useToast } from '../hooks/useToast';
import { DEFAULT_USD_TRY_RATE, TIMING } from '../config';

interface PortfolioContextType {
  // Holdings
  holdings: Holding[];
  setHoldings: React.Dispatch<React.SetStateAction<Holding[]>>;
  loading: boolean;
  refreshing: boolean;

  // PnL
  pnlData: { daily: PnLData; weekly: PnLData; monthly: PnLData } | null;
  livePnlData: { daily: PnLData; weekly: PnLData; monthly: PnLData } | null;
  historicalData: PortfolioSnapshot[];

  // Connection
  connectionStatus: ConnectionStatus;
  lastUpdate: string;

  // Cash
  totalCashValue: number;

  // Notifications
  notificationsEnabled: boolean;
  enableNotifications: () => Promise<void>;

  // Actions
  handleAddHolding: (newHolding: { symbol: string; asset_type: AssetType; purchase_price: number; quantity: number; current_price: number; currency?: string; source?: string; price_notes?: string }) => Promise<void>;
  handleUpdateHolding: (id: string, updates: { symbol: string; asset_type: AssetType; purchase_price: number; quantity: number }) => Promise<void>;
  handleDeleteHolding: (id: string) => void;
  pendingDeleteId: string | null;
  confirmDelete: () => Promise<void>;
  cancelDelete: () => void;
  handleRefresh: () => Promise<void>;

  // Metrics
  portfolioMetrics: {
    totalInvestment: number;
    totalCurrentValue: number;
    totalRealized: number;
    unrealizedPnl: number;
    totalProfitLoss: number;
    totalProfitLossPercent: number;
    grandTotal: number;
    usdRate: number;
    totalInvestmentUSD: number;
    totalCurrentValueUSD: number;
    grandTotalUSD: number;
  };

  // Filter/Sort
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  selectedAssetType: AssetType | 'all';
  setSelectedAssetType: (t: AssetType | 'all') => void;
  sortBy: 'name' | 'value' | 'pnl' | 'pnl_percent';
  setSortBy: (s: 'name' | 'value' | 'pnl' | 'pnl_percent') => void;
  sortOrder: 'asc' | 'desc';
  setSortOrder: (o: 'asc' | 'desc') => void;
  filteredAndSortedHoldings: Holding[];

  // Rebalance
  targetAllocations: ReturnType<typeof getDefaultTargetAllocations>;
  setTargetAllocations: React.Dispatch<React.SetStateAction<ReturnType<typeof getDefaultTargetAllocations>>>;

  // Toast
  toast: ReturnType<typeof useToast>;
}

const PortfolioContext = createContext<PortfolioContextType | null>(null);

export function usePortfolio() {
  const ctx = useContext(PortfolioContext);
  if (!ctx) throw new Error('usePortfolio must be used within PortfolioProvider');
  return ctx;
}

export function PortfolioProvider({ children }: { children: ReactNode }) {
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isPageVisible, setIsPageVisible] = useState(true);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const toast = useToast();

  const [pnlData, setPnlData] = useState<{ daily: PnLData; weekly: PnLData; monthly: PnLData } | null>(null);
  const [livePnlData, setLivePnlData] = useState<{ daily: PnLData; weekly: PnLData; monthly: PnLData } | null>(null);
  const [historicalData, setHistoricalData] = useState<PortfolioSnapshot[]>([]);
  const [targetAllocations, setTargetAllocations] = useState(getDefaultTargetAllocations());
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const [lastUpdate, setLastUpdate] = useState<string>('');
  const [totalCashValue, setTotalCashValue] = useState(0);
  const [liveUsdRate, setLiveUsdRate] = useState<number>(DEFAULT_USD_TRY_RATE);
  const [liveEurRate, setLiveEurRate] = useState<number>(DEFAULT_USD_TRY_RATE * 1.08);

  // Filter/Sort
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedAssetType, setSelectedAssetType] = useState<AssetType | 'all'>('all');
  const [sortBy, setSortBy] = useState<'name' | 'value' | 'pnl' | 'pnl_percent'>('value');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const lastWsUpdateTimeRef = useRef<Record<string, number>>({});
  const WS_THROTTLE_MS = TIMING.WS_THROTTLE_MS;
  const sessionOpenValueRef = useRef<number | null>(null);
  const dailyOpenPricesRef = useRef<Record<string, number>>({});
  const holdingsRef = useRef<Holding[]>([]);
  const isUpdatingRef = useRef(false);

  // Keep ref in sync
  useEffect(() => { holdingsRef.current = holdings; }, [holdings]);

  // Live FX rates (TRY-base) — refreshed every 5 min, used in portfolioMetrics normalization
  useEffect(() => {
    let cancelled = false;
    const loadRates = async () => {
      try {
        const [usd, eur] = await Promise.all([fetchUSDTRYRate(), fetchEURTRYRate()]);
        if (!cancelled) {
          if (usd > 1) setLiveUsdRate(usd);
          if (eur > 1) setLiveEurRate(eur);
        }
      } catch {
        // keep previous rates on failure
      }
    };
    loadRates();
    const id = setInterval(loadRates, 5 * 60 * 1000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  async function loadCashValue() {
    const val = await getTotalCashValue();
    setTotalCashValue(val);
  }

  // ── Initialization ─────────────────────────────────────────────
  useEffect(() => {
    loadHoldings();
    loadPnLData();
    loadHistoricalData();
    checkNotificationPermission();
    loadCashValue();

    registerServiceWorker();
    setupInstallPrompt();
    setupConnectionListener(() => {});
    startExchangeRateUpdates();
    startHealthMonitoring();
    startPriceAlertMonitor(() => holdingsRef.current);

    const unsubscribeStatus = subscribeToConnectionStatus((status) => {
      setConnectionStatus(status);
    });

    const unsubscribePrices = subscribeToPriceUpdates((update: PriceUpdate) => {
      const now = Date.now();
      const last = lastWsUpdateTimeRef.current[update.symbol] || 0;
      if (now - last < WS_THROTTLE_MS) return;
      lastWsUpdateTimeRef.current[update.symbol] = now;

      setLastUpdate(`${update.symbol}: ${formatCurrency(update.price)} ₺ (${update.source})`);

      setHoldings(prev =>
        prev.map(h =>
          h.symbol === update.symbol
            ? { ...h, current_price: update.price, updated_at: new Date().toISOString() }
            : h
        )
      );
    });

    return () => {
      unsubscribeStatus();
      unsubscribePrices();
      closeWebSocketConnection();
      stopHealthMonitoring();
      stopPriceAlertMonitor();
      stopExchangeRateUpdates();
      stopCacheCleanup();
    };
  }, []);

  // ── Visibility ─────────────────────────────────────────────────
  useEffect(() => {
    const handleVisibilityChange = () => {
      const visible = !document.hidden;
      setIsPageVisible(visible);
      if (visible) {
        resetAndReconnectWebSocket();
        updatePrices();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  // ── Price refresh interval ─────────────────────────────────────
  useEffect(() => {
    if (!isPageVisible) return;
    const interval = setInterval(() => { updatePrices(); }, TIMING.PRICE_REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [isPageVisible]);

  // ── PnL calculations ──────────────────────────────────────────
  useEffect(() => {
    if (holdings.length > 0) {
      calculateAndUpdatePnL();
      calculateLivePnL();
      checkAchievements(portfolioMetrics.totalCurrentValue, portfolioMetrics.totalProfitLoss);
    }
  }, [holdings, liveUsdRate, liveEurRate]);

  useEffect(() => {
    if (holdings.length > 0 && pnlData) {
      calculateLivePnL();
    }
  }, [pnlData]);

  // ── Data loading ───────────────────────────────────────────────
  async function loadHoldings() {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('holdings')
        .select('*')
        .order('created_at', { ascending: false });

      if (data) {
        setHoldings(data);

        // DB'deki son gerçek fiyatlar fallback havuzunu besler — API kesintisinde
        // ekran bayat-ama-gerçek fiyat gösterir, uydurma sabit değil.
        const seed: Record<string, number> = {};
        data.forEach(h => { if (h.current_price > 0) seed[h.symbol] = h.current_price; });
        seedFallbackPrices(seed);

        const holdingIds = data.map(h => h.id);
        const dailyPrices = await loadDailyOpenPrices(holdingIds);
        if (dailyPrices) {
          dailyOpenPricesRef.current = dailyPrices;
        }

        const cryptoSymbols = data
          .filter(h => h.asset_type === 'crypto')
          .map(h => h.symbol);

        if (cryptoSymbols.length > 0) {
          initializeWebSocketConnection(cryptoSymbols);
        }

        await updatePricesForHoldings(data);

        const currentPrices: Record<string, number> = {};
        data.forEach(h => {
          if (h.current_price > 0) {
            currentPrices[h.id] = h.current_price;
          }
        });

        const stored = dailyOpenPricesRef.current;
        let needsSave = false;
        for (const h of data) {
          if (!stored[h.id] && h.current_price > 0) {
            stored[h.id] = h.current_price;
            needsSave = true;
          }
        }
        if (needsSave) {
          dailyOpenPricesRef.current = stored;
          await saveDailyOpenPrices(data, stored);
        }
      }
    } catch (error) {
      console.error('Error loading holdings:', error);
    }
    setLoading(false);
  }

  async function updatePrices() {
    const current = holdingsRef.current;
    if (current.length === 0) return;
    await updatePricesForHoldings(current);
  }

  async function updatePricesForHoldings(holdingsToUpdate: Holding[]) {
    if (isUpdatingRef.current) return;
    isUpdatingRef.current = true;
    try {
      const holdingsToAutoUpdate = holdingsToUpdate.filter(
        h => !h.manual_price && h.asset_type !== 'fund' && h.asset_type !== 'eurobond'
      );

      if (holdingsToAutoUpdate.length === 0) return;

      const symbols = holdingsToAutoUpdate.map(h => ({
        symbol: h.symbol,
        assetType: h.asset_type,
      }));

      const prices = await fetchMultiplePrices(symbols);

      const updates = holdingsToUpdate.map(async (holding): Promise<Holding> => {
        if (holding.manual_price || holding.asset_type === 'fund' || holding.asset_type === 'eurobond') {
          return holding;
        }
        // KONTRAT: priceService artık holding.currency cinsinden ham fiyat döndürür
        // (US stock → USD, EU stock → EUR, BIST → TRY, crypto → TRY). Doğrudan yazılır.
        // Fallback fiyat DB'ye YAZILMAZ — eski gerçek fiyat, uydurma sabitten iyidir.
        const newPrice = prices[holding.symbol];
        if (newPrice && !isFallbackPrice(holding.symbol, newPrice) && Math.abs(newPrice - holding.current_price) > 0.01) {
          const { error } = await supabase
            .from('holdings')
            .update({
              current_price: newPrice,
              updated_at: new Date().toISOString()
            })
            .eq('id', holding.id);

          if (error) {
            console.error(`DB update failed for ${holding.symbol}:`, error.message);
            return holding; // keep original price if DB update fails
          }
          return { ...holding, current_price: newPrice };
        }
        return holding;
      });

      const results = await Promise.allSettled(updates);
      setHoldings(prev => prev.map(h => {
        const idx = holdingsToUpdate.findIndex(hu => hu.id === h.id);
        if (idx === -1) return h;
        const result = results[idx];
        if (result.status === 'fulfilled') return result.value;
        return h; // keep original on failure
      }));

      // Build the latest holdings snapshot for PnL calculation
      const updatedForPnl = holdingsToUpdate.map((h, idx) => {
        const result = results[idx];
        if (result.status === 'fulfilled') return result.value;
        return h;
      });
      await calculateAndUpdatePnL(updatedForPnl);
    } catch (error) {
      console.error('Error updating prices:', error);
    } finally {
      isUpdatingRef.current = false;
    }
  }

  async function calculateAndUpdatePnL(currentHoldings = holdings) {
    try {
      if (currentHoldings.length === 0) return;
      // Snapshots are written only by the daily cron (api/cron/daily-snapshot.ts);
      // the client no longer persists them. PnL is read straight from the stored
      // snapshots, so we just refresh from the DB here — no recompute needed.
      const data = await getPnLData();
      setPnlData(data);
    } catch (error) {
      console.error('Error calculating PnL:', error instanceof Error ? error.message : '');
    }
  }

  function calculateLivePnL() {
    const investmentOnly = holdings.filter(h => h.asset_type !== 'cash');
    if (investmentOnly.length === 0) { setLivePnlData(null); return; }

    // Intraday hesabı unified module'den (per-holding sanity check dahil)
    let intraday = computeIntradayChange(holdings, dailyOpenPricesRef.current);
    const currentTotalValue = intraday.currentValueTRY;
    const holdingsWithOpenPrice = Object.keys(dailyOpenPricesRef.current).length;

    // Hiç per-holding open yoksa, portfolio-level session baseline'a düş
    if (holdingsWithOpenPrice === 0) {
      const now = new Date();
      const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      if (sessionOpenValueRef.current === null && currentTotalValue > 0) {
        const stored = sessionStorage.getItem('portfolio_open_value_v2');
        const storedDate = sessionStorage.getItem('portfolio_open_date_v2');
        if (stored && storedDate === today) {
          sessionOpenValueRef.current = parseFloat(stored);
        } else {
          sessionOpenValueRef.current = currentTotalValue;
          sessionStorage.setItem('portfolio_open_value_v2', String(currentTotalValue));
          sessionStorage.setItem('portfolio_open_date_v2', today);
        }
      }
      const fallbackOpen = sessionOpenValueRef.current || currentTotalValue;
      const fallbackChange = currentTotalValue - fallbackOpen;
      const fallbackPct = fallbackOpen > 0 ? (fallbackChange / fallbackOpen) * 100 : 0;
      const safe = Math.abs(fallbackPct) > 30;
      intraday = {
        changeTRY: safe ? 0 : fallbackChange,
        changePct: safe ? 0 : fallbackPct,
        prevValueTRY: fallbackOpen,
        currentValueTRY: currentTotalValue,
        cashFlowTRY: 0,
      };
    }
    const safeIntradayChange = intraday.changeTRY;
    const safeIntradayPct = intraday.changePct;

    // PnL paneli ile tutarlı olsun diye: günlük = snapshot tabanlı (dün → bugün, 24h)
    // İntraday yerine, ana sayfa ve PnL paneli aynı "günlük" tanımı kullanır.
    let dailyChange = safeIntradayChange;
    let dailyPct = safeIntradayPct;
    let weeklyChange = safeIntradayChange;
    let weeklyPct = safeIntradayPct;
    let monthlyChange = safeIntradayChange;
    let monthlyPct = safeIntradayPct;

    if (pnlData) {
      if (Math.abs(pnlData.daily.percentage) < 30) {
        dailyChange = pnlData.daily.change;
        dailyPct = pnlData.daily.percentage;
      }
      if (Math.abs(pnlData.weekly.percentage) < 50) {
        weeklyChange = pnlData.weekly.change;
        weeklyPct = pnlData.weekly.percentage;
      }
      if (Math.abs(pnlData.monthly.percentage) < 80) {
        monthlyChange = pnlData.monthly.change;
        monthlyPct = pnlData.monthly.percentage;
      }
    }

    setLivePnlData({
      daily: { period: 'Günlük', value: currentTotalValue, change: dailyChange, percentage: dailyPct },
      weekly: { period: 'Haftalık', value: currentTotalValue, change: weeklyChange, percentage: weeklyPct },
      monthly: { period: 'Aylık', value: currentTotalValue, change: monthlyChange, percentage: monthlyPct },
    });
  }

  async function loadPnLData() {
    try {
      const data = await getPnLData();
      setPnlData(data);
      setLivePnlData(data);
    } catch (error) {
      console.error('Error loading PnL data:', error instanceof Error ? error.message : '');
    }
  }

  async function loadHistoricalData() {
    const data = await getHistoricalSnapshots(30);
    setHistoricalData(data);
  }

  async function checkNotificationPermission() {
    const status = getNotificationPermissionStatus();
    setNotificationsEnabled(status === 'granted');
  }

  async function enableNotifications() {
    const granted = await requestNotificationPermission();
    setNotificationsEnabled(granted);
    if (granted) {
      // Web Push aboneliği: uygulama kapalıyken de cron uyarıları düşsün
      const pushed = await subscribeToPush();
      toast.success(
        pushed
          ? 'Bildirimler + push aktif! Uygulama kapalıyken de uyarı alacaksınız.'
          : 'Bildirimler etkinleştirildi! (Push aboneliği kurulamadı — sadece uygulama açıkken uyarı gelir.)'
      );
    } else {
      toast.error('Bildirim izni reddedildi.');
    }
  }

  async function checkAchievements(totalValue: number, totalPnL: number) {
    try {
      const assetTypes = [...new Set(holdings.map((h) => h.asset_type))];
      const transactions = await getAllTransactions();
      const totalDividends = await getTotalDividends();

      const unlocked = await checkAndUnlockAchievements({
        totalHoldings: holdings.length,
        totalValue,
        totalPnL,
        assetTypes,
        positiveDays: 0,
        totalDividends,
        totalTransactions: transactions.length,
      });

      if (unlocked && unlocked.length > 0 && notificationsEnabled) {
        unlocked.forEach((achievement: { title: string; description: string }) => {
          notifyAchievementUnlocked(achievement.title, achievement.description);
        });
      }
    } catch (error) {
      console.error('Error checking achievements:', error);
    }
  }

  // ── CRUD Handlers ──────────────────────────────────────────────
  const handleAddHolding = useCallback(async (newHolding: {
    symbol: string;
    asset_type: AssetType;
    purchase_price: number;
    quantity: number;
    current_price: number;
    currency?: string;
    source?: string;
    price_notes?: string;
  }) => {
    const { data, error } = await supabase
      .from('holdings')
      .insert([{ currency: 'TRY', ...newHolding }])
      .select()
      .maybeSingle();

    if (error) {
      toast.error('Varlık eklenirken hata oluştu!');
    } else if (data) {
      setHoldings(prev => [...prev, data]);
      toast.success(`${newHolding.symbol} başarıyla eklendi!`);
    }
  }, [toast]);

  const handleUpdateHolding = useCallback(async (
    id: string,
    updates: { symbol: string; asset_type: AssetType; purchase_price: number; quantity: number }
  ) => {
    const { error } = await supabase
      .from('holdings')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) {
      toast.error('Varlık güncellenirken hata oluştu!');
    } else {
      setHoldings(prev => prev.map((h) => h.id === id ? { ...h, ...updates } : h));
      toast.success('Varlık başarıyla güncellendi!');
    }
  }, [toast]);

  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const handleDeleteHolding = useCallback((id: string) => {
    setPendingDeleteId(id);
  }, []);

  const confirmDelete = useCallback(async () => {
    if (!pendingDeleteId) return;
    const { error } = await supabase.from('holdings').delete().eq('id', pendingDeleteId);

    if (error) {
      toast.error('Varlık silinirken hata oluştu!');
    } else {
      setHoldings(prev => prev.filter((h) => h.id !== pendingDeleteId));
      toast.success('Varlık başarıyla silindi!');
    }
    setPendingDeleteId(null);
  }, [pendingDeleteId, toast]);

  const cancelDelete = useCallback(() => {
    setPendingDeleteId(null);
  }, []);

  const reloadHoldings = useCallback(async () => {
    const { data } = await supabase
      .from('holdings')
      .select('*')
      .order('created_at', { ascending: false });
    if (data) setHoldings(data);
  }, []);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await reloadHoldings();
    await Promise.all([updatePrices(), loadPnLData(), loadHistoricalData(), loadCashValue()]);
    setTimeout(() => setRefreshing(false), 500);
  }, [reloadHoldings]);

  // ── Memoized values (unified portfolioMetrics module üzerinden) ────
  const portfolioMetrics = useMemo(() => {
    const m = computePortfolioMetrics(holdings);
    // Live FX override: API'den taze kur geldiyse onu kullan (holdings'teki son kur eski olabilir)
    const usdRate = liveUsdRate > 1 ? liveUsdRate : (m.fxRates.usd > 1 ? m.fxRates.usd : DEFAULT_USD_TRY_RATE);
    const totalRealized = holdings.reduce((sum, h) => {
      const v = (h.total_realized_pnl || 0);
      const c = (h.currency || 'TRY').toUpperCase();
      if (c === 'TRY') return sum + v;
      if (c === 'USD') return sum + v * usdRate;
      if (c === 'EUR') return sum + v * (liveEurRate > 1 ? liveEurRate : m.fxRates.eur);
      return sum + v;
    }, 0);
    const totalProfitLoss = m.totalPnLTRY + totalRealized;
    const totalProfitLossPercent = m.totalCostTRY > 0 ? (totalProfitLoss / m.totalCostTRY) * 100 : 0;
    const grandTotal = m.totalValueTRY + totalCashValue;
    return {
      totalInvestment: m.totalCostTRY,
      totalCurrentValue: m.totalValueTRY,
      totalRealized,
      unrealizedPnl: m.totalPnLTRY,
      totalProfitLoss,
      totalProfitLossPercent,
      grandTotal,
      usdRate,
      totalInvestmentUSD: m.totalCostTRY / usdRate,
      totalCurrentValueUSD: m.totalValueTRY / usdRate,
      grandTotalUSD: grandTotal / usdRate,
    };
  }, [holdings, totalCashValue, liveUsdRate, liveEurRate]);

  const filteredAndSortedHoldings = useMemo(() => {
    const fxRates: FxRates = {
      usd: liveUsdRate > 1 ? liveUsdRate : DEFAULT_USD_TRY_RATE,
      eur: liveEurRate > 1 ? liveEurRate : (liveUsdRate > 1 ? liveUsdRate : DEFAULT_USD_TRY_RATE) * 1.08,
      gbp: (liveUsdRate > 1 ? liveUsdRate : DEFAULT_USD_TRY_RATE) * 1.27,
    };
    return holdings
      .filter((holding) => {
        const matchesSearch = searchQuery === '' || holding.symbol.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesType = selectedAssetType === 'all' || holding.asset_type === selectedAssetType;
        return matchesSearch && matchesType;
      })
      .sort((a, b) => {
        const aValue = holdingValueTRY(a, fxRates);
        const bValue = holdingValueTRY(b, fxRates);
        const aInvestment = holdingCostTRY(a, fxRates);
        const bInvestment = holdingCostTRY(b, fxRates);
        const aPnl = aValue - aInvestment;
        const bPnl = bValue - bInvestment;
        const aPnlPercent = aInvestment > 0 ? (aPnl / aInvestment) * 100 : 0;
        const bPnlPercent = bInvestment > 0 ? (bPnl / bInvestment) * 100 : 0;

        let comparison = 0;
        if (sortBy === 'name') comparison = a.symbol.localeCompare(b.symbol);
        else if (sortBy === 'value') comparison = aValue - bValue;
        else if (sortBy === 'pnl') comparison = aPnl - bPnl;
        else if (sortBy === 'pnl_percent') comparison = aPnlPercent - bPnlPercent;

        return sortOrder === 'asc' ? comparison : -comparison;
      });
  }, [holdings, searchQuery, selectedAssetType, sortBy, sortOrder, liveUsdRate, liveEurRate]);

  const value: PortfolioContextType = {
    holdings, setHoldings, loading, refreshing,
    pnlData, livePnlData, historicalData,
    connectionStatus, lastUpdate,
    totalCashValue,
    notificationsEnabled, enableNotifications,
    handleAddHolding, handleUpdateHolding, handleDeleteHolding,
    pendingDeleteId, confirmDelete, cancelDelete,
    handleRefresh,
    portfolioMetrics,
    searchQuery, setSearchQuery,
    selectedAssetType, setSelectedAssetType,
    sortBy, setSortBy,
    sortOrder, setSortOrder,
    filteredAndSortedHoldings,
    targetAllocations, setTargetAllocations,
    toast,
  };

  return (
    <PortfolioContext.Provider value={value}>
      {children}
    </PortfolioContext.Provider>
  );
}
