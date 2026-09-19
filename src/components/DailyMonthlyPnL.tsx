import { useEffect, useState } from 'react';
import { TrendingUp, TrendingDown, Calendar, BarChart2, CalendarDays } from 'lucide-react';
import { formatCurrency } from '../services/priceService';
import { getUsdDaily, getUsdPeriods, type UsdDaily, type UsdPeriod } from '../services/usdPnlService';

// KAR/ZARAR GEÇMİŞİ — TEK CETVEL: DOLAR (2026-09-19)
// Kâr = dolar servetin ne kadar arttı (yeni para hariç). Servet dolar gösteriliyor,
// kâr da aynı cetvelle. TL kârını bugünkü kurla dolara çevirmek kur hareketini
// kâr sayıyordu (portföyün ~%90'ı TL fiyatıyla kayıtlı döviz/altın/BTC).
// Motor: lib/usdPnl.ts (test edilmiş), veri: services/usdPnlService.ts.

type Tab = 'daily' | 'weekly' | 'monthly';

const fmtUsd = (n: number) => `${n >= 0 ? '+' : '−'}$${Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
const pct = (gain: number, base: number) => (base > 0 ? (gain / base) * 100 : 0);

function Badge({ gain, base }: { gain: number; base: number }) {
  const pos = gain >= 0;
  return (
    <div className={`text-right ${pos ? 'text-green-600' : 'text-red-600'}`}>
      <p className="text-base font-bold">{fmtUsd(gain)}</p>
      <p className="text-xs">{pos ? '+' : ''}{pct(gain, base).toFixed(2)}%</p>
    </div>
  );
}

export function DailyMonthlyPnL() {
  const [tab, setTab] = useState<Tab>('daily');
  const [daily, setDaily] = useState<UsdDaily[]>([]);
  const [weekly, setWeekly] = useState<UsdPeriod[]>([]);
  const [monthly, setMonthly] = useState<UsdPeriod[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [d, w, m] = await Promise.all([getUsdDaily(), getUsdPeriods('weekly'), getUsdPeriods('monthly')]);
      setDaily([...d].reverse()); setWeekly([...w].reverse()); setMonthly([...m].reverse());
      setLoading(false);
    })();
  }, []);

  const fmtDate = (s: string) => new Date(s + 'T00:00:00').toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' });

  const renderPeriod = (rows: UsdPeriod[]) => (
    <div className="divide-y divide-slate-100 dark:divide-gray-700 max-h-[640px] overflow-y-auto">
      {rows.length === 0 ? <p className="text-center text-slate-400 py-10">Henüz veri yok</p> : rows.map((r) => {
        const pos = r.gainUSD >= 0;
        return (
          <div key={r.key} className={`p-4 border-l-4 ${pos ? 'border-l-green-500' : 'border-l-red-500'}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${pos ? 'bg-green-100 dark:bg-green-900/30' : 'bg-red-100 dark:bg-red-900/30'}`}>
                  {pos ? <TrendingUp size={16} className="text-green-600" /> : <TrendingDown size={16} className="text-red-600" />}
                </div>
                <div>
                  <p className="text-sm font-bold text-gray-900 dark:text-white">{r.label}</p>
                  <p className="text-xs text-slate-500 dark:text-gray-400">
                    servet ${r.startWealthUSD.toLocaleString('en-US', { maximumFractionDigits: 0 })} → ${r.endWealthUSD.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                    {r.realizedTRY !== 0 && <span className="ml-1 text-slate-400">(satış kârı {formatCurrency(r.realizedTRY)} ₺ dahil)</span>}
                    {r.gapDays > 45 && <span className="ml-1 text-amber-600">⚠ {r.gapDays} günlük dönem — arada kayıt yok</span>}
                  </p>
                </div>
              </div>
              <Badge gain={r.gainUSD} base={r.startWealthUSD} />
            </div>
            <div className="w-full bg-slate-100 dark:bg-gray-700 rounded-full h-1.5 mt-2">
              <div className={`h-1.5 rounded-full ${pos ? 'bg-green-500' : 'bg-red-500'}`} style={{ width: `${Math.min(Math.abs(pct(r.gainUSD, r.startWealthUSD)) * 10, 100)}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-slate-200 dark:border-gray-700 overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-200 dark:border-gray-700">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white">Kar/Zarar Geçmişi</h3>
          <span className="text-[11px] text-slate-500 dark:text-gray-400">dolar bazlı · yeni para hariç</span>
        </div>
        <div className="flex gap-2">
          {([['daily', 'Günlük', Calendar], ['weekly', 'Haftalık', CalendarDays], ['monthly', 'Aylık', BarChart2]] as const).map(([k, label, Icon]) => (
            <button key={k} onClick={() => setTab(k)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${tab === k ? 'bg-brand-600 text-white' : 'bg-slate-100 dark:bg-gray-700 text-slate-600 dark:text-gray-300'}`}>
              <Icon size={14} /> {label}
            </button>
          ))}
        </div>
      </div>

      {loading ? <p className="text-center text-slate-400 py-10">Yükleniyor…</p> : (
        <>
          {tab === 'daily' && (
            <div className="divide-y divide-slate-100 dark:divide-gray-700 max-h-[640px] overflow-y-auto">
              {daily.slice(0, 60).map((d) => {
                const pos = d.gainUSD >= 0;
                return (
                  <div key={d.date} className={`p-3 flex items-center justify-between border-l-4 ${pos ? 'border-l-green-500' : 'border-l-red-500'}`}>
                    <div>
                      <p className="text-sm font-semibold text-gray-900 dark:text-white">{fmtDate(d.date)}</p>
                      <p className="text-xs text-slate-500 dark:text-gray-400">servet ${d.wealthUSD.toLocaleString('en-US', { maximumFractionDigits: 0 })} · kur {d.usdRate.toFixed(2)}</p>
                    </div>
                    <Badge gain={d.gainUSD} base={d.wealthUSD - d.gainUSD} />
                  </div>
                );
              })}
            </div>
          )}
          {tab === 'weekly' && renderPeriod(weekly)}
          {tab === 'monthly' && (
            <div>
              {renderPeriod(monthly)}
              {monthly.length > 0 && (() => {
                const rows = monthly.filter(m => m.key >= '2026-04');
                const tot = rows.reduce((s, m) => s + m.gainUSD, 0);
                const posM = rows.filter(m => m.gainUSD > 0).length;
                return (
                  <div className="p-5 bg-slate-50 dark:bg-gray-900/30 border-t border-slate-200 dark:border-gray-700">
                    <p className="text-xs text-slate-500 dark:text-gray-400 mb-2">📈 Toplam (Nisan 2026'dan beri, {rows.length} ay)</p>
                    <div className="flex items-baseline gap-4">
                      <p className={`text-2xl font-bold ${tot >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>{fmtUsd(tot)}</p>
                      <p className="text-sm font-semibold text-slate-700 dark:text-gray-300">{posM}/{rows.length} ay kâr</p>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-gray-400 mt-2">
                      Kâr = dolar servetin artışı; kur hareketi kâr sayılmaz. Dinamik maaş = geçen ayın kârı × 0,85 (Kâr Cüzdanı).
                    </p>
                  </div>
                );
              })()}
            </div>
          )}
        </>
      )}
    </div>
  );
}
export default DailyMonthlyPnL;
