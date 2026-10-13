import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';
import { Holding } from '../lib/supabase';
import { CLASS_LABELS } from '../config/portfolioPolicy';
import { policySnapshot } from '../lib/policyAllocation';
import { ASSET_TYPE_COLORS } from '../constants/assetTypes';

interface AllocationChartProps {
  holdings: Holding[];
}

export function AllocationChart({ holdings }: AllocationChartProps) {
  const snap = policySnapshot(holdings);
  const totalValue = snap.totalTRY;
  const allocationData = snap.rows
    .filter(r => r.valueEUR > 0)
    .map(r => ({
      type: r.key,
      name: CLASS_LABELS[r.key],
      value: snap.eurRate > 0 ? r.valueEUR * snap.eurRate : r.valueEUR,
    }));

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
            <Cell key={`cell-${index}`} fill={ASSET_TYPE_COLORS[entry.type] || '#64748b'} />
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
