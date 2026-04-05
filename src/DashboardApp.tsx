import { useEffect, useState } from 'react';
import { supabase, Holding } from './lib/supabase';
import { LiveDashboard } from './components/LiveDashboard';
import {
  fetchMultiplePrices,
  initializeWebSocketConnection,
  closeWebSocketConnection,
  subscribeToPriceUpdates,
  PriceUpdate,
} from './services/priceService';

const REFRESH_INTERVAL = 120;

function DashboardApp() {
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [updatingPrices, setUpdatingPrices] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [countdown, setCountdown] = useState(REFRESH_INTERVAL);

  useEffect(() => {
    loadHoldings();

    const unsubscribePrices = subscribeToPriceUpdates((update: PriceUpdate) => {
      setHoldings(prev =>
        prev.map(h =>
          h.symbol === update.symbol
            ? { ...h, current_price: update.price, updated_at: new Date().toISOString() }
            : h
        )
      );
    });

    return () => {
      unsubscribePrices();
      closeWebSocketConnection();
    };
  }, []);

  useEffect(() => {
    setCountdown(REFRESH_INTERVAL);
    const priceInterval = setInterval(() => {
      updatePrices();
      setCountdown(REFRESH_INTERVAL);
    }, REFRESH_INTERVAL * 1000);

    const countdownInterval = setInterval(() => {
      setCountdown(prev => (prev > 0 ? prev - 1 : REFRESH_INTERVAL));
    }, 1000);

    return () => {
      clearInterval(priceInterval);
      clearInterval(countdownInterval);
    };
  }, [holdings]);

  async function loadHoldings() {
    setLoading(true);
    setLoadError(null);
    try {
      const { data, error } = await supabase
        .from('holdings')
        .select('*')
        .order('symbol', { ascending: true });

      if (error) {
        console.error('Error loading holdings:', error);
        setLoadError(error.message);
      } else {
        setHoldings(data || []);
        if (data && data.length > 0) {
          updatePricesForHoldings(data).catch(err => {
            console.warn('Price update failed, showing cached prices:', err);
          });

          const cryptoSymbols = data
            .filter(h => h.asset_type === 'crypto')
            .map(h => h.symbol);

          if (cryptoSymbols.length > 0) {
            initializeWebSocketConnection(cryptoSymbols);
          }
        }
      }
    } catch (err) {
      console.error('Unexpected error loading holdings:', err);
      setLoadError('Bağlantı hatası. Lütfen sayfayı yenileyin.');
    } finally {
      setLoading(false);
    }
  }

  async function updatePrices() {
    if (holdings.length === 0) return;
    setUpdatingPrices(true);
    await updatePricesForHoldings(holdings);
    setUpdatingPrices(false);
    setLastUpdated(new Date());
  }

  async function updatePricesForHoldings(holdingsToUpdate: Holding[]) {
    try {
      const holdingsToAutoUpdate = holdingsToUpdate.filter(
        h => !h.manual_price && h.asset_type !== 'fund' && h.asset_type !== 'eurobond'
      );

      if (holdingsToAutoUpdate.length === 0) {
        return;
      }

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
            .update({ current_price: newPrice, updated_at: new Date().toISOString() })
            .eq('id', holding.id);

          return { ...holding, current_price: newPrice };
        }
        return holding;
      });

      const updatedHoldings = await Promise.all(updates);
      setHoldings(updatedHoldings);
      setLastUpdated(new Date());
    } catch (error) {
      console.error('Error updating prices:', error);
    } finally {
      setUpdatingPrices(false);
    }
  }

  const totalInvestment = holdings.reduce(
    (sum, h) => sum + h.purchase_price * h.quantity,
    0
  );

  const totalCurrentValue = holdings.reduce(
    (sum, h) => sum + h.current_price * h.quantity,
    0
  );

  const totalRealized = holdings.reduce(
    (sum, h) => sum + (h.total_realized_pnl || 0),
    0
  );

  const unrealizedPnl = totalCurrentValue - totalInvestment;
  const totalProfitLoss = unrealizedPnl + totalRealized;
  const totalProfitLossPercent = totalInvestment > 0
    ? (totalProfitLoss / totalInvestment) * 100
    : 0;

  if (loading) {
    return (
      <div className="fixed inset-0 bg-gradient-to-br from-gray-900 via-slate-900 to-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-blue-500 mx-auto mb-4"></div>
          <p className="text-white text-xl font-semibold">Yükleniyor...</p>
          <p className="text-gray-400 text-sm mt-2">Portföy verileri alınıyor</p>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="fixed inset-0 bg-gradient-to-br from-gray-900 via-slate-900 to-gray-900 flex items-center justify-center">
        <div className="text-center text-white max-w-md px-6">
          <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-red-400 text-2xl">!</span>
          </div>
          <h1 className="text-2xl font-bold mb-3">Bağlantı Hatası</h1>
          <p className="text-gray-400 mb-6">{loadError}</p>
          <button
            onClick={loadHoldings}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold transition-colors"
          >
            Tekrar Dene
          </button>
        </div>
      </div>
    );
  }

  if (holdings.length === 0) {
    return (
      <div className="fixed inset-0 bg-gradient-to-br from-gray-900 via-slate-900 to-gray-900 flex items-center justify-center">
        <div className="text-center text-white max-w-md px-6">
          <div className="w-20 h-20 bg-blue-500/20 border border-blue-500/30 rounded-2xl flex items-center justify-center mx-auto mb-5">
            <svg className="text-blue-400 w-10 h-10" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold mb-3">Portfoy Bos</h1>
          <p className="text-gray-400 text-base mb-6">Ana uygulamadan varlik ekleyin</p>
          <a
            href="/"
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold transition-colors inline-block"
          >
            Ana Sayfaya Git
          </a>
        </div>
      </div>
    );
  }

  return (
    <LiveDashboard
      holdings={holdings}
      totalValue={totalCurrentValue}
      totalInvestment={totalInvestment}
      totalPnL={totalProfitLoss}
      totalPnLPercent={totalProfitLossPercent}
      updatingPrices={updatingPrices}
      lastUpdated={lastUpdated}
      countdown={countdown}
      onRefresh={updatePrices}
    />
  );
}

export default DashboardApp;
