import { useMemo, useState } from 'react';
import { Wallet, TrendingUp, ArrowRight, Sparkles } from 'lucide-react';
import { usePortfolio } from '../contexts/PortfolioContext';
import { analyzePortfolio, NewMoneyAllocation } from '../services/smartInvestmentEngine';
import { formatCurrency } from '../services/priceService';
import { Card, CardHeader, CardBody } from './ui/Card';

const PRESET_AMOUNTS = [5000, 10000, 25000, 50000, 100000, 250000];

const TYPE_LABELS: Record<string, string> = {
  stock: 'Hisse',
  crypto: 'Kripto',
  currency: 'Döviz',
  fund: 'Fon',
  eurobond: 'Eurobond',
  commodity: 'Emtia',
  cash: 'Nakit',
};

const TYPE_COLORS: Record<string, string> = {
  stock: 'bg-brand-500',
  crypto: 'bg-amber-500',
  currency: 'bg-accent-500',
  fund: 'bg-brand-500',
  eurobond: 'bg-brand-500',
  commodity: 'bg-yellow-500',
  cash: 'bg-gray-500',
};

export default function CashFlowRebalanceWidget() {
  const { holdings, totalCashValue } = usePortfolio();
  const [amount, setAmount] = useState<number>(0);

  const report = useMemo(
    () => analyzePortfolio(holdings, totalCashValue),
    [holdings, totalCashValue]
  );

  const plan: NewMoneyAllocation[] = useMemo(
    () => (amount > 0 ? report.newMoneyPlan(amount) : []),
    [amount, report]
  );

  const planByType = useMemo(() => {
    const grouped: Record<string, { amount: number; items: NewMoneyAllocation[] }> = {};
    for (const item of plan) {
      if (!grouped[item.type]) grouped[item.type] = { amount: 0, items: [] };
      grouped[item.type].amount += item.amount;
      grouped[item.type].items.push(item);
    }
    return Object.entries(grouped).sort(([, a], [, b]) => b.amount - a.amount);
  }, [plan]);

  const beforeTotal = report.totalValue;
  const afterTotal = beforeTotal + amount;

  const driftRows = useMemo(() => {
    if (amount <= 0) return [];
    const currentByType: Record<string, number> = {};
    for (const a of report.currentAllocation) currentByType[a.type] = a.value;

    const addedByType: Record<string, number> = {};
    for (const item of plan) addedByType[item.type] = (addedByType[item.type] || 0) + item.amount;

    const allTypes = new Set([...Object.keys(currentByType), ...Object.keys(addedByType)]);
    return Array.from(allTypes).map(type => {
      const before = currentByType[type] || 0;
      const after = before + (addedByType[type] || 0);
      const idealItem = report.idealAllocation.find(i => i.type === type);
      return {
        type,
        beforePct: beforeTotal > 0 ? (before / beforeTotal) * 100 : 0,
        afterPct: afterTotal > 0 ? (after / afterTotal) * 100 : 0,
        targetPct: idealItem?.weight || 0,
      };
    }).sort((a, b) => b.afterPct - a.afterPct);
  }, [plan, amount, report, beforeTotal, afterTotal]);

  if (holdings.length === 0) return null;

  return (
    <Card>
      <CardHeader
        icon={Wallet}
        iconTone="accent"
        title="Yeni Para Dağıtım Planı"
        subtitle="Sat-al yapmadan, yeni nakitle dengesizlikleri kapat"
      />
      <CardBody>
        <div>
          <label className="block text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
            Eklenecek Tutar
          </label>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {PRESET_AMOUNTS.map(preset => (
              <button
                key={preset}
                onClick={() => setAmount(preset)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                  amount === preset
                    ? 'bg-accent-600 text-white'
                    : 'bg-slate-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-slate-200 dark:hover:bg-gray-700'
                }`}
              >
                {formatCurrency(preset)} ₺
              </button>
            ))}
          </div>
          <input
            type="number"
            value={amount || ''}
            onChange={e => setAmount(Math.max(0, parseFloat(e.target.value) || 0))}
            placeholder="Veya özel tutar gir (₺)"
            className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm focus:ring-2 focus:ring-accent-500 outline-none"
          />
        </div>

        {amount > 0 && plan.length > 0 && (
          <>
            <div className="space-y-2">
              <h4 className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles size={11} /> Önerilen Dağılım
              </h4>
              {planByType.map(([type, group]) => {
                const pctOfNew = (group.amount / amount) * 100;
                return (
                  <div key={type} className="rounded-xl border border-slate-200 dark:border-gray-800 p-3 bg-slate-50 dark:bg-gray-800/40">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${TYPE_COLORS[type] || 'bg-gray-500'}`} />
                        <span className="text-sm font-bold text-gray-900 dark:text-white">
                          {TYPE_LABELS[type] || type}
                        </span>
                        <span className="text-[10px] font-semibold text-gray-500 px-1.5 py-0.5 rounded bg-slate-200 dark:bg-gray-700">
                          %{pctOfNew.toFixed(0)}
                        </span>
                      </div>
                      <span className="text-sm font-bold text-accent-600 dark:text-accent-400">
                        {formatCurrency(group.amount)} ₺
                      </span>
                    </div>
                    <div className="space-y-1">
                      {group.items.map((item, i) => (
                        <div key={i} className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <span className="font-bold text-gray-900 dark:text-gray-100">{item.symbol}</span>
                            <span className="text-gray-500 dark:text-gray-400 truncate">— {item.reason}</span>
                          </div>
                          <span className="font-semibold text-gray-700 dark:text-gray-300 ml-2 flex-shrink-0">
                            {formatCurrency(item.amount)} ₺
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="space-y-2">
              <h4 className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                <TrendingUp size={11} /> Dağılım Etkisi
              </h4>
              <div className="rounded-xl border border-slate-200 dark:border-gray-800 p-3 space-y-1.5">
                {driftRows.map(row => {
                  const drift = row.afterPct - row.beforePct;
                  const distFromTarget = row.targetPct > 0 ? row.afterPct - row.targetPct : 0;
                  return (
                    <div key={row.type} className="flex items-center gap-2 text-xs">
                      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${TYPE_COLORS[row.type] || 'bg-gray-500'}`} />
                      <span className="font-semibold text-gray-800 dark:text-gray-200 w-16">
                        {TYPE_LABELS[row.type] || row.type}
                      </span>
                      <span className="text-gray-500 dark:text-gray-400 tabular-nums">
                        %{row.beforePct.toFixed(1)}
                      </span>
                      <ArrowRight size={10} className="text-gray-400" />
                      <span className="font-bold text-gray-900 dark:text-gray-100 tabular-nums">
                        %{row.afterPct.toFixed(1)}
                      </span>
                      {drift > 0.1 && (
                        <span className="text-[10px] font-semibold text-accent-600 dark:text-accent-400">
                          +%{drift.toFixed(1)}
                        </span>
                      )}
                      {row.targetPct > 0 && (
                        <span className={`ml-auto text-[10px] font-semibold tabular-nums ${
                          Math.abs(distFromTarget) <= 3 ? 'text-accent-600 dark:text-accent-400'
                          : Math.abs(distFromTarget) <= 8 ? 'text-amber-600 dark:text-amber-400'
                          : 'text-red-600 dark:text-red-400'
                        }`}>
                          hedef %{row.targetPct} ({distFromTarget >= 0 ? '+' : ''}{distFromTarget.toFixed(1)})
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
              <p className="text-[10px] text-gray-500 dark:text-gray-500 italic">
                Hedef = ideal dağılım. Yeşil ≤ %3 sapma · Sarı ≤ %8 · Kırmızı &gt; %8
              </p>
            </div>
          </>
        )}

        {amount > 0 && plan.length === 0 && (
          <div className="text-center py-4 text-sm text-gray-500 dark:text-gray-400">
            Portföyün dengeli — yeni para için belirgin bir eksik tür yok.
          </div>
        )}
      </CardBody>
    </Card>
  );
}
