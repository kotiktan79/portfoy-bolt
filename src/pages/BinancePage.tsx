import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, RefreshCw, Download,
  AlertCircle, Check
} from 'lucide-react';
import { formatCurrency } from '../services/priceService';
import { usePortfolio } from '../contexts/PortfolioContext';
import { useToast } from '../hooks/useToast';
import { DEFAULT_USD_TRY_RATE } from '../config';
import { getCachedUSDRate } from '../services/priceService';

interface BinanceBalance {
  asset: string;
  free: number;
  locked: number;
  total: number;
  usdPrice: number;
  usdValue: number;
}

export default function BinancePage() {
  const navigate = useNavigate();
  const { handleAddHolding, holdings } = usePortfolio();
  const toast = useToast();
  const [balances, setBalances] = useState<BinanceBalance[]>([]);
  const [totalUsd, setTotalUsd] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [usdRate, setUsdRate] = useState(DEFAULT_USD_TRY_RATE);
  const [importing, setImporting] = useState<Set<string>>(new Set());
  const [imported, setImported] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchBalances();
    getCachedUSDRate().then(setUsdRate);
  }, []);

  async function fetchBalances() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/binance');
      const data = await res.json();

      if (data.success) {
        setBalances(data.balances);
        setTotalUsd(data.totalUsdValue);
      } else {
        setError(data.error || 'Binance bağlantısı başarısız');
      }
    } catch {
      setError('Binance API bağlantı hatası');
    }
    setLoading(false);
  }

  // Check which assets are already in portfolio
  const existingSymbols = new Set(holdings.map(h => h.symbol));

  async function importAsset(b: BinanceBalance) {
    if (importing.has(b.asset)) return;
    setImporting(prev => new Set(prev).add(b.asset));

    try {
      const tryPrice = b.usdPrice * usdRate;
      const isStablecoin = ['USDT', 'USDC', 'BUSD', 'FDUSD'].includes(b.asset);

      await handleAddHolding({
        symbol: b.asset,
        asset_type: isStablecoin ? 'currency' : 'crypto',
        purchase_price: tryPrice,
        quantity: b.total,
        current_price: tryPrice,
      });

      setImported(prev => new Set(prev).add(b.asset));
      toast.success(`${b.asset} portföye eklendi`);
    } catch {
      toast.error(`${b.asset} eklenemedi`);
    }

    setImporting(prev => {
      const next = new Set(prev);
      next.delete(b.asset);
      return next;
    });
  }

  async function importAll() {
    const toImport = balances.filter(b =>
      !existingSymbols.has(b.asset) &&
      !imported.has(b.asset) &&
      b.usdValue > 5 // Skip dust
    );

    for (const b of toImport) {
      await importAsset(b);
    }
    toast.success(`${toImport.length} varlık portföye eklendi`);
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-gray-950">
      <div className="max-w-4xl mx-auto p-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate(-1)} className="p-2 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
              <ArrowLeft size={18} className="text-gray-600 dark:text-gray-400" />
            </button>
            <div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <img src="https://bin.bnbstatic.com/static/images/common/favicon.ico" alt="" className="w-6 h-6 rounded" onError={e => (e.currentTarget.style.display = 'none')} />
                Binance Portföy
              </h1>
              <p className="text-xs text-gray-500 dark:text-gray-400">Canlı bakiye senkronizasyonu</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchBalances}
              disabled={loading}
              className="p-2 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700"
            >
              <RefreshCw size={16} className={`text-gray-600 ${loading ? 'animate-spin' : ''}`} />
            </button>
            {balances.length > 0 && (
              <button
                onClick={importAll}
                className="flex items-center gap-1.5 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-semibold transition-colors"
              >
                <Download size={15} />
                Tümünü Aktar
              </button>
            )}
          </div>
        </div>

        {/* Total Value */}
        {!loading && !error && (
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 mb-4">
            <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Binance Toplam Değer</div>
            <div className="flex items-baseline gap-3">
              <span className="text-2xl font-bold text-gray-900 dark:text-white">
                ${formatCurrency(totalUsd)}
              </span>
              <span className="text-lg text-gray-500 dark:text-gray-400">
                ≈ {formatCurrency(totalUsd * usdRate)} ₺
              </span>
            </div>
            <div className="text-xs text-gray-400 mt-1">{balances.length} varlık · USD/TRY: {usdRate.toFixed(2)}</div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-xl p-4 mb-4 flex items-center gap-3">
            <AlertCircle size={18} className="text-red-500 flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-red-700 dark:text-red-400">{error}</p>
              <p className="text-xs text-red-500 mt-0.5">Binance API key'lerini kontrol edin.</p>
            </div>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-20">
            <RefreshCw size={24} className="text-amber-500 animate-spin mb-3" />
            <p className="text-sm text-gray-500">Binance'den bakiye çekiliyor...</p>
          </div>
        )}

        {/* Balances List */}
        {!loading && balances.length > 0 && (
          <div className="space-y-2">
            {balances.map(b => {
              const tryValue = b.usdValue * usdRate;
              const alreadyExists = existingSymbols.has(b.asset);
              const alreadyImported = imported.has(b.asset);
              const isImporting = importing.has(b.asset);

              return (
                <div
                  key={b.asset}
                  className={`bg-white dark:bg-gray-900 rounded-xl border p-4 flex items-center gap-4 transition-all ${
                    alreadyImported
                      ? 'border-green-300 dark:border-green-800 bg-green-50/50 dark:bg-green-950/10'
                      : 'border-gray-200 dark:border-gray-800'
                  }`}
                >
                  {/* Coin icon */}
                  <div className="w-10 h-10 bg-amber-50 dark:bg-amber-900/20 rounded-full flex items-center justify-center flex-shrink-0">
                    <span className="text-xs font-black text-amber-700 dark:text-amber-400">{b.asset.slice(0, 3)}</span>
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-gray-900 dark:text-white">{b.asset}</span>
                      {alreadyExists && !alreadyImported && (
                        <span className="text-[10px] px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded font-medium">Portföyde var</span>
                      )}
                      {alreadyImported && (
                        <span className="text-[10px] px-1.5 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded font-medium flex items-center gap-0.5">
                          <Check size={10} /> Aktarıldı
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                      <span>{b.total.toFixed(b.total < 1 ? 6 : 2)} adet</span>
                      {b.locked > 0 && <span className="text-amber-500">({b.locked.toFixed(4)} kilitli)</span>}
                      <span>@ ${b.usdPrice.toFixed(b.usdPrice < 1 ? 4 : 2)}</span>
                    </div>
                  </div>

                  {/* Value */}
                  <div className="text-right flex-shrink-0">
                    <div className="font-bold text-gray-900 dark:text-white text-sm">${formatCurrency(b.usdValue)}</div>
                    <div className="text-xs text-gray-400">{formatCurrency(tryValue)} ₺</div>
                  </div>

                  {/* Import button */}
                  <button
                    onClick={() => importAsset(b)}
                    disabled={alreadyImported || isImporting}
                    className={`flex-shrink-0 p-2 rounded-lg transition-colors ${
                      alreadyImported
                        ? 'bg-green-100 dark:bg-green-900/30 text-green-500 cursor-default'
                        : isImporting
                        ? 'bg-gray-100 dark:bg-gray-800 text-gray-400'
                        : 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/40'
                    }`}
                    title={alreadyImported ? 'Aktarıldı' : 'Portföye aktar'}
                  >
                    {alreadyImported ? <Check size={16} /> : isImporting ? <RefreshCw size={16} className="animate-spin" /> : <Download size={16} />}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
