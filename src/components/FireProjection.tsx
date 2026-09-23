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
import { projectFire, poolRuleCapitalFor, poolRuleMonthlyFrom, FireInputs } from '../services/fireProjectionService';
import { usePortfolio } from '../contexts/PortfolioContext';
import { useDarkMode } from '../hooks/useDarkMode';
import { chartChrome } from '../lib/chartTheme';

// HEDEFE ULAŞMA PLANI — EUR, kasa HARİÇ, dış katkı VARSAYILAN 0 (2026-09-20 denetimi).
// Eski sürüm USD'ydi, hedefi salary_settings'ten ($1.500) alıyordu ve 'aylık katkı'yı son 90 günün
// mevduat farkından türetiyordu — o fark kasa→portföy İÇ transferiydi ($7.076/ay 'katkı' sanıp
// '2 yıl 7 ay' diyordu). Gerçek: dış katkı yok, hedef €1.000/ay, gerçekçi getiriyle ~17-21 yıl.
import { MONTHLY_CAP_EUR, INFLATION_EUR, SALARY_SAFETY } from '../lib/eurPnl';
import { getEurDaily } from '../services/eurPnlService';
import { fmtEUR0, fmtAxisEUR } from '../lib/chartTheme';

const STORAGE_KEY = 'tandor_fire_inputs_eur';   // eski USD kayıtları ('tandor_fire_inputs') bilerek okunmaz

interface StoredInputs {
  monthlyContribution: number;
  annualReturnPct: number;
  targetMonthlyIncome: number;
  safeWithdrawalRatePct: number;
  annualInflationPct: number;
}

const DEFAULTS: StoredInputs = {
  monthlyContribution: 0,                     // dış katkı yok (kullanıcı beyanı 2026-09-18)
  annualReturnPct: 4,                         // politika dağılımı ~%4-5 nominal EUR; bugünkü (%40 nakit) ~%3
  targetMonthlyIncome: MONTHLY_CAP_EUR,       // €1.000/ay (geçim planı)
  safeWithdrawalRatePct: 3.5,                 // Morningstar 2025 %3,9 / ERN %3,25-3,4 bandının ortası
  annualInflationPct: INFLATION_EUR * 100,    // motorla aynı (%2)
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

export default function FireProjection() {
  const { portfolioMetrics } = usePortfolio();
  const { isDark } = useDarkMode();
  const chrome = chartChrome(isDark);

  const [inputs, setInputs] = useState<StoredInputs>(() => loadStored() || DEFAULTS);
  // Taban: motorun EUR serveti (kasa HARİÇ, kilitli kural). Motor gelmezse holdings'ten TL/EUR.
  const [wealthEUR, setWealthEUR] = useState<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    getEurDaily().then(d => { if (!cancelled && d.length) setWealthEUR(d[d.length - 1].wealthEUR); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  function update(field: keyof StoredInputs, raw: string) {
    const v = parseFloat(raw);
    const next = { ...inputs, [field]: Number.isFinite(v) ? v : 0 };
    setInputs(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }

  // Yedek: USD toplamı EUR'ya (motor gelene kadar); EUR/USD ≈ 1,15 varsayımı yalnız ilk render için
  const fallbackEUR = portfolioMetrics.totalCurrentValueUSD > 0 ? portfolioMetrics.totalCurrentValueUSD / 1.15 : 0;
  const currentValueEUR = wealthEUR ?? fallbackEUR;

  // Havuz kuralının (Kâr Cüzdanı) aynı hedef için istediği sermaye ve bugünkü portföyün beklentisi —
  // sayfanın kendi getiri/enflasyon girdilerinden türetilir, sabit rakam yok.
  const realRatePct = inputs.annualReturnPct - inputs.annualInflationPct;
  const poolRuleCapital = poolRuleCapitalFor(inputs.targetMonthlyIncome, realRatePct, SALARY_SAFETY);
  const poolRuleMonthlyNow = poolRuleMonthlyFrom(currentValueEUR, realRatePct, SALARY_SAFETY, MONTHLY_CAP_EUR);

  const projection = useMemo(() => {
    const fi: FireInputs = { currentValue: currentValueEUR, ...inputs };
    return projectFire(fi);
  }, [currentValueEUR, inputs]);

  const baseYear = new Date().getFullYear();
  const chartData = useMemo(
    () =>
      projection.yearByYear.map((y) => ({
        yearLabel: String(baseYear + y.year),
        value: y.endOfYearValue,
        principal: currentValueEUR + y.contributionsYTD,
        monthlyAtSWR: y.monthlyIncomeAtSWR,
        growthYTD: y.growthYTD,
      })),
    [projection, baseYear, currentValueEUR]
  );

  const seriesColor = isDark ? '#3987e5' : '#2a78d6';
  const principalColor = isDark ? '#9085e9' : '#4a3aa7';
  const targetReached = projection.yearsToTarget !== null;

  const inputFields: { key: keyof StoredInputs; label: string; suffix: string; step: string }[] = [
    { key: 'monthlyContribution', label: 'Aylık dış katkı', suffix: '€', step: '100' },
    { key: 'annualReturnPct', label: 'Yıllık getiri', suffix: '%', step: '0.5' },
    { key: 'targetMonthlyIncome', label: 'Hedef aylık gelir', suffix: '€', step: '100' },
    { key: 'safeWithdrawalRatePct', label: 'Güvenli çekim (SWR)', suffix: '%', step: '0.5' },
    { key: 'annualInflationPct', label: 'Enflasyon (EUR)', suffix: '%', step: '0.5' },
  ];

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-slate-200 dark:border-gray-700 overflow-hidden">
      <div className="p-5 border-b border-slate-200 dark:border-gray-700 flex items-center gap-2">
        <Target className="text-brand-600 dark:text-brand-400" size={22} />
        <div>
          <h3 className="text-lg font-bold text-gray-900 dark:text-white">Hedefe Ulaşma Planı (€)</h3>
          <p className="text-xs text-slate-500 dark:text-gray-400">
            Portföy €{Math.round(currentValueEUR).toLocaleString('de-DE')} (kasa hariç) + dış katkı → hedef aylık gelir. Hedef REEL: enflasyonla birlikte büyür.
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
          label="Hedef portföy (bugünkü €)"
          value={fmtEUR0(projection.targetPortfolio)}
          sub={`€${inputs.targetMonthlyIncome.toLocaleString('de-DE')}/ay ÷ %${inputs.safeWithdrawalRatePct} SWR`}
        />
        <SummaryTile
          icon={<Wallet size={14} />}
          label="Referans: SWR ile"
          value={`${fmtEUR0(projection.currentMonthlyAtSWR)}/ay`}
          sub="karşılaştırma ölçüsü — gerçek çekim hakkı Kâr Cüzdanı'nda (havuz kuralı)"
        />
        <SummaryTile
          icon={<TrendingUp size={14} />}
          label="Hedefe kalan"
          value={targetReached ? `${projection.yearsToTarget} yıl (${baseYear + (projection.yearsToTarget || 0)})` : '40+ yıl'}
          sub={targetReached ? `Açık: ${fmtEUR0(projection.currentGap)} · reel hedef` : 'Bu varsayımlarla ulaşılamıyor'}
          warn={!targetReached}
        />
        <SummaryTile
          icon={<Target size={14} />}
          label="Hedef yılındaki nominal hedef"
          value={fmtEUR0(projection.inflationAdjustedTarget)}
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
              tickFormatter={fmtAxisEUR}
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
                      Portföy: {fmtEUR0(d.value)}
                    </p>
                    <p className="text-xs text-gray-600 dark:text-gray-300">
                      Anapara+katkı: {fmtEUR0(d.principal)} · O yıl büyüme: {fmtEUR0(d.growthYTD)}
                    </p>
                    <p className="text-xs text-gray-600 dark:text-gray-300">
                      SWR ile aylık: {fmtEUR0(d.monthlyAtSWR)}
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
                  value: `Hedef ${fmtAxisEUR(projection.targetPortfolio)}`,
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
        <p className="text-[11px] text-slate-500 dark:text-gray-400 mt-2">
          {/* 2026-09-23: rakamlar sayfanın KENDİ girdilerinden türetilir (eski sabit '~€343k / ~€460k+' metni girdiler
              değişince yanlış kalıyordu ve panelle çelişiyordu). İki ölçüt ayrı ayrı yazılır ki çelişki gibi görünmesin. */}
          Dürüst not: iki farklı ölçüt var. <strong>SWR (%{inputs.safeWithdrawalRatePct})</strong> ile
          €{inputs.targetMonthlyIncome.toLocaleString('de-DE')}/ay için {projection.targetPortfolio > 0 ? fmtEUR0(projection.targetPortfolio) : '—'} gerekir.
          <strong> Kâr Cüzdanı'nın havuz kuralı</strong> (reel kârın %{Math.round(SALARY_SAFETY * 100)}'i; çekim her hâlükârda aylık €{MONTHLY_CAP_EUR.toLocaleString('de-DE')} ile sınırlı)
          bu sayfadaki varsayımlarla (%{inputs.annualReturnPct} getiri − %{inputs.annualInflationPct} enflasyon = reel %{realRatePct.toFixed(1)})
          {poolRuleCapital > 0 ? ` ${fmtEUR0(poolRuleCapital)}` : ' —'} ister; bugünkü portföyün bu kuralla beklenen maaşı {fmtEUR0(poolRuleMonthlyNow)}/ay ve ayların çoğu €0.
          Kasa bu hesaba dahil değil; yastıktır. Yerel panel aynı soruyu politika dağılımının beklenen reel getirisiyle hesapladığı için orada farklı bir sermaye rakamı görebilirsin.
        </p>
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
                <td className="py-1.5 pr-3 font-semibold text-gray-900 dark:text-white whitespace-nowrap">
                  {baseYear + y.year}
                  {projection.yearsToTarget === y.year && (
                    <span className="ml-1.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">🎯</span>
                  )}
                </td>
                <td className="py-1.5 pr-3 text-right font-semibold text-gray-900 dark:text-white">{fmtEUR0(y.endOfYearValue)}</td>
                <td className="py-1.5 pr-3 text-right text-slate-600 dark:text-gray-300">{fmtEUR0(y.contributionsYTD)}</td>
                <td className="py-1.5 pr-3 text-right text-slate-600 dark:text-gray-300">{fmtEUR0(y.growthYTD)}</td>
                <td className="py-1.5 text-right text-slate-600 dark:text-gray-300">{fmtEUR0(y.monthlyIncomeAtSWR)}</td>
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
