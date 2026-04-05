import { createContext, useContext, useEffect, useState, useRef, useMemo, useCallback, ReactNode } from 'react';
import { supabase, Holding, AssetType } from '../lib/supabase';
import {
  fetchMultiplePrices,
  formatCurrency,
  initializeWebSocketConnection,
  closeWebSocketConnection,
  resetAndReconnectWebSocket,
  subscribeToConnectionStatus,
  subscribeToPriceUpdates,
  ConnectionStatus,
  PriceUpdate
} from '../services/priceService';
import {
  getPnLData,
  savePortfolioSnapshot,
  getDefaultTargetAllocations,
  getHistoricalSnapshots,
  PnLData,
  PortfolioSnapshot,
} from '../services/analyticsService';
import { checkAndUnlockAchievements } from '../services/achievementService';
import { getAllTransactions, getTotalDividends } from '../services/transactionService';
import { getAllCashBalanceTotals, getTotalCashValue } from '../services/cashService';
import { requestNotificationPermission, notifyAchievementUnlocked, getNotificationPermissionStatus } from '../services/notificationService';
import { registerServiceWorker, setupInstallPrompt, setupConnectionListener } from '../services/pwaService';
import { startExchangeRateUpdates, stopExchangeRateUpdates, normalizeToBaseCurrency } from '../services/currencyService';
import { startHealthMonitoring, stopHealthMonitoring } from '../services/priceMonitor';
import { stopCacheCleanup } from '../services/cacheService';
import { loadDailyOpenPrices, saveDailyOpenPrices } from '../services/dailyOpenPriceService';
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
  handleAddHolding: (newHolding: { symbol: string; asset_type: AssetType; purchase_price: number; quantity: number; current_price: number }) => Promise<void>;
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

  // Keep ref in sync
  useEffect(() => { holdingsRef.current = holdings; }, [holdings]);

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

      const totalInvestment = holdings.reduce((sum, h) => sum + h.purchase_price * h.quantity, 0);
      const totalCurrentValue = holdings.reduce((sum, h) => sum + h.current_price * h.quantity, 0);
      const totalRealized = holdings.reduce((sum, h) => sum + (h.total_realized_pnl || 0), 0);
      const unrealizedPnl = totalCurrentValue - totalInvestment;
      const totalProfitLoss = unrealizedPnl + totalRealized;

      checkAchievements(totalCurrentValue, totalProfitLoss);
    }
  }, [holdings]);

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

      const updates = holdingsToUpdate.map(async (holding) => {
        if (holding.manual_price || holding.asset_type === 'fund' || holding.asset_type === 'eurobond') {
          return holding;
        }

        const newPrice = prices[holding.symbol];
        if (newPrice && Math.abs(newPrice - holding.current_price) > 0.01) {
          await supabase
            .from('holdings')
            .update({
              current_price: newPrice,
              currency: 'TRY',
              updated_at: new Date().toISOString()
            })
            .eq('id', holding.id);

          return { ...holding, current_price: newPrice, currency: 'TRY' };
        }
        return holding;
      });

      const updatedHoldings = await Promise.all(updates);
      setHoldings(updatedHoldings);

      await calculateAndUpdatePnL(updatedHoldings);
    } catch (error) {
      console.error('Error updating prices:', error);
    }
  }

  async function calculateAndUpdatePnL(currentHoldings = holdings) {
    try {
      if (currentHoldings.length === 0) return;

      const normalized = await normalizeToBaseCurrency(currentHoldings, 'TRY');
      const totalValue = normalized.reduce((sum, h) => sum + h.normalized_current, 0);
      const totalInv = normalized.reduce((sum, h) => sum + h.normalized_invested, 0);
      const totalRealized = currentHoldings.reduce((sum, h) => sum + (h.total_realized_pnl || 0), 0);
      const { totalDeposits, totalWithdrawals } = await getAllCashBalanceTotals();
      const unrealizedPnl = totalValue - totalInv;
      const totalPnl = unrealizedPnl + totalRealized;
      const pnlPercent = totalInv > 0 ? (totalPnl / totalInv) * 100 : 0;

      await savePortfolioSnapshot(totalValue, totalInv, totalPnl, pnlPercent, totalDeposits, totalWithdrawals);
      const data = await getPnLData();
      setPnlData(data);
    } catch (error) {
      console.error('Error calculating PnL:', error instanceof Error ? error.message : '');
    }
  }

  function calculateLivePnL() {
    if (holdings.length === 0) { setLivePnlData(null); return; }

    const currentTotalValue = holdings.reduce((sum, h) => sum + h.current_price * h.quantity, 0);
    const openPrices = dailyOpenPricesRef.current;
    let dailyOpenValue = 0;
    let hasOpenPrices = false;

    for (const h of holdings) {
      if (h.asset_type === 'cash') continue;
      const op = openPrices[h.id];
      if (op && op > 0) {
        const ratio = h.current_price > 0 ? op / h.current_price : 1;
        const validOpen = ratio < 0.1 || ratio > 10 ? h.current_price : op;
        dailyOpenValue += validOpen * h.quantity;
        hasOpenPrices = true;
      } else {
        dailyOpenValue += h.current_price * h.quantity;
      }
    }

    if (!hasOpenPrices) {
      const now = new Date();
      const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

      if (sessionOpenValueRef.current === null && currentTotalValue > 0) {
        const stored = sessionStorage.getItem('portfolio_open_value');
        const storedDate = sessionStorage.getItem('portfolio_open_date');

        if (stored && storedDate === today) {
          sessionOpenValueRef.current = parseFloat(stored);
        } else {
          sessionOpenValueRef.current = currentTotalValue;
          sessionStorage.setItem('portfolio_open_value', String(currentTotalValue));
          sessionStorage.setItem('portfolio_open_date', today);
        }
      }
      dailyOpenValue = sessionOpenValueRef.current || currentTotalValue;
    }

    const sessionBase = dailyOpenValue;
    const dailyBase = sessionBase;
    let weeklyBase = sessionBase;
    let monthlyBase = sessionBase;

    if (pnlData) {
      const pnlWeeklyBase = pnlData.weekly.value - pnlData.weekly.change;
      const pnlMonthlyBase = pnlData.monthly.value - pnlData.monthly.change;
      if (pnlWeeklyBase > 0) weeklyBase = pnlWeeklyBase;
      if (pnlMonthlyBase > 0) monthlyBase = pnlMonthlyBase;
    }

    const dailyChange = currentTotalValue - dailyBase;
    const weeklyChange = currentTotalValue - weeklyBase;
    const monthlyChange = currentTotalValue - monthlyBase;

    setLivePnlData({
      daily: { period: 'Günlük', value: currentTotalValue, change: dailyChange, percentage: dailyBase > 0 ? (dailyChange / dailyBase) * 100 : 0 },
      weekly: { period: 'Haftalık', value: currentTotalValue, change: weeklyChange, percentage: weeklyBase > 0 ? (weeklyChange / weeklyBase) * 100 : 0 },
      monthly: { period: 'Aylık', value: currentTotalValue, change: monthlyChange, percentage: monthlyBase > 0 ? (monthlyChange / monthlyBase) * 100 : 0 },
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
      toast.success('Bildirimler etkinleştirildi! Fiyat alarmları için bildirim alacaksınız.');
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
  }) => {
    const { data, error } = await supabase
      .from('holdings')
      .insert([{ ...newHolding, currency: 'TRY' }])
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

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await updatePrices();
    await loadPnLData();
    await loadHistoricalData();
    setTimeout(() => setRefreshing(false), 500);
  }, []);

  // ── Memoized values ────────────────────────────────────────────
  const portfolioMetrics = useMemo(() => {
    const totalInvestment = holdings.reduce((sum, h) => sum + h.purchase_price * h.quantity, 0);
    const totalCurrentValue = holdings.reduce((sum, h) => sum + h.current_price * h.quantity, 0);
    const totalRealized = holdings.reduce((sum, h) => sum + (h.total_realized_pnl || 0), 0);
    const unrealizedPnl = totalCurrentValue - totalInvestment;
    const totalProfitLoss = unrealizedPnl + totalRealized;
    const totalProfitLossPercent = totalInvestment > 0 ? (totalProfitLoss / totalInvestment) * 100 : 0;
    const usdHolding = holdings.find(h => h.symbol === 'USD');
    const usdRate = usdHolding?.current_price && usdHolding.current_price > 1
      ? usdHolding.current_price
      : DEFAULT_USD_TRY_RATE;
    return {
      totalInvestment,
      totalCurrentValue,
      totalRealized,
      unrealizedPnl,
      totalProfitLoss,
      totalProfitLossPercent,
      usdRate,
      totalInvestmentUSD: totalInvestment / usdRate,
      totalCurrentValueUSD: totalCurrentValue / usdRate,
      grandTotalUSD: (totalCurrentValue + totalCashValue) / usdRate,
    };
  }, [holdings, totalCashValue]);

  const filteredAndSortedHoldings = useMemo(() => {
    return holdings
      .filter((holding) => {
        const matchesSearch = searchQuery === '' || holding.symbol.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesType = selectedAssetType === 'all' || holding.asset_type === selectedAssetType;
        return matchesSearch && matchesType;
      })
      .sort((a, b) => {
        const aValue = a.current_price * a.quantity;
        const bValue = b.current_price * b.quantity;
        const aInvestment = a.purchase_price * a.quantity;
        const bInvestment = b.purchase_price * b.quantity;
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
  }, [holdings, searchQuery, selectedAssetType, sortBy, sortOrder]);

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
