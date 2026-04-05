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
  const [showAddMoney, setShowAddMoney] = useState(false);
  const [newMoneyAmount, setNewMoneyAmount] = useState('');
  const [allocationResult, setAllocationResult] = useState<string[] | null>(null);

  const investmentHoldings = useMemo(() => holdings.filter(h => h.asset_type !== 'cash'), [holdings]);
  const grandTotal = totalValue + totalCashValue;

  // ── Portfolio analysis data (shared between action items and allocation) ──
  const portfolioAnalysis = useMemo(() => {
    const holdingStats = investmentHoldings.map(h => {
      const value = h.current_price * h.quantity;
      const invested = h.purchase_price * h.quantity;
      const pnl = value - invested;
      const pnlPct = invested > 0 ? (pnl / invested) * 100 : 0;
      const weight = totalValue > 0 ? (value / totalValue) * 100 : 0;
      return { ...h, value, invested, pnl, pnlPct, weight };
    });

    const assetTypes = new Set(investmentHoldings.map(h => h.asset_type));
    const typeWeights: Record<string, number> = {};
    holdingStats.forEach(h => { typeWeights[h.asset_type] = (typeWeights[h.asset_type] || 0) + h.weight; });

    const STOCK_PICKS = ['THYAO', 'ASELS', 'BIMAS', 'SISE', 'KCHOL', 'TUPRS', 'GARAN', 'EREGL', 'TOASO', 'SAHOL'];
    const ownedSymbols = new Set(holdingStats.map(h => h.symbol));
    const availableStocks = STOCK_PICKS.filter(s => !ownedSymbols.has(s));
    const stockPick1 = availableStocks[0] || 'THYAO';
    const stockPick2 = availableStocks[1] || 'ASELS';
    const cryptoPick = (['BTC', 'ETH'].find(c => !ownedSymbols.has(c))) || 'BTC';

    return { holdingStats, assetTypes, typeWeights, stockPick1, stockPick2, cryptoPick };
  }, [investmentHoldings, totalValue]);

  // ── getFullAllocation (accessible outside useMemo) ────────
  const getFullAllocation = useMemo(() => {
    const { typeWeights, stockPick1, stockPick2 } = portfolioAnalysis;
    return (amount: number): string[] => {
      const lines: string[] = [];
      const stockWeight = Math.max(30, 50 - (typeWeights['stock'] || 0));
      const cryptoWeight = Math.max(5, 15 - (typeWeights['crypto'] || 0));
      const goldWeight = Math.max(10, 20 - (typeWeights['commodity'] || 0));
      const currencyWeight = Math.max(5, 15 - (typeWeights['currency'] || 0));
      const total = stockWeight + cryptoWeight + goldWeight + currencyWeight;

      if (stockWeight > 5) {
        const amt = amount * (stockWeight / total);
        lines.push(`📊 ${stockPick1}: ${formatCurrency(amt * 0.6)} ₺ + ${stockPick2}: ${formatCurrency(amt * 0.4)} ₺`);
      }
      if (goldWeight > 5) {
        lines.push(`🥇 ALTIN: ${formatCurrency(amount * (goldWeight / total))} ₺`);
      }
      if (cryptoWeight > 5) {
        const amt = amount * (cryptoWeight / total);
        lines.push(`₿ BTC: ${formatCurrency(amt * 0.7)} ₺ + ETH: ${formatCurrency(amt * 0.3)} ₺`);
      }
      if (currencyWeight > 5) {
        lines.push(`💵 USD: ${formatCurrency(amount * (currencyWeight / total))} ₺`);
      }
      return lines.length > 0 ? lines : [`${formatCurrency(amount)} ₺ dengeli dağıtın`];
    };
  }, [portfolioAnalysis]);

  // ── Action Items ──────────────────────────────────────────
  const actionItems = useMemo((): ActionItem[] => {
    if (investmentHoldings.length === 0) return [];
    const items: ActionItem[] = [];

    const { holdingStats, assetTypes, typeWeights, stockPick1, stockPick2, cryptoPick } = portfolioAnalysis;

    const sorted = [...holdingStats].sort((a, b) => b.value - a.value);
    const winners = holdingStats.filter(h => h.pnlPct > 0).sort((a, b) => b.pnlPct - a.pnlPct);
    const losers = holdingStats.filter(h => h.pnlPct < 0).sort((a, b) => a.pnlPct - b.pnlPct);

    function getBuyAlternative(amount: number, excludeType?: string): string {
      const parts: string[] = [];

      if (excludeType !== 'commodity' && (!assetTypes.has('commodity') || (typeWeights['commodity'] || 0) < 15)) {
        parts.push(`${formatCurrency(amount * 0.35)} ₺ ALTIN`);
      }
      if (excludeType !== 'stock' && (!assetTypes.has('stock') || (typeWeights['stock'] || 0) < 25)) {
        parts.push(`${formatCurrency(amount * 0.35)} ₺ ${stockPick1} + ${stockPick2}`);
      }
      if (excludeType !== 'crypto' && (!assetTypes.has('crypto') || (typeWeights['crypto'] || 0) < 10)) {
        parts.push(`${formatCurrency(amount * 0.2)} ₺ ${cryptoPick}`);
      }
      if (excludeType !== 'currency' && (!assetTypes.has('currency') || (typeWeights['currency'] || 0) < 10)) {
        parts.push(`${formatCurrency(amount * 0.1)} ₺ USD`);
      }

      if (parts.length === 0) {
        // Portfolio is well-diversified, suggest underweight assets
        const underweight = Object.entries(typeWeights).sort((a, b) => a[1] - b[1]);
        if (underweight.length > 0) {
          const typeName: Record<string, string> = { stock: stockPick1, crypto: cryptoPick, commodity: 'ALTIN', currency: 'USD' };
          return `${formatCurrency(amount)} ₺ ${typeName[underweight[0][0]] || underweight[0][0]} (en düşük ağırlık)`;
        }
        return `${formatCurrency(amount)} ₺ farklı varlıklara dağıtın`;
      }
      return parts.slice(0, 3).join(' + ');
    }

    // 1. URGENT: Big losers (>20% loss)
    const bigLosers = losers.filter(l => l.pnlPct < -20);
    if (bigLosers.length > 0) {
      const loser = bigLosers[0];
      const sellValue = loser.value;
      items.push({
        priority: 'urgent',
        icon: 'warning',
        title: `${loser.symbol} sat → alternatife yönlendir`,
        description: `%${Math.abs(loser.pnlPct).toFixed(0)} zararda (${formatCurrency(Math.abs(loser.pnl))} ₺). Satın ve yerine: ${getBuyAlternative(sellValue, loser.asset_type)}`,
        amount: `${formatCurrency(sellValue)} ₺`,
      });
    }

    // 2. URGENT: Over-concentration (>40%)
    if (sorted.length > 0 && sorted[0].weight > 40) {
      const top = sorted[0];
      const sellAmount = top.value * 0.4;
      items.push({
        priority: 'urgent',
        icon: 'rebalance',
        title: `${top.symbol}'den ${formatCurrency(sellAmount)} ₺ sat → dağıt`,
        description: `Portföyün %${top.weight.toFixed(0)}'i tek varlıkta. Satıp yerine: ${getBuyAlternative(sellAmount, top.asset_type)}`,
        amount: `${formatCurrency(sellAmount)} ₺ aktar`,
        route: '/rebalancing',
      });
    }

    // 3. IMPORTANT: Take profit (>50% gain) → suggest what to buy
    const bigWinners = winners.filter(w => w.pnlPct > 50);
    if (bigWinners.length > 0) {
      const winner = bigWinners[0];
      const profitToTake = winner.pnl * 0.3;
      items.push({
        priority: 'important',
        icon: 'sell',
        title: `${winner.symbol}'den kâr al → yeniden dağıt`,
        description: `%+${winner.pnlPct.toFixed(0)} kârda. ${formatCurrency(profitToTake)} ₺ realize edip yerine: ${getBuyAlternative(profitToTake, winner.asset_type)}`,
        amount: `+${formatCurrency(profitToTake)} ₺`,
      });
    }

    // 4. IMPORTANT: Low diversification → specific buy suggestions
    if (assetTypes.size < 3 && investmentHoldings.length >= 3) {
      const buyBudget = totalValue * 0.1; // Suggest 10% of portfolio
      const suggestions: string[] = [];
      if (!assetTypes.has('commodity')) suggestions.push(`Altın (${formatCurrency(buyBudget)} ₺)`);
      if (!assetTypes.has('stock')) suggestions.push(`BIST hisse - THYAO, SISE, ASELS (${formatCurrency(buyBudget)} ₺)`);
      if (!assetTypes.has('crypto')) suggestions.push(`BTC + ETH (${formatCurrency(buyBudget)} ₺)`);
      if (!assetTypes.has('currency')) suggestions.push(`USD/EUR döviz (${formatCurrency(buyBudget)} ₺)`);
      items.push({
        priority: 'important',
        icon: 'buy',
        title: 'Eksik varlık türleri ekleyin',
        description: `Alın: ${suggestions.slice(0, 2).join(', ')}`,
        route: '/watchlist',
      });
    }

    // 5. SUGGESTION: Cash too high → specific buy suggestions
    if (totalCashValue > 0 && grandTotal > 0) {
      const cashRatio = (totalCashValue / grandTotal) * 100;
      if (cashRatio > 30) {
        const investAmount = totalCashValue * 0.5;
        items.push({
          priority: 'suggestion',
          icon: 'cash',
          title: `${formatCurrency(investAmount)} ₺ nakiti yatırıma çevirin`,
          description: `Nakit %${cashRatio.toFixed(0)}. Öneri: ${getBuyAlternative(investAmount)}`,
          amount: `${formatCurrency(investAmount)} ₺ yatır`,
        });
      }
    }

    // 6. SUGGESTION: Portfolio performing well
    if (totalProfitLossPercent > 20 && items.filter(i => i.priority === 'urgent').length === 0) {
      items.push({
        priority: 'suggestion',
        icon: 'goal',
        title: `Portföy %${totalProfitLossPercent.toFixed(0)} kârda`,
        description: `Toplam ${formatCurrency(totalProfitLoss)} ₺ kâr. Kârın bir kısmını altın veya dövize kaydırarak koruma altına alın.`,
      });
    }

    // 7. SUGGESTION: Buy opportunity (small dip)
    const smallLosers = losers.filter(l => l.pnlPct > -10 && l.pnlPct < -3);
    if (smallLosers.length > 0 && totalCashValue > 1000) {
      const target = smallLosers[0];
      const buyAmount = Math.min(totalCashValue * 0.2, target.value * 0.3);
      items.push({
        priority: 'suggestion',
        icon: 'buy',
        title: `${target.symbol} alım fırsatı (%${target.pnlPct.toFixed(1)} düşüş)`,
        description: `${formatCurrency(buyAmount)} ₺ ek alım yaparak ortalama maliyeti ${formatCurrency(target.purchase_price * 0.97)} ₺'ye düşürebilirsiniz.`,
        amount: `${formatCurrency(buyAmount)} ₺ al`,
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

          {/* New Money Allocation */}
          <div className="space-y-2">
            <button
              onClick={() => { setShowAddMoney(!showAddMoney); setAllocationResult(null); setNewMoneyAmount(''); }}
              className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all border ${
                showAddMoney
                  ? 'bg-green-600 text-white border-green-600'
                  : 'bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800 hover:bg-green-100 dark:hover:bg-green-900/40'
              }`}
            >
              <DollarSign size={16} />
              {showAddMoney ? 'Kapat' : 'Yeni Para Ekleyeceğim — Nasıl Dağıtayım?'}
            </button>

            {showAddMoney && (
              <div className="p-4 rounded-xl bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900 space-y-3">
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={newMoneyAmount}
                    onChange={e => setNewMoneyAmount(e.target.value)}
                    placeholder="Eklenecek tutar (₺)"
                    className="flex-1 px-3 py-2 rounded-lg border border-green-300 dark:border-green-800 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-green-500 outline-none"
                  />
                  <button
                    onClick={() => {
                      const amt = parseFloat(newMoneyAmount);
                      if (amt > 0) setAllocationResult(actionItems.length > 0 ? getFullAllocation(amt) : [`${formatCurrency(amt)} ₺ dengeli dağıtın`]);
                    }}
                    disabled={!newMoneyAmount || parseFloat(newMoneyAmount) <= 0}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-semibold hover:bg-green-700 transition-colors disabled:opacity-40"
                  >
                    Hesapla
                  </button>
                </div>

                {allocationResult && (
                  <div className="space-y-1.5 pt-2 border-t border-green-200 dark:border-green-800">
                    <p className="text-xs font-semibold text-green-800 dark:text-green-300">
                      {formatCurrency(parseFloat(newMoneyAmount))} ₺ şöyle dağıtın:
                    </p>
                    {allocationResult.map((line, i) => (
                      <p key={i} className="text-sm text-green-700 dark:text-green-400">{line}</p>
                    ))}
                    <p className="text-[10px] text-green-600 dark:text-green-500 mt-2 italic">
                      * Portföyünüzde eksik/düşük ağırlıklı varlık türlerine göre hesaplandı
                    </p>
                  </div>
                )}
              </div>
            )}
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
