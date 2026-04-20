import { useMemo } from 'react';
import { Globe, AlertTriangle } from 'lucide-react';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from 'recharts';
import { usePortfolio } from '../contexts/PortfolioContext';
import { Holding } from '../lib/supabase';
import { formatCurrency } from '../services/priceService';

interface CurrencyBucket {
  [key: string]: unknown;
  currency: string;
  label: string;
  value: number;
  weight: number;
  color: string;
  components: { symbol: string; type: string; value: number }[];
}

const CURRENCY_COLORS: Record<string, string> = {
  TRY: '#3b82f6',
  USD: '#10b981',
  EUR: '#f59e0b',
  GBP: '#8b5cf6',
  CHF: '#ec4899',
  GOLD: '#eab308',
  BTC: '#f97316',
  Diğer: '#6b7280',
};

const CURRENCY_LABELS: Record<string, string> = {
  TRY: 'Türk Lirası',
  USD: 'ABD Doları',
  EUR: 'Euro',
  GBP: 'İngiliz Sterlini',
  CHF: 'İsviçre Frangı',
  GOLD: 'Altın (USD bazlı)',
  BTC: 'Bitcoin/Crypto (USD bazlı)',
};

const FUND_CURRENCY: Record<string, string> = {
  EUROFON: 'EUR',
  USDFON: 'USD',
};

function classifyHolding(h: Holding): string {
  const sym = h.symbol.toUpperCase();
  if (h.asset_type === 'currency') {
    if (sym === 'USDC' || sym === 'USDT') return 'USD';
    return sym;
  }
  if (h.asset_type === 'fund') {
    return FUND_CURRENCY[sym] || 'TRY';
  }
  if (h.asset_type === 'eurobond') {
    return 'USD';
  }
  if (h.asset_type === 'commodity') {
    if (sym.includes('GOLD') || sym.includes('ALTIN') || sym === 'XAU') return 'GOLD';
    return 'USD';
  }
  if (h.asset_type === 'crypto') {
    return 'BTC';
  }
  if (h.asset_type === 'stock') {
    return 'TRY';
  }
  return 'Diğer';
}

export default function CurrencyExposureCard() {
  const { holdings } = usePortfolio();

  const buckets = useMemo<CurrencyBucket[]>(() => {
    const map: Record<string, CurrencyBucket> = {};
    let total = 0;

    for (const h of holdings) {
      const value = (h.current_price || 0) * (h.quantity || 0);
      if (value <= 0) continue;
      total += value;

      const currency = classifyHolding(h);
      if (!map[currency]) {
        map[currency] = {
          currency,
          label: CURRENCY_LABELS[currency] || currency,
          value: 0,
          weight: 0,
          color: CURRENCY_COLORS[currency] || '#6b7280',
          components: [],
        };
      }
      map[currency].value += value;
      map[currency].components.push({
        symbol: h.symbol,
        type: h.asset_type,
        value,
      });
    }

    for (const b of Object.values(map)) {
      b.weight = total > 0 ? (b.value / total) * 100 : 0;
      b.components.sort((a, b) => b.value - a.value);
    }

    return Object.values(map).sort((a, b) => b.value - a.value);
  }, [holdings]);

  const totalValue = buckets.reduce((s, b) => s + b.value, 0);
  const tryWeight = buckets.find(b => b.currency === 'TRY')?.weight || 0;
  const fxWeight = 100 - tryWeight;

  if (totalValue === 0) return null;

  const fxWarning = fxWeight > 60 ? 'high' : fxWeight > 40 ? 'medium' : 'ok';

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden">
      <div className="p-4 border-b border-slate-200 dark:border-gray-800 flex items-center gap-3">
        <div className="p-2 bg-gradient-to-br from-sky-500 to-indigo-600 rounded-xl shadow-md">
          <Globe className="text-white" size={18} />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-bold text-gray-900 dark:text-white">Para Birimi Maruziyeti</h3>
          <p className="text-xs text-gray-500">
            Tüm pozisyonların alt yatırım birimi (fon/eurobond/altın dahil)
          </p>
        </div>
        <div className="text-right">
          <div className={`text-base font-bold ${
            fxWarning === 'high' ? 'text-red-600' : fxWarning === 'medium' ? 'text-amber-600' : 'text-emerald-600'
          }`}>
            %{fxWeight.toFixed(1)} FX
          </div>
          <div className="text-[10px] text-gray-500">{tryWeight.toFixed(1)}% TRY</div>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {fxWarning !== 'ok' && (
          <div className={`flex items-start gap-1.5 p-2 rounded-lg border ${
            fxWarning === 'high'
              ? 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900 text-red-700 dark:text-red-400'
              : 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900 text-amber-700 dark:text-amber-400'
          }`}>
            <AlertTriangle size={12} className="mt-0.5 flex-shrink-0" />
            <p className="text-[11px]">
              {fxWarning === 'high'
                ? `Döviz maruziyeti %${fxWeight.toFixed(0)} — TRY güçlenirse büyük etkilenirsin. Tipik hedef %25-40.`
                : `Döviz maruziyeti %${fxWeight.toFixed(0)} — orta seviye, hedef üst sınırda.`}
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={buckets}
                  dataKey="value"
                  nameKey="currency"
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={2}
                >
                  {buckets.map(b => (
                    <Cell key={b.currency} fill={b.color} />
                  ))}
                </Pie>
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload || payload.length === 0) return null;
                    const d = payload[0].payload as CurrencyBucket;
                    return (
                      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-2 text-xs">
                        <p className="font-bold">{d.label}</p>
                        <p>{formatCurrency(d.value, 0)} ₺ · %{d.weight.toFixed(1)}</p>
                      </div>
                    );
                  }}
                />
                <Legend
                  verticalAlign="bottom"
                  iconSize={8}
                  wrapperStyle={{ fontSize: 10 }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="space-y-1.5">
            {buckets.map(b => (
              <div key={b.currency} className="rounded-lg border border-slate-200 dark:border-gray-800 p-2">
                <div className="flex items-center gap-2 mb-1">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: b.color }} />
                  <span className="text-xs font-bold text-gray-900 dark:text-gray-100">{b.label}</span>
                  <span className="ml-auto text-xs font-bold tabular-nums text-gray-700 dark:text-gray-300">
                    %{b.weight.toFixed(1)}
                  </span>
                  <span className="text-[10px] text-gray-500 tabular-nums w-16 text-right">
                    {formatCurrency(b.value, 0)} ₺
                  </span>
                </div>
                <div className="text-[10px] text-gray-500 dark:text-gray-400 truncate pl-4">
                  {b.components.slice(0, 5).map(c => c.symbol).join(' · ')}
                  {b.components.length > 5 && ` +${b.components.length - 5}`}
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="text-[10px] text-gray-500 italic">
          Sınıflandırma: BIST hisseleri TRY · Eurobond ve emtia USD · EUROFON EUR · Kripto BTC kovasında.
          Dolaylı maruziyet (örn. TUPRS petrol fiyatı) hariç.
        </p>
      </div>
    </div>
  );
}
