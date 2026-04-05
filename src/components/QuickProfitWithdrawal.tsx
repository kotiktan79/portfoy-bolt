import { useState, useMemo } from 'react';
import { TrendingUp, DollarSign, AlertTriangle, CheckCircle, Zap, ArrowRight } from 'lucide-react';
import { Holding } from '../lib/supabase';
import { useToast } from '../hooks/useToast';
import { formatCurrency as formatNumber } from '../services/priceService';

const formatCurrency = (value: number): string => {
  return `₺${formatNumber(value)}`;
};

const formatPrice = (value: number, currency: string): string => {
  const symbols: { [key: string]: string } = {
    'TRY': '₺',
    'USD': '$',
    'EUR': '€',
    'GBP': '£',
  };
  const symbol = symbols[currency] || currency;
  return `${formatNumber(value)} ${symbol}`;
};
import { updateCashBalance } from '../services/cashService';

interface QuickProfitWithdrawalProps {
  holdings: Holding[];
  onWithdrawalComplete: () => void;
}

interface ProfitableAsset {
  holding: Holding;
  totalCost: number;
  currentValue: number;
  profit: number;
  profitPercent: number;
  withdrawableProfit: number;
}

export function QuickProfitWithdrawal({ holdings, onWithdrawalComplete }: QuickProfitWithdrawalProps) {
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [selectedAssets, setSelectedAssets] = useState<Set<string>>(new Set());

  const getInflationRate = (assetType: string): number => {
    const type = assetType.toLowerCase();
    if (type === 'crypto') return 0;
    if (type === 'stock') return 0.15;
    if (type === 'gold') return 0;
    if (type === 'cash' || type === 'currency') return 0.65;
    return 0.65;
  };

  const profitableAssets: ProfitableAsset[] = useMemo(() => {
    return holdings
      .map(holding => {
        const totalCost = holding.purchase_price * holding.quantity;
        const currentValue = holding.current_price * holding.quantity;
        const profit = currentValue - totalCost;
        const profitPercent = (profit / totalCost) * 100;

        const inflationRate = getInflationRate(holding.asset_type);
        const inflationAdjustedCost = totalCost * (1 + inflationRate);
        const realProfit = currentValue - inflationAdjustedCost;

        const withdrawableProfit = Math.max(0, realProfit);

        return {
          holding,
          totalCost,
          currentValue,
          profit,
          profitPercent,
          withdrawableProfit,
        };
      })
      .filter(asset => asset.withdrawableProfit > 0)
      .sort((a, b) => b.profitPercent - a.profitPercent);
  }, [holdings]);

  const totalWithdrawableProfit = useMemo(() => {
    if (selectedAssets.size === 0) {
      return profitableAssets.reduce((sum, asset) => sum + asset.withdrawableProfit, 0);
    }
    return profitableAssets
      .filter(asset => selectedAssets.has(asset.holding.id))
      .reduce((sum, asset) => sum + asset.withdrawableProfit, 0);
  }, [profitableAssets, selectedAssets]);

  const toggleAssetSelection = (assetId: string) => {
    const newSelected = new Set(selectedAssets);
    if (newSelected.has(assetId)) {
      newSelected.delete(assetId);
    } else {
      newSelected.add(assetId);
    }
    setSelectedAssets(newSelected);
  };

  const selectAll = () => {
    setSelectedAssets(new Set(profitableAssets.map(a => a.holding.id)));
  };

  const deselectAll = () => {
    setSelectedAssets(new Set());
  };

  const handleQuickWithdraw = async () => {
    if (totalWithdrawableProfit <= 0) {
      toast.error('Çekilebilir kar bulunmuyor');
      return;
    }

    const confirmMessage = selectedAssets.size > 0
      ? `${selectedAssets.size} varlıktan toplam ${formatCurrency(totalWithdrawableProfit)} kar çekmek istediğinize emin misiniz?`
      : `Tüm varlıklardan toplam ${formatCurrency(totalWithdrawableProfit)} kar çekmek istediğinize emin misiniz?`;

    if (!confirm(confirmMessage)) return;

    setLoading(true);
    try {
      const success = await updateCashBalance(
        'TRY',
        totalWithdrawableProfit,
        'withdrawal',
        `Hızlı kar çekimi - ${selectedAssets.size > 0 ? selectedAssets.size : profitableAssets.length} varlık`
      );

      if (success) {
        toast.success(`Başarıyla ${formatCurrency(totalWithdrawableProfit)} kar çekildi!`);
        setSelectedAssets(new Set());
        onWithdrawalComplete();
      } else {
        toast.error('İşlem başarısız oldu');
      }
    } catch (error) {
      console.error('Withdrawal error:', error);
      toast.error('Bir hata oluştu');
    } finally {
      setLoading(false);
    }
  };

  if (profitableAssets.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 border border-slate-200 dark:border-gray-700">
        <div className="flex items-center gap-3 mb-4">
          <Zap className="text-amber-500" size={24} />
          <h3 className="text-xl font-bold text-slate-800 dark:text-white">Hızlı Kar Çekimi</h3>
        </div>
        <div className="text-center py-8">
          <AlertTriangle className="mx-auto mb-3 text-slate-400" size={48} />
          <p className="text-slate-600 dark:text-slate-400">Şu anda çekilebilir kar bulunmuyor</p>
          <p className="text-sm text-slate-500 dark:text-slate-500 mt-2">
            Varlıklarınız enflasyon ayarlı maliyetin üzerinde kar ettiğinde burada görünecek
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 border border-slate-200 dark:border-gray-700">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Zap className="text-amber-500" size={24} />
          <div>
            <h3 className="text-xl font-bold text-slate-800 dark:text-white">Hızlı Kar Çekimi</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400">Enflasyon ayarlı kar hesaplaması</p>
          </div>
        </div>
        <button
          onClick={() => setShowDetails(!showDetails)}
          className="text-blue-600 dark:text-blue-400 hover:underline text-sm font-medium"
        >
          {showDetails ? 'Detayları Gizle' : 'Detayları Göster'}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-800/20 rounded-lg p-4 border border-green-200 dark:border-green-800">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="text-green-600 dark:text-green-400" size={20} />
            <span className="text-sm font-medium text-green-700 dark:text-green-300">Toplam Kar</span>
          </div>
          <p className="text-2xl font-bold text-green-800 dark:text-green-200">
            {formatCurrency(totalWithdrawableProfit)}
          </p>
          <p className="text-xs text-green-600 dark:text-green-400 mt-1">
            {profitableAssets.length} varlık
          </p>
        </div>

        <div className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 rounded-lg p-4 border border-blue-200 dark:border-blue-800">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className="text-blue-600 dark:text-blue-400" size={20} />
            <span className="text-sm font-medium text-blue-700 dark:text-blue-300">Ortalama Getiri</span>
          </div>
          <p className="text-2xl font-bold text-blue-800 dark:text-blue-200">
            {(profitableAssets.reduce((sum, a) => sum + a.profitPercent, 0) / profitableAssets.length).toFixed(1)}%
          </p>
          <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
            En yüksek: {profitableAssets[0]?.profitPercent.toFixed(1)}%
          </p>
        </div>

        <div className="bg-gradient-to-br from-amber-50 to-amber-100 dark:from-amber-900/20 dark:to-amber-800/20 rounded-lg p-4 border border-amber-200 dark:border-amber-800">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle className="text-amber-600 dark:text-amber-400" size={20} />
            <span className="text-sm font-medium text-amber-700 dark:text-amber-300">Seçili Tutar</span>
          </div>
          <p className="text-2xl font-bold text-amber-800 dark:text-amber-200">
            {formatCurrency(totalWithdrawableProfit)}
          </p>
          <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
            {selectedAssets.size > 0 ? `${selectedAssets.size} varlık seçili` : 'Tümü seçili'}
          </p>
        </div>
      </div>

      {showDetails && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-semibold text-slate-700 dark:text-slate-300">Karlı Varlıklar</h4>
            <div className="flex gap-2">
              <button
                onClick={selectAll}
                className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
              >
                Tümünü Seç
              </button>
              <button
                onClick={deselectAll}
                className="text-xs text-slate-600 dark:text-slate-400 hover:underline"
              >
                Temizle
              </button>
            </div>
          </div>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {profitableAssets.map(asset => (
              <div
                key={asset.holding.id}
                onClick={() => toggleAssetSelection(asset.holding.id)}
                className={`p-3 rounded-lg border cursor-pointer transition-all ${
                  selectedAssets.size === 0 || selectedAssets.has(asset.holding.id)
                    ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
                    : 'bg-slate-50 dark:bg-slate-700/50 border-slate-200 dark:border-slate-600 opacity-50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={selectedAssets.size === 0 || selectedAssets.has(asset.holding.id)}
                        onChange={() => {}}
                        className="cursor-pointer"
                      />
                      <span className="font-semibold text-slate-800 dark:text-white">
                        {asset.holding.symbol}
                      </span>
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        {asset.holding.asset_type}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-400 ml-6">
                      {asset.holding.quantity} adet × {formatPrice(asset.holding.current_price, asset.holding.currency || 'TRY')}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-green-600 dark:text-green-400">
                      +{formatCurrency(asset.withdrawableProfit)}
                    </p>
                    <p className="text-xs text-green-600 dark:text-green-400">
                      %{asset.profitPercent.toFixed(2)}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <button
        onClick={handleQuickWithdraw}
        disabled={loading || totalWithdrawableProfit <= 0}
        className="w-full bg-gradient-to-r from-green-600 to-green-500 hover:from-green-700 hover:to-green-600
                 text-white font-bold py-4 rounded-lg transition-all transform hover:scale-[1.02]
                 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100
                 flex items-center justify-center gap-2 shadow-lg"
      >
        {loading ? (
          <span>İşleniyor...</span>
        ) : (
          <>
            <Zap size={20} />
            <span>Hızlı Kar Çek</span>
            <ArrowRight size={20} />
            <span className="font-bold">{formatCurrency(totalWithdrawableProfit)}</span>
          </>
        )}
      </button>

      <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
        <div className="flex items-start gap-2">
          <AlertTriangle className="text-blue-600 dark:text-blue-400 mt-0.5" size={16} />
          <div className="text-xs text-blue-700 dark:text-blue-300">
            <p className="font-semibold mb-1">Nasıl Hesaplanıyor?</p>
            <p>Enflasyon oranları: Hisse %15, Döviz/Nakit %65, Kripto/Altın %0</p>
            <p className="mt-1">Sadece enflasyon ayarlı maliyetin üzerindeki kar çekilebilir.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
