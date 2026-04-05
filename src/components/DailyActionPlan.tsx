import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CheckCircle2, Circle, ArrowRight, Brain, ChevronDown, ChevronUp,
  AlertTriangle, TrendingUp, TrendingDown, DollarSign, Shield,
  Clock, Zap, Target, RefreshCw
} from 'lucide-react';
import { Holding } from '../lib/supabase';
import { formatCurrency } from '../services/priceService';
import { analyzePortfolio } from '../services/smartInvestmentEngine';

interface DailyActionPlanProps {
  holdings: Holding[];
  totalValue: number;
  totalInvestment: number;
  totalProfitLoss: number;
  totalProfitLossPercent: number;
  totalCashValue: number;
}

interface Step {
  id: string;
  order: number;
  urgency: 'now' | 'today' | 'this_week' | 'watch';
  icon: JSX.Element;
  action: string; // "SAT", "AL", "BEKLE" etc
  symbol?: string;
  instruction: string;
  detail: string;
  amount?: number;
  completed: boolean;
}

const STORAGE_KEY = 'tandor_daily_actions';

function getTodayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function loadCompletedSteps(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const data = JSON.parse(raw);
    if (data.date !== getTodayKey()) return new Set(); // Reset daily
    return new Set(data.completed || []);
  } catch { return new Set(); }
}

function saveCompletedSteps(completed: Set<string>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    date: getTodayKey(),
    completed: Array.from(completed),
  }));
}

function getGreeting(): string {
  const h = new Date().getHours();
  return h < 6 ? 'İyi geceler' : h < 12 ? 'Günaydın' : h < 18 ? 'İyi günler' : 'İyi akşamlar';
}

function getMarketStatus(): { isOpen: boolean; label: string } {
  const now = new Date();
  const day = now.getDay();
  const hour = now.getHours();
  const minute = now.getMinutes();
  const time = hour * 60 + minute;

  if (day === 0 || day === 6) return { isOpen: false, label: 'Borsa kapalı (hafta sonu)' };
  if (time >= 600 && time <= 1080) return { isOpen: true, label: 'Borsa açık (10:00-18:00)' };
  if (time < 600) return { isOpen: false, label: `Borsa ${Math.floor((600 - time) / 60)}s ${(600 - time) % 60}dk sonra açılacak` };
  return { isOpen: false, label: 'Borsa kapandı. Kripto 7/24 aktif.' };
}

export function DailyActionPlan({ holdings, totalValue, totalInvestment, totalProfitLoss, totalProfitLossPercent, totalCashValue }: DailyActionPlanProps) {
  const navigate = useNavigate();
  const [completedSteps, setCompletedSteps] = useState<Set<string>>(loadCompletedSteps);
  const [expanded, setExpanded] = useState(true);

  const report = useMemo(() => analyzePortfolio(holdings, totalCashValue), [holdings, totalCashValue]);
  const market = getMarketStatus();

  const steps = useMemo((): Step[] => {
    if (report.holdings.length === 0) return [];
    const s: Step[] = [];
    let order = 0;

    const investmentHoldings = report.holdings;
    const grandTotal = report.grandTotal;

    // ── HEMEN YAP (Acil) ────────────────────────────────────

    // Kritik zarardakiler
    const criticalLosers = investmentHoldings.filter(h => h.pnlPct < -20);
    criticalLosers.forEach(h => {
      const sellAmount = h.value;
      const alt = investmentHoldings.find(x => x.assetType !== h.assetType && x.pnlPct > 0);
      const buySymbol = !report.currentAllocation.find(a => a.type === 'commodity')
        ? 'ALTIN' : alt ? alt.symbol : 'USD';

      s.push({
        id: `sell-${h.symbol}`, order: order++, urgency: 'now',
        icon: <AlertTriangle size={16} className="text-red-500" />,
        action: 'SAT',
        symbol: h.symbol,
        instruction: `${h.symbol} portföyden çıkar`,
        detail: `%${Math.abs(h.pnlPct).toFixed(0)} zararda (${formatCurrency(Math.abs(h.pnl))} ₺ kayıp). Tamamını sat ve ${formatCurrency(sellAmount)} ₺'yi ${buySymbol}'a yönlendir.`,
        amount: sellAmount,
        completed: completedSteps.has(`sell-${h.symbol}`),
      });
    });

    // Aşırı yoğunlaşma
    const overweight = investmentHoldings.filter(h => h.weight > 35);
    overweight.forEach(h => {
      if (criticalLosers.find(l => l.symbol === h.symbol)) return; // Zaten satılacak
      const reduceAmount = h.value * ((h.weight - 20) / 100);
      const missingTypes = ['commodity', 'stock', 'crypto'].filter(t =>
        !report.currentAllocation.find(a => a.type === t && a.weight > 5)
      );
      const buyTargets = missingTypes.length > 0
        ? missingTypes.map(t => t === 'commodity' ? 'ALTIN' : t === 'crypto' ? 'BTC' : 'THYAO').join(' + ')
        : 'farklı varlıklara';

      s.push({
        id: `reduce-${h.symbol}`, order: order++, urgency: 'now',
        icon: <TrendingDown size={16} className="text-orange-500" />,
        action: 'AZALT',
        symbol: h.symbol,
        instruction: `${h.symbol}'den ${formatCurrency(reduceAmount)} ₺ azalt`,
        detail: `Portföyün %${h.weight.toFixed(0)}'i tek varlıkta. ${formatCurrency(reduceAmount)} ₺ satıp ${buyTargets}'a dağıt.`,
        amount: reduceAmount,
        completed: completedSteps.has(`reduce-${h.symbol}`),
      });
    });

    // ── BUGÜN YAP ───────────────────────────────────────────

    // Kâr realizasyonu
    const bigWinners = investmentHoldings.filter(h => h.pnlPct > 40).sort((a, b) => b.pnlPct - a.pnlPct);
    if (bigWinners.length > 0) {
      const w = bigWinners[0];
      const takeAmount = w.pnl * 0.3;
      s.push({
        id: `profit-${w.symbol}`, order: order++, urgency: 'today',
        icon: <TrendingUp size={16} className="text-green-500" />,
        action: 'KÂR AL',
        symbol: w.symbol,
        instruction: `${w.symbol}'den ${formatCurrency(takeAmount)} ₺ kâr realize et`,
        detail: `%+${w.pnlPct.toFixed(0)} kârda. Kârın %30'unu sat (${formatCurrency(takeAmount)} ₺). Kalanı tut, stop-loss: ${formatCurrency(w.stopLoss)} ₺`,
        amount: takeAmount,
        completed: completedSteps.has(`profit-${w.symbol}`),
      });
    }

    // Nakit fazlası → yatırıma çevir
    if (totalCashValue > grandTotal * 0.25 && totalCashValue > 3000) {
      const investAmount = totalCashValue * 0.4;
      const plan = report.newMoneyPlan(investAmount);
      const targets = plan.slice(0, 3).map(p => `${p.symbol}: ${formatCurrency(p.amount)} ₺`).join(', ');

      s.push({
        id: 'invest-cash', order: order++, urgency: 'today',
        icon: <DollarSign size={16} className="text-emerald-500" />,
        action: 'YATIR',
        instruction: `${formatCurrency(investAmount)} ₺ nakiti yatırıma çevir`,
        detail: `Nakit %${((totalCashValue / grandTotal) * 100).toFixed(0)} - fazla. Şöyle dağıt: ${targets}`,
        amount: investAmount,
        completed: completedSteps.has('invest-cash'),
      });
    }

    // Eksik varlık türleri → al
    const typeWeights: Record<string, number> = {};
    report.currentAllocation.forEach(a => { typeWeights[a.type] = a.weight; });

    if (!typeWeights['commodity'] || typeWeights['commodity'] < 5) {
      const amt = Math.max(grandTotal * 0.05, 1000);
      s.push({
        id: 'buy-gold', order: order++, urgency: 'today',
        icon: <Target size={16} className="text-amber-500" />,
        action: 'AL',
        symbol: 'ALTIN',
        instruction: `${formatCurrency(amt)} ₺ ALTIN al`,
        detail: 'Portföyde emtia/altın yok. Altın enflasyon koruması ve güvenli liman.',
        amount: amt,
        completed: completedSteps.has('buy-gold'),
      });
    }

    if (!typeWeights['stock'] || typeWeights['stock'] < 10) {
      const amt = Math.max(grandTotal * 0.1, 2000);
      const ownedSymbols = new Set(investmentHoldings.map(h => h.symbol));
      const pick = ['THYAO', 'ASELS', 'BIMAS', 'TUPRS'].find(s => !ownedSymbols.has(s)) || 'THYAO';
      s.push({
        id: `buy-${pick}`, order: order++, urgency: 'today',
        icon: <Target size={16} className="text-blue-500" />,
        action: 'AL',
        symbol: pick,
        instruction: `${formatCurrency(amt)} ₺ ${pick} al`,
        detail: `Portföyde BIST hisse eksik/az. ${pick} likiditesi yüksek, güvenilir hisse.`,
        amount: amt,
        completed: completedSteps.has(`buy-${pick}`),
      });
    }

    // ── BU HAFTA ────────────────────────────────────────────

    // Maliyet düşürme fırsatları
    const dips = investmentHoldings.filter(h => h.pnlPct > -10 && h.pnlPct < -2 && h.action === 'buy');
    if (dips.length > 0 && totalCashValue > 1000) {
      const d = dips[0];
      const buyAmt = Math.min(totalCashValue * 0.1, d.value * 0.2, 5000);
      if (buyAmt > 500) {
        s.push({
          id: `avg-${d.symbol}`, order: order++, urgency: 'this_week',
          icon: <Zap size={16} className="text-purple-500" />,
          action: 'EK ALIM',
          symbol: d.symbol,
          instruction: `${d.symbol}'a ${formatCurrency(buyAmt)} ₺ ek alım yap`,
          detail: `%${Math.abs(d.pnlPct).toFixed(1)} düşüşte. Ek alımla ortalama maliyeti düşür.`,
          amount: buyAmt,
          completed: completedSteps.has(`avg-${d.symbol}`),
        });
      }
    }

    // Stop-loss güncelle
    const noStopLoss = investmentHoldings.filter(h => h.pnlPct < -5 && h.riskLevel !== 'low');
    if (noStopLoss.length > 0) {
      s.push({
        id: 'set-stoploss', order: order++, urgency: 'this_week',
        icon: <Shield size={16} className="text-indigo-500" />,
        action: 'KORU',
        instruction: `${noStopLoss.length} varlık için stop-loss belirle`,
        detail: noStopLoss.map(h => `${h.symbol}: ${formatCurrency(h.stopLoss)} ₺`).join(', '),
        completed: completedSteps.has('set-stoploss'),
      });
    }

    // ── İZLE ─────────────────────────────────────────────────

    // İyi performans gösterenler
    const stable = investmentHoldings.filter(h => h.action === 'hold' && h.pnlPct > 5);
    if (stable.length > 0) {
      s.push({
        id: 'watch-stable', order: order++, urgency: 'watch',
        icon: <CheckCircle2 size={16} className="text-gray-400" />,
        action: 'TUT',
        instruction: `${stable.map(h => h.symbol).join(', ')} - pozisyon koru`,
        detail: 'Bu varlıklar stabil. Değişiklik gerekmez, izlemeye devam.',
        completed: false,
      });
    }

    return s;
  }, [report, totalCashValue, completedSteps]);

  function toggleStep(id: string) {
    setCompletedSteps(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      saveCompletedSteps(next);
      return next;
    });
  }

  if (holdings.filter(h => h.asset_type !== 'cash').length === 0) return null;

  const completedCount = steps.filter(s => s.completed).length;
  const totalSteps = steps.filter(s => s.urgency !== 'watch').length;
  const progress = totalSteps > 0 ? (completedCount / totalSteps) * 100 : 0;

  const urgencyLabels: Record<string, { label: string; color: string }> = {
    now: { label: 'HEMEN', color: 'text-red-600 bg-red-50 dark:bg-red-950/30' },
    today: { label: 'BUGÜN', color: 'text-amber-600 bg-amber-50 dark:bg-amber-950/30' },
    this_week: { label: 'BU HAFTA', color: 'text-blue-600 bg-blue-50 dark:bg-blue-950/30' },
    watch: { label: 'İZLE', color: 'text-gray-500 bg-gray-50 dark:bg-gray-800' },
  };

  const actionColors: Record<string, string> = {
    SAT: 'text-red-700 dark:text-red-400',
    AZALT: 'text-orange-700 dark:text-orange-400',
    'KÂR AL': 'text-green-700 dark:text-green-400',
    AL: 'text-emerald-700 dark:text-emerald-400',
    'EK ALIM': 'text-purple-700 dark:text-purple-400',
    YATIR: 'text-emerald-700 dark:text-emerald-400',
    KORU: 'text-indigo-700 dark:text-indigo-400',
    TUT: 'text-gray-500 dark:text-gray-400',
  };

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-gray-800 overflow-hidden bg-white dark:bg-gray-900">
      {/* Header */}
      <div className="p-4 cursor-pointer hover:bg-slate-50/50 dark:hover:bg-gray-800/30 transition-colors" onClick={() => setExpanded(!expanded)}>
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gradient-to-br from-amber-500 to-orange-600 rounded-xl shadow-md flex-shrink-0">
            <Brain className="text-white" size={18} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-gray-900 dark:text-white">{getGreeting()}! Bugünkü Planınız</h3>
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <div className="flex-1 h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-amber-500 to-green-500 rounded-full transition-all" style={{ width: `${progress}%` }} />
              </div>
              <span className="text-[10px] font-bold text-gray-400">{completedCount}/{totalSteps}</span>
            </div>
          </div>
          <div className={`text-[10px] font-bold px-2 py-1 rounded-full ${market.isOpen ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'}`}>
            <Clock size={10} className="inline mr-1" />
            {market.isOpen ? 'AÇIK' : 'KAPALI'}
          </div>
          {expanded ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
        </div>
      </div>

      {expanded && (
        <div className="px-4 pb-4 space-y-1.5">
          {steps.map(step => (
            <div
              key={step.id}
              className={`flex items-start gap-2.5 p-3 rounded-xl transition-all ${
                step.completed ? 'opacity-50 bg-gray-50 dark:bg-gray-800/30' : 'bg-white dark:bg-gray-900'
              }`}
            >
              {/* Checkbox */}
              {step.urgency !== 'watch' ? (
                <button onClick={() => toggleStep(step.id)} className="mt-0.5 flex-shrink-0">
                  {step.completed
                    ? <CheckCircle2 size={18} className="text-green-500" />
                    : <Circle size={18} className="text-gray-300 dark:text-gray-600 hover:text-amber-500" />}
                </button>
              ) : (
                <div className="mt-0.5 flex-shrink-0">{step.icon}</div>
              )}

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${urgencyLabels[step.urgency].color}`}>
                    {urgencyLabels[step.urgency].label}
                  </span>
                  <span className={`text-xs font-bold ${actionColors[step.action] || 'text-gray-600'}`}>
                    {step.action}
                  </span>
                  {step.symbol && <span className="text-xs font-bold text-gray-900 dark:text-white">{step.symbol}</span>}
                </div>
                <p className={`text-sm font-semibold mt-1 ${step.completed ? 'line-through text-gray-400' : 'text-gray-900 dark:text-white'}`}>
                  {step.instruction}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-relaxed">{step.detail}</p>
              </div>

              {/* Amount */}
              {step.amount && step.amount > 0 && !step.completed && (
                <span className="flex-shrink-0 text-xs font-bold text-gray-900 dark:text-gray-200 bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded-lg">
                  {formatCurrency(step.amount)} ₺
                </span>
              )}
            </div>
          ))}

          {/* Quick nav */}
          <div className="flex gap-2 pt-2 overflow-x-auto">
            <button onClick={() => navigate('/ai-advisor')} className="flex items-center gap-1 px-3 py-1.5 bg-amber-600 text-white rounded-lg text-[11px] font-semibold whitespace-nowrap">
              <Brain size={11} /> Detaylı Analiz
            </button>
            <button onClick={() => navigate('/performance')} className="flex items-center gap-1 px-3 py-1.5 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 rounded-lg text-[11px] font-semibold border border-gray-200 dark:border-gray-700 whitespace-nowrap">
              <TrendingUp size={11} /> Performans
            </button>
            <button onClick={() => navigate('/market')} className="flex items-center gap-1 px-3 py-1.5 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 rounded-lg text-[11px] font-semibold border border-gray-200 dark:border-gray-700 whitespace-nowrap">
              <RefreshCw size={11} /> Piyasa
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
