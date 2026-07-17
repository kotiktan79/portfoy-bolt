import { useEffect, useMemo, useState } from 'react';
import { Target, TrendingUp, Flag, Wallet } from 'lucide-react';
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  ReferenceLine,
} from 'recharts';
import { supabase } from '../lib/supabase';
import { projectFire, FireInputs } from '../services/fireProjectionService';
import { usePortfolio } from '../contexts/PortfolioContext';
import { useDarkMode } from '../hooks/useDarkMode';
import { chartChrome, fmtUSD0 } from '../lib/chartTheme';

// Kalıcı kullanıcı varsayımları (USD bazlı projeksiyon)
const STORAGE_KEY = 'tandor_fire_inputs';

interface StoredInputs {
  monthlyContribution: number;
  annualReturnPct: number;
  targetMonthlyIncome: number;
  safeWithdrawalRatePct: number;
  annualInflationPct: number;
}

const DEFAULTS: StoredInputs = {
  monthlyContribution: 4000,
  annualReturnPct: 8,
  targetMonthlyIncome: 2000,
  safeWithdrawalRatePct: 4,
  annualInflationPct: 3,
};

function loadStored(): StoredInputs | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    return { ...DEFAULTS, ...p };
  } catch {
    return null;
  }
}

const fmtAxisUSD = (n: number): string => {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `$${(abs / 1_000_000).toLocaleString('en-US', { maximumFractionDigits: 1 })}M`;
  if (abs >= 1_000) return `$${(abs / 1_000).toLocaleString('en-US', { maximumFractionDigits: 0 })}K`;
  return fmtUSD0(n);
};

export default function FireProjection() {
  const { portfolioMetrics } = usePortfolio();
  const { isDark } = useDarkMode();
  const chrome = chartChrome(isDark);

  const [inputs, setInputs] = useState<StoredInputs>(() => loadStored() || DEFAULTS);
  const [hydratedFromDb, setHydratedFromDb] = useState(false);

  // localStorage'da kayıt yoksa varsayılanları canlı veriden türet:
  // hedef gelir = maaş paneli hedefi, aylık katkı = son 90 günün deposit ortalaması.
  useEffect(() => {
    if (loadStored()) {
      setHydratedFromDb(true);
      return;
    }
    let cancelled = false;
    (async () => {
      const since = new Date();
      since.setDate(since.getDate() - 90);
      const [salary, cur, past] = await Promise.all([
        supabase.from('salary_settings').select('target_monthly_usd').eq('id', 1).maybeSingle(),
        supabase.from('portfolio_snapshots').select('total_deposits_usd').order('snapshot_date', { ascending: false }).limit(1).maybeSingle(),
        supabase.from('portfolio_snapshots').select('total_deposits_usd').gte('snapshot_date', since.toISOString().slice(0, 10)).order('snapshot_date', { ascending: true }).limit(1).maybeSingle(),
      ]);
      if (cancelled) return;
      const next = { ...DEFAULTS };
      if (salary.data?.target_monthly_usd) next.targetMonthlyIncome = Number(salary.data.target_monthly_usd);
      const curDep = Number(cur.data?.total_deposits_usd);
      const pastDep = Number(past.data?.total_deposits_usd);
      if (Number.isFinite(curDep) && Number.isFinite(pastDep) && curDep > pastDep) {
        next.monthlyContribution = Math.round((curDep - pastDep) / 3);
      }
      setInputs(next);
      setHydratedFromDb(true);
    })();
    return () => { cancelled = true; };
  }, []);

  function update(field: keyof StoredInputs, raw: string) {
    const v = parseFloat(raw);
    const next = { ...inputs, [field]: Number.isFinite(v) ? v : 0 };
    setInputs(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }

  const currentValueUsd = portfolioMetrics.totalCurrentValueUSD;

  const projection = useMemo(() => {
    const fi: FireInputs = { currentValue: currentValueUsd, ...inputs };
    return projectFire(fi);
  }, [currentValueUsd, inputs]);

  const baseYear = new Date().getFullYear();
  const chartData = useMemo(
    () =>
      projection.yearByYear.map((y) => ({
        yearLabel: String(baseYear + y.year),
        value: y.endOfYearValue,
        principal: currentValueUsd + y.contributionsYTD,
        monthlyAtSWR: y.monthlyIncomeAtSWR,
        growthYTD: y.growthYTD,
      })),
    [projection, baseYear, currentValueUsd]
  );

  const seriesColor = isDark ? '#3987e5' : '#2a78d6';
  const principalColor = isDark ? '#9085e9' : '#4a3aa7';
  const targetReached = projection.yearsToTarget !== null;

  const inputFields: { key: keyof StoredInputs; label: string; suffix: string; step: string }[] = [
    { key: 'monthlyContribution', label: 'Aylık katkı', suffix: '$', step: '100' },
    { key: 'annualReturnPct', label: 'Yıllık getiri', suffix: '%', step: '0.5' },
    { key: 'targetMonthlyIncome', label: 'Hedef aylık gelir', suffix: '$', step: '100' },
    { key: 'safeWithdrawalRatePct', label: 'Güvenli çekim (SWR)', suffix: '%', step: '0.5' },
    { key: 'annualInflationPct', label: 'Enflasyon (USD)', suffix: '%', step: '0.5' },
  ];

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-slate-200 dark:border-gray-700 overflow-hidden">
      <div className="p-5 border-b border-slate-200 dark:border-gray-700 flex items-center gap-2">
        <Target className="text-brand-600 dark:text-brand-400" size={22} />
        <div>
          <h3 className="text-lg font-bold text-gray-900 dark:text-white">FIRE Projeksiyonu</h3>
          <p className="text-xs text-slate-500 dark:text-gray-400">
            Mevcut portföy + aylık katkı ile finansal bağımsızlık hedefine gidiş (USD)
          </p>
        </div>
      </div>

      {/* Varsayımlar */}
      <div className="p-5 grid grid-cols-2 md:grid-cols-5 gap-3 border-b border-slate-200 dark:border-gray-700">
        {inputFields.map((f) => (
          <label key={f.key} className="block">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-gray-400">
              {f.label}
            </span>
            <div className="mt-1 flex items-center gap-1 bg-slate-50 dark:bg-gray-900/60 border border-slate-200 dark:border-gray-600 rounded-lg px-2 py-1.5">
              <input
                type="number"
                step={f.step}
                value={inputs[f.key]}
                onChange={(e) => update(f.key, e.target.value)}
                className="w-full bg-transparent text-sm font-bold text-gray-900 dark:text-white outline-none"
              />
              <span className="text-xs text-slate-400">{f.suffix}</span>
            </div>
          </label>
        ))}
      </div>

      {/* Özet kartlar */}
      <div className="p-5 grid grid-cols-2 lg:grid-cols-4 gap-3">
        <SummaryTile
          icon={<Flag size={14} />}
          label="Hedef portföy"
          value={fmtUSD0(projection.targetPortfolio)}
          sub={`$${inputs.targetMonthlyIncome.toLocaleString('en-US')}/ay ÷ %${inputs.safeWithdrawalRatePct} SWR`}
        />
        <SummaryTile
          icon={<Wallet size={14} />}
          label="Bugün SWR ile"
          value={`${fmtUSD0(projection.currentMonthlyAtSWR)}/ay`}
          sub={`Portföy ${fmtUSD0(currentValueUsd)}`}
        />
        <SummaryTile
          icon={<TrendingUp size={14} />}
          label="Hedefe kalan"
          value={targetReached ? `${projection.yearsToTarget} yıl (${baseYear + (projection.yearsToTarget || 0)})` : '25+ yıl'}
          sub={targetReached ? `Açık: ${fmtUSD0(projection.currentGap)}` : 'Bu varsayımlarla ulaşılamıyor'}
          warn={!targetReached}
        />
        <SummaryTile
          icon={<Target size={14} />}
          label="Enflasyon düzeltmeli hedef"
          value={fmtUSD0(projection.inflationAdjustedTarget)}
          sub={`%${inputs.annualInflationPct}/yıl ile hedef yılındaki eşdeğer`}
        />
      </div>

      {/* Grafik */}
      <div className="px-5 pb-5">
        <ResponsiveContainer width="100%" height={320}>
          <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
            <defs>
              <linearGradient id="fireGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={seriesColor} stopOpacity={0.2} />
                <stop offset="95%" stopColor={seriesColor} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke={chrome.grid} />
            <XAxis dataKey="yearLabel" tick={{ fontSize: 12, fill: chrome.axis }} axisLine={false} tickLine={false} />
            <YAxis
              tick={{ fontSize: 12, fill: chrome.axis }}
              axisLine={false}
              tickLine={false}
              tickFormatter={fmtAxisUSD}
              width={64}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload || payload.length === 0) return null;
                const d = payload[0].payload;
                return (
                  <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-3 space-y-1">
                    <p className="text-xs text-gray-500 dark:text-gray-400">{d.yearLabel} sonu</p>
                    <p className="text-sm font-bold text-gray-900 dark:text-white">
                      Portföy: {fmtUSD0(d.value)}
                    </p>
                    <p className="text-xs text-gray-600 dark:text-gray-300">
                      Anapara+katkı: {fmtUSD0(d.principal)} · O yıl büyüme: {fmtUSD0(d.growthYTD)}
                    </p>
                    <p className="text-xs text-gray-600 dark:text-gray-300">
                      SWR ile aylık: {fmtUSD0(d.monthlyAtSWR)}
                    </p>
                  </div>
                );
              }}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {projection.targetPortfolio > 0 && (
              <ReferenceLine
                y={projection.targetPortfolio}
                stroke={chrome.neutralLine}
                strokeDasharray="6 4"
                label={{
                  value: `Hedef ${fmtAxisUSD(projection.targetPortfolio)}`,
                  position: 'insideTopRight',
                  fill: chrome.axis,
                  fontSize: 11,
                }}
              />
            )}
            <Area
              type="monotone"
              dataKey="value"
              name="Projeksiyon"
              stroke={seriesColor}
              strokeWidth={2}
              fill="url(#fireGradient)"
              dot={false}
              activeDot={{ r: 5, strokeWidth: 2 }}
            />
            <Line
              type="monotone"
              dataKey="principal"
              name="Anapara + katkı"
              stroke={principalColor}
              strokeWidth={2}
              strokeDasharray="4 3"
              dot={false}
              activeDot={{ r: 4 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
        {!hydratedFromDb && (
          <p className="text-[11px] text-slate-400 mt-1">Varsayılanlar yükleniyor…</p>
        )}
      </div>

      {/* Yıl yıl tablo */}
      <div className="px-5 pb-5 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500 dark:text-gray-400 border-b border-slate-200 dark:border-gray-700">
              <th className="py-2 pr-3">Yıl</th>
              <th className="py-2 pr-3 text-right">Yıl sonu değer</th>
              <th className="py-2 pr-3 text-right">Toplam katkı</th>
              <th className="py-2 pr-3 text-right">O yıl büyüme</th>
              <th className="py-2 text-right">SWR ile aylık</th>
            </tr>
          </thead>
          <tbody>
            {projection.yearByYear.map((y) => (
              <tr
                key={y.year}
                className={`border-b border-slate-100 dark:border-gray-700/50 ${
                  y.reachedTarget ? 'bg-emerald-50/60 dark:bg-emerald-950/20' : ''
                }`}
              >
                <td className="py-1.5 pr-3 font-semibold text-gray-900 dark:text-white">
                  {baseYear + y.year}
                  {projection.yearsToTarget === y.year && (
                    <span className="ml-2 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">🎯 HEDEF</span>
                  )}
                </td>
                <td className="py-1.5 pr-3 text-right font-semibold text-gray-900 dark:text-white">{fmtUSD0(y.endOfYearValue)}</td>
                <td className="py-1.5 pr-3 text-right text-slate-600 dark:text-gray-300">{fmtUSD0(y.contributionsYTD)}</td>
                <td className="py-1.5 pr-3 text-right text-slate-600 dark:text-gray-300">{fmtUSD0(y.growthYTD)}</td>
                <td className="py-1.5 text-right text-slate-600 dark:text-gray-300">{fmtUSD0(y.monthlyIncomeAtSWR)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SummaryTile({
  icon,
  label,
  value,
  sub,
  warn,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  warn?: boolean;
}) {
  return (
    <div
      className={`rounded-xl p-3 border ${
        warn
          ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900'
          : 'bg-slate-50 dark:bg-gray-900/60 border-slate-200 dark:border-gray-700'
      }`}
    >
      <p className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-gray-400 flex items-center gap-1 mb-1">
        {icon} {label}
      </p>
      <p className={`text-lg font-bold ${warn ? 'text-amber-700 dark:text-amber-300' : 'text-gray-900 dark:text-white'}`}>
        {value}
      </p>
      {sub && <p className="text-[11px] text-slate-500 dark:text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}
