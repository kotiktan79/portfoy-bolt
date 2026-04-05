import { useState, useMemo, useEffect } from 'react';
import { DollarSign, TrendingUp, AlertCircle, CheckCircle, Wallet, Calendar } from 'lucide-react';
import { Holding, supabase } from '../lib/supabase';
import { formatCurrency, formatPercentage } from '../services/priceService';

interface WithdrawalCalculatorProps {
  holdings: Holding[];
}

interface WithdrawableAsset {
  holding: Holding;
  currentValue: number;
  profit: number;
  profitPercent: number;
  maxWithdrawable: number;
  recommendedWithdraw: number;
  canWithdraw: boolean;
}

export function WithdrawalCalculator({ holdings }: WithdrawalCalculatorProps) {
  const [targetAmount, setTargetAmount] = useState('');
  const [strategy, setStrategy] = useState<'sustainable' | 'profit-only' | 'balanced' | 'aggressive'>('sustainable');
  const [monthlyWithdrawals, setMonthlyWithdrawals] = useState(0);

  const currentDate = new Date();
  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth() + 1;
  const monthName = currentDate.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' });

  useEffect(() => {
    fetchMonthlyWithdrawals();
  }, []);

  async function fetchMonthlyWithdrawals() {
    try {
      const { data, error } = await supabase
        .from('monthly_withdrawals')
        .select('amount')
        .eq('year', currentYear)
        .eq('month', currentMonth);

      if (error) throw error;

      const total = data?.reduce((sum, w) => sum + parseFloat(w.amount.toString()), 0) || 0;
      setMonthlyWithdrawals(total);
    } catch (error) {
      console.error('Error fetching monthly withdrawals:', error);
    }
  }

  const getInflationRate = (assetType: string): number => {
    const type = assetType.toLowerCase();
    if (type === 'crypto') return 0;
    if (type === 'stock') return 0.15;
    if (type === 'gold') return 0;
    if (type === 'cash' || type === 'currency') return 0.65;
    return 0.65;
  };

  const totalPortfolioValue = useMemo(() => {
    return holdings.reduce((sum, h) => sum + (h.current_price * h.quantity), 0);
  }, [holdings]);

  const inflationAdjustedCost = useMemo(() => {
    return holdings.reduce((sum, h) => {
      const cost = h.purchase_price * h.quantity;
      const inflation = getInflationRate(h.asset_type);
      return sum + (cost * (1 + inflation));
    }, 0);
  }, [holdings]);

  const annualSafeWithdrawal = totalPortfolioValue * 0.04;
  const monthlySafeWithdrawal = annualSafeWithdrawal / 12;
  const realProfit = totalPortfolioValue - inflationAdjustedCost;

  const withdrawableAssets: WithdrawableAsset[] = useMemo(() => {
    return holdings.map(holding => {
      const cost = holding.purchase_price * holding.quantity;
      const currentValue = holding.current_price * holding.quantity;
      const profit = currentValue - cost;
      const profitPercent = (profit / cost) * 100;

      const holdingInflationRate = getInflationRate(holding.asset_type);
      const inflationAdjustedHoldingCost = cost * (1 + holdingInflationRate);
      const realHoldingProfit = currentValue - inflationAdjustedHoldingCost;

      let maxWithdrawable = 0;
      let recommendedWithdraw = 0;
      let canWithdraw = false;

      switch (strategy) {
        case 'sustainable':
          const annualSafeForAsset = currentValue * 0.04;
          const monthlySafeForAsset = annualSafeForAsset / 12;
          maxWithdrawable = Math.max(0, realHoldingProfit > 0 ? monthlySafeForAsset : 0);
          recommendedWithdraw = maxWithdrawable;
          canWithdraw = realHoldingProfit > 0;
          break;

        case 'profit-only':
          if (profit > 0) {
            canWithdraw = true;
            maxWithdrawable = profit;
            recommendedWithdraw = profit * 0.5;
          }
          break;

        case 'balanced':
          if (profit > 0) {
            canWithdraw = true;
            maxWithdrawable = profit + (cost * 0.3);
            recommendedWithdraw = profit * 0.7;
          }
          break;

        case 'aggressive':
          if (profit > 0) {
            canWithdraw = true;
            maxWithdrawable = currentValue * 0.8;
            recommendedWithdraw = profit;
          }
          break;
      }

      return {
        holding,
        currentValue,
        profit,
        profitPercent,
        maxWithdrawable,
        recommendedWithdraw,
        canWithdraw,
      };
    }).filter(asset => asset.canWithdraw);
  }, [holdings, strategy]);

  const totalWithdrawable = withdrawableAssets.reduce((sum, asset) => sum + asset.maxWithdrawable, 0);
  const totalRecommended = withdrawableAssets.reduce((sum, asset) => sum + asset.recommendedWithdraw, 0);
  const remainingWithdrawable = totalWithdrawable - monthlyWithdrawals;

  const withdrawalPlan = useMemo(() => {
    const target = parseFloat(targetAmount || '0');
    if (target <= 0 || withdrawableAssets.length === 0) return [];

    const plan = withdrawableAssets.map(asset => ({
      ...asset,
      withdrawAmount: 0,
      withdrawQuantity: 0,
      remainingQuantity: asset.holding.quantity,
    }));

    let remaining = target;

    const profitableAssets = plan
      .filter(a => a.profit > 0)
      .sort((a, b) => b.profitPercent - a.profitPercent);

    for (const asset of profitableAssets) {
      if (remaining <= 0) break;

      const canWithdraw = Math.min(remaining, asset.maxWithdrawable);
      const withdrawQuantity = canWithdraw / asset.holding.current_price;

      asset.withdrawAmount = canWithdraw;
      asset.withdrawQuantity = withdrawQuantity;
      asset.remainingQuantity = asset.holding.quantity - withdrawQuantity;
      remaining -= canWithdraw;
    }

    return plan.filter(p => p.withdrawAmount > 0);
  }, [targetAmount, withdrawableAssets]);

  const targetValue = parseFloat(targetAmount || '0');
  const canAchieveTarget = targetValue <= remainingWithdrawable;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="bg-gradient-to-r from-teal-500 to-cyan-600 p-6 text-white">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-3 bg-white bg-opacity-20 rounded-lg">
            <Wallet size={28} />
          </div>
          <div>
            <h2 className="text-2xl font-bold">Sürdürülebilir Maaş Hesaplayıcı</h2>
            <p className="text-cyan-100 text-sm">Enflasyon korumalı, uzun vadeli çekim stratejisi</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-4">
          <div className="bg-white bg-opacity-10 backdrop-blur-sm p-4 rounded-lg">
            <p className="text-cyan-100 text-sm mb-1">Toplam Çekilebilir</p>
            <p className="text-2xl font-bold">{formatCurrency(totalWithdrawable)} ₺</p>
          </div>
          <div className="bg-white bg-opacity-10 backdrop-blur-sm p-4 rounded-lg">
            <p className="text-cyan-100 text-sm mb-1">Önerilen Miktar</p>
            <p className="text-2xl font-bold">{formatCurrency(totalRecommended)} ₺</p>
          </div>
          <div className="bg-white bg-opacity-10 backdrop-blur-sm p-4 rounded-lg">
            <div className="flex items-center gap-2 mb-1">
              <Calendar size={14} />
              <p className="text-cyan-100 text-sm">{monthName}</p>
            </div>
            <p className="text-2xl font-bold">{formatCurrency(monthlyWithdrawals)} ₺</p>
            <p className="text-cyan-100 text-xs mt-1">Bu ay çekilen</p>
          </div>
          <div className="bg-white bg-opacity-10 backdrop-blur-sm p-4 rounded-lg">
            <p className="text-cyan-100 text-sm mb-1">Kalan Çekilebilir</p>
            <p className={`text-2xl font-bold ${remainingWithdrawable < 0 ? 'text-red-200' : ''}`}>
              {formatCurrency(Math.max(0, remainingWithdrawable))} ₺
            </p>
            <p className="text-cyan-100 text-xs mt-1">Bu ay için</p>
          </div>
        </div>
      </div>

      <div className="p-6 space-y-6">
        <div className="bg-gradient-to-br from-blue-50 to-cyan-50 border-2 border-blue-200 rounded-lg p-5 mb-6">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-blue-500 rounded-lg">
              <TrendingUp className="text-white" size={20} />
            </div>
            <div className="flex-1">
              <h3 className="font-bold text-gray-900 mb-2">Sürdürülebilirlik Bilgisi</h3>
              <div className="space-y-2 text-sm text-gray-700">
                <p>
                  <span className="font-semibold">Portföy Değeri:</span> {formatCurrency(totalPortfolioValue)} ₺
                </p>
                <p>
                  <span className="font-semibold">Enflasyon Koruması:</span> Kripto %0, Hisse %15, Altın %0, TL %65
                </p>
                <p>
                  <span className="font-semibold">Real Kar:</span> {formatCurrency(realProfit)} ₺ {' '}
                  <span className="text-xs text-gray-500">(Varlık tipine göre enflasyon düşüldü)</span>
                </p>
                <p>
                  <span className="font-semibold">Güvenli Yıllık Çekim (4% Kuralı):</span> {formatCurrency(annualSafeWithdrawal)} ₺
                </p>
                <p className="pt-2 border-t border-blue-200">
                  <span className="font-semibold text-teal-700">Aylık Sürdürülebilir Limit:</span>{' '}
                  <span className="text-xl font-bold text-teal-600">{formatCurrency(monthlySafeWithdrawal)} ₺</span>
                </p>
              </div>
            </div>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-3">
            Çekim Stratejisi
          </label>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <button
              onClick={() => setStrategy('sustainable')}
              className={`p-4 rounded-lg border-2 transition-all text-left ${
                strategy === 'sustainable'
                  ? 'border-teal-500 bg-teal-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="font-semibold text-gray-900 mb-1">Sürdürülebilir ⭐</div>
              <div className="text-xs text-gray-600">4% kuralı + enflasyon koruması</div>
            </button>
            <button
              onClick={() => setStrategy('profit-only')}
              className={`p-4 rounded-lg border-2 transition-all text-left ${
                strategy === 'profit-only'
                  ? 'border-teal-500 bg-teal-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="font-semibold text-gray-900 mb-1">Sadece Kar</div>
              <div className="text-xs text-gray-600">Anaparayı korur, sadece kardan çeker</div>
            </button>
            <button
              onClick={() => setStrategy('balanced')}
              className={`p-4 rounded-lg border-2 transition-all text-left ${
                strategy === 'balanced'
                  ? 'border-teal-500 bg-teal-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="font-semibold text-gray-900 mb-1">Dengeli</div>
              <div className="text-xs text-gray-600">Kar + Anaparanın %30'u çekilebilir</div>
            </button>
            <button
              onClick={() => setStrategy('aggressive')}
              className={`p-4 rounded-lg border-2 transition-all text-left ${
                strategy === 'aggressive'
                  ? 'border-teal-500 bg-teal-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="font-semibold text-gray-900 mb-1">Agresif</div>
              <div className="text-xs text-gray-600">Toplam değerin %80'ine kadar</div>
            </button>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Hedef Çekim Miktarı (₺)
          </label>
          <input
            type="number"
            step="100"
            value={targetAmount}
            onChange={(e) => setTargetAmount(e.target.value)}
            placeholder="Örn: 10000"
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-lg"
          />
          {targetValue > 0 && (
            <div className={`mt-2 p-3 rounded-lg flex items-center gap-2 ${
              canAchieveTarget ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
            }`}>
              {canAchieveTarget ? (
                <>
                  <CheckCircle size={18} />
                  <span className="text-sm font-medium">Bu miktar çekilebilir!</span>
                </>
              ) : (
                <>
                  <AlertCircle size={18} />
                  <span className="text-sm font-medium">
                    Bu ay için yetersiz! Kalan çekilebilir: {formatCurrency(Math.max(0, remainingWithdrawable))} ₺
                  </span>
                </>
              )}
            </div>
          )}
        </div>

        {withdrawalPlan.length > 0 && (
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-3">Önerilen Çekim Planı</h3>
            <div className="space-y-3">
              {withdrawalPlan.map((plan) => (
                <div
                  key={plan.holding.id}
                  className="p-4 bg-gradient-to-r from-slate-50 to-gray-50 rounded-lg border border-slate-200"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <div className="font-semibold text-gray-900 text-lg">{plan.holding.symbol}</div>
                      <div className="text-sm text-gray-600">
                        Kar: {formatCurrency(plan.profit)} ₺ ({formatPercentage(plan.profitPercent)})
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-bold text-teal-600">
                        {formatCurrency(plan.withdrawAmount)} ₺
                      </div>
                      <div className="text-sm text-gray-600">
                        {formatCurrency(plan.withdrawQuantity, 8)} adet
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4 pt-3 border-t border-slate-200">
                    <div>
                      <div className="text-xs text-gray-500">Mevcut</div>
                      <div className="font-semibold text-gray-900">
                        {formatCurrency(plan.holding.quantity, 4)} adet
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500">Çekilecek</div>
                      <div className="font-semibold text-red-600">
                        -{formatCurrency(plan.withdrawQuantity, 4)} adet
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500">Kalacak</div>
                      <div className="font-semibold text-green-600">
                        {formatCurrency(plan.remainingQuantity, 4)} adet
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 p-4 bg-teal-50 border-2 border-teal-200 rounded-lg">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <DollarSign className="text-teal-600" size={24} />
                  <span className="font-semibold text-gray-900">Toplam Çekilecek Miktar</span>
                </div>
                <span className="text-2xl font-bold text-teal-600">
                  {formatCurrency(withdrawalPlan.reduce((sum, p) => sum + p.withdrawAmount, 0))} ₺
                </span>
              </div>
            </div>
          </div>
        )}

        {withdrawableAssets.length > 0 && !targetAmount && (
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-3">
              Varlık Başına Çekilebilir Miktar
            </h3>
            <div className="space-y-3">
              {withdrawableAssets.map((asset) => (
                <div
                  key={asset.holding.id}
                  className="p-4 bg-slate-50 rounded-lg border border-slate-200"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <div className="font-semibold text-gray-900">{asset.holding.symbol}</div>
                      <div className="text-sm text-gray-600">
                        Güncel Değer: {formatCurrency(asset.currentValue)} ₺
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm text-green-600 font-medium">
                        +{formatCurrency(asset.profit)} ₺ ({formatPercentage(asset.profitPercent)})
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 pt-3 border-t border-slate-200">
                    <div>
                      <div className="text-xs text-gray-500 mb-1">Maksimum Çekilebilir</div>
                      <div className="text-lg font-bold text-teal-600">
                        {formatCurrency(asset.maxWithdrawable)} ₺
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500 mb-1">Önerilen</div>
                      <div className="text-lg font-bold text-blue-600">
                        {formatCurrency(asset.recommendedWithdraw)} ₺
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {withdrawableAssets.length === 0 && (
          <div className="text-center py-12">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-gray-100 rounded-full mb-4">
              <AlertCircle className="text-gray-400" size={32} />
            </div>
            <p className="text-gray-600 font-medium">Henüz karlı varlık bulunmuyor</p>
            <p className="text-sm text-gray-500 mt-1">
              Varlıklarınız kar ettiğinde buradan çekim yapabilirsiniz
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
