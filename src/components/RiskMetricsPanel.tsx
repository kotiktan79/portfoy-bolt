import { useEffect, useState } from 'react';
import { ShieldAlert, TrendingUp, TrendingDown, Activity } from 'lucide-react';
import { getHistoricalSnapshots } from '../services/analyticsService';
import { computeRiskMetrics, RiskMetrics } from '../services/riskMetricsService';
import { fmtTRY0 } from '../lib/chartTheme';

const MONTH_NAMES_TR = [
  'Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz',
  'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara',
];

function fmtDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return `${d.getDate()} ${MONTH_NAMES_TR[d.getMonth()]} ${d.getFullYear()}`;
}

// Tüm geçmiş üzerinden deposit-arındırılmış risk metrikleri. Grafikteki dönem
// seçiciden bağımsızdır — Sharpe/drawdown kısa pencerede anlamsızlaşır.
export function RiskMetricsPanel() {
  const [metrics, setMetrics] = useState<RiskMetrics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getHistoricalSnapshots(10000)
      .then((snaps) => { if (!cancelled) setMetrics(computeRiskMetrics(snaps)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-slate-200 dark:border-gray-700 p-6">
        <div className="h-24 bg-slate-100 dark:bg-gray-700 rounded-lg animate-pulse" />
      </div>
    );
  }

  if (!metrics) return null;

  const inDrawdown = metrics.currentDrawdownPct > 0.5;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-slate-200 dark:border-gray-700 overflow-hidden">
      <div className="p-5 border-b border-slate-200 dark:border-gray-700 flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <ShieldAlert className="text-brand-600 dark:text-brand-400" size={22} />
          <div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">Risk Metrikleri</h3>
            <p className="text-xs text-slate-500 dark:text-gray-400">
              {metrics.observationDays} gözlem günü · deposit-arındırılmış getiriler üzerinden
            </p>
          </div>
        </div>
        {inDrawdown && (
          <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300">
            Zirveden −%{metrics.currentDrawdownPct.toFixed(1)}
          </span>
        )}
      </div>

      <div className="p-5 grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricTile
          label="Yıllıklandırılmış getiri"
          value={`${metrics.annualizedReturn >= 0 ? '+' : ''}%${(metrics.annualizedReturn * 100).toFixed(1)}`}
          positive={metrics.annualizedReturn >= 0}
          sub="Bileşik, nakit akışından arındırılmış"
        />
        <MetricTile
          label="Yıllık volatilite"
          value={`%${(metrics.annualizedVolatility * 100).toFixed(1)}`}
          sub={`Günlük ort. %${(metrics.volatility * 100).toFixed(2)}`}
        />
        <MetricTile
          label="Sharpe oranı"
          value={metrics.sharpeRatio != null ? metrics.sharpeRatio.toFixed(2) : '—'}
          positive={metrics.sharpeRatio != null ? metrics.sharpeRatio > 0 : undefined}
          sub="Risksiz oran: %40 (TRY)"
        />
        <MetricTile
          label="Sortino oranı"
          value={metrics.sortinoRatio != null ? metrics.sortinoRatio.toFixed(2) : '—'}
          positive={metrics.sortinoRatio != null ? metrics.sortinoRatio > 0 : undefined}
          sub="Sadece aşağı yön riski"
        />
        <MetricTile
          label="Maks. düşüş"
          value={`−%${metrics.maxDrawdownPct.toFixed(1)}`}
          positive={false}
          sub={`≈${fmtTRY0(metrics.maxDrawdownValueTry)} · ${fmtDate(metrics.maxDrawdownStart)} → ${fmtDate(metrics.maxDrawdownTrough)}${metrics.maxDrawdownRecovered ? ` · toparlandı ${fmtDate(metrics.maxDrawdownRecovered)}` : ' · henüz toparlanmadı'}`}
        />
        <MetricTile
          label="Pozitif gün oranı"
          value={`%${metrics.positiveDaysPct.toFixed(0)}`}
          sub={`${metrics.observationDays} günün ${Math.round((metrics.positiveDaysPct / 100) * metrics.observationDays)}'i artıda`}
        />
        <MetricTile
          label="En iyi gün"
          value={metrics.bestDay ? `+%${metrics.bestDay.changePct.toFixed(2)}` : '—'}
          positive
          icon={<TrendingUp size={12} />}
          sub={metrics.bestDay ? `${fmtDate(metrics.bestDay.date)} · +${fmtTRY0(metrics.bestDay.changeTry)}` : undefined}
        />
        <MetricTile
          label="En kötü gün"
          value={metrics.worstDay ? `%${metrics.worstDay.changePct.toFixed(2)}` : '—'}
          positive={false}
          icon={<TrendingDown size={12} />}
          sub={metrics.worstDay ? `${fmtDate(metrics.worstDay.date)} · ${fmtTRY0(metrics.worstDay.changeTry)}` : undefined}
        />
      </div>

      <p className="px-5 pb-4 text-[11px] text-slate-400 dark:text-gray-500 flex items-center gap-1">
        <Activity size={11} /> Haftalık alımlar getiri sayılmaz: tüm metrikler deposit/çekim etkisi çıkarılarak hesaplanır.
      </p>
    </div>
  );
}

function MetricTile({
  label,
  value,
  sub,
  positive,
  icon,
}: {
  label: string;
  value: string;
  sub?: string;
  positive?: boolean;
  icon?: React.ReactNode;
}) {
  const valueColor =
    positive === undefined
      ? 'text-gray-900 dark:text-white'
      : positive
        ? 'text-green-600 dark:text-green-400'
        : 'text-red-600 dark:text-red-400';
  return (
    <div className="rounded-xl p-3 bg-slate-50 dark:bg-gray-900/60 border border-slate-200 dark:border-gray-700">
      <p className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-gray-400 flex items-center gap-1 mb-1">
        {icon} {label}
      </p>
      <p className={`text-lg font-bold ${valueColor}`}>{value}</p>
      {sub && <p className="text-[10px] text-slate-500 dark:text-gray-400 mt-0.5 leading-snug">{sub}</p>}
    </div>
  );
}
