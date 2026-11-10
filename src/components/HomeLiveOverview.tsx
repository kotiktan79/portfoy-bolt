import { lazy, memo, Suspense, useMemo, type ComponentProps } from 'react';
import { useNavigate } from 'react-router-dom';
import HeroDashboard from './HeroDashboard';
import GununHareketleri from './GununHareketleri';
import { DailyNetChangeCard, InvestmentScheduleCard } from './DailyNetAndSchedule';
import { getDynamicSalary, type DynamicSalary } from '../services/salaryService';
import { getEurDaily, getLiveEurGain } from '../services/eurPnlService';
import type { PortfolioSnapshot } from '../services/analyticsService';
import { useSilentRefresh } from '../hooks/useSilentRefresh';

const salaryLabel = (d: DynamicSalary) => d.spendDown
  ? `${d.spendDown.year} maaşı · portföyden €${Math.round(d.spendDown.fromPortfolioEUR)} + kasadan €${Math.round(d.spendDown.fromKasaEUR)}`
  : (d.poolOutEUR ?? 0) < 0
    ? `${d.monthLabel} sonu havuz −€${Math.round(Math.abs(d.poolOutEUR ?? 0))} açık → maaş yok (${d.monthLabel} kâr ${d.realGainEUR >= 0 ? '+' : '−'}€${Math.round(Math.abs(d.realGainEUR))})`
    : `havuz €${Math.round(d.poolOutEUR ?? 0)} × 0,85 (${d.monthLabel} sonu)`;

/** Dakikalık okumalar yalnız bu paneli günceller; Home'a state/callback taşımaz. */
export const HomeLiveOverview = memo(function HomeLiveOverview(props: ComponentProps<typeof HeroDashboard>) {
  const salary = useSilentRefresh(() => getDynamicSalary(props.holdings));
  const market = useSilentRefresh(async () => {
    const [live, days] = await Promise.all([getLiveEurGain(props.holdings), getEurDaily()]);
    return { live, days };
  });
  const days = market.data?.days ?? [];
  const last = days[days.length - 1], prev = days[days.length - 2], live = market.data?.live;
  const state = market.data ? 'ok' : market.loading ? 'loading' : 'error';
  return <>
    <HeroDashboard {...props}
      dynamicSafeMaxUSD={salary.data?.entitlementEUR}
      dynamicSalaryLabel={salary.data ? salaryLabel(salary.data) : undefined}
      todayGainEUR={last?.gainEUR} prevWealthEUR={prev?.wealthEUR} todayDate={last?.date}
      liveGainEUR={live?.gainEUR} liveSince={live?.sinceDate} liveParts={live?.parts}
      liveFxEUR={live?.fxEUR} liveOtherEUR={live?.otherEUR} closeWealthEUR={last?.wealthEUR} eurState={state} />
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
      <DailyNetChangeCard holdings={props.holdings} />
      <InvestmentScheduleCard holdings={props.holdings} />
    </div>
    <GununHareketleri live={live ?? null} baseWealthEUR={last?.wealthEUR} state={state} />
  </>;
});

const PortfolioChart = lazy(() => import('./PortfolioChart').then(m => ({ default: m.PortfolioChart })));

export function HomePortfolioTrend({ historicalData }: { historicalData: PortfolioSnapshot[] }) {
  const navigate = useNavigate();
  const series = useSilentRefresh(getEurDaily);
  const chartData = useMemo(() => {
    const days = (series.data ?? []).slice(-30); let cum = 0;
    return days.map((d, i) => {
      if (i > 0) cum += d.gainEUR;
      const base = d.wealthEUR - cum;
      return { date: d.date, total_value: d.wealthEUR, total_investment: base, total_pnl: cum, pnl_percentage: base > 0 ? 100 * cum / base : 0 };
    });
  }, [series.data]);
  return <div className="card-secondary p-5 h-full">
    <div className="flex items-center justify-between mb-4">
      <div><h3 className="t-h3">Portföy Trendi</h3><p className="t-caption">{chartData.length > 1 ? 'Euro servet, son 30 gün — çizgiler arası = kâr' : 'Son dönemdeki değer değişimi (₺, nominal)'}</p></div>
      <button onClick={() => navigate('/performance')} className="text-xs text-brand-600 dark:text-brand-400 font-semibold hover:underline">Detay →</button>
    </div>
    <div className="h-72 md:h-64">
      <Suspense fallback={<div className="h-full animate-pulse rounded-xl bg-slate-100 dark:bg-gray-800" />}>
        {chartData.length > 1 || historicalData.length > 0
          ? <PortfolioChart data={chartData.length > 1 ? chartData : historicalData} unit={chartData.length > 1 ? 'EUR' : 'TRY'} type="area" />
          : <div className="flex items-center justify-center h-full text-slate-300 dark:text-gray-600 text-sm">Veri bekleniyor...</div>}
      </Suspense>
    </div>
  </div>;
}
