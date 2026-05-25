import { useMemo } from 'react';
import { Card, Metric, Text, Flex, Badge, AreaChart, Color } from '@tremor/react';
import { TrendingUp, TrendingDown, Wallet, Gauge, DollarSign } from 'lucide-react';
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
  const dailyColor: Color = isPos ? 'emerald' : 'rose';

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
      {/* HERO — Toplam değer */}
      <Card className="!bg-gradient-to-br !from-white !to-slate-50 dark:!from-gray-900 dark:!to-gray-950 !border !border-slate-200 dark:!border-gray-800 !shadow-lg">
        <Flex justifyContent="between" alignItems="start" className="mb-2">
          <div>
            <Text className="!text-slate-500 dark:!text-gray-400 !uppercase !tracking-wider !text-xs !font-semibold">
              Toplam Varlık
            </Text>
            <Metric className="!text-slate-900 dark:!text-white !text-4xl md:!text-5xl !mt-1">
              ₺{fmtTRY(grandTotal)}
            </Metric>
            <Text className="!text-slate-500 dark:!text-gray-400 !mt-1">
              ≈ <span className="font-semibold text-slate-700 dark:text-gray-300">${fmtUSD(grandTotalUSD)}</span> USD
            </Text>
          </div>
          {dailyChange !== undefined && dailyChangePct !== undefined && (
            <Badge color={dailyColor} icon={isPos ? TrendingUp : TrendingDown} size="lg">
              {isPos ? '+' : ''}{dailyChangePct.toFixed(2)}%
            </Badge>
          )}
        </Flex>

        {chartData.length > 1 && (
          <AreaChart
            className="!h-32 !mt-3"
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
      </Card>

      {/* KPI Grid 2x2 / 4 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card decoration="top" decorationColor="emerald" className="!border !border-slate-200 dark:!border-gray-800">
          <Flex justifyContent="between" alignItems="start">
            <Text className="!text-xs">Toplam K/Z</Text>
            <DollarSign className="text-emerald-500" size={16} />
          </Flex>
          <Metric className="!text-2xl !mt-2">
            +{m.totalPnLPct.toFixed(1)}%
          </Metric>
          <Text className="!text-xs !mt-1">
            +₺{fmtTRY(m.totalPnLTRY)} (${fmtUSD(m.totalPnLUSD)})
          </Text>
        </Card>

        <Card decoration="top" decorationColor={isPos ? 'emerald' : 'rose'} className="!border !border-slate-200 dark:!border-gray-800">
          <Flex justifyContent="between" alignItems="start">
            <Text className="!text-xs">Anlık (Bugün)</Text>
            {isPos ? <TrendingUp size={16} className="text-emerald-500" /> : <TrendingDown size={16} className="text-rose-500" />}
          </Flex>
          <Metric className={`!text-2xl !mt-2 ${isPos ? '!text-emerald-600 dark:!text-emerald-400' : '!text-rose-600 dark:!text-rose-400'}`}>
            {isPos ? '+' : ''}₺{fmtTRY(dailyChange ?? 0)}
          </Metric>
          <Text className="!text-xs !mt-1">
            {isPos ? '+' : ''}{(dailyChangePct ?? 0).toFixed(2)}%
          </Text>
        </Card>

        <Card decoration="top" decorationColor="blue" className="!border !border-slate-200 dark:!border-gray-800">
          <Flex justifyContent="between" alignItems="start">
            <Text className="!text-xs">Pasif Gelir</Text>
            <Wallet size={16} className="text-blue-500" />
          </Flex>
          <Metric className="!text-2xl !mt-2">
            ${fmtUSD(passiveYearlyUSD / 12)}<span className="text-base text-slate-400 font-normal">/ay</span>
          </Metric>
          <Text className="!text-xs !mt-1">
            ${fmtUSD(passiveYearlyUSD)}/yıl temettü + kupon
          </Text>
        </Card>

        <Card decoration="top" decorationColor="indigo" className="!border !border-slate-200 dark:!border-gray-800">
          <Flex justifyContent="between" alignItems="start">
            <Text className="!text-xs">Dinamik Max</Text>
            <Gauge size={16} className="text-indigo-500" />
          </Flex>
          <Metric className="!text-2xl !mt-2">
            ${fmtUSD(dynamicSafeMaxUSD ?? 0)}<span className="text-base text-slate-400 font-normal">/ay</span>
          </Metric>
          <Text className="!text-xs !mt-1">
            Reel büyümeden güvenli çekim
          </Text>
        </Card>
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
