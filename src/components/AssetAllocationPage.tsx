import { Holding } from '../lib/supabase';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid, ReferenceLine } from 'recharts';
import { TrendingUp, TrendingDown, PieChart as PieIcon } from 'lucide-react';
import { getFxRatesFromHoldings, holdingValueTRY, holdingCostTRY } from '../lib/fx';
import { useDarkMode } from '../hooks/useDarkMode';
import { assetColor, chartChrome, fmtAxisTRY, fmtTRY0 } from '../lib/chartTheme';
import { CLASS_LABELS, TARGET_ALLOCATION, allocationClassFor, isHouseMoney, type AllocationClass } from '../config/portfolioPolicy';

interface AssetAllocationPageProps {
  holdings: Holding[];
  onBack: () => void;
}

interface AssetTypeData {
  type: string;
  typeName: string;
  value: number;
  investment: number;
  profit: number;
  profitPercent: number;
  count: number;
  color: string;
}

export function AssetAllocationPage({ holdings, onBack }: AssetAllocationPageProps) {
  const { isDark } = useDarkMode();
  const chrome = chartChrome(isDark);
  const assetTypeMap = new Map<string, AssetTypeData>();
  const fxRates = getFxRatesFromHoldings(holdings);

  const activeCount = holdings.filter(h => (Number(h.quantity) || 0) > 0 && h.asset_type !== 'cash' && allocationClassFor(h)).length;
  let houseMoneyTRY = 0;
  for (const h of holdings) {
    if ((Number(h.quantity) || 0) <= 0 || !isHouseMoney(h)) continue;
    houseMoneyTRY += holdingValueTRY(h, fxRates);
  }
  const houseMoneyEUR = fxRates.eur > 0 ? houseMoneyTRY / fxRates.eur : 0;

  holdings
    .filter(h => (Number(h.quantity) || 0) > 0 && h.asset_type !== 'cash' && !isHouseMoney(h))
    .forEach((holding) => {
    const currentValue = holdingValueTRY(holding, fxRates);
    const investmentValue = holdingCostTRY(holding, fxRates);
    const profit = currentValue - investmentValue;

    const type = allocationClassFor(holding);
    if (!type) return;
    if (!assetTypeMap.has(type)) {
      assetTypeMap.set(type, {
        type,
        typeName: CLASS_LABELS[type as AllocationClass] || type,
        value: 0,
        investment: 0,
        profit: 0,
        profitPercent: 0,
        count: 0,
        color: assetColor(type, isDark),
      });
    }

    const data = assetTypeMap.get(type)!;
    data.value += currentValue;
    data.investment += investmentValue;
    data.profit += profit;
    data.count += 1;
  });

  for (const key of Object.keys(TARGET_ALLOCATION) as AllocationClass[]) {
    if (!assetTypeMap.has(key)) {
      assetTypeMap.set(key, {
        type: key,
        typeName: CLASS_LABELS[key],
        value: 0,
        investment: 0,
        profit: 0,
        profitPercent: 0,
        count: 0,
        color: assetColor(key, isDark),
      });
    }
  }

  const assetData = Array.from(assetTypeMap.values()).map(data => ({
    ...data,
    profitPercent: data.investment > 0 ? (data.profit / data.investment) * 100 : 0,
  }));

  const totalValue = assetData.reduce((sum, d) => sum + d.value, 0);
  const totalInvestment = assetData.reduce((sum, d) => sum + d.investment, 0);
  const totalProfit = assetData.reduce((sum, d) => sum + d.profit, 0);
  const totalProfitPercent = totalInvestment > 0 ? (totalProfit / totalInvestment) * 100 : 0;

  const pieData = assetData.filter(d => d.value > 0).map(d => ({
    name: d.typeName,
    value: d.value,
    percent: totalValue > 0 ? (d.value / totalValue) * 100 : 0,
    color: d.color,
  }));

  const profitData = assetData
    .map(d => ({
      name: d.typeName,
      profit: d.profit,
      profitPercent: d.profitPercent,
      color: d.color,
    }))
    .sort((a, b) => b.profit - a.profit);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-gray-950 text-gray-900 dark:text-white">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm border-b border-slate-200 dark:border-gray-800 px-4 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-slate-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            <span>←</span>
            <span className="hidden sm:inline">Geri</span>
          </button>
          <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2 text-gray-900 dark:text-white">
            <PieIcon className="w-6 h-6 text-brand-600 dark:text-brand-400" />
            Varlık Dağılımı
          </h1>
          <div className="w-16"></div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-6">
        {/* Total Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Toplam değer (TL, kasa ve Ev Parası hariç)', value: fmtTRY0(totalValue), tone: '' },
            { label: 'TL maliyet', value: fmtTRY0(totalInvestment), tone: '' },
            {
              label: 'TL maliyet kârı',
              value: `${totalProfit >= 0 ? '+' : '−'}${fmtTRY0(Math.abs(totalProfit))}`,
              tone: totalProfit >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400',
              icon: totalProfit >= 0 ? TrendingUp : TrendingDown,
            },
            {
              label: 'TL getiri (euro cetveli değil)',
              value: `${totalProfitPercent >= 0 ? '+' : ''}${totalProfitPercent.toFixed(2)}%`,
              tone: totalProfitPercent >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400',
            },
          ].map((card) => {
            const Icon = (card as { icon?: typeof TrendingUp }).icon;
            return (
              <div key={card.label} className="bg-white dark:bg-gray-800 rounded-xl p-4 sm:p-6 border border-slate-200 dark:border-gray-700 shadow-sm">
                <div className="text-slate-500 dark:text-gray-400 text-sm mb-2">{card.label}</div>
                <div className={`text-2xl sm:text-3xl font-bold tabular-nums tracking-tight flex items-center gap-2 ${card.tone || 'text-gray-900 dark:text-white'}`}>
                  {Icon && <Icon className="w-6 h-6 flex-shrink-0" />}
                  {card.value}
                </div>
              </div>
            );
          })}
        </div>

        {/* Charts Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Pie Chart */}
          <div className="bg-white dark:bg-gray-800 rounded-xl p-4 sm:p-6 border border-slate-200 dark:border-gray-700 shadow-sm">
            <h2 className="text-lg sm:text-xl font-bold mb-1 text-gray-900 dark:text-white">Politika dağılımı</h2>
            <p className="text-xs text-slate-500 dark:text-gray-400 mb-4">Hisse 62 · güvenli taraf 14 · altın 10 · kripto 5 · fon 4 · nakit 5. Kasa ve Ev Parası yok. Kapalı pozisyon yok.</p>
            {houseMoneyTRY > 0 && (
              <p className="text-xs text-slate-600 dark:text-gray-300 mb-4">
                Ev Parası {fmtTRY0(houseMoneyTRY)}{houseMoneyEUR > 0 ? ` · €${Math.round(houseMoneyEUR).toLocaleString('de-DE')}` : ''} — hedef ve dengeleme dışı.
              </p>
            )}
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={(entry: any) => `${entry.percent.toFixed(1)}%`}
                  innerRadius={52}
                  outerRadius={92}
                  paddingAngle={2}
                  stroke={isDark ? '#1f2937' : '#ffffff'}
                  strokeWidth={2}
                  dataKey="value"
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value: number) => fmtTRY0(value)}
                  contentStyle={{ backgroundColor: chrome.tooltipBg, border: `1px solid ${chrome.tooltipBorder}`, borderRadius: '8px', color: chrome.tooltipText }}
                  itemStyle={{ color: chrome.tooltipText }}
                />
                <Legend wrapperStyle={{ fontSize: 13 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Profit Bar Chart */}
          <div className="bg-white dark:bg-gray-800 rounded-xl p-4 sm:p-6 border border-slate-200 dark:border-gray-700 shadow-sm">
            <h2 className="text-lg sm:text-xl font-bold mb-4 text-gray-900 dark:text-white">Getiri Karşılaştırması</h2>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={profitData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke={chrome.grid} />
                <XAxis dataKey="name" tick={{ fill: chrome.axis, fontSize: 12 }} angle={-30} textAnchor="end" height={70} axisLine={false} tickLine={false} interval={0} />
                <YAxis tick={{ fill: chrome.axis, fontSize: 12 }} tickFormatter={fmtAxisTRY} axisLine={false} tickLine={false} width={64} />
                <ReferenceLine y={0} stroke={chrome.axis} strokeWidth={1} />
                <Tooltip
                  formatter={(value: number) => `${value >= 0 ? '+' : ''}${fmtTRY0(value)}`}
                  contentStyle={{ backgroundColor: chrome.tooltipBg, border: `1px solid ${chrome.tooltipBorder}`, borderRadius: '8px', color: chrome.tooltipText }}
                  itemStyle={{ color: chrome.tooltipText }}
                  cursor={{ fill: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)' }}
                />
                <Bar dataKey="profit" name="K/Z" radius={[4, 4, 0, 0]} maxBarSize={48}>
                  {profitData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Detailed Table */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-slate-200 dark:border-gray-700 overflow-hidden shadow-sm">
          <h2 className="text-lg sm:text-xl font-bold p-4 sm:p-6 border-b border-slate-200 dark:border-gray-700 text-gray-900 dark:text-white">Detaylı Analiz</h2>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-100 dark:bg-gray-700/50">
                <tr className="text-slate-600 dark:text-gray-300">
                  <th className="px-4 py-3 text-left text-xs sm:text-sm font-semibold">Varlık Tipi</th>
                  <th className="px-4 py-3 text-right text-xs sm:text-sm font-semibold">Adet</th>
                  <th className="px-4 py-3 text-right text-xs sm:text-sm font-semibold">Yatırım</th>
                  <th className="px-4 py-3 text-right text-xs sm:text-sm font-semibold">Değer</th>
                  <th className="px-4 py-3 text-right text-xs sm:text-sm font-semibold">K/Z</th>
                  <th className="px-4 py-3 text-right text-xs sm:text-sm font-semibold">Pay</th>
                  <th className="px-4 py-3 text-right text-xs sm:text-sm font-semibold">Hedef</th>
                  <th className="px-4 py-3 text-right text-xs sm:text-sm font-semibold">Sapma</th>
                  <th className="px-4 py-3 text-right text-xs sm:text-sm font-semibold">TL getiri %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-gray-700">
                {assetData
                  .sort((a, b) => b.value - a.value)
                  .map((asset) => (
                    <tr key={asset.type} className="hover:bg-slate-50 dark:hover:bg-gray-700/30 transition-colors">
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-2 sm:gap-3">
                          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: asset.color }}></div>
                          <span className="font-medium text-sm sm:text-base text-gray-900 dark:text-gray-100">{asset.typeName}</span>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-right text-sm sm:text-base text-gray-700 dark:text-gray-300">{asset.count}</td>
                      <td className="px-4 py-4 text-right text-sm sm:text-base text-gray-700 dark:text-gray-300">{fmtTRY0(asset.investment)}</td>
                      <td className="px-4 py-4 text-right font-semibold text-sm sm:text-base text-gray-900 dark:text-gray-100">{fmtTRY0(asset.value)}</td>
                      <td className={`px-4 py-4 text-right font-semibold text-sm sm:text-base ${asset.profit >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                        {asset.profit >= 0 ? '+' : ''}{fmtTRY0(asset.profit)}
                      </td>
                      <td className="px-4 py-4 text-right text-sm sm:text-base text-gray-700 dark:text-gray-300">
                        {totalValue > 0 ? ((asset.value / totalValue) * 100).toFixed(1) : 0}%
                      </td>
                      <td className="px-4 py-4 text-right text-sm sm:text-base text-gray-700 dark:text-gray-300">
                        %{TARGET_ALLOCATION[asset.type as AllocationClass]?.target ?? '—'}
                      </td>
                      <td className="px-4 py-4 text-right text-sm sm:text-base text-gray-700 dark:text-gray-300">
                        {(() => {
                          const tgt = TARGET_ALLOCATION[asset.type as AllocationClass]?.target;
                          if (tgt == null || totalValue <= 0) return '—';
                          const d = (asset.value / totalValue) * 100 - tgt;
                          return `${d >= 0 ? '+' : ''}${d.toFixed(1)}`;
                        })()}
                      </td>
                      <td className={`px-4 py-4 text-right font-semibold text-sm sm:text-base ${asset.profitPercent >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                        {asset.profitPercent >= 0 ? '+' : ''}{asset.profitPercent.toFixed(2)}%
                      </td>
                    </tr>
                  ))}
              </tbody>
              <tfoot className="bg-slate-100 dark:bg-gray-700/50 font-bold text-gray-900 dark:text-white">
                <tr>
                  <td className="px-4 py-4 text-sm sm:text-base">TOPLAM</td>
                  <td className="px-4 py-4 text-right text-sm sm:text-base">{activeCount}</td>
                  <td className="px-4 py-4 text-right text-sm sm:text-base">{fmtTRY0(totalInvestment)}</td>
                  <td className="px-4 py-4 text-right text-sm sm:text-base">{fmtTRY0(totalValue)}</td>
                  <td className={`px-4 py-4 text-right text-sm sm:text-base ${totalProfit >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                    {totalProfit >= 0 ? '+' : ''}{fmtTRY0(totalProfit)}
                  </td>
                  <td className="px-4 py-4 text-right text-sm sm:text-base">100%</td>
                  <td className="px-4 py-4 text-right text-sm sm:text-base">100%</td>
                  <td className="px-4 py-4 text-right text-sm sm:text-base">0</td>
                  <td className={`px-4 py-4 text-right text-sm sm:text-base ${totalProfitPercent >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                    {totalProfitPercent >= 0 ? '+' : ''}{totalProfitPercent.toFixed(2)}%
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
