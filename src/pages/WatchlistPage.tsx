import { useState, useEffect, useCallback } from 'react';
import {
  Eye, Plus, Trash2, TrendingUp, TrendingDown, RefreshCw,
  Star, Search, ShoppingCart, X
} from 'lucide-react';
import { AssetType } from '../lib/supabase';
import { fetchRealTimePrice, formatCurrency } from '../services/priceService';
import { ASSET_TYPE_LABELS } from '../constants/assetTypes';
import { useToast } from '../hooks/useToast';
import { usePortfolio } from '../contexts/PortfolioContext';
import { PageHeader } from '../components/ui/PageHeader';
import { EmptyState } from '../components/ui/EmptyState';
import { Sparkline } from '../components/ui/Sparkline';

interface WatchlistItem {
  symbol: string;
  assetType: AssetType;
  currentPrice: number;
  previousPrice: number;
  addedAt: string;
  targetBuy?: number;
  targetSell?: number;
  notes?: string;
}

const STORAGE_KEY = 'portfoy_watchlist';

function loadWatchlist(): WatchlistItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveWatchlist(items: WatchlistItem[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

function yahooTickerFor(symbol: string, type: AssetType): string | null {
  const s = symbol.toUpperCase();
  if (type === 'crypto') return `${s}-USD`;
  if (type === 'currency') {
    if (s === 'USD') return 'TRY=X';
    if (s === 'EUR') return 'EURTRY=X';
    if (s === 'GBP') return 'GBPTRY=X';
    return `${s}TRY=X`;
  }
  if (type === 'commodity') {
    if (s.includes('GOLD') || s.includes('ALTIN') || s === 'XAU') return 'GC=F';
    if (s.includes('SILVER') || s.includes('GUMUS') || s === 'XAG') return 'SI=F';
    return null;
  }
  if (type === 'stock') {
    // BIST sembolleri .IS suffix
    const BIST = ['THYAO','ASELS','TUPRS','GARAN','AKBNK','BIMAS','KCHOL','SISE','SAHOL','EREGL','TCELL','TTKOM','TOASO','EKGYO','AKSEN','ENKAI','CCOLA'];
    if (BIST.includes(s)) return `${s}.IS`;
    return s;
  }
  return null;
}

export default function WatchlistPage() {
  const toast = useToast();
  const { handleAddHolding } = usePortfolio();
  const [items, setItems] = useState<WatchlistItem[]>(loadWatchlist);
  const [showAddForm, setShowAddForm] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sparklines, setSparklines] = useState<Record<string, number[]>>({});

  // Add form state
  const [newSymbol, setNewSymbol] = useState('');
  const [newType, setNewType] = useState<AssetType>('stock');
  const [newTargetBuy, setNewTargetBuy] = useState('');
  const [newNotes, setNewNotes] = useState('');

  useEffect(() => { saveWatchlist(items); }, [items]);

  const refreshPrices = useCallback(async () => {
    if (items.length === 0) return;
    setRefreshing(true);
    const updated = await Promise.all(
      items.map(async (item) => {
        try {
          const price = await fetchRealTimePrice(item.symbol, item.assetType);
          return {
            ...item,
            previousPrice: item.currentPrice,
            currentPrice: price || item.currentPrice,
          };
        } catch {
          return item;
        }
      })
    );
    setItems(updated);
    setRefreshing(false);
    toast.success('Fiyatlar güncellendi');
  }, [items, toast]);

  useEffect(() => {
    if (items.length > 0) refreshPrices();
  }, []);

  // Fetch sparkline data for each item
  useEffect(() => {
    if (items.length === 0) return;
    let cancelled = false;
    (async () => {
      const results = await Promise.all(items.map(async (item) => {
        const ticker = yahooTickerFor(item.symbol, item.assetType);
        if (!ticker) return [item.symbol, [] as number[]] as const;
        try {
          const res = await fetch(`/api/price-proxy?type=benchmark-history&symbol=${encodeURIComponent(ticker)}&days=30`);
          if (!res.ok) return [item.symbol, [] as number[]] as const;
          const data = await res.json();
          const series: number[] = (data?.data?.series || []).map((p: { value: number }) => p.value);
          return [item.symbol, series] as const;
        } catch {
          return [item.symbol, [] as number[]] as const;
        }
      }));
      if (!cancelled) {
        setSparklines(Object.fromEntries(results));
      }
    })();
    return () => { cancelled = true; };
  }, [items.length]);

  function addItem() {
    if (!newSymbol.trim()) return;
    const symbol = newSymbol.toUpperCase().trim();
    if (items.some(i => i.symbol === symbol)) {
      toast.error('Bu varlık zaten listede');
      return;
    }
    setItems(prev => [...prev, {
      symbol,
      assetType: newType,
      currentPrice: 0,
      previousPrice: 0,
      addedAt: new Date().toISOString(),
      targetBuy: newTargetBuy ? parseFloat(newTargetBuy) : undefined,
      notes: newNotes || undefined,
    }]);
    setNewSymbol('');
    setNewTargetBuy('');
    setNewNotes('');
    setShowAddForm(false);
    toast.success(`${symbol} izleme listesine eklendi`);
    // Fetch price immediately
    fetchRealTimePrice(symbol, newType).then(price => {
      if (price) {
        setItems(prev => prev.map(i => i.symbol === symbol ? { ...i, currentPrice: price } : i));
      }
    });
  }

  function removeItem(symbol: string) {
    setItems(prev => prev.filter(i => i.symbol !== symbol));
    toast.success(`${symbol} listeden çıkarıldı`);
  }

  async function buyFromWatchlist(item: WatchlistItem) {
    if (item.currentPrice <= 0) {
      toast.error('Fiyat bilgisi yok, önce yenileyin');
      return;
    }
    await handleAddHolding({
      symbol: item.symbol,
      asset_type: item.assetType,
      purchase_price: item.currentPrice,
      quantity: 1,
      current_price: item.currentPrice,
    });
    removeItem(item.symbol);
  }

  const filtered = items.filter(i =>
    i.symbol.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-50/40 via-white to-accent-50/30 dark:from-gray-900 dark:via-gray-950 dark:to-gray-900 p-4 md:p-6">
      <div className="max-w-5xl mx-auto">
        <PageHeader
          icon={Eye}
          title="İzleme Listesi"
          subtitle={`${items.length} varlık takip ediliyor`}
          actions={
            <div className="flex items-center gap-2">
              <button
                onClick={refreshPrices}
                disabled={refreshing}
                className="p-2 rounded-xl bg-white dark:bg-gray-800 ring-1 ring-slate-200 dark:ring-gray-700 text-brand-600 dark:text-brand-400 hover:bg-brand-50 dark:hover:bg-brand-950/30 transition-colors disabled:opacity-50"
                aria-label="Yenile"
              >
                <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
              </button>
              <button
                onClick={() => setShowAddForm(true)}
                className="flex items-center gap-1.5 px-3 py-2 bg-gradient-to-br from-brand-600 to-brand-700 hover:from-brand-500 text-white rounded-xl shadow-md shadow-brand-500/20 font-semibold text-sm hover-lift transition-all"
              >
                <Plus size={15} />
                Ekle
              </button>
            </div>
          }
        />

        {/* Search */}
        {items.length > 3 && (
          <div className="relative mb-4">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Sembol ara..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-gray-800 rounded-xl border border-slate-200 dark:border-gray-700 text-sm focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none"
            />
          </div>
        )}

        {/* List */}
        {filtered.length === 0 ? (
          items.length === 0 ? (
            <div className="card-secondary">
              <EmptyState
                icon={Star}
                title="İzleme listeniz boş"
                description="Almak istediğiniz varlıkları buraya ekleyin; hedef fiyata düşünce bildirim al."
                action={
                  <button
                    onClick={() => setShowAddForm(true)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-gradient-to-br from-brand-600 to-brand-700 text-white rounded-xl shadow-md font-semibold text-sm hover-lift"
                  >
                    <Plus size={15} />
                    İlk Varlığı Ekle
                  </button>
                }
              />
            </div>
          ) : (
            <div className="card-secondary p-8 text-center">
              <p className="t-caption">Aramanızla eşleşen varlık yok</p>
            </div>
          )
        ) : (
          <div className="space-y-3">
            {filtered.map(item => {
              const change = item.previousPrice > 0
                ? ((item.currentPrice - item.previousPrice) / item.previousPrice) * 100
                : 0;
              const isUp = change >= 0;
              const atTarget = item.targetBuy && item.currentPrice > 0 && item.currentPrice <= item.targetBuy;

              const sparkData = sparklines[item.symbol] || [];
              return (
                <div
                  key={item.symbol}
                  className={`card-secondary p-4 transition-all ${
                    atTarget
                      ? 'ring-2 ring-accent-400 dark:ring-accent-600 border-accent-300 dark:border-accent-800'
                      : ''
                  }`}
                >
                  <div className="flex items-center gap-4">
                    {/* Symbol badge */}
                    <div className="flex-shrink-0">
                      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center shadow-md shadow-brand-500/20">
                        <span className="text-sm font-black text-white">{item.symbol.slice(0, 3)}</span>
                      </div>
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-gray-900 dark:text-white">{item.symbol}</span>
                        <span className="pill pill-neutral !text-[10px] !px-2 !py-0.5">
                          {ASSET_TYPE_LABELS[item.assetType] || item.assetType}
                        </span>
                        {atTarget && (
                          <span className="pill pill-positive !text-[10px] !px-2 !py-0.5 animate-pulse">
                            Hedef fiyatta!
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1">
                        {item.currentPrice > 0 ? (
                          <>
                            <span className="text-lg font-bold text-gray-900 dark:text-white tabular-nums">
                              {formatCurrency(item.currentPrice)} ₺
                            </span>
                            {change !== 0 && (
                              <span className={`pill !px-2 !py-0.5 !text-[11px] ${isUp ? 'pill-positive' : 'pill-negative'}`}>
                                {isUp ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                                {isUp ? '+' : ''}{change.toFixed(2)}%
                              </span>
                            )}
                          </>
                        ) : (
                          <span className="text-sm text-gray-400">Fiyat yükleniyor...</span>
                        )}
                      </div>
                      {item.targetBuy && (
                        <p className="t-caption mt-1">
                          Hedef alış: <span className="font-semibold">{formatCurrency(item.targetBuy)} ₺</span>
                          {item.currentPrice > 0 && item.currentPrice > item.targetBuy && (
                            <span className="text-red-500 ml-1">(%{(((item.currentPrice - item.targetBuy) / item.targetBuy) * 100).toFixed(1)} yukarıda)</span>
                          )}
                        </p>
                      )}
                      {item.notes && (
                        <p className="text-xs text-gray-400 mt-0.5 italic truncate">{item.notes}</p>
                      )}
                    </div>

                    {/* Sparkline */}
                    {sparkData.length > 1 && (
                      <div className="hidden sm:block flex-shrink-0">
                        <Sparkline data={sparkData} width={100} height={36} />
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => buyFromWatchlist(item)}
                        className="p-2 bg-accent-50 dark:bg-accent-950/30 text-accent-600 dark:text-accent-400 rounded-lg hover:bg-accent-100 dark:hover:bg-accent-900/40 transition-colors"
                        title="Satın Al"
                      >
                        <ShoppingCart size={16} />
                      </button>
                      <button
                        onClick={() => removeItem(item.symbol)}
                        className="p-2 text-red-500 dark:text-red-400 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                        title="Listeden Çıkar"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add Form Modal */}
      {showAddForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowAddForm(false)} />
          <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-md w-full p-6 z-10">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <Star className="text-amber-500" size={20} />
                İzleme Listesine Ekle
              </h3>
              <button onClick={() => setShowAddForm(false)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Sembol *</label>
                <input
                  type="text"
                  value={newSymbol}
                  onChange={e => setNewSymbol(e.target.value.toUpperCase())}
                  placeholder="THYAO, BTC, USD..."
                  className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 text-sm focus:ring-2 focus:ring-amber-500 outline-none"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Varlık Türü</label>
                <select
                  value={newType}
                  onChange={e => setNewType(e.target.value as AssetType)}
                  className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 text-sm focus:ring-2 focus:ring-amber-500 outline-none"
                >
                  <option value="stock">Hisse Senedi</option>
                  <option value="crypto">Kripto Para</option>
                  <option value="currency">Döviz</option>
                  <option value="commodity">Emtia</option>
                  <option value="fund">Fon</option>
                  <option value="eurobond">Eurobond</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Hedef Alış Fiyatı (opsiyonel)</label>
                <input
                  type="number"
                  value={newTargetBuy}
                  onChange={e => setNewTargetBuy(e.target.value)}
                  placeholder="Bu fiyata düşünce bildirim al"
                  className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 text-sm focus:ring-2 focus:ring-amber-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Not (opsiyonel)</label>
                <input
                  type="text"
                  value={newNotes}
                  onChange={e => setNewNotes(e.target.value)}
                  placeholder="Neden takip ediyorsunuz?"
                  className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 text-sm focus:ring-2 focus:ring-amber-500 outline-none"
                />
              </div>

              <button
                onClick={addItem}
                disabled={!newSymbol.trim()}
                className="w-full py-3 bg-gradient-to-r from-amber-500 to-brand-600 text-white rounded-xl font-bold shadow-lg hover:shadow-xl hover:scale-[1.02] transition-all disabled:opacity-50 disabled:hover:scale-100"
              >
                Listeye Ekle
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      <div role="alert" aria-live="polite" className="fixed bottom-4 right-4 z-50 space-y-2">
        {toast.toasts.map(t => (
          <div key={t.id} className={`px-4 py-2 rounded-lg text-sm font-medium shadow-lg ${
            t.type === 'success' ? 'bg-green-600 text-white' :
            t.type === 'error' ? 'bg-red-600 text-white' :
            'bg-brand-600 text-white'
          }`}>
            {t.message}
          </div>
        ))}
      </div>
    </div>
  );
}
