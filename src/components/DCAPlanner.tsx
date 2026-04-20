import { useState, useEffect, useMemo, useCallback } from 'react';
import { Calendar, DollarSign, Plus, Trash2, Clock, TrendingUp } from 'lucide-react';
import { usePortfolio } from '../contexts/PortfolioContext';
import { analyzePortfolio } from '../services/smartInvestmentEngine';
import { formatCurrency } from '../services/priceService';

interface DCAConfig {
  id: string;
  monthlyAmount: number;
  frequency: 'weekly' | 'biweekly' | 'monthly';
  startDate: string; // ISO date
  isActive: boolean;
  createdAt: string;
}

const STORAGE_KEY = 'tandor_dca_plans';

const FREQUENCY_LABELS: Record<DCAConfig['frequency'], string> = {
  weekly: 'Haftalik',
  biweekly: '2 Haftalik',
  monthly: 'Aylik',
};

const FREQUENCY_DAYS: Record<DCAConfig['frequency'], number> = {
  weekly: 7,
  biweekly: 14,
  monthly: 30,
};

function loadPlans(): DCAConfig[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as DCAConfig[]) : [];
  } catch {
    return [];
  }
}

function savePlans(plans: DCAConfig[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(plans));
}

function getNextInvestmentDate(plan: DCAConfig): Date {
  const now = new Date();
  const start = new Date(plan.startDate);
  const intervalDays = FREQUENCY_DAYS[plan.frequency];

  if (start > now) return start;

  const diffMs = now.getTime() - start.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  const periodsPassed = Math.floor(diffDays / intervalDays);
  const nextDate = new Date(start.getTime() + (periodsPassed + 1) * intervalDays * 24 * 60 * 60 * 1000);
  return nextDate;
}

function getInvestmentsThisYear(plan: DCAConfig): number {
  const now = new Date();
  const yearStart = new Date(now.getFullYear(), 0, 1);
  const start = new Date(plan.startDate);
  const effectiveStart = start > yearStart ? start : yearStart;

  if (effectiveStart > now) return 0;

  const diffMs = now.getTime() - effectiveStart.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  const intervalDays = FREQUENCY_DAYS[plan.frequency];
  const periods = Math.floor(diffDays / intervalDays) + 1;

  // Amount per period
  let amountPerPeriod: number;
  if (plan.frequency === 'weekly') {
    amountPerPeriod = plan.monthlyAmount / 4;
  } else if (plan.frequency === 'biweekly') {
    amountPerPeriod = plan.monthlyAmount / 2;
  } else {
    amountPerPeriod = plan.monthlyAmount;
  }

  return periods * amountPerPeriod;
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('tr-TR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function DCAPlanner() {
  const { holdings, totalCashValue, toast } = usePortfolio();

  const [plans, setPlans] = useState<DCAConfig[]>(loadPlans);
  const [showForm, setShowForm] = useState(false);
  const [monthlyAmount, setMonthlyAmount] = useState('');
  const [frequency, setFrequency] = useState<DCAConfig['frequency']>('monthly');

  useEffect(() => {
    savePlans(plans);
  }, [plans]);

  const handleAdd = useCallback(() => {
    const amount = parseFloat(monthlyAmount);
    if (isNaN(amount) || amount <= 0) return;

    const newPlan: DCAConfig = {
      id: crypto.randomUUID(),
      monthlyAmount: amount,
      frequency,
      startDate: new Date().toISOString(),
      isActive: true,
      createdAt: new Date().toISOString(),
    };

    setPlans((prev) => [...prev, newPlan]);
    setMonthlyAmount('');
    setFrequency('monthly');
    setShowForm(false);
  }, [monthlyAmount, frequency]);

  const handleDelete = useCallback((id: string) => {
    setPlans((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const handleToggleActive = useCallback((id: string) => {
    setPlans((prev) =>
      prev.map((p) => (p.id === id ? { ...p, isActive: !p.isActive } : p))
    );
  }, []);

  const handleInvestToday = useCallback(() => {
    toast.success('Hatirlatma: Bugun yatiriminizi yapmay unutmayin!');
  }, [toast]);

  // Summary calculations
  const summary = useMemo(() => {
    const activePlans = plans.filter((p) => p.isActive);
    const totalMonthly = activePlans.reduce((sum, p) => sum + p.monthlyAmount, 0);
    const totalYearly = totalMonthly * 12;
    const totalInvestedThisYear = activePlans.reduce(
      (sum, p) => sum + getInvestmentsThisYear(p),
      0
    );
    return { totalMonthly, totalYearly, totalInvestedThisYear, activePlans: activePlans.length };
  }, [plans]);

  // AI allocation for each plan
  const report = useMemo(() => {
    if (holdings.length === 0) return null;
    try {
      return analyzePortfolio(holdings, totalCashValue);
    } catch {
      return null;
    }
  }, [holdings, totalCashValue]);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-slate-200 dark:border-gray-700 p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-gray-300 uppercase tracking-wider flex items-center gap-2">
          <DollarSign className="text-accent-500" size={16} />
          DCA Yatirim Plani
        </h3>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-1 text-xs font-medium text-brand-600 dark:text-brand-400 hover:text-brand-700 dark:hover:text-brand-300 transition-colors"
        >
          <Plus size={14} />
          Yeni Plan Ekle
        </button>
      </div>

      {/* Summary Bar */}
      {plans.length > 0 && (
        <div className="mb-4 p-3 bg-accent-50 dark:bg-accent-900/20 rounded-lg border border-accent-200 dark:border-accent-800">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-3">
              <span className="text-accent-700 dark:text-accent-300 font-medium">
                Aylik toplam: <span className="font-bold">{formatCurrency(summary.totalMonthly)} &#8378;</span>
              </span>
              <span className="text-accent-600 dark:text-accent-400">
                Yillik: <span className="font-bold">{formatCurrency(summary.totalYearly)} &#8378;</span>
              </span>
            </div>
            <span className="text-accent-600 dark:text-accent-400">
              Bu yil: {formatCurrency(summary.totalInvestedThisYear)} &#8378;
            </span>
          </div>
        </div>
      )}

      {/* Add Form */}
      {showForm && (
        <div className="mb-4 p-3 bg-slate-50 dark:bg-gray-700/50 rounded-lg border border-slate-200 dark:border-gray-600 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-slate-500 dark:text-gray-400 mb-1">
                Aylik Tutar (&#8378;)
              </label>
              <input
                type="number"
                placeholder="orn: 5000"
                value={monthlyAmount}
                onChange={(e) => setMonthlyAmount(e.target.value)}
                min="0"
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-slate-700 dark:text-gray-200 placeholder-slate-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-500 dark:text-gray-400 mb-1">
                Sıklık
              </label>
              <select
                value={frequency}
                onChange={(e) => setFrequency(e.target.value as DCAConfig['frequency'])}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-slate-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                <option value="weekly">Haftalik</option>
                <option value="biweekly">2 Haftalik</option>
                <option value="monthly">Aylik</option>
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleAdd}
              className="px-4 py-2 text-xs font-medium text-white bg-brand-600 hover:bg-brand-700 rounded-lg transition-colors"
            >
              Ekle
            </button>
            <button
              onClick={() => setShowForm(false)}
              className="px-4 py-2 text-xs font-medium text-slate-500 dark:text-gray-400 hover:text-slate-700 dark:hover:text-gray-200 transition-colors"
            >
              Iptal
            </button>
          </div>
        </div>
      )}

      {/* Plans list */}
      {plans.length === 0 ? (
        <div className="text-center py-8">
          <Calendar className="mx-auto text-slate-300 dark:text-gray-600 mb-2" size={32} />
          <p className="text-sm text-slate-400 dark:text-gray-500">
            Henuz bir DCA planiniz yok.
          </p>
          <p className="text-xs text-slate-400 dark:text-gray-500 mt-1">
            Duzenli yatirim plani olusturmak icin &quot;Yeni Plan Ekle&quot; butonuna tiklayin.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {plans.map((plan) => {
            const nextDate = getNextInvestmentDate(plan);
            const investedThisYear = getInvestmentsThisYear(plan);
            const allocation = report?.newMoneyPlan(plan.monthlyAmount) ?? [];

            return (
              <div
                key={plan.id}
                className={`p-3 rounded-lg border transition-opacity ${
                  plan.isActive
                    ? 'bg-slate-50 dark:bg-gray-700/30 border-slate-100 dark:border-gray-700'
                    : 'bg-slate-50/50 dark:bg-gray-700/10 border-slate-100/50 dark:border-gray-700/50 opacity-60'
                }`}
              >
                {/* Header row */}
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-slate-700 dark:text-gray-200">
                      {formatCurrency(plan.monthlyAmount)} &#8378;/ay
                    </span>
                    <span className="text-[10px] font-medium text-slate-500 dark:text-gray-400 bg-white dark:bg-gray-700 px-1.5 py-0.5 rounded border border-slate-200 dark:border-gray-600">
                      {FREQUENCY_LABELS[plan.frequency]}
                    </span>
                    {!plan.isActive && (
                      <span className="text-[10px] font-medium text-brand-500 dark:text-brand-400">
                        Duraklatildi
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleToggleActive(plan.id)}
                      className={`text-[10px] font-medium px-2 py-0.5 rounded transition-colors ${
                        plan.isActive
                          ? 'text-brand-600 hover:bg-brand-50 dark:text-brand-400 dark:hover:bg-brand-900/20'
                          : 'text-green-600 hover:bg-green-50 dark:text-green-400 dark:hover:bg-green-900/20'
                      }`}
                      title={plan.isActive ? 'Duraklat' : 'Devam Ettir'}
                    >
                      {plan.isActive ? 'Duraklat' : 'Devam'}
                    </button>
                    <button
                      onClick={() => handleDelete(plan.id)}
                      className="text-slate-400 hover:text-red-500 dark:text-gray-500 dark:hover:text-red-400 transition-colors p-0.5"
                      title="Plani sil"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                {/* AI allocation breakdown */}
                {plan.isActive && allocation.length > 0 && (
                  <div className="mb-2 p-2 bg-brand-50 dark:bg-brand-900/15 rounded-md border border-brand-100 dark:border-brand-800/40">
                    <p className="text-[10px] font-medium text-brand-600 dark:text-brand-400 mb-1 flex items-center gap-1">
                      <TrendingUp size={10} />
                      AI Onerilen Dagilim
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {allocation.slice(0, 5).map((item) => (
                        <span
                          key={item.symbol}
                          className="text-[11px] font-medium text-slate-600 dark:text-gray-300 bg-white dark:bg-gray-700 px-2 py-0.5 rounded border border-slate-200 dark:border-gray-600"
                        >
                          {item.symbol}: {formatCurrency(item.amount)} &#8378;
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Stats row */}
                <div className="flex items-center justify-between text-[11px] text-slate-400 dark:text-gray-500">
                  <span className="flex items-center gap-1">
                    <Clock size={11} />
                    Sonraki: {formatDate(nextDate)}
                  </span>
                  <span className="flex items-center gap-1">
                    <TrendingUp size={11} />
                    Bu yil: {formatCurrency(investedThisYear)} &#8378;
                  </span>
                </div>

                {/* Invest today button */}
                {plan.isActive && (
                  <button
                    onClick={handleInvestToday}
                    className="mt-2 w-full py-1.5 text-[11px] font-medium text-accent-600 dark:text-accent-400 bg-accent-50 dark:bg-accent-900/20 hover:bg-accent-100 dark:hover:bg-accent-900/30 rounded-md border border-accent-200 dark:border-accent-800 transition-colors"
                  >
                    Bugun Yatir
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
