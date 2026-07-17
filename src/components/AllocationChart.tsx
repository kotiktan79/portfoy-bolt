import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';
import { Holding } from '../lib/supabase';
import { getFxRatesFromHoldings, holdingValueTRY } from '../lib/fx';

interface AllocationChartProps {
  holdings: Holding[];
}

const COLORS = {
  stock: '#3b82f6',
  crypto: '#f59e0b',
  currency: '#10b981',
  fund: '#8b5cf6',
  eurobond: '#ec4899',
  commodity: '#06b6d4',
};

const ASSET_LABELS: Record<string, string> = {
  stock: 'Hisse',
  crypto: 'Kripto',
  currency: 'Döviz',
  fund: 'Fon',
  eurobond: 'Eurobond',
  commodity: 'Emtia',
};

export function AllocationChart({ holdings }: AllocationChartProps) {
  const fxRates = getFxRatesFromHoldings(holdings);
  const investmentHoldings = holdings.filter(h => h.asset_type !== 'cash');
  const totalValue = investmentHoldings.reduce((sum, h) => sum + holdingValueTRY(h, fxRates), 0);

  const allocationData = investmentHoldings.reduce((acc, holding) => {
    const value = holdingValueTRY(holding, fxRates);
    const existing = acc.find((item) => item.type === holding.asset_type);

    if (existing) {
      existing.value += value;
    } else {
      acc.push({
        type: holding.asset_type,
        name: ASSET_LABELS[holding.asset_type] || holding.asset_type,
        value: value,
      });
    }

    return acc;
  }, [] as Array<{ type: string; name: string; value: number }>);

  const chartData = allocationData.map((item) => ({
    ...item,
    percentage: totalValue > 0 ? ((item.value / totalValue) * 100).toFixed(1) : '0.0',
  }));

  interface PieTooltipItem { value?: number; payload: { name: string; percentage: string } }
  const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: PieTooltipItem[] }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white dark:bg-gray-800 p-3 rounded-lg shadow-lg border border-slate-200 dark:border-gray-700">
          <p className="text-sm font-semibold text-slate-700 dark:text-gray-200">{payload[0].payload.name}</p>
          <p className="text-sm text-slate-600 dark:text-gray-400">
            {(payload[0].value ?? 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
          </p>
          <p className="text-sm font-bold text-brand-600 dark:text-brand-400">{payload[0].payload.percentage}%</p>
        </div>
      );
    }
    return null;
  };

  const renderCustomLabel = (entry: unknown) => {
    return `${(entry as { percentage?: string }).percentage}%`;
  };

  if (!holdings || holdings.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-slate-500 dark:text-gray-400">Henüz varlık yok</p>
      </div>
    );
  }

  if (chartData.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-slate-500 dark:text-gray-400">Veri hesaplanıyor...</p>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie
          data={chartData}
          cx="50%"
          cy="50%"
          labelLine={false}
          label={renderCustomLabel}
          outerRadius={120}
          fill="#6366f1"
          dataKey="value"
        >
          {chartData.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={COLORS[entry.type as keyof typeof COLORS] || '#64748b'} />
          ))}
        </Pie>
        <Tooltip content={<CustomTooltip />} />
        <Legend
          verticalAlign="bottom"
          height={36}
          formatter={(_value, entry) => (
            <span className="text-sm text-slate-700 dark:text-gray-300">{(entry as { payload?: { name?: string } }).payload?.name}</span>
          )}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
