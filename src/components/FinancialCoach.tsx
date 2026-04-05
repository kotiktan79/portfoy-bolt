import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Brain, TrendingUp, TrendingDown, AlertTriangle, Shield,
  Target, ArrowRight, ChevronDown, ChevronUp, Sparkles,
  RefreshCw, Wallet, Calendar, DollarSign, PiggyBank,
  CheckCircle, XCircle, ArrowUpRight, ArrowDownRight, Zap
} from 'lucide-react';
import { Holding } from '../lib/supabase';
import { formatCurrency } from '../services/priceService';

interface FinancialCoachProps {
  holdings: Holding[];
  totalValue: number;
  totalInvestment: number;
  totalProfitLoss: number;
  totalProfitLossPercent: number;
  totalCashValue: number;
}

interface ActionItem {
  priority: 'urgent' | 'important' | 'suggestion';
  icon: 'sell' | 'buy' | 'rebalance' | 'warning' | 'cash' | 'goal';
  title: string;
  description: string;
  amount?: string;
  route?: string;
}

interface WithdrawalPlan {
  safeMonthly: number;
  moderateMonthly: number;
  aggressiveMonthly: number;
  portfolioLifeYears: number;
  monthlyFromProfits: number;
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 6) return 'İyi geceler';
  if (hour < 12) return 'Günaydın';
  if (hour < 18) return 'İyi günler';
  return 'İyi akşamlar';
}

function getDateStr(): string {
  return new Date().toLocaleDateString('tr-TR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

export function FinancialCoach({ holdings, totalValue, totalInvestment, totalProfitLoss, totalProfitLossPercent, totalCashValue }: FinancialCoachProps) {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(true);
  const hasRunRef = useRef(false);

  const investmentHoldings = useMemo(() => holdings.filter(h => h.asset_type !== 'cash'), [holdings]);
  const grandTotal = totalValue + totalCashValue;

  // ── Action Items ──────────────────────────────────────────
  const actionItems = useMemo((): ActionItem[] => {
    if (investmentHoldings.length === 0) return [];
    const items: ActionItem[] = [];

    // Calculate per-holding stats
    const holdingStats = investmentHoldings.map(h => {
      const value = h.current_price * h.quantity;
      const invested = h.purchase_price * h.quantity;
      const pnl = value - invested;
      const pnlPct = invested > 0 ? (pnl / invested) * 100 : 0;
      const weight = totalValue > 0 ? (value / totalValue) * 100 : 0;
      return { ...h, value, invested, pnl, pnlPct, weight };
    });

    const sorted = [...holdingStats].sort((a, b) => b.value - a.value);
    const winners = holdingStats.filter(h => h.pnlPct > 0).sort((a, b) => b.pnlPct - a.pnlPct);
    const losers = holdingStats.filter(h => h.pnlPct < 0).sort((a, b) => a.pnlPct - b.pnlPct);
    const assetTypes = new Set(investmentHoldings.map(h => h.asset_type));

    // 1. URGENT: Big losers (>20% loss)
    const bigLosers = losers.filter(l => l.pnlPct < -20);
    if (bigLosers.length > 0) {
      items.push({
        priority: 'urgent',
        icon: 'warning',
        title: `${bigLosers[0].symbol} %${Math.abs(bigLosers[0].pnlPct).toFixed(0)} zararda`,
        description: `Stop-loss belirleyin veya pozisyonu kapatmayı değerlendirin. Zarar: ${formatCurrency(Math.abs(bigLosers[0].pnl))} ₺`,
        amount: `-${formatCurrency(Math.abs(bigLosers[0].pnl))} ₺`,
      });
    }

    // 2. URGENT: Over-concentration (>40%)
    if (sorted.length > 0 && sorted[0].weight > 40) {
      items.push({
        priority: 'urgent',
        icon: 'rebalance',
        title: `${sorted[0].symbol} portföyün %${sorted[0].weight.toFixed(0)}'i`,
        description: `Tek varlık riski çok yüksek. %20-25'e düşürmek için ${formatCurrency(sorted[0].value * 0.4)} ₺ satış yapabilirsiniz.`,
        amount: `${formatCurrency(sorted[0].value * 0.4)} ₺ sat`,
        route: '/rebalancing',
      });
    }

    // 3. IMPORTANT: Take profit (>50% gain)
    const bigWinners = winners.filter(w => w.pnlPct > 50);
    if (bigWinners.length > 0) {
      const profitToTake = bigWinners[0].pnl * 0.3; // Suggest taking 30% of profit
      items.push({
        priority: 'important',
        icon: 'sell',
        title: `${bigWinners[0].symbol}'den kâr al (%+${bigWinners[0].pnlPct.toFixed(0)})`,
        description: `Kârın %30'unu realize edin. Önerilen satış: ${formatCurrency(profitToTake)} ₺ değerinde`,
        amount: `+${formatCurrency(profitToTake)} ₺`,
      });
    }

    // 4. IMPORTANT: Low diversification
    if (assetTypes.size < 3 && investmentHoldings.length >= 3) {
      const missing = [];
      if (!assetTypes.has('stock')) missing.push('hisse');
      if (!assetTypes.has('crypto')) missing.push('kripto');
      if (!assetTypes.has('commodity')) missing.push('altın/emtia');
      items.push({
        priority: 'important',
        icon: 'buy',
        title: 'Portföyü çeşitlendirin',
        description: `Sadece ${assetTypes.size} varlık türünüz var. ${missing.slice(0, 2).join(' ve ')} ekleyin.`,
        route: '/watchlist',
      });
    }

    // 5. SUGGESTION: Cash too high
    if (totalCashValue > 0 && grandTotal > 0) {
      const cashRatio = (totalCashValue / grandTotal) * 100;
      if (cashRatio > 30) {
        items.push({
          priority: 'suggestion',
          icon: 'cash',
          title: `Nakit oranı yüksek (%${cashRatio.toFixed(0)})`,
          description: `${formatCurrency(totalCashValue)} ₺ nakit bekliyor. Enflasyona karşı yatırıma yönlendirin.`,
          amount: `${formatCurrency(totalCashValue * 0.5)} ₺ yatır`,
        });
      }
    }

    // 6. SUGGESTION: Portfolio performing well
    if (totalProfitLossPercent > 20 && items.filter(i => i.priority === 'urgent').length === 0) {
      items.push({
        priority: 'suggestion',
        icon: 'goal',
        title: `Portföy %${totalProfitLossPercent.toFixed(0)} kârda - harika!`,
        description: 'Hedeflerinizi gözden geçirin ve kâr realizasyonu stratejisi belirleyin.',
      });
    }

    // 7. SUGGESTION: Buy opportunity for losers with small loss
    const smallLosers = losers.filter(l => l.pnlPct > -10 && l.pnlPct < -3);
    if (smallLosers.length > 0 && totalCashValue > 0) {
      items.push({
        priority: 'suggestion',
        icon: 'buy',
        title: `${smallLosers[0].symbol} maliyeti düşürme fırsatı`,
        description: `%${Math.abs(smallLosers[0].pnlPct).toFixed(1)} düşüşte. Ek alım yaparak ortalama maliyeti düşürebilirsiniz.`,
      });
    }

    return items;
  }, [investmentHoldings, totalValue, totalCashValue, totalProfitLoss, totalProfitLossPercent, grandTotal]);

  // ── Withdrawal Plan ───────────────────────────────────────
  const withdrawalPlan = useMemo((): WithdrawalPlan | null => {
    if (grandTotal <= 0) return null;

    const monthlyProfitRate = totalProfitLossPercent > 0
      ? (totalProfitLossPercent / 12) / 100
      : 0;

    const monthlyFromProfits = grandTotal * monthlyProfitRate;

    // Safe: 2% annual withdrawal (very conservative)
    const safeMonthly = grandTotal * 0.02 / 12;
    // Moderate: 4% annual (standard retirement rule)
    const moderateMonthly = grandTotal * 0.04 / 12;
    // Aggressive: 7% annual
    const aggressiveMonthly = grandTotal * 0.07 / 12;

    // How long portfolio lasts at moderate withdrawal (simplified)
    const portfolioLifeYears = moderateMonthly > 0
      ? grandTotal / (moderateMonthly * 12)
      : 999;

    return { safeMonthly, moderateMonthly, aggressiveMonthly, portfolioLifeYears, monthlyFromProfits };
  }, [grandTotal, totalProfitLossPercent]);

  // ── Portfolio Health Score ────────────────────────────────
  const healthScore = useMemo(() => {
    if (investmentHoldings.length === 0) return { score: 0, grade: '-', color: 'text-gray-400' };

    let score = 50; // Base

    // Diversification (+20)
    const types = new Set(investmentHoldings.map(h => h.asset_type));
    score += Math.min(types.size * 5, 20);

    // Number of holdings (+10)
    score += Math.min(investmentHoldings.length * 2, 10);

    // Concentration penalty (-15)
    if (totalValue > 0) {
      const maxWeight = Math.max(...investmentHoldings.map(h => (h.current_price * h.quantity) / totalValue * 100));
      if (maxWeight > 40) score -= 15;
      else if (maxWeight > 25) score -= 5;
    }

    // Profit bonus (+15)
    if (totalProfitLossPercent > 10) score += 15;
    else if (totalProfitLossPercent > 0) score += 5;
    else if (totalProfitLossPercent < -10) score -= 10;

    // Cash cushion (+5)
    if (totalCashValue > grandTotal * 0.05) score += 5;

    score = Math.max(0, Math.min(100, score));
    const grade = score >= 85 ? 'A+' : score >= 75 ? 'A' : score >= 65 ? 'B+' : score >= 55 ? 'B' : score >= 40 ? 'C' : 'D';
    const color = score >= 75 ? 'text-green-500' : score >= 55 ? 'text-blue-500' : score >= 40 ? 'text-yellow-500' : 'text-red-500';

    return { score, grade, color };
  }, [investmentHoldings, totalValue, totalProfitLossPercent, totalCashValue, grandTotal]);

  if (investmentHoldings.length === 0) return null;

  const urgentCount = actionItems.filter(i => i.priority === 'urgent').length;
  const importantCount = actionItems.filter(i => i.priority === 'important').length;

  const priorityIcons = {
    sell: <ArrowDownRight size={16} className="text-red-500" />,
    buy: <ArrowUpRight size={16} className="text-green-500" />,
    rebalance: <RefreshCw size={16} className="text-blue-500" />,
    warning: <AlertTriangle size={16} className="text-red-500" />,
    cash: <Wallet size={16} className="text-amber-500" />,
    goal: <Target size={16} className="text-purple-500" />,
  };

  const priorityBg = {
    urgent: 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900',
    important: 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900',
    suggestion: 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-900',
  };

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-gray-800 overflow-hidden bg-white dark:bg-gray-900">
      {/* Header */}
      <div
        className="p-4 md:p-5 cursor-pointer hover:bg-slate-50 dark:hover:bg-gray-800/50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl shadow-lg flex-shrink-0">
            <Brain className="text-white" size={20} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-bold text-gray-900 dark:text-white">
                {getGreeting()}!
              </h3>
              <span className="text-xs text-gray-400 dark:text-gray-500">{getDateStr()}</span>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              {urgentCount > 0
                ? `${urgentCount} acil aksiyon gerekiyor`
                : importantCount > 0
                ? `${importantCount} öneri var`
                : 'Portföyünüz dengeli görünüyor'}
            </p>
          </div>

          {/* Health Score */}
          <div className="flex items-center gap-3 flex-shrink-0">
            <div className="text-center">
              <div className={`text-xl font-black ${healthScore.color}`}>{healthScore.grade}</div>
              <div className="text-[9px] text-gray-400 uppercase tracking-wider">skor</div>
            </div>
            {expanded ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
          </div>
        </div>
      </div>

      {expanded && (
        <div className="px-4 md:px-5 pb-4 md:pb-5 space-y-4">

          {/* Action Items */}
          {actionItems.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Yapmanız Gerekenler</h4>
              {actionItems.slice(0, 4).map((item, i) => (
                <div key={i} className={`flex items-start gap-3 p-3 rounded-xl border ${priorityBg[item.priority]}`}>
                  <div className="mt-0.5 flex-shrink-0">{priorityIcons[item.icon]}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{item.title}</p>
                      {item.amount && (
                        <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                          item.amount.startsWith('+') ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400' :
                          item.amount.startsWith('-') ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400' :
                          'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400'
                        }`}>
                          {item.amount}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">{item.description}</p>
                  </div>
                  {item.route && (
                    <button
                      onClick={(e) => { e.stopPropagation(); navigate(item.route!); }}
                      className="flex-shrink-0 p-1.5 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/30 rounded-lg transition-colors"
                    >
                      <ArrowRight size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Monthly Withdrawal Plan */}
          {withdrawalPlan && grandTotal > 10000 && (
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                <PiggyBank size={12} />
                Aylık Çekilebilir Tutar
              </h4>
              <div className="grid grid-cols-3 gap-2">
                <div className="p-3 rounded-xl bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900 text-center">
                  <div className="text-[10px] text-green-600 dark:text-green-400 font-semibold mb-1">Güvenli</div>
                  <div className="text-sm font-bold text-green-700 dark:text-green-300">{formatCurrency(withdrawalPlan.safeMonthly)} ₺</div>
                  <div className="text-[9px] text-green-500">yıllık %2</div>
                </div>
                <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 text-center">
                  <div className="text-[10px] text-blue-600 dark:text-blue-400 font-semibold mb-1">Dengeli</div>
                  <div className="text-sm font-bold text-blue-700 dark:text-blue-300">{formatCurrency(withdrawalPlan.moderateMonthly)} ₺</div>
                  <div className="text-[9px] text-blue-500">yıllık %4</div>
                </div>
                <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 text-center">
                  <div className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold mb-1">Agresif</div>
                  <div className="text-sm font-bold text-amber-700 dark:text-amber-300">{formatCurrency(withdrawalPlan.aggressiveMonthly)} ₺</div>
                  <div className="text-[9px] text-amber-500">yıllık %7</div>
                </div>
              </div>
              {withdrawalPlan.monthlyFromProfits > 0 && (
                <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
                  <Sparkles size={11} />
                  Mevcut kâr hızıyla aylık ~{formatCurrency(withdrawalPlan.monthlyFromProfits)} ₺ kazanıyorsunuz
                </p>
              )}
              {withdrawalPlan.portfolioLifeYears < 50 && (
                <p className="text-xs text-gray-400">
                  Dengeli çekimle portföy ~{withdrawalPlan.portfolioLifeYears.toFixed(0)} yıl dayanır
                </p>
              )}
            </div>
          )}

          {/* Quick Summary */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-gray-800 text-center">
              <div className="text-[10px] text-gray-400 mb-0.5">Portföy</div>
              <div className="text-sm font-bold text-gray-900 dark:text-white">{formatCurrency(grandTotal)} ₺</div>
            </div>
            <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-gray-800 text-center">
              <div className="text-[10px] text-gray-400 mb-0.5">K/Z</div>
              <div className={`text-sm font-bold ${totalProfitLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {totalProfitLoss >= 0 ? '+' : ''}{formatCurrency(totalProfitLoss)} ₺
              </div>
            </div>
            <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-gray-800 text-center">
              <div className="text-[10px] text-gray-400 mb-0.5">Nakit</div>
              <div className="text-sm font-bold text-gray-900 dark:text-white">{formatCurrency(totalCashValue)} ₺</div>
            </div>
            <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-gray-800 text-center">
              <div className="text-[10px] text-gray-400 mb-0.5">Varlık</div>
              <div className="text-sm font-bold text-gray-900 dark:text-white">{investmentHoldings.length} adet</div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="flex gap-2 overflow-x-auto pb-1">
            <button onClick={() => navigate('/ai-advisor')} className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 text-white rounded-lg text-xs font-semibold hover:bg-indigo-700 transition-colors whitespace-nowrap">
              <Brain size={13} /> AI'a Sor
            </button>
            <button onClick={() => navigate('/market')} className="flex items-center gap-1.5 px-3 py-2 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg text-xs font-semibold border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors whitespace-nowrap">
              <TrendingUp size={13} /> Piyasa
            </button>
            <button onClick={() => navigate('/rebalancing')} className="flex items-center gap-1.5 px-3 py-2 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg text-xs font-semibold border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors whitespace-nowrap">
              <RefreshCw size={13} /> Rebalance
            </button>
            <button onClick={() => navigate('/watchlist')} className="flex items-center gap-1.5 px-3 py-2 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg text-xs font-semibold border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors whitespace-nowrap">
              <Target size={13} /> İzleme
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
