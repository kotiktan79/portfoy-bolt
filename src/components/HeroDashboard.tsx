import { useMemo } from 'react';
import { Card, Text, Flex, Badge, AreaChart, Color } from '@tremor/react';
import { TrendingUp, TrendingDown, Wallet, Gauge, DollarSign, Sparkles } from 'lucide-react';
import { Holding } from '../lib/supabase';
import { computePortfolioMetrics, computeHoldingMetrics } from '../lib/portfolioMetrics';

interface HeroDashboardProps {
  holdings: Holding[];
  totalCashValue: number;
  dailyChange?: number;
  dailyChangePct?: number;
  historicalData?: { date: string; value: number }[];
  dynamicSafeMaxUSD?: number;
}

function fmtTRY(n: number): string {
  return new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 }).format(n);
}
function fmtUSD(n: number): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(n);
}

export default function HeroDashboard({
  holdings,
  totalCashValue,
  dailyChange,
  dailyChangePct,
  historicalData,
  dynamicSafeMaxUSD,
}: HeroDashboardProps) {
  const m = useMemo(() => computePortfolioMetrics(holdings), [holdings]);
  const usdRate = m.fxRates.usd;
  const grandTotal = m.totalValueTRY + totalCashValue;
  const grandTotalUSD = usdRate > 0 ? grandTotal / usdRate : 0;

  // Pasif gelir (kaba tahmin: eurobond %5, temettü hisseleri %3)
  const passiveYearlyUSD = useMemo(() => {
    const fx = m.fxRates;
    let yearly = 0;
    for (const h of holdings.filter(x => x.asset_type !== 'cash')) {
      const v = (h.current_price || 0) * (h.quantity || 0);
      const vTRY = (h.currency || 'TRY').toUpperCase() === 'USD' ? v * fx.usd
        : (h.currency || 'TRY').toUpperCase() === 'EUR' ? v * fx.eur : v;
      let y = 0;
      if (h.asset_type === 'eurobond') y = 0.045;
      else if (['JNJ', 'KO', 'PG', 'SCHD', 'NESN'].includes(h.symbol)) y = 0.03;
      else if (h.asset_type === 'fund') y = 0.03;
      yearly += vTRY * y;
    }
    return usdRate > 0 ? yearly / usdRate : 0;
  }, [holdings, m.fxRates, usdRate]);

  const isPos = (dailyChange ?? 0) >= 0;

  // Top 3 holding by weight
  const topHoldings = useMemo(() =>
    computeHoldingMetrics(holdings).sort((a, b) => b.weight - a.weight).slice(0, 3),
    [holdings]);

  // Chart data
  const chartData = (historicalData || []).slice(-30).map(d => ({
    date: d.date.slice(5),
    'Portföy (₺)': d.value,
  }));

  return (
    <div className="space-y-4">
      {/* HERO — Glass effect, büyük tipografi */}
      <div className="relative overflow-hidden rounded-3xl border border-slate-200/60 dark:border-gray-800 bg-gradient-to-br from-indigo-50 via-white to-emerald-50 dark:from-indigo-950/40 dark:via-gray-900 dark:to-emerald-950/40 shadow-xl">
        {/* Dekor blob */}
        <div className="absolute -top-24 -right-24 w-96 h-96 rounded-full bg-indigo-300/20 dark:bg-indigo-500/10 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-96 h-96 rounded-full bg-emerald-300/20 dark:bg-emerald-500/10 blur-3xl pointer-events-none" />
        <div className="relative p-6 md:p-8">
          <div className="flex items-start justify-between mb-2">
            <div className="flex items-center gap-2">
              <Sparkles className="text-indigo-500 dark:text-indigo-400" size={16} />
              <span className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500 dark:text-gray-400">
                Toplam Varlık
              </span>
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Canlı
              </span>
            </div>
            {dailyChange !== undefined && dailyChangePct !== undefined && (
              <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-bold shadow-md ${
                isPos
                  ? 'bg-emerald-500 text-white'
                  : 'bg-rose-500 text-white'
              }`}>
                {isPos ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
                {isPos ? '+' : ''}{dailyChangePct.toFixed(2)}%
              </div>
            )}
          </div>
          <p className="text-5xl md:text-7xl font-black tracking-tight text-slate-900 dark:text-white tabular-nums leading-none">
            ₺{fmtTRY(grandTotal)}
          </p>
          <p className="mt-3 text-base md:text-lg text-slate-600 dark:text-gray-400">
            ≈ <span className="font-bold text-slate-800 dark:text-gray-200">${fmtUSD(grandTotalUSD)}</span> USD
            {dailyChange !== undefined && (
              <span className={`ml-3 font-semibold ${isPos ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400'}`}>
                {isPos ? '+' : ''}₺{fmtTRY(dailyChange)} bugün
              </span>
            )}
          </p>

          {chartData.length > 1 && (
            <AreaChart
              className="!h-36 !mt-4"
              data={chartData}
              index="date"
              categories={['Portföy (₺)']}
              colors={[isPos ? 'emerald' : 'rose']}
              showLegend={false}
              showYAxis={false}
              showGridLines={false}
              showXAxis={false}
              curveType="monotone"
              valueFormatter={(n) => '₺' + fmtTRY(n)}
            />
          )}
        </div>
      </div>

      {/* KPI Grid — büyük renkli kartlar */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* K/Z */}
        <div className="group relative overflow-hidden rounded-2xl border border-slate-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-400 to-emerald-600" />
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-gray-400">Toplam K/Z</span>
            <div className="w-9 h-9 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
              <DollarSign className="text-emerald-600 dark:text-emerald-400" size={18} />
            </div>
          </div>
          <p className="text-3xl font-black tabular-nums text-emerald-600 dark:text-emerald-400">
            +{m.totalPnLPct.toFixed(1)}%
          </p>
          <p className="text-xs text-slate-500 dark:text-gray-400 mt-1 tabular-nums">
            +₺{fmtTRY(m.totalPnLTRY)} · ${fmtUSD(m.totalPnLUSD)}
          </p>
        </div>

        {/* Anlık bugün */}
        <div className="group relative overflow-hidden rounded-2xl border border-slate-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all">
          <div className={`absolute top-0 left-0 right-0 h-1 ${isPos ? 'bg-gradient-to-r from-emerald-400 to-emerald-600' : 'bg-gradient-to-r from-rose-400 to-rose-600'}`} />
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-gray-400">Bugün</span>
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${isPos ? 'bg-emerald-100 dark:bg-emerald-900/30' : 'bg-rose-100 dark:bg-rose-900/30'}`}>
              {isPos ? <TrendingUp className="text-emerald-600 dark:text-emerald-400" size={18} /> : <TrendingDown className="text-rose-600 dark:text-rose-400" size={18} />}
            </div>
          </div>
          <p className={`text-3xl font-black tabular-nums ${isPos ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
            {isPos ? '+' : ''}₺{fmtTRY(dailyChange ?? 0)}
          </p>
          <p className="text-xs text-slate-500 dark:text-gray-400 mt-1 tabular-nums">
            {isPos ? '+' : ''}{(dailyChangePct ?? 0).toFixed(2)}% piyasa
          </p>
        </div>

        {/* Pasif gelir */}
        <div className="group relative overflow-hidden rounded-2xl border border-slate-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-400 to-blue-600" />
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-gray-400">Pasif Gelir</span>
            <div className="w-9 h-9 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
              <Wallet className="text-blue-600 dark:text-blue-400" size={18} />
            </div>
          </div>
          <p className="text-3xl font-black tabular-nums text-blue-600 dark:text-blue-400">
            ${fmtUSD(passiveYearlyUSD / 12)}<span className="text-base font-normal text-slate-400">/ay</span>
          </p>
          <p className="text-xs text-slate-500 dark:text-gray-400 mt-1 tabular-nums">
            ${fmtUSD(passiveYearlyUSD)}/yıl tahmini
          </p>
        </div>

        {/* Dinamik max */}
        <div className="group relative overflow-hidden rounded-2xl border border-slate-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-indigo-400 to-purple-600" />
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-gray-400">Güvenli Max</span>
            <div className="w-9 h-9 rounded-xl bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center">
              <Gauge className="text-indigo-600 dark:text-indigo-400" size={18} />
            </div>
          </div>
          <p className="text-3xl font-black tabular-nums bg-gradient-to-r from-indigo-600 to-purple-600 dark:from-indigo-400 dark:to-purple-400 bg-clip-text text-transparent">
            ${fmtUSD(dynamicSafeMaxUSD ?? 0)}<span className="text-base font-normal text-slate-400">/ay</span>
          </p>
          <p className="text-xs text-slate-500 dark:text-gray-400 mt-1">
            Dinamik çekim limiti
          </p>
        </div>
      </div>

      {/* Top 3 Holdings */}
      {topHoldings.length > 0 && (
        <Card className="!border !border-slate-200 dark:!border-gray-800">
          <Flex justifyContent="between" alignItems="center" className="mb-3">
            <Text className="!text-sm !font-semibold !text-slate-700 dark:!text-gray-200">En Büyük 3 Pozisyon</Text>
            <Text className="!text-xs">Portföyün %{topHoldings.reduce((s, h) => s + h.weight, 0).toFixed(0)}'i</Text>
          </Flex>
          <div className="space-y-2">
            {topHoldings.map((h) => {
              const pnlColor: Color = h.pnlTRY >= 0 ? 'emerald' : 'rose';
              return (
                <div key={h.holding.id} className="flex items-center gap-3 py-1.5">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-400 to-blue-500 flex items-center justify-center text-white text-xs font-black flex-shrink-0">
                    {h.holding.symbol.slice(0, 3)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <Flex justifyContent="between" alignItems="center">
                      <Text className="!font-semibold !text-slate-900 dark:!text-white">{h.holding.symbol}</Text>
                      <Text className="!text-sm !font-semibold">₺{fmtTRY(h.valueTRY)}</Text>
                    </Flex>
                    <Flex justifyContent="between" alignItems="center" className="mt-0.5">
                      <Text className="!text-xs">{h.weight.toFixed(1)}% · {h.holding.asset_type}</Text>
                      <Badge color={pnlColor} size="xs">
                        {h.pnlTRY >= 0 ? '+' : ''}{h.pnlPct.toFixed(1)}%
                      </Badge>
                    </Flex>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}
