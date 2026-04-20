import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Brain, TrendingUp, TrendingDown,
  Target, ChevronDown, ChevronUp,
  RefreshCw, DollarSign, PiggyBank,
  ArrowUpRight, ArrowDownRight, ShieldCheck, Crosshair
} from 'lucide-react';
import { Holding } from '../lib/supabase';
import { formatCurrency } from '../services/priceService';
import { analyzePortfolio, ActionRecommendation } from '../services/smartInvestmentEngine';

interface FinancialCoachProps {
  holdings: Holding[];
  totalValue: number;
  totalInvestment: number;
  totalProfitLoss: number;
  totalProfitLossPercent: number;
  totalCashValue: number;
}

function getGreeting(): string {
  const h = new Date().getHours();
  return h < 6 ? 'İyi geceler' : h < 12 ? 'Günaydın' : h < 18 ? 'İyi günler' : 'İyi akşamlar';
}

const actionIcons: Record<string, JSX.Element> = {
  sell: <ArrowDownRight size={15} className="text-red-500" />,
  buy: <ArrowUpRight size={15} className="text-green-500" />,
  reduce: <TrendingDown size={15} className="text-brand-500" />,
  add: <TrendingUp size={15} className="text-accent-500" />,
  rebalance: <RefreshCw size={15} className="text-brand-500" />,
  protect: <ShieldCheck size={15} className="text-brand-500" />,
  hold: <Target size={15} className="text-gray-500" />,
};

const priorityStyles: Record<string, string> = {
  critical: 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900',
  high: 'bg-brand-50 dark:bg-brand-950/30 border-brand-200 dark:border-brand-900',
  medium: 'bg-brand-50 dark:bg-brand-950/30 border-brand-200 dark:border-brand-900',
  low: 'bg-slate-50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800',
};

export function FinancialCoach({ holdings, totalCashValue }: FinancialCoachProps) {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(true);
  const [showAddMoney, setShowAddMoney] = useState(false);
  const [newMoneyAmount, setNewMoneyAmount] = useState('');
  const [showAllActions, setShowAllActions] = useState(false);
  const [showHoldings, setShowHoldings] = useState(false);

  const report = useMemo(
    () => analyzePortfolio(holdings, totalCashValue),
    [holdings, totalCashValue]
  );

  const newMoneyResult = useMemo(() => {
    const amt = parseFloat(newMoneyAmount);
    return amt > 0 ? report.newMoneyPlan(amt) : null;
  }, [newMoneyAmount, report]);

  if (report.holdings.length === 0) return null;

  const allActions = [...report.urgentActions, ...report.opportunities];
  const visibleActions = showAllActions ? allActions : allActions.slice(0, 3);
  const urgentCount = report.urgentActions.filter(a => a.priority === 'critical' || a.priority === 'high').length;

  function renderAction(action: ActionRecommendation, i: number) {
    return (
      <div key={i} className={`flex items-start gap-2.5 p-3 rounded-xl border ${priorityStyles[action.priority]}`}>
        <div className="mt-0.5 flex-shrink-0">{actionIcons[action.type] || actionIcons.hold}</div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 leading-snug">{action.title}</p>
          <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5 leading-relaxed">{action.detail}</p>
          {action.impact && (
            <p className="text-[10px] text-gray-500 dark:text-gray-500 mt-1 font-medium">Etki: {action.impact}</p>
          )}
        </div>
        {action.amount && action.amount > 0 && (
          <span className={`flex-shrink-0 text-xs font-bold px-2 py-1 rounded-lg ${
            action.type === 'sell' || action.type === 'reduce'
              ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400'
              : 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400'
          }`}>
            {formatCurrency(action.amount)} ₺
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-gray-800 overflow-hidden bg-white dark:bg-gray-900">
      {/* Header */}
      <div className="p-4 cursor-pointer hover:bg-slate-50/50 dark:hover:bg-gray-800/30 transition-colors" onClick={() => setExpanded(!expanded)}>
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gradient-to-br from-amber-500 to-brand-600 rounded-xl shadow-md flex-shrink-0">
            <Brain className="text-white" size={18} />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-bold text-gray-900 dark:text-white">{getGreeting()}! Finansal Koçunuz</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {urgentCount > 0 ? `${urgentCount} acil aksiyon` : `${allActions.length} öneri`} · Skor: {report.healthGrade}
            </p>
          </div>
          <div className={`text-xl font-black ${report.healthScore >= 75 ? 'text-green-500' : report.healthScore >= 55 ? 'text-amber-500' : 'text-red-500'}`}>
            {report.healthGrade}
          </div>
          {expanded ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
        </div>
      </div>

      {expanded && (
        <div className="px-4 pb-4 space-y-4">

          {/* Actions */}
          <div className="space-y-2">
            <h4 className="text-[11px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest">Yapmanız Gerekenler</h4>
            {visibleActions.map(renderAction)}
            {allActions.length > 3 && (
              <button
                onClick={() => setShowAllActions(!showAllActions)}
                className="w-full text-center text-xs text-brand-600 dark:text-brand-400 font-semibold py-1.5 hover:underline"
              >
                {showAllActions ? 'Daha az göster' : `+${allActions.length - 3} öneri daha`}
              </button>
            )}
          </div>

          {/* Holdings Quick View */}
          <div>
            <button
              onClick={() => setShowHoldings(!showHoldings)}
              className="flex items-center gap-1.5 text-[11px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest hover:text-gray-600"
            >
              <Crosshair size={11} />
              Varlık Karnesi
              {showHoldings ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </button>
            {showHoldings && (
              <div className="mt-2 space-y-1">
                {report.holdings.map(h => (
                  <div key={h.symbol} className="flex items-center gap-2 px-2.5 py-2 rounded-lg bg-slate-50 dark:bg-gray-800/60 text-xs">
                    <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                      h.action === 'sell' ? 'bg-red-500' :
                      h.action === 'reduce' ? 'bg-brand-500' :
                      h.action === 'buy' || h.action === 'strong_buy' ? 'bg-green-500' :
                      'bg-gray-400'
                    }`} />
                    <span className="font-semibold text-gray-900 dark:text-white w-14">{h.symbol}</span>
                    <span className={`font-bold ${h.pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      %{h.pnlPct >= 0 ? '+' : ''}{h.pnlPct.toFixed(1)}
                    </span>
                    <span className="text-gray-400 dark:text-gray-500 flex-1 text-right">{formatCurrency(h.value)} ₺</span>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                      h.action === 'sell' ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400' :
                      h.action === 'reduce' ? 'bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-400' :
                      h.action === 'buy' || h.action === 'strong_buy' ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400' :
                      'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
                    }`}>
                      {h.action === 'sell' ? 'SAT' : h.action === 'reduce' ? 'AZALT' : h.action === 'buy' || h.action === 'strong_buy' ? 'AL' : 'TUT'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Withdrawal */}
          {report.grandTotal > 5000 && (
            <div className="space-y-2">
              <h4 className="text-[11px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest flex items-center gap-1.5">
                <PiggyBank size={11} /> Aylık Çekilebilir
              </h4>
              <div className="grid grid-cols-3 gap-1.5">
                {[
                  { label: 'Güvenli', amount: report.withdrawal.safeMonthly, color: 'green', sub: '%2/yıl' },
                  { label: 'Dengeli', amount: report.withdrawal.moderateMonthly, color: 'blue', sub: '%4/yıl' },
                  { label: 'Agresif', amount: report.withdrawal.aggressiveMonthly, color: 'amber', sub: '%6/yıl' },
                ].map(w => (
                  <div key={w.label} className={`p-2 rounded-lg bg-${w.color}-50 dark:bg-${w.color}-950/20 border border-${w.color}-200 dark:border-${w.color}-900 text-center`}>
                    <div className={`text-[10px] text-${w.color}-600 dark:text-${w.color}-400 font-semibold`}>{w.label}</div>
                    <div className={`text-xs font-bold text-${w.color}-700 dark:text-${w.color}-300`}>{formatCurrency(w.amount)} ₺</div>
                    <div className={`text-[9px] text-${w.color}-500`}>{w.sub}</div>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-gray-500 dark:text-gray-400">{report.withdrawal.recommendation}</p>
            </div>
          )}

          {/* New Money */}
          <div>
            <button
              onClick={() => { setShowAddMoney(!showAddMoney); setNewMoneyAmount(''); }}
              className={`w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all border ${
                showAddMoney
                  ? 'bg-accent-600 text-white border-accent-600'
                  : 'bg-accent-50 dark:bg-accent-950/20 text-accent-700 dark:text-accent-400 border-accent-200 dark:border-accent-800'
              }`}
            >
              <DollarSign size={15} />
              {showAddMoney ? 'Kapat' : 'Para Ekleyeceğim — Nasıl Dağıtayım?'}
            </button>

            {showAddMoney && (
              <div className="mt-2 p-3 rounded-xl bg-accent-50 dark:bg-accent-950/20 border border-accent-200 dark:border-accent-800 space-y-2.5">
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={newMoneyAmount}
                    onChange={e => setNewMoneyAmount(e.target.value)}
                    placeholder="Tutar (₺)"
                    className="flex-1 px-3 py-2 rounded-lg border border-accent-300 dark:border-accent-800 bg-white dark:bg-gray-900 text-sm focus:ring-2 focus:ring-accent-500 outline-none"
                  />
                  <button
                    onClick={() => {}} // Result is computed reactively via useMemo
                    disabled={!newMoneyAmount || parseFloat(newMoneyAmount) <= 0}
                    className="px-4 py-2 bg-accent-600 text-white rounded-lg text-sm font-semibold disabled:opacity-40"
                  >
                    Hesapla
                  </button>
                </div>

                {newMoneyResult && newMoneyResult.length > 0 && (
                  <div className="space-y-1 pt-2 border-t border-accent-200 dark:border-accent-800">
                    <p className="text-xs font-bold text-accent-800 dark:text-accent-300">
                      {formatCurrency(parseFloat(newMoneyAmount))} ₺ şöyle dağıtın:
                    </p>
                    {newMoneyResult.map((item, i) => (
                      <div key={i} className="flex items-center justify-between text-sm text-accent-700 dark:text-accent-400">
                        <span className="font-semibold">{item.symbol}</span>
                        <span className="font-bold">{formatCurrency(item.amount)} ₺</span>
                      </div>
                    ))}
                    <p className="text-[10px] text-accent-600 dark:text-accent-500 italic pt-1">
                      * Portföyünüzde eksik türlere göre hesaplandı
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Quick Summary + Actions */}
          <div className="flex gap-2 overflow-x-auto pb-1">
            <button onClick={() => navigate('/ai-advisor')} className="flex items-center gap-1.5 px-3 py-2 bg-amber-600 text-white rounded-lg text-xs font-semibold hover:bg-amber-700 whitespace-nowrap">
              <Brain size={12} /> AI Sohbet
            </button>
            <button onClick={() => navigate('/market')} className="flex items-center gap-1.5 px-3 py-2 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg text-xs font-semibold border border-gray-200 dark:border-gray-700 whitespace-nowrap">
              <TrendingUp size={12} /> Piyasa
            </button>
            <button onClick={() => navigate('/rebalancing')} className="flex items-center gap-1.5 px-3 py-2 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg text-xs font-semibold border border-gray-200 dark:border-gray-700 whitespace-nowrap">
              <RefreshCw size={12} /> Rebalance
            </button>
            <button onClick={() => navigate('/watchlist')} className="flex items-center gap-1.5 px-3 py-2 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg text-xs font-semibold border border-gray-200 dark:border-gray-700 whitespace-nowrap">
              <Target size={12} /> İzleme
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
