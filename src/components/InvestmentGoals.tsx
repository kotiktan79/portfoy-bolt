import { useState, useEffect, useCallback } from 'react';
import { Target, Plus, Trash2, Calendar, TrendingUp } from 'lucide-react';
import { usePortfolio } from '../contexts/PortfolioContext';
import { formatCurrency } from '../services/priceService';

interface Goal {
  id: string;
  title: string;
  targetAmount: number;
  deadline: string;
  createdAt: string;
}

const STORAGE_KEY = 'tandor_investment_goals';

function loadGoals(): Goal[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) as Goal[] : [];
  } catch {
    return [];
  }
}

function saveGoals(goals: Goal[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(goals));
}

export function InvestmentGoals() {
  const { portfolioMetrics } = usePortfolio();
  const currentValue = portfolioMetrics.totalCurrentValue;

  const [goals, setGoals] = useState<Goal[]>(loadGoals);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [targetAmount, setTargetAmount] = useState('');
  const [deadline, setDeadline] = useState('');

  useEffect(() => {
    saveGoals(goals);
  }, [goals]);

  const handleAdd = useCallback(() => {
    const target = parseFloat(targetAmount);
    if (!title.trim() || isNaN(target) || target <= 0 || !deadline) return;

    const newGoal: Goal = {
      id: crypto.randomUUID(),
      title: title.trim(),
      targetAmount: target,
      deadline,
      createdAt: new Date().toISOString(),
    };

    setGoals((prev) => [...prev, newGoal]);
    setTitle('');
    setTargetAmount('');
    setDeadline('');
    setShowForm(false);
  }, [title, targetAmount, deadline]);

  const handleDelete = useCallback((id: string) => {
    setGoals((prev) => prev.filter((g) => g.id !== id));
  }, []);

  const getDaysRemaining = (deadlineStr: string): number => {
    const now = new Date();
    const end = new Date(deadlineStr);
    const diff = end.getTime() - now.getTime();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  };

  const getMonthlyNeeded = (target: number, deadlineStr: string): number => {
    const remaining = target - currentValue;
    if (remaining <= 0) return 0;
    const days = getDaysRemaining(deadlineStr);
    const months = days / 30;
    if (months <= 0) return remaining;
    return remaining / months;
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-slate-200 dark:border-gray-700 p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-gray-300 uppercase tracking-wider flex items-center gap-2">
          <Target className="text-brand-500" size={16} />
          Yatırım Hedefleri
        </h3>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-1 text-xs font-medium text-brand-600 dark:text-brand-400 hover:text-brand-700 dark:hover:text-brand-300 transition-colors"
        >
          <Plus size={14} />
          Hedef Ekle
        </button>
      </div>

      {showForm && (
        <div className="mb-4 p-3 bg-slate-50 dark:bg-gray-700/50 rounded-lg border border-slate-200 dark:border-gray-600 space-y-3">
          <input
            type="text"
            placeholder="Hedef adı (ör: Ev alımı)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-slate-700 dark:text-gray-200 placeholder-slate-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
          <div className="grid grid-cols-2 gap-3">
            <input
              type="number"
              placeholder="Hedef tutar (₺)"
              value={targetAmount}
              onChange={(e) => setTargetAmount(e.target.value)}
              min="0"
              className="px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-slate-700 dark:text-gray-200 placeholder-slate-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            <input
              type="date"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              className="px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-slate-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
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
              İptal
            </button>
          </div>
        </div>
      )}

      {goals.length === 0 ? (
        <div className="text-center py-8">
          <Target className="mx-auto text-slate-300 dark:text-gray-600 mb-2" size={32} />
          <p className="text-sm text-slate-400 dark:text-gray-500">
            Henüz bir yatırım hedefiniz yok.
          </p>
          <p className="text-xs text-slate-400 dark:text-gray-500 mt-1">
            Yukarıdaki &quot;Hedef Ekle&quot; butonuna tıklayarak başlayın.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {goals.map((goal) => {
            const progress = Math.min((currentValue / goal.targetAmount) * 100, 100);
            const daysLeft = getDaysRemaining(goal.deadline);
            const monthlyNeeded = getMonthlyNeeded(goal.targetAmount, goal.deadline);
            const isComplete = currentValue >= goal.targetAmount;

            return (
              <div
                key={goal.id}
                className="p-3 bg-slate-50 dark:bg-gray-700/30 rounded-lg border border-slate-100 dark:border-gray-700"
              >
                <div className="flex items-start justify-between mb-2">
                  <h4 className="text-sm font-semibold text-slate-700 dark:text-gray-200">
                    {goal.title}
                  </h4>
                  <button
                    onClick={() => handleDelete(goal.id)}
                    className="text-slate-400 hover:text-red-500 dark:text-gray-500 dark:hover:text-red-400 transition-colors p-0.5"
                    title="Hedefi sil"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>

                {/* Progress bar */}
                <div className="w-full h-2 bg-slate-200 dark:bg-gray-600 rounded-full overflow-hidden mb-2">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      isComplete
                        ? 'bg-green-500'
                        : progress > 60
                        ? 'bg-brand-500'
                        : progress > 30
                        ? 'bg-yellow-500'
                        : 'bg-brand-500'
                    }`}
                    style={{ width: `${progress}%` }}
                  />
                </div>

                <div className="flex items-center justify-between text-xs">
                  <span className={`font-mono tabular-nums font-medium ${
                    isComplete
                      ? 'text-green-600 dark:text-green-400'
                      : 'text-slate-600 dark:text-gray-300'
                  }`}>
                    ₺{formatCurrency(currentValue)} / ₺{formatCurrency(goal.targetAmount)}
                  </span>
                  <span className="text-slate-500 dark:text-gray-400 font-medium">
                    %{progress.toFixed(1)}
                  </span>
                </div>

                <div className="flex items-center justify-between mt-2 text-[11px] text-slate-400 dark:text-gray-500">
                  <span className="flex items-center gap-1">
                    <Calendar size={11} />
                    {daysLeft > 0 ? `${daysLeft} gün kaldı` : 'Süre doldu'}
                  </span>
                  {!isComplete && daysLeft > 0 && (
                    <span className="flex items-center gap-1">
                      <TrendingUp size={11} />
                      Aylık ₺{formatCurrency(monthlyNeeded)} gerekli
                    </span>
                  )}
                  {isComplete && (
                    <span className="text-green-600 dark:text-green-400 font-medium">
                      Hedefe ulaşıldı!
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
