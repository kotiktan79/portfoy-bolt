import { useState, useEffect, useCallback } from 'react';
import { TrendingUp, TrendingDown, RefreshCw, Globe, Bitcoin, Gem, Banknote } from 'lucide-react';
import { fetchUSDTRYRate, fetchEURTRYRate, fetchRealTimePrice, formatCurrency } from '../services/priceService';
import { PageHeader } from '../components/ui/PageHeader';
import { Sparkline } from '../components/ui/Sparkline';

interface MarketIndicator {
  id: string;
  name: string;
  symbol: string;
  yahooSymbol: string;
  category: string;
  price: number | null;
  updatedAt: number | null;
  sparkline: number[];
  changePct: number | null;
}

const INDICATORS: Omit<MarketIndicator, 'price' | 'updatedAt' | 'sparkline' | 'changePct'>[] = [
  { id: 'usd',  name: 'USD/TRY', symbol: 'USD',   yahooSymbol: 'TRY=X',    category: 'Döviz' },
  { id: 'eur',  name: 'EUR/TRY', symbol: 'EUR',   yahooSymbol: 'EURTRY=X', category: 'Döviz' },
  { id: 'btc',  name: 'Bitcoin', symbol: 'BTC',   yahooSymbol: 'BTC-USD',  category: 'Kripto' },
  { id: 'eth',  name: 'Ethereum',symbol: 'ETH',   yahooSymbol: 'ETH-USD',  category: 'Kripto' },
  { id: 'gold', name: 'Altın',   symbol: 'ALTIN', yahooSymbol: 'GC=F',     category: 'Emtia' },
];

const AUTO_REFRESH_MS = 60000;

const CATEGORY_STYLES: Record<string, { icon: typeof Globe; tone: string }> = {
  Döviz:  { icon: Banknote, tone: 'icon-badge-brand' },
  Kripto: { icon: Bitcoin,  tone: 'icon-badge-accent' },
  Emtia:  { icon: Gem,      tone: 'icon-badge-slate' },
};

export default function MarketPage() {
  const [indicators, setIndicators] = useState<MarketIndicator[]>(
    INDICATORS.map((ind) => ({ ...ind, price: null, updatedAt: null, sparkline: [], changePct: null }))
  );
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchAll = useCallback(async (isManual = false) => {
    if (isManual) setRefreshing(true);

    const priceResults = await Promise.allSettled(
      INDICATORS.map(async (ind) => {
        let price: number;
        if (ind.symbol === 'USD') price = await fetchUSDTRYRate();
        else if (ind.symbol === 'EUR') price = await fetchEURTRYRate();
        else if (ind.symbol === 'BTC' || ind.symbol === 'ETH') price = await fetchRealTimePrice(ind.symbol, 'crypto');
        else price = await fetchRealTimePrice(ind.symbol, 'commodity');
        return { id: ind.id, price };
      })
    );

    const sparkResults = await Promise.allSettled(
      INDICATORS.map(async (ind) => {
        const res = await fetch(`/api/price-proxy?type=benchmark-history&symbol=${encodeURIComponent(ind.yahooSymbol)}&days=30`);
        if (!res.ok) return { id: ind.id, series: [] };
        const data = await res.json();
        return { id: ind.id, series: (data?.data?.series || []).map((p: { value: number }) => p.value) };
      })
    );

    setIndicators((prev) =>
      prev.map((ind) => {
        const priceRes = priceResults.find((r) => r.status === 'fulfilled' && r.value.id === ind.id);
        const sparkRes = sparkResults.find((r) => r.status === 'fulfilled' && r.value.id === ind.id);
        const price = priceRes?.status === 'fulfilled' ? priceRes.value.price : ind.price;
        const series: number[] = sparkRes?.status === 'fulfilled' ? sparkRes.value.series : ind.sparkline;
        const changePct = series.length >= 2 ? ((series[series.length - 1] - series[0]) / series[0]) * 100 : null;
        return { ...ind, price, sparkline: series, changePct, updatedAt: Date.now() };
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
    return new Date(ts).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  }

  function getDecimals(symbol: string) {
    if (symbol === 'USD' || symbol === 'EUR') return 4;
    if (symbol === 'ALTIN') return 2;
    return 0;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-50/40 via-white to-accent-50/30 dark:from-gray-900 dark:via-gray-950 dark:to-gray-900 p-4 md:p-6">
      <div className="max-w-6xl mx-auto">
        <PageHeader
          icon={Globe}
          title="Piyasa Özeti"
          subtitle="Döviz, kripto ve emtia canlı fiyatları"
          actions={
            <button
              onClick={() => fetchAll(true)}
              disabled={refreshing}
              className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-xl bg-white dark:bg-gray-800 ring-1 ring-slate-200 dark:ring-gray-700 text-brand-600 dark:text-brand-400 hover:bg-brand-50 dark:hover:bg-brand-950/30 transition-colors disabled:opacity-50 font-medium"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              Yenile
            </button>
          }
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {indicators.map((ind) => {
            const cat = CATEGORY_STYLES[ind.category] || CATEGORY_STYLES.Döviz;
            const Icon = cat.icon;
            const isPositive = (ind.changePct ?? 0) >= 0;

            return (
              <div key={ind.id} className="card-secondary p-5 hover-lift group">
                {loading ? (
                  <div className="animate-pulse space-y-3">
                    <div className="flex items-center gap-2">
                      <div className="w-9 h-9 rounded-xl bg-slate-200 dark:bg-gray-800" />
                      <div className="flex-1 space-y-1.5">
                        <div className="h-3 w-16 rounded bg-slate-200 dark:bg-gray-800" />
                        <div className="h-2 w-24 rounded bg-slate-200 dark:bg-gray-800" />
                      </div>
                    </div>
                    <div className="h-8 w-32 rounded bg-slate-200 dark:bg-gray-800" />
                    <div className="h-10 rounded bg-slate-200 dark:bg-gray-800" />
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className={`icon-badge ${cat.tone}`}>
                          <Icon size={16} />
                        </div>
                        <div className="min-w-0">
                          <p className="t-eyebrow">{ind.category}</p>
                          <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 truncate">{ind.name}</p>
                        </div>
                      </div>
                      {ind.changePct !== null && (
                        <div className={`pill ${isPositive ? 'pill-positive' : 'pill-negative'}`}>
                          {isPositive ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                          {isPositive ? '+' : ''}{ind.changePct.toFixed(2)}%
                        </div>
                      )}
                    </div>

                    <p className="kpi-number text-gray-900 dark:text-white mb-2">
                      {ind.price !== null
                        ? `${formatCurrency(ind.price, getDecimals(ind.symbol))}`
                        : '---'}
                      <span className="text-sm font-semibold text-slate-400 dark:text-gray-500 ml-1">
                        {ind.symbol === 'BTC' || ind.symbol === 'ETH' ? '$' : ind.symbol === 'ALTIN' ? '$/oz' : '₺'}
                      </span>
                    </p>

                    {ind.sparkline.length > 1 && (
                      <div className="mb-2">
                        <Sparkline data={ind.sparkline} width={260} height={40} />
                      </div>
                    )}

                    <p className="t-caption">Son güncelleme: {formatTime(ind.updatedAt)} · 30 gün trend</p>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
