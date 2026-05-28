import { useMemo } from 'react';
import { Globe, AlertTriangle, Home, TrendingUp } from 'lucide-react';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from 'recharts';
import { usePortfolio } from '../contexts/PortfolioContext';
import { Holding } from '../lib/supabase';
import { getFxRatesFromHoldings, holdingValueTRY } from '../lib/fx';
import { formatCurrency } from '../services/priceService';
import { Card, CardHeader, CardBody } from './ui/Card';

interface CurrencyBucket {
  [key: string]: unknown;
  currency: string;
  label: string;
  value: number;
  weight: number;
  color: string;
  kind: 'home' | 'reserve' | 'foreign' | 'alt';
  components: { symbol: string; type: string; value: number }[];
}

const CURRENCY_COLORS: Record<string, string> = {
  EUR: '#f59e0b',
  USD: '#10b981',
  TRY: '#3b82f6',
  GBP: '#8b5cf6',
  CHF: '#ec4899',
  GOLD: '#eab308',
  BTC: '#f97316',
  Diğer: '#6b7280',
};

const CURRENCY_LABELS: Record<string, string> = {
  EUR: 'Euro (ev parası)',
  USD: 'ABD Doları',
  TRY: 'Türk Lirası',
  GBP: 'İngiliz Sterlini',
  CHF: 'İsviçre Frangı',
  GOLD: 'Altın',
  BTC: 'Kripto',
};

// Romanya/EUR yatırımcı: EUR ev parası, USD rezerv, TL yabancı, altın/kripto alternatif
const CURRENCY_KIND: Record<string, CurrencyBucket['kind']> = {
  EUR: 'home', USD: 'reserve', TRY: 'foreign', GBP: 'reserve', CHF: 'reserve',
  GOLD: 'alt', BTC: 'alt',
};

const FUND_CURRENCY: Record<string, string> = {
  EUROFON: 'EUR',
  USDFON: 'USD',
};

// Holding'in alt para birimini doğru tespit et — currency field + symbol.
function classifyHolding(h: Holding): string {
  const sym = h.symbol.toUpperCase();
  const cur = (h.currency || 'TRY').toUpperCase();

  if (h.asset_type === 'currency') {
    if (sym === 'USDC' || sym === 'USDT' || sym === 'USD') return 'USD';
    if (sym === 'EURO' || sym === 'EUR') return 'EUR';
    if (sym === 'GBP') return 'GBP';
    if (sym === 'CHF') return 'CHF';
    return sym;
  }
  if (h.asset_type === 'crypto') return 'BTC';
  if (h.asset_type === 'commodity') {
    if (sym.includes('GOLD') || sym.includes('ALTIN') || sym === 'XAU' || sym === 'GA') return 'GOLD';
    return 'GOLD';
  }
  if (h.asset_type === 'fund') {
    return FUND_CURRENCY[sym] || cur || 'TRY';
  }
  if (h.asset_type === 'eurobond') {
    // currency field doğru kaynak (IB01 EUR, US Treasury USD)
    return cur === 'TRY' ? 'USD' : cur;
  }
  if (h.asset_type === 'stock') {
    // ASML→EUR, JNJ→USD, V3YL→EUR, BIST→TRY
    return cur || 'TRY';
  }
  return 'Diğer';
}

const KIND_LABEL: Record<CurrencyBucket['kind'], string> = {
  home: 'Ev Parası', reserve: 'Rezerv', foreign: 'Yabancı', alt: 'Alternatif',
};

export default function CurrencyExposureCard() {
  const { holdings } = usePortfolio();
  const fxRates = useMemo(() => getFxRatesFromHoldings(holdings), [holdings]);

  const buckets = useMemo<CurrencyBucket[]>(() => {
    const map: Record<string, CurrencyBucket> = {};
    let total = 0;

    for (const h of holdings) {
      if (h.asset_type === 'cash') continue;
      const value = holdingValueTRY(h, fxRates);
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
          kind: CURRENCY_KIND[currency] || 'foreign',
          components: [],
        };
      }
      map[currency].value += value;
      map[currency].components.push({ symbol: h.symbol, type: h.asset_type, value });
    }

    for (const b of Object.values(map)) {
      b.weight = total > 0 ? (b.value / total) * 100 : 0;
      b.components.sort((a, b) => b.value - a.value);
    }

    return Object.values(map).sort((a, b) => b.value - a.value);
  }, [holdings, fxRates]);

  const totalValue = buckets.reduce((s, b) => s + b.value, 0);
  if (totalValue === 0) return null;

  // Romanya profili: EUR ev parası, TL yabancı para riski
  const eurWeight = buckets.filter(b => b.kind === 'home').reduce((s, b) => s + b.weight, 0);
  const reserveWeight = buckets.filter(b => b.kind === 'reserve').reduce((s, b) => s + b.weight, 0);
  const foreignWeight = buckets.filter(b => b.kind === 'foreign').reduce((s, b) => s + b.weight, 0);
  const altWeight = buckets.filter(b => b.kind === 'alt').reduce((s, b) => s + b.weight, 0);

  // TL (yabancı para) maruziyeti riski
  const tlWarning = foreignWeight > 50 ? 'high' : foreignWeight > 35 ? 'medium' : 'ok';

  return (
    <Card>
      <CardHeader
        icon={Globe}
        iconTone="brand"
        title="Para Birimi Maruziyeti"
        subtitle="Romanya/EUR-bazlı: EUR ev parası, USD rezerv, TL yabancı para"
        rightSlot={
          <div className="text-right">
            <div className="text-base font-bold text-amber-600 dark:text-amber-400">
              %{eurWeight.toFixed(0)} EUR
            </div>
            <div className="text-[10px] text-gray-500">ev parası</div>
          </div>
        }
      />
      <CardBody>
        {/* Profil özeti: 4 kova */}
        <div className="grid grid-cols-4 gap-2">
          <KindStat label="Ev Parası (EUR)" pct={eurWeight} tone="home" icon={Home} />
          <KindStat label="Rezerv (USD)" pct={reserveWeight} tone="reserve" icon={TrendingUp} />
          <KindStat label="Yabancı (TL)" pct={foreignWeight} tone="foreign" icon={AlertTriangle} />
          <KindStat label="Alternatif" pct={altWeight} tone="alt" icon={Globe} />
        </div>

        {tlWarning !== 'ok' && (
          <div className={`flex items-start gap-1.5 p-2 rounded-lg border ${
            tlWarning === 'high'
              ? 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900 text-red-700 dark:text-red-400'
              : 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900 text-amber-700 dark:text-amber-400'
          }`}>
            <AlertTriangle size={12} className="mt-0.5 flex-shrink-0" />
            <p className="text-[11px]">
              {tlWarning === 'high'
                ? `TL maruziyeti %${foreignWeight.toFixed(0)} — Romanya'da yaşıyorsun, TL yabancı para. TL/EUR düşerse EUR servetin küçülür. Öneri: %40 altı.`
                : `TL maruziyeti %${foreignWeight.toFixed(0)} — orta seviye. BIST hisseleri TL bazlı, EUR'a karşı kur riski taşır.`}
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
                        <p className="text-[10px] text-gray-500">{KIND_LABEL[d.kind]}</p>
                      </div>
                    );
                  }}
                />
                <Legend verticalAlign="bottom" iconSize={8} wrapperStyle={{ fontSize: 10 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="space-y-1.5">
            {buckets.map(b => (
              <div key={b.currency} className="rounded-lg border border-slate-200 dark:border-gray-800 p-2">
                <div className="flex items-center gap-2 mb-1">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: b.color }} />
                  <span className="text-xs font-bold text-gray-900 dark:text-gray-100">{b.label}</span>
                  <span className={`text-[8px] font-bold px-1 py-0.5 rounded uppercase tracking-wide ${
                    b.kind === 'home' ? 'bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300'
                    : b.kind === 'reserve' ? 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
                    : b.kind === 'foreign' ? 'bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                  }`}>
                    {KIND_LABEL[b.kind]}
                  </span>
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
          Sınıflandırma: hisse/fon/eurobond holding currency'sinden · BIST→TRY · ASML/V3YL→EUR · JNJ→USD ·
          eurobond IB01→EUR · emtia→altın · kripto→BTC kovası. Dolaylı maruziyet (örn. TUPRS petrol) hariç.
        </p>
      </CardBody>
    </Card>
  );
}

function KindStat({ label, pct, tone, icon: Icon }: { label: string; pct: number; tone: CurrencyBucket['kind']; icon: typeof Home }) {
  const toneStyle = {
    home: 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900 text-amber-700 dark:text-amber-400',
    reserve: 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900 text-emerald-700 dark:text-emerald-400',
    foreign: 'bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-900 text-blue-700 dark:text-blue-400',
    alt: 'bg-gray-50 dark:bg-gray-800/40 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400',
  }[tone];
  return (
    <div className={`rounded-xl border p-2 text-center ${toneStyle}`}>
      <Icon size={12} className="mx-auto mb-1" />
      <div className="text-base font-bold tabular-nums">%{pct.toFixed(0)}</div>
      <div className="text-[9px] leading-tight opacity-80">{label}</div>
    </div>
  );
}
