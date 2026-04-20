import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, TrendingUp, TrendingDown, RefreshCw, Globe } from 'lucide-react';
import { fetchUSDTRYRate, fetchEURTRYRate, fetchRealTimePrice, formatCurrency } from '../services/priceService';

interface MarketIndicator {
  id: string;
  name: string;
  symbol: string;
  category: string;
  price: number | null;
  updatedAt: number | null;
}

const INDICATORS: Omit<MarketIndicator, 'price' | 'updatedAt'>[] = [
  { id: 'usd', name: 'USD/TRY', symbol: 'USD', category: 'Döviz' },
  { id: 'eur', name: 'EUR/TRY', symbol: 'EUR', category: 'Döviz' },
  { id: 'btc', name: 'Bitcoin', symbol: 'BTC', category: 'Kripto' },
  { id: 'eth', name: 'Ethereum', symbol: 'ETH', category: 'Kripto' },
  { id: 'gold', name: 'Altın (gr)', symbol: 'ALTIN', category: 'Emtia' },
];

const AUTO_REFRESH_MS = 60000;

export default function MarketPage() {
  const navigate = useNavigate();
  const [indicators, setIndicators] = useState<MarketIndicator[]>(
    INDICATORS.map((ind) => ({ ...ind, price: null, updatedAt: null }))
  );
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchAll = useCallback(async (isManual = false) => {
    if (isManual) setRefreshing(true);

    const results = await Promise.allSettled(
      INDICATORS.map(async (ind) => {
        let price: number;
        if (ind.symbol === 'USD') {
          price = await fetchUSDTRYRate();
        } else if (ind.symbol === 'EUR') {
          price = await fetchEURTRYRate();
        } else if (ind.symbol === 'BTC' || ind.symbol === 'ETH') {
          price = await fetchRealTimePrice(ind.symbol, 'crypto');
        } else {
          // ALTIN
          price = await fetchRealTimePrice(ind.symbol, 'commodity');
        }
        return { id: ind.id, price, updatedAt: Date.now() };
      })
    );

    setIndicators((prev) =>
      prev.map((ind) => {
        const result = results.find(
          (r) => r.status === 'fulfilled' && r.value.id === ind.id
        );
        if (result && result.status === 'fulfilled') {
          return { ...ind, price: result.value.price, updatedAt: result.value.updatedAt };
        }
        return ind;
      })
    );

    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    fetchAll();
    const interval = setInterval(() => fetchAll(), AUTO_REFRESH_MS);
    return () => clearInterval(interval);
  }, [fetchAll]);

  function formatTime(ts: number | null) {
    if (!ts) return '--:--';
    return new Date(ts).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  function getCategoryIcon(category: string) {
    switch (category) {
      case 'Döviz':
        return <Globe className="w-5 h-5 text-brand-500" />;
      case 'Kripto':
        return <TrendingUp className="w-5 h-5 text-brand-500" />;
      case 'Emtia':
        return <TrendingDown className="w-5 h-5 text-yellow-500" />;
      default:
        return <Globe className="w-5 h-5 text-gray-500" />;
    }
  }

  function getDecimals(symbol: string) {
    if (symbol === 'USD' || symbol === 'EUR') return 4;
    if (symbol === 'ALTIN') return 2;
    return 0;
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/')}
              className="p-2 -ml-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-gray-700 dark:text-gray-300" />
            </button>
            <h1 className="text-lg font-bold text-gray-900 dark:text-white">Piyasa Özeti</h1>
          </div>
          <button
            onClick={() => fetchAll(true)}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg bg-brand-50 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400 hover:bg-brand-100 dark:hover:bg-brand-900/50 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            Yenile
          </button>
        </div>
      </div>

      {/* Grid */}
      <div className="max-w-5xl mx-auto px-4 py-6">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {indicators.map((ind) => (
            <div
              key={ind.id}
              className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 flex flex-col gap-2"
            >
              {loading ? (
                /* Skeleton */
                <div className="animate-pulse flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded bg-gray-200 dark:bg-gray-700" />
                    <div className="h-4 w-16 rounded bg-gray-200 dark:bg-gray-700" />
                  </div>
                  <div className="h-7 w-24 rounded bg-gray-200 dark:bg-gray-700 mt-1" />
                  <div className="h-3 w-14 rounded bg-gray-200 dark:bg-gray-700" />
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    {getCategoryIcon(ind.category)}
                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                      {ind.category}
                    </span>
                  </div>
                  <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                    {ind.name}
                  </p>
                  <p className="text-xl font-bold text-gray-900 dark:text-white">
                    {ind.price !== null
                      ? `₺${formatCurrency(ind.price, getDecimals(ind.symbol))}`
                      : '---'}
                  </p>
                  <p className="text-[11px] text-gray-400 dark:text-gray-500">
                    {formatTime(ind.updatedAt)}
                  </p>
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
