import { useEffect, useMemo, useState } from 'react';
import { Activity, TrendingDown, TrendingUp, Shield } from 'lucide-react';
import { getHistoricalSnapshots, PortfolioSnapshot } from '../services/analyticsService';
import { computeRiskMetrics } from '../services/riskMetricsService';
import { formatCurrency } from '../services/priceService';

const PERIODS: { label: string; days: number }[] = [
  { label: '30 gün', days: 30 },
  { label: '90 gün', days: 90 },
  { label: '1 yıl', days: 365 },
  { label: 'Tümü', days: 10000 },
];

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
}

function gradeSharpe(s: number | null): { label: string; color: string } {
  if (s === null) return { label: '–', color: 'text-gray-500' };
  if (s >= 2) return { label: 'Mükemmel', color: 'text-emerald-600' };
  if (s >= 1) return { label: 'İyi', color: 'text-emerald-500' };
  if (s >= 0.5) return { label: 'Vasat', color: 'text-amber-500' };
  if (s >= 0) return { label: 'Zayıf', color: 'text-red-500' };
  return { label: 'Negatif', color: 'text-red-600' };
}

export default function RiskMetricsCard() {
  const [period, setPeriod] = useState(90);
  const [snapshots, setSnapshots] = useState<PortfolioSnapshot[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getHistoricalSnapshots(period).then(data => {
      if (!cancelled) {
        setSnapshots(data);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [period]);

  const metrics = useMemo(() => computeRiskMetrics(snapshots), [snapshots]);

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6">
        <div className="text-sm text-gray-500 text-center">Risk metrikleri hesaplanıyor…</div>
      </div>
    );
  }

  if (!metrics) {
    return (
      <div className="rounded-2xl border border-slate-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6">
        <div className="text-sm text-gray-500 text-center">
          Yeterli snapshot verisi yok (en az 2 gün gerekli).
        </div>
      </div>
    );
  }

  const sharpeGrade = gradeSharpe(metrics.sharpeRatio);
  const sortinoGrade = gradeSharpe(metrics.sortinoRatio);

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden">
      <div className="p-4 border-b border-slate-200 dark:border-gray-800 flex items-center gap-3">
        <div className="p-2 bg-gradient-to-br from-slate-600 to-slate-800 rounded-xl shadow-md">
          <Shield className="text-white" size={18} />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-bold text-gray-900 dark:text-white">Risk Metrikleri</h3>
          <p className="text-xs text-gray-500">
            {metrics.observationDays} günlük gözlem · Risk-free %40 (TL mevduat)
          </p>
        </div>
        <div className="flex gap-1 bg-slate-100 dark:bg-gray-800 rounded-lg p-0.5">
          {PERIODS.map(opt => (
            <button
              key={opt.days}
              onClick={() => setPeriod(opt.days)}
              className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-colors ${
                period === opt.days
                  ? 'bg-slate-700 dark:bg-gray-700 text-white'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="p-4 space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Stat
            label="Yıllık Getiri"
            value={`%${(metrics.annualizedReturn * 100).toFixed(1)}`}
            sub="Annualized"
            color={metrics.annualizedReturn >= 0 ? 'text-emerald-600' : 'text-red-600'}
          />
          <Stat
            label="Volatilite"
            value={`%${(metrics.annualizedVolatility * 100).toFixed(1)}`}
            sub="Yıllık std sapma"
          />
          <Stat
            label="Sharpe"
            value={metrics.sharpeRatio === null ? '–' : metrics.sharpeRatio.toFixed(2)}
            sub={sharpeGrade.label}
            color={sharpeGrade.color}
          />
          <Stat
            label="Sortino"
            value={metrics.sortinoRatio === null ? '–' : metrics.sortinoRatio.toFixed(2)}
            sub={sortinoGrade.label}
            color={sortinoGrade.color}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="rounded-xl border border-red-200 dark:border-red-900 bg-red-50/50 dark:bg-red-950/20 p-3 space-y-1">
            <div className="flex items-center gap-1.5 text-[11px] font-bold text-red-700 dark:text-red-400 uppercase tracking-wider">
              <TrendingDown size={11} /> Maksimum Drawdown
            </div>
            <div className="text-lg font-bold text-red-700 dark:text-red-400">
              %{metrics.maxDrawdownPct.toFixed(2)}
            </div>
            <div className="text-xs text-red-600 dark:text-red-500">
              {formatCurrency(metrics.maxDrawdownValueTry, 0)} ₺ kayıp
            </div>
            {metrics.maxDrawdownStart && metrics.maxDrawdownTrough && (
              <div className="text-[10px] text-gray-500">
                {formatDate(metrics.maxDrawdownStart)} → {formatDate(metrics.maxDrawdownTrough)}
                {metrics.maxDrawdownRecovered && ` → ${formatDate(metrics.maxDrawdownRecovered)} (kapandı)`}
              </div>
            )}
            {metrics.currentDrawdownPct > 0.5 && (
              <div className="text-[10px] font-semibold text-amber-700 dark:text-amber-400 mt-1">
                Şu an: %{metrics.currentDrawdownPct.toFixed(2)} drawdown'da
              </div>
            )}
          </div>

          <div className="rounded-xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50/50 dark:bg-emerald-950/20 p-3 space-y-1">
            <div className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">
              <TrendingUp size={11} /> Pozitif Gün Oranı
            </div>
            <div className="text-lg font-bold text-emerald-700 dark:text-emerald-400">
              %{metrics.positiveDaysPct.toFixed(0)}
            </div>
            <div className="text-xs text-emerald-600 dark:text-emerald-500">
              {Math.round((metrics.positiveDaysPct / 100) * metrics.observationDays)} / {metrics.observationDays} gün
            </div>
            {metrics.bestDay && metrics.worstDay && (
              <div className="text-[10px] text-gray-500">
                En iyi: %{metrics.bestDay.changePct.toFixed(2)} ({formatDate(metrics.bestDay.date)})
                <br />
                En kötü: %{metrics.worstDay.changePct.toFixed(2)} ({formatDate(metrics.worstDay.date)})
              </div>
            )}
          </div>
        </div>

        <div className="flex items-start gap-1.5 p-2 rounded-lg bg-slate-50 dark:bg-gray-800/40 border border-slate-200 dark:border-gray-800">
          <Activity size={12} className="mt-0.5 text-gray-500 flex-shrink-0" />
          <p className="text-[10px] text-gray-600 dark:text-gray-400 leading-relaxed">
            <strong>Sharpe</strong>: getiri ÷ volatilite (yüksek = iyi). 1+ tatmin edici, 2+ mükemmel.
            <strong className="ml-2">Sortino</strong>: aşağı volatiliteye göre, daha gerçekçi.
            <strong className="ml-2">Drawdown</strong>: tepe noktasından dip noktasına kayıp yüzdesi.
            Hesap günlük snapshot'lardan, %40 risk-free oranıyla yapılır.
          </p>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, sub, color }: { label: string; value: string; sub: string; color?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-gray-800 bg-slate-50/50 dark:bg-gray-800/30 p-3">
      <div className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
        {label}
      </div>
      <div className={`text-lg font-bold mt-0.5 tabular-nums ${color || 'text-gray-900 dark:text-gray-100'}`}>
        {value}
      </div>
      <div className="text-[10px] text-gray-500">{sub}</div>
    </div>
  );
}
