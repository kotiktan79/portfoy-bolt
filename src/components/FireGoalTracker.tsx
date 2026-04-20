import { useMemo, useState } from 'react';
import { Target, TrendingUp, AlertCircle } from 'lucide-react';
import {
  ResponsiveContainer,
  ComposedChart,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Area,
  Line,
  ReferenceLine,
  Legend,
} from 'recharts';
import { usePortfolio } from '../contexts/PortfolioContext';
import { projectFire } from '../services/fireProjectionService';
import { formatCurrency } from '../services/priceService';
import { Card, CardHeader, CardBody } from './ui/Card';

const STORAGE_KEY = 'tandor_fire_inputs';

interface SavedInputs {
  monthlyContribution: number;
  annualReturnPct: number;
  targetMonthlyIncome: number;
  safeWithdrawalRatePct: number;
}

const DEFAULTS: SavedInputs = {
  monthlyContribution: 25000,
  annualReturnPct: 25,
  targetMonthlyIncome: 50000,
  safeWithdrawalRatePct: 4,
};

function loadInputs(): SavedInputs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return DEFAULTS;
  }
}

function saveInputs(inputs: SavedInputs) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(inputs));
}

export default function FireGoalTracker() {
  const { holdings } = usePortfolio();
  const [inputs, setInputs] = useState<SavedInputs>(() => loadInputs());

  const currentValue = useMemo(
    () => holdings.reduce((s, h) => s + (h.current_price || 0) * (h.quantity || 0), 0),
    [holdings]
  );

  const projection = useMemo(
    () => projectFire({ currentValue, ...inputs }),
    [currentValue, inputs]
  );

  function update<K extends keyof SavedInputs>(key: K, value: SavedInputs[K]) {
    const next = { ...inputs, [key]: value };
    setInputs(next);
    saveInputs(next);
  }

  if (currentValue === 0) return null;

  const progressPct = projection.targetPortfolio > 0
    ? Math.min(100, (currentValue / projection.targetPortfolio) * 100)
    : 0;

  const chartData = projection.yearByYear.map(y => ({
    year: `+${y.year}y`,
    portfolio: Math.round(y.endOfYearValue),
    income: Math.round(y.monthlyIncomeAtSWR),
    target: Math.round(projection.targetPortfolio),
  }));

  return (
    <Card>
      <CardHeader
        icon={Target}
        iconTone="brand"
        title="FIRE Hedef Takipçisi"
        subtitle={`Aylık ₺${inputs.targetMonthlyIncome.toLocaleString('tr-TR')} pasif gelir hedefine kaç yıl?`}
        rightSlot={
          projection.yearsToTarget ? (
            <div className="text-right">
              <div className="text-2xl font-black text-brand-600 dark:text-brand-400">
                {projection.yearsToTarget}y
              </div>
              <div className="text-[10px] text-gray-500">tahmini</div>
            </div>
          ) : null
        }
      />
      <CardBody>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Stat
            label="Mevcut"
            value={formatCurrency(currentValue, 0) + ' ₺'}
            sub={`Aylık ${formatCurrency(projection.currentMonthlyAtSWR, 0)} ₺`}
          />
          <Stat
            label="Hedef"
            value={formatCurrency(projection.targetPortfolio, 0) + ' ₺'}
            sub={`%${inputs.safeWithdrawalRatePct} SWR`}
          />
          <Stat
            label="Gap"
            value={formatCurrency(projection.currentGapTry, 0) + ' ₺'}
            sub={`%${(100 - progressPct).toFixed(0)} kaldı`}
          />
          <Stat
            label="Enflasyon Adj."
            value={projection.yearsToTarget ? formatCurrency(projection.inflationAdjustedTarget, 0) + ' ₺' : '–'}
            sub={projection.yearsToTarget ? `${projection.yearsToTarget}y sonra` : '–'}
            warn
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              İlerleme
            </span>
            <span className="text-xs font-bold text-brand-600 dark:text-brand-400 tabular-nums">
              %{progressPct.toFixed(1)}
            </span>
          </div>
          <div className="h-3 rounded-full bg-slate-100 dark:bg-gray-800 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-brand-400 to-brand-600 transition-all"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <NumberInput
            label="Aylık Katkı (₺)"
            value={inputs.monthlyContribution}
            onChange={v => update('monthlyContribution', v)}
            step={1000}
          />
          <NumberInput
            label="Yıllık Getiri (%)"
            value={inputs.annualReturnPct}
            onChange={v => update('annualReturnPct', v)}
            step={1}
          />
          <NumberInput
            label="Hedef Aylık Gelir (₺)"
            value={inputs.targetMonthlyIncome}
            onChange={v => update('targetMonthlyIncome', v)}
            step={5000}
          />
          <NumberInput
            label="SWR (%)"
            value={inputs.safeWithdrawalRatePct}
            onChange={v => update('safeWithdrawalRatePct', v)}
            step={0.5}
          />
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-gray-800 p-2 bg-slate-50/50 dark:bg-gray-800/30">
          <h4 className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5 px-2 pt-1">
            <TrendingUp size={11} /> Yıllara Göre Projeksiyon
          </h4>
          <ResponsiveContainer width="100%" height={220}>
            <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="portfolioGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#6366f1" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" opacity={0.4} />
              <XAxis dataKey="year" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
              <YAxis
                yAxisId="left"
                tick={{ fontSize: 11, fill: '#9ca3af' }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v: number) => v >= 1000000 ? `${(v / 1000000).toFixed(0)}M` : `${(v / 1000).toFixed(0)}K`}
                width={45}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                tick={{ fontSize: 10, fill: '#10b981' }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}K` : `${v.toFixed(0)}`}
                width={40}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload || payload.length === 0) return null;
                  const d = payload[0].payload;
                  return (
                    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-2 text-xs space-y-0.5">
                      <p className="font-bold text-gray-700 dark:text-gray-300">{d.year}</p>
                      <p className="text-brand-600 dark:text-brand-400">Portföy: {formatCurrency(d.portfolio, 0)} ₺</p>
                      <p className="text-accent-600 dark:text-accent-400">Aylık gelir: {formatCurrency(d.income, 0)} ₺</p>
                    </div>
                  );
                }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Area
                yAxisId="left"
                type="monotone"
                dataKey="portfolio"
                stroke="#6366f1"
                strokeWidth={2}
                fill="url(#portfolioGrad)"
                name="Portföy ₺"
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="income"
                stroke="#10b981"
                strokeWidth={2}
                strokeDasharray="4 3"
                dot={false}
                name="Aylık ₺"
              />
              <ReferenceLine
                yAxisId="left"
                y={projection.targetPortfolio}
                stroke="#10b981"
                strokeDasharray="3 3"
                label={{ value: 'Hedef', fill: '#10b981', fontSize: 10, position: 'right' }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        {!projection.yearsToTarget && (
          <div className="flex items-start gap-1.5 p-2 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900">
            <AlertCircle size={14} className="mt-0.5 text-amber-600 flex-shrink-0" />
            <p className="text-[11px] text-amber-700 dark:text-amber-400">
              25 yılda hedefe ulaşılamıyor. Aylık katkıyı artır veya beklenen getiri varsayımını gözden geçir.
            </p>
          </div>
        )}

        <p className="text-[10px] text-gray-500 italic">
          SWR: Safe Withdrawal Rate. %4 klasik FIRE kuralı. Türkiye'de enflasyon nedeniyle
          %3 daha güvenli, %5-6 agresif. Hesap aylık bileşik faizle yapılır, vergi/komisyon hariçtir.
        </p>
      </CardBody>
    </Card>
  );
}

function Stat({ label, value, sub, warn }: { label: string; value: string; sub: string; warn?: boolean }) {
  return (
    <div className={`rounded-xl border p-2 ${
      warn
        ? 'border-amber-200 dark:border-amber-900 bg-amber-50/30 dark:bg-amber-950/20'
        : 'border-slate-200 dark:border-gray-800 bg-slate-50/50 dark:bg-gray-800/30'
    }`}>
      <div className="text-[9px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
        {label}
      </div>
      <div className={`text-sm font-bold mt-0.5 ${warn ? 'text-amber-700 dark:text-amber-400' : 'text-gray-900 dark:text-gray-100'}`}>
        {value}
      </div>
      <div className="text-[10px] text-gray-500 truncate">{sub}</div>
    </div>
  );
}

function NumberInput({ label, value, onChange, step }: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step: number;
}) {
  return (
    <div>
      <label className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
        {label}
      </label>
      <input
        type="number"
        value={value || ''}
        step={step}
        onChange={e => onChange(Math.max(0, parseFloat(e.target.value) || 0))}
        className="w-full px-2 py-1.5 rounded-lg border border-slate-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-xs font-semibold focus:ring-2 focus:ring-brand-500 outline-none tabular-nums"
      />
    </div>
  );
}
