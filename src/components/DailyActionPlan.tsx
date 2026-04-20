import { useState, useMemo, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CheckCircle2, Brain, ChevronDown, ChevronUp,
  AlertTriangle, TrendingUp, TrendingDown, Shield,
  Clock, Zap, Target, Wallet, Globe, Sparkles
} from 'lucide-react';
import { Holding } from '../lib/supabase';
import { formatCurrency } from '../services/priceService';
import { analyzePortfolio } from '../services/smartInvestmentEngine';
import { buildMemoryContext, saveRecommendations, recordPortfolioValue } from '../services/aiMemoryService';

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

interface AIAction {
  urgency: string;
  type: string;
  symbol: string;
  market: string;
  instruction: string;
  detail: string;
  amount_try: number;
  risk: string;
  timeframe: string;
}

interface AIPlan {
  actions: AIAction[];
  market_outlook: string;
  top_pick: string;
}

const AI_CACHE_KEY = 'tandor_ai_daily_plan';

function getCachedAIPlan(): AIPlan | null {
  try {
    const raw = localStorage.getItem(AI_CACHE_KEY);
    if (!raw) return null;
    const { date, plan } = JSON.parse(raw);
    if (date !== getTodayKey()) return null;
    return plan;
  } catch { return null; }
}

function cacheAIPlan(plan: AIPlan) {
  localStorage.setItem(AI_CACHE_KEY, JSON.stringify({ date: getTodayKey(), plan }));
}

export function DailyActionPlan({ holdings, totalCashValue }: DailyActionPlanProps) {
  const navigate = useNavigate();
  const [completedSteps] = useState<Set<string>>(loadCompletedSteps);
  const [expanded, setExpanded] = useState(true);
  const [aiPlan, setAiPlan] = useState<AIPlan | null>(getCachedAIPlan);
  const [aiLoading, setAiLoading] = useState(false);
  const aiLoadedRef = useRef(false);

  const report = useMemo(() => analyzePortfolio(holdings, totalCashValue), [holdings, totalCashValue]);
  const market = getMarketStatus();

  // Fetch AI plan once per day
  useEffect(() => {
    if (aiLoadedRef.current || aiPlan || holdings.filter(h => h.asset_type !== 'cash').length === 0) return;
    aiLoadedRef.current = true;
    fetchAIPlan();
  }, [holdings.length]);

  async function fetchAIPlan() {
    setAiLoading(true);
    try {
      const investmentHoldings = holdings.filter(h => h.asset_type !== 'cash');
      const tv = investmentHoldings.reduce((s, h) => s + h.current_price * h.quantity, 0);
      const ti = investmentHoldings.reduce((s, h) => s + h.purchase_price * h.quantity, 0);

      const portfolioData = {
        holdings: investmentHoldings.map(h => {
          const value = h.current_price * h.quantity;
          const invested = h.purchase_price * h.quantity;
          const pnl = value - invested;
          return {
            symbol: h.symbol, asset_type: h.asset_type,
            quantity: h.quantity, purchase_price: h.purchase_price,
            current_price: h.current_price, total_value: value, pnl,
            pnl_percent: invested > 0 ? (pnl / invested) * 100 : 0,
            weight: tv > 0 ? (value / tv) * 100 : 0,
          };
        }),
        totalValue: tv, totalInvested: ti,
        totalPnlPct: ti > 0 ? ((tv - ti) / ti) * 100 : 0,
        cashBalance: totalCashValue,
      };

      // Build memory context for Claude
      const memory = buildMemoryContext();

      // Record today's portfolio value
      recordPortfolioValue(tv + totalCashValue);

      const res = await fetch('/api/daily-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ portfolio: portfolioData, memory }),
      });

      if (!res.ok) {
        // Dev ortamında /api/daily-plan Vercel function çalışmaz — sessizce geç
        setAiLoading(false);
        return;
      }

      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        setAiLoading(false);
        return;
      }

      const data = await res.json();
      if (data.success && data.plan) {
        setAiPlan(data.plan);
        cacheAIPlan(data.plan);

        // Save recommendations to memory for future tracking
        if (data.plan.actions) {
          const priceMap: Record<string, number> = {};
          investmentHoldings.forEach(h => { priceMap[h.symbol] = h.current_price; });
          saveRecommendations(data.plan.actions, priceMap);
        }
      }
    } catch (e) {
      console.error('AI plan fetch failed:', e);
    }
    setAiLoading(false);
  }

  const steps = useMemo((): Step[] => {
    if (report.holdings.length === 0) return [];
    const s: Step[] = [];
    let order = 0;

    const investmentHoldings = report.holdings;
    const totalValue = report.totalValue;

    // Portfolio type weights
    const typeWeights: Record<string, number> = {};
    report.currentAllocation.forEach(a => { typeWeights[a.type] = a.weight; });
    const ownedSymbols = new Set(investmentHoldings.map(h => h.symbol));

    // Ideal: stock 35%, commodity 15%, crypto 10%, currency 10%, fund 10%
    const IDEAL: Record<string, number> = { stock: 35, commodity: 15, crypto: 10, currency: 10, fund: 10, eurobond: 10 };
    const TYPE_NAMES: Record<string, string> = { stock: 'Hisse', crypto: 'Kripto', currency: 'Döviz', commodity: 'Emtia', fund: 'Fon', eurobond: 'Eurobond' };
    const STOCK_PICKS = ['THYAO', 'ASELS', 'BIMAS', 'TUPRS', 'KCHOL', 'GARAN', 'SISE', 'EREGL'];

    // ── HEMEN YAP (Acil) ────────────────────────────────────

    // 1. VARLIK TÜRÜ BAZINDA REBALANCE (en önemli)
    const overweightTypes = Object.entries(typeWeights).filter(([t, w]) => IDEAL[t] && w > IDEAL[t] * 2);
    const underweightTypes = Object.entries(IDEAL).filter(([t]) => (typeWeights[t] || 0) < IDEAL[t] * 0.5);

    overweightTypes.sort((a, b) => b[1] - a[1]);
    overweightTypes.forEach(([type, weight]) => {
      const excess = weight - IDEAL[type];
      const excessAmount = totalValue * (excess / 100);
      const holdingsOfType = investmentHoldings.filter(h => h.assetType === type).sort((a, b) => b.value - a.value);
      const sellSymbol = holdingsOfType[0]?.symbol || type;

      // Ne alacak?
      const buyParts: string[] = [];
      underweightTypes.forEach(([buyType]) => {
        if (buyType === type) return;
        const buyAmt = excessAmount / Math.max(underweightTypes.length, 1);
        const pick = buyType === 'stock'
          ? STOCK_PICKS.filter(s => !ownedSymbols.has(s))[0] || 'THYAO'
          : buyType === 'crypto' ? 'BTC'
          : buyType === 'commodity' ? 'ALTIN'
          : buyType === 'fund' ? 'IPV' : 'THYAO';
        buyParts.push(`${pick}: ${formatCurrency(buyAmt)} ₺`);
      });

      s.push({
        id: `rebal-type-${type}`, order: order++, urgency: 'now',
        icon: <AlertTriangle size={16} className="text-red-500" />,
        action: 'DÖNÜŞTÜR',
        symbol: sellSymbol,
        instruction: `${TYPE_NAMES[type] || type} azalt (%${weight.toFixed(0)} → %${IDEAL[type]}) → ${buyParts.length > 0 ? buyParts.join(' + ') : 'eksik türlere dağıt'}`,
        detail: `${TYPE_NAMES[type]} portföyün %${weight.toFixed(0)}'i (ideal: %${IDEAL[type]}). ${formatCurrency(excessAmount)} ₺ çıkarıp eksik türlere aktar.`,
        amount: excessAmount,
        completed: completedSteps.has(`rebal-type-${type}`),
      });
    });

    // 2. Kritik zarardakiler
    const criticalLosers = investmentHoldings.filter(h => h.pnlPct < -20);
    criticalLosers.forEach(h => {
      s.push({
        id: `sell-${h.symbol}`, order: order++, urgency: 'now',
        icon: <AlertTriangle size={16} className="text-red-500" />,
        action: 'SAT',
        symbol: h.symbol,
        instruction: `${h.symbol} sat → ALTIN veya hisseye çevir`,
        detail: `%${Math.abs(h.pnlPct).toFixed(0)} zararda (${formatCurrency(Math.abs(h.pnl))} ₺ kayıp). Sat ve daha güvenli varlığa yönlendir.`,
        amount: h.value,
        completed: completedSteps.has(`sell-${h.symbol}`),
      });
    });

    // ── BUGÜN YAP ───────────────────────────────────────────

    // 3. Eksik türler → spesifik alım önerisi
    underweightTypes.forEach(([type]) => {
      const current = typeWeights[type] || 0;
      const deficit = IDEAL[type] - current;
      const amt = totalValue * (deficit / 100);
      if (amt < 500) return;

      let pick: string;
      let pickDetail: string;
      if (type === 'stock') {
        const available = STOCK_PICKS.filter(s => !ownedSymbols.has(s));
        pick = available[0] || 'THYAO';
        const pick2 = available[1] || 'ASELS';
        pickDetail = `${pick}: ${formatCurrency(amt * 0.6)} ₺ + ${pick2}: ${formatCurrency(amt * 0.4)} ₺. Likiditesi yüksek, güvenilir BIST hisseleri.`;
      } else if (type === 'crypto') {
        pick = 'BTC';
        pickDetail = `BTC: ${formatCurrency(amt * 0.7)} ₺ + ETH: ${formatCurrency(amt * 0.3)} ₺. En güvenilir kripto paralar.`;
      } else if (type === 'commodity') {
        pick = 'ALTIN';
        pickDetail = `ALTIN: ${formatCurrency(amt)} ₺. Enflasyon koruması + güvenli liman.`;
      } else {
        pick = type === 'fund' ? 'IPV' : 'USD';
        pickDetail = `${pick}: ${formatCurrency(amt)} ₺`;
      }

      s.push({
        id: `buy-${type}`, order: order++, urgency: 'today',
        icon: <Target size={16} className="text-accent-500" />,
        action: 'AL',
        symbol: pick,
        instruction: `${TYPE_NAMES[type] || type} ekle → ${pick} al (${formatCurrency(amt)} ₺)`,
        detail: `${TYPE_NAMES[type]} %${current.toFixed(0)} (ideal: %${IDEAL[type]}). ${pickDetail}`,
        amount: amt,
        completed: completedSteps.has(`buy-${type}`),
      });
    });

    // 4. Kâr realizasyonu (en kârlıdan)
    const bigWinners = investmentHoldings.filter(h => h.pnlPct > 40).sort((a, b) => b.pnlPct - a.pnlPct);
    bigWinners.slice(0, 2).forEach(w => {
      const takeAmount = w.pnl * 0.3;
      s.push({
        id: `profit-${w.symbol}`, order: order++, urgency: 'today',
        icon: <TrendingUp size={16} className="text-green-500" />,
        action: 'KÂR AL',
        symbol: w.symbol,
        instruction: `${w.symbol}'den ${formatCurrency(takeAmount)} ₺ kâr al`,
        detail: `%+${w.pnlPct.toFixed(0)} kârda. Kârın %30'unu realize et. Stop-loss: ${formatCurrency(w.stopLoss)} ₺`,
        amount: takeAmount,
        completed: completedSteps.has(`profit-${w.symbol}`),
      });
    });

    // ── BU HAFTA ────────────────────────────────────────────

    // Maliyet düşürme fırsatları
    const dips = investmentHoldings.filter(h => h.pnlPct > -10 && h.pnlPct < -2 && h.action === 'buy');
    if (dips.length > 0 && totalCashValue > 1000) {
      const d = dips[0];
      const buyAmt = Math.min(totalCashValue * 0.1, d.value * 0.2, 5000);
      if (buyAmt > 500) {
        s.push({
          id: `avg-${d.symbol}`, order: order++, urgency: 'this_week',
          icon: <Zap size={16} className="text-brand-500" />,
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
        icon: <Shield size={16} className="text-brand-500" />,
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

  if (holdings.filter(h => h.asset_type !== 'cash').length === 0) return null;

  const completedCount = steps.filter(s => s.completed).length;
  const totalSteps = steps.filter(s => s.urgency !== 'watch').length;
  const progress = totalSteps > 0 ? (completedCount / totalSteps) * 100 : 0;

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-gray-800 overflow-hidden bg-white dark:bg-gray-900">
      {/* Header */}
      <div className="p-4 cursor-pointer hover:bg-slate-50/50 dark:hover:bg-gray-800/30 transition-colors" onClick={() => setExpanded(!expanded)}>
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gradient-to-br from-amber-500 to-brand-600 rounded-xl shadow-md flex-shrink-0">
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

          {/* AI loading or no plan yet */}
          {!aiPlan && !aiLoading && (
            <div className="text-center py-4">
              <p className="text-xs text-gray-400 mb-2">AI analizi henüz yüklenmedi</p>
              <button onClick={fetchAIPlan} className="text-xs text-brand-600 dark:text-brand-400 font-semibold hover:underline">
                Analiz Başlat
              </button>
            </div>
          )}

          {aiLoading && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-brand-50 dark:bg-brand-950/20 border border-brand-200 dark:border-brand-800">
              <Sparkles size={14} className="text-brand-500 animate-pulse" />
              <span className="text-xs text-brand-700 dark:text-brand-400 font-medium">Claude portföyünüzü analiz ediyor...</span>
            </div>
          )}

          {aiPlan && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <h4 className="text-[11px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest">
                  AI Portföy Yöneticisi
                </h4>
                <button onClick={fetchAIPlan} disabled={aiLoading} className="text-[10px] text-brand-500 hover:text-brand-700 font-medium">
                  {aiLoading ? 'Yükleniyor...' : 'Yenile'}
                </button>
              </div>

              {/* Portfolio Diagnosis */}
              {(aiPlan as any).portfolio_diagnosis && (
                <div className="px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800">
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Portföy Teşhisi</p>
                  <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">{(aiPlan as any).portfolio_diagnosis}</p>
                </div>
              )}

              {/* Market Outlook */}
              {aiPlan.market_outlook && (
                <div className="px-3 py-2 rounded-lg bg-brand-50 dark:bg-brand-950/20 border border-brand-200 dark:border-brand-800">
                  <p className="text-[10px] font-bold text-brand-500 uppercase tracking-widest mb-1">Piyasa Görünümü</p>
                  <p className="text-xs text-brand-700 dark:text-brand-300 leading-relaxed">{aiPlan.market_outlook}</p>
                </div>
              )}

              {aiPlan.top_pick && (
                <div className="px-3 py-2 rounded-lg bg-brand-50 dark:bg-brand-950/20 border border-brand-200 dark:border-brand-800">
                  <span className="text-xs font-bold text-brand-700 dark:text-brand-300">Gunun Tercihi: </span>
                  <span className="text-xs text-brand-600 dark:text-brand-400">{aiPlan.top_pick}</span>
                </div>
              )}

              {(aiPlan as any).weekly_strategy && (
                <p className="text-xs text-brand-600 dark:text-brand-400 font-medium px-1">
                  Haftalık strateji: {(aiPlan as any).weekly_strategy}
                </p>
              )}

              {(aiPlan as any).news_alerts?.length > 0 && (
                <div className="space-y-1">
                  {(aiPlan as any).news_alerts.map((news: string, i: number) => (
                    <div key={i} className="flex items-start gap-2 px-3 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800">
                      <AlertTriangle size={12} className="text-amber-500 mt-0.5 flex-shrink-0" />
                      <span className="text-xs text-amber-700 dark:text-amber-400">{news}</span>
                    </div>
                  ))}
                </div>
              )}

              {aiPlan.actions?.map((action, i) => {
                const marketBadge: Record<string, string> = {
                  BIST: 'bg-brand-100 text-brand-700 dark:bg-brand-900/30 dark:text-brand-400',
                  US: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
                  EU: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
                  CRYPTO: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
                };
                const typeIcon = action.type === 'buy' ? <TrendingUp size={14} className="text-green-500" /> :
                  action.type === 'sell' || action.type === 'reduce' ? <TrendingDown size={14} className="text-red-500" /> :
                  <Shield size={14} className="text-brand-500" />;

                return (
                  <div key={i} className="flex items-start gap-2.5 p-3 rounded-xl bg-brand-50/50 dark:bg-brand-950/10 border border-brand-100 dark:border-brand-900/50">
                    <div className="mt-0.5 flex-shrink-0">{typeIcon}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${marketBadge[action.market] || marketBadge.BIST}`}>
                          {action.market}
                        </span>
                        <span className="text-xs font-bold text-gray-900 dark:text-white">{action.symbol}</span>
                        {action.risk && (
                          <span className={`text-[9px] px-1 py-0.5 rounded ${
                            action.risk === 'low' ? 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400' :
                            action.risk === 'high' ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400' :
                            'bg-yellow-100 text-yellow-600 dark:bg-yellow-900/30 dark:text-yellow-400'
                          }`}>
                            {action.risk === 'low' ? 'düşük risk' : action.risk === 'high' ? 'yüksek risk' : 'orta risk'}
                          </span>
                        )}
                        {(action as any).platform && (
                          <span className="text-[9px] font-medium text-gray-500 bg-gray-100 dark:bg-gray-800 px-1 rounded">{(action as any).platform}</span>
                        )}
                        {action.timeframe && (
                          <span className="text-[9px] text-gray-400">{action.timeframe === 'short' ? 'kısa vade' : 'uzun vade'}</span>
                        )}
                      </div>
                      <p className="text-sm font-semibold text-gray-900 dark:text-white mt-1">{action.instruction}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{action.detail}</p>
                    </div>
                    {action.amount_try > 0 && (
                      <span className="flex-shrink-0 text-xs font-bold text-gray-900 dark:text-gray-200 bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded-lg">
                        {formatCurrency(action.amount_try)} ₺
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Monthly Dynamic Salary - ALWAYS shown */}
          {report.grandTotal > 5000 && (
            <div className="p-3 rounded-xl bg-accent-50 dark:bg-accent-950/20 border border-accent-200 dark:border-accent-800">
              <p className="text-[10px] font-bold text-accent-600 dark:text-accent-400 uppercase tracking-widest mb-2">Aylık Dinamik Maaş</p>
              <div className="grid grid-cols-3 gap-2">
                <div className="text-center">
                  <p className="text-[10px] text-accent-600">Güvenli (%2/yıl)</p>
                  <p className="text-sm font-bold text-accent-700 dark:text-accent-300">{formatCurrency(report.grandTotal * 0.02 / 12)} ₺</p>
                </div>
                <div className="text-center">
                  <p className="text-[10px] text-accent-600">Dengeli (%4/yıl)</p>
                  <p className="text-sm font-bold text-accent-700 dark:text-accent-300">{formatCurrency(report.grandTotal * 0.04 / 12)} ₺</p>
                </div>
                <div className="text-center">
                  <p className="text-[10px] text-accent-600">Büyüme (%6/yıl)</p>
                  <p className="text-sm font-bold text-accent-700 dark:text-accent-300">{formatCurrency(report.grandTotal * 0.06 / 12)} ₺</p>
                </div>
              </div>
              {(aiPlan as any)?.monthly_income?.description ? (
                <p className="text-[11px] text-accent-600 dark:text-accent-400 mt-2">{(aiPlan as any).monthly_income.description}</p>
              ) : (
                <p className="text-[11px] text-accent-600 dark:text-accent-400 mt-2">
                  Güvenli: portföy büyümeye devam eder. Dengeli: 25 yıl sürdürülebilir. Büyüme: kârdan çekim, anapara korunur.
                </p>
              )}
            </div>
          )}

          {/* AI Wealth Building Tip */}
          {aiPlan && (aiPlan as any).wealth_building_tip && (
            <p className="text-xs text-brand-600 dark:text-brand-400 font-medium px-1 italic">
              {(aiPlan as any).wealth_building_tip}
            </p>
          )}

          {/* AI action details: expected return + dividend */}
          {aiPlan?.actions?.some((a: any) => a.expected_annual_return || a.dividend_yield) && (
            <div className="space-y-1">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Beklenen Getiriler</p>
              {aiPlan.actions.filter((a: any) => a.expected_annual_return || a.dividend_yield).map((a: any, i: number) => (
                <div key={i} className="flex items-center justify-between px-2 py-1 rounded bg-gray-50 dark:bg-gray-800/50 text-xs">
                  <span className="font-semibold text-gray-700 dark:text-gray-300">{a.symbol}</span>
                  <div className="flex gap-3">
                    {a.expected_annual_return && (
                      <span className="text-accent-600 dark:text-accent-400">Yıllık: %{a.expected_annual_return}</span>
                    )}
                    {a.dividend_yield && (
                      <span className="text-brand-600 dark:text-brand-400">Temettü: %{a.dividend_yield}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Quick nav */}
          <div className="flex gap-2 pt-2 overflow-x-auto">
            <button onClick={() => navigate('/ai-advisor')} className="flex items-center gap-1 px-3 py-1.5 bg-amber-600 text-white rounded-lg text-[11px] font-semibold whitespace-nowrap">
              <Brain size={11} /> AI Sohbet
            </button>
            <button onClick={() => navigate('/performance')} className="flex items-center gap-1 px-3 py-1.5 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 rounded-lg text-[11px] font-semibold border border-gray-200 dark:border-gray-700 whitespace-nowrap">
              <TrendingUp size={11} /> Performans
            </button>
            <button onClick={() => navigate('/market')} className="flex items-center gap-1 px-3 py-1.5 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 rounded-lg text-[11px] font-semibold border border-gray-200 dark:border-gray-700 whitespace-nowrap">
              <Globe size={11} /> Piyasa
            </button>
            <button onClick={() => navigate('/binance')} className="flex items-center gap-1 px-3 py-1.5 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 rounded-lg text-[11px] font-semibold border border-gray-200 dark:border-gray-700 whitespace-nowrap">
              <Wallet size={11} /> Binance
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
