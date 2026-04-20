import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Eye, Plus, Trash2, TrendingUp, TrendingDown, RefreshCw,
  Star, Search, ArrowLeft, ShoppingCart, X
} from 'lucide-react';
import { AssetType } from '../lib/supabase';
import { fetchRealTimePrice, formatCurrency } from '../services/priceService';
import { ASSET_TYPE_LABELS } from '../constants/assetTypes';
import { useToast } from '../hooks/useToast';
import { usePortfolio } from '../contexts/PortfolioContext';

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

export default function WatchlistPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const { handleAddHolding } = usePortfolio();
  const [items, setItems] = useState<WatchlistItem[]>(loadWatchlist);
  const [showAddForm, setShowAddForm] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

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
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-brand-50/40 to-slate-100 dark:from-gray-950 dark:via-gray-900 dark:to-slate-900 p-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate(-1)} className="p-2 bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
              <ArrowLeft size={18} className="text-gray-600 dark:text-gray-400" />
            </button>
            <div className="p-2.5 bg-gradient-to-br from-amber-500 to-brand-600 rounded-xl shadow-lg">
              <Eye className="text-white" size={22} />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">İzleme Listesi</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">{items.length} varlık takip ediliyor</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={refreshPrices}
              disabled={refreshing}
              className="p-2.5 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
            >
              <RefreshCw size={18} className={`text-brand-600 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={() => setShowAddForm(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-amber-500 to-brand-600 text-white rounded-xl font-semibold text-sm shadow-lg hover:shadow-xl hover:scale-105 transition-all"
            >
              <Plus size={18} />
              Ekle
            </button>
          </div>
        </div>

        {/* Search */}
        {items.length > 3 && (
          <div className="relative mb-4">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Ara..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none"
            />
          </div>
        )}

        {/* List */}
        {filtered.length === 0 ? (
          <div className="text-center py-20 bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700">
            <Star className="mx-auto text-amber-400 mb-4" size={48} />
            <h3 className="text-lg font-bold text-gray-700 dark:text-gray-200 mb-2">İzleme listeniz boş</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">Almak istediğiniz varlıkları buraya ekleyip fiyatlarını takip edin</p>
            <button
              onClick={() => setShowAddForm(true)}
              className="px-6 py-3 bg-gradient-to-r from-amber-500 to-brand-600 text-white rounded-xl font-bold shadow-lg hover:shadow-xl hover:scale-105 transition-all"
            >
              <Plus size={18} className="inline mr-2" />
              İlk Varlığı Ekle
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(item => {
              const change = item.previousPrice > 0
                ? ((item.currentPrice - item.previousPrice) / item.previousPrice) * 100
                : 0;
              const isUp = change >= 0;
              const atTarget = item.targetBuy && item.currentPrice > 0 && item.currentPrice <= item.targetBuy;

              return (
                <div
                  key={item.symbol}
                  className={`bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm border transition-all hover:shadow-md ${
                    atTarget
                      ? 'border-green-400 dark:border-green-600 ring-2 ring-green-200 dark:ring-green-900'
                      : 'border-gray-200 dark:border-gray-700'
                  }`}
                >
                  <div className="flex items-center gap-4">
                    {/* Symbol */}
                    <div className="flex-shrink-0">
                      <div className="w-12 h-12 bg-gradient-to-br from-amber-100 to-brand-100 dark:from-amber-900/30 dark:to-brand-900/30 rounded-xl flex items-center justify-center">
                        <span className="text-sm font-black text-amber-700 dark:text-amber-400">{item.symbol.slice(0, 3)}</span>
                      </div>
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-gray-900 dark:text-white">{item.symbol}</span>
                        <span className="text-xs px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 rounded-full">
                          {ASSET_TYPE_LABELS[item.assetType] || item.assetType}
                        </span>
                        {atTarget && (
                          <span className="text-xs px-2 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-full font-semibold animate-pulse">
                            Hedef fiyatta!
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1">
                        {item.currentPrice > 0 ? (
                          <>
                            <span className="text-lg font-bold text-gray-900 dark:text-white">
                              {formatCurrency(item.currentPrice)} ₺
                            </span>
                            {change !== 0 && (
                              <span className={`flex items-center gap-1 text-xs font-semibold ${isUp ? 'text-green-600' : 'text-red-600'}`}>
                                {isUp ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                                {isUp ? '+' : ''}{change.toFixed(2)}%
                              </span>
                            )}
                          </>
                        ) : (
                          <span className="text-sm text-gray-400">Fiyat yükleniyor...</span>
                        )}
                      </div>
                      {item.targetBuy && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          Hedef alış: {formatCurrency(item.targetBuy)} ₺
                          {item.currentPrice > 0 && item.currentPrice > item.targetBuy && (
                            <span className="text-red-500 ml-1">(%{(((item.currentPrice - item.targetBuy) / item.targetBuy) * 100).toFixed(1)} yukarıda)</span>
                          )}
                        </p>
                      )}
                      {item.notes && (
                        <p className="text-xs text-gray-400 mt-0.5 italic">{item.notes}</p>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={() => buyFromWatchlist(item)}
                        className="p-2 bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 rounded-lg hover:bg-green-100 dark:hover:bg-green-900/40 transition-colors"
                        title="Satın Al"
                      >
                        <ShoppingCart size={16} />
                      </button>
                      <button
                        onClick={() => removeItem(item.symbol)}
                        className="p-2 bg-red-50 dark:bg-red-900/20 text-red-500 dark:text-red-400 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors"
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
