import { useEffect, useState } from 'react';
import { TrendingUp, TrendingDown, Calendar, BarChart2, CalendarDays } from 'lucide-react';
import { getEurDaily, getEurWeeks, getEurMonths, monthLabel, type EurDaily } from '../services/eurPnlService';
import type { MonthRow } from '../lib/eurPnl';

// KAR/ZARAR GEÇMİŞİ — TEK CETVEL: EURO (2026-09-19 gece; standart araştırması + kullanıcı kararı)
// Kâr = euro servetin artışı, koyduğun/çektiğin para hariç (GIPS). Euro, çünkü harcanan para
// (IAS 21 §9); TL hiperenflasyonist (IAS 29); USD harcanmıyor. Kur hareketi kâr değildir.
// Motor: lib/eurPnl.ts (6 test), veri: services/eurPnlService.ts; 4 bağımsız denetçi ±€40.

type Tab = 'daily' | 'weekly' | 'monthly';

const fmtEur = (n: number) => `${n >= 0 ? '+' : '−'}€${Math.abs(n).toLocaleString('de-DE', { maximumFractionDigits: 0 })}`;
const fmtW = (n: number) => `€${Math.round(n).toLocaleString('de-DE')}`;
const pct = (gain: number, base: number) => (base > 0 ? (gain / base) * 100 : 0);

function Badge({ gain, base }: { gain: number; base: number }) {
  const pos = gain >= 0;
  return (
    <div className={`text-right ${pos ? 'text-green-600' : 'text-red-600'}`}>
      <p className="text-base font-bold">{fmtEur(gain)}</p>
      <p className="text-xs">{pos ? '+' : ''}{pct(gain, base).toFixed(2)}%</p>
    </div>
  );
}

export function DailyMonthlyPnL() {
  const [tab, setTab] = useState<Tab>('daily');
  type Period = { key: string; label: string; gainEUR: number; startWealthEUR: number; endWealthEUR: number; firstDate: string; lastDate: string; gapDays: number; inflationEUR?: number; realGainEUR?: number; carryInEUR?: number; salaryEUR?: number; carryResetApplied?: boolean };
  const [daily, setDaily] = useState<EurDaily[]>([]);
  const [weekly, setWeekly] = useState<Period[]>([]);
  const [monthly, setMonthly] = useState<Period[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  // daily DESC (yeni→eski) → i'nin önceki günü i+1. Taban = önceki günün serveti (LivePage/ana sayfa/cron ile aynı).
  const prevWealthOf = (i: number) => daily[i + 1]?.wealthEUR ?? (daily[i] ? daily[i].wealthEUR - daily[i].gainEUR : 0);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const gap = (a: string, b: string) => Math.round((new Date(b + 'T00:00:00').getTime() - new Date(a + 'T00:00:00').getTime()) / 86400000);
      const [d, w, m] = await Promise.all([getEurDaily(), getEurWeeks(), getEurMonths()]).catch((e) => { setErr(e?.message || 'veri yüklenemedi'); return [[], [], []] as const; });
      setDaily([...d].reverse());
      setWeekly([...w].map((x, i, arr) => ({ ...x, gapDays: gap(i > 0 ? arr[i - 1].lastDate : x.firstDate, x.lastDate) })).reverse());
      setMonthly([...m].map((x: MonthRow, i, arr) => ({ key: x.month, label: monthLabel(x.month), gainEUR: x.gainEUR, startWealthEUR: x.startWealthEUR, endWealthEUR: x.endWealthEUR, firstDate: x.firstDate, lastDate: x.lastDate, gapDays: gap(i > 0 ? arr[i - 1].lastDate : x.firstDate, x.lastDate), inflationEUR: x.inflationEUR, realGainEUR: x.realGainEUR, carryInEUR: x.carryInEUR, salaryEUR: x.salaryEUR, carryResetApplied: x.carryResetApplied })).reverse());
      setLoading(false);
    })();
  }, []);

  const fmtDate = (s: string) => new Date(s + 'T00:00:00').toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' });

  const renderPeriod = (rows: Period[]) => (
    <div className="divide-y divide-slate-100 dark:divide-gray-700 max-h-[640px] overflow-y-auto">
      {rows.length === 0 ? <p className="text-center text-slate-400 py-10">Henüz veri yok</p> : rows.map((r) => {
        const pos = r.gainEUR >= 0;
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
                    servet {fmtW(r.startWealthEUR)} → {fmtW(r.endWealthEUR)}
                    {r.salaryEUR !== undefined && <span className="ml-1 text-slate-400">· reel {fmtEur(r.realGainEUR ?? 0)} → maaş €{Math.round(r.salaryEUR).toLocaleString('de-DE')}</span>}
                    {r.gapDays > 45 && <span className="ml-1 text-amber-600">⚠ {r.gapDays} günlük dönem — arada kayıt yok</span>}
                  </p>
                </div>
              </div>
              <Badge gain={r.gainEUR} base={r.startWealthEUR} />
            </div>
            <div className="w-full bg-slate-100 dark:bg-gray-700 rounded-full h-1.5 mt-2">
              <div className={`h-1.5 rounded-full ${pos ? 'bg-green-500' : 'bg-red-500'}`} style={{ width: `${Math.min(Math.abs(pct(r.gainEUR, r.startWealthEUR)) * 10, 100)}%` }} />
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
          <span className="text-[11px] text-slate-500 dark:text-gray-400">euro bazlı · koyduğun/çektiğin para hariç</span>
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

      {err ? <p className="text-center text-red-500 py-10 text-sm">Kâr verisi yüklenemedi: {err}</p> : loading ? <p className="text-center text-slate-400 py-10">Yükleniyor…</p> : (
        <>
          {tab === 'daily' && (
            <div className="divide-y divide-slate-100 dark:divide-gray-700 max-h-[640px] overflow-y-auto">
              {daily.slice(0, 60).map((d, i) => {
                const pos = d.gainEUR >= 0;
                return (
                  <div key={d.date} className={`p-3 flex items-center justify-between border-l-4 ${pos ? 'border-l-green-500' : 'border-l-red-500'}`}>
                    <div>
                      <p className="text-sm font-semibold text-gray-900 dark:text-white">{fmtDate(d.date)}</p>
                      <p className="text-xs text-slate-500 dark:text-gray-400">servet {fmtW(d.wealthEUR)} · EUR/TL {d.eurRate.toFixed(2)}</p>
                    </div>
                    <Badge gain={d.gainEUR} base={prevWealthOf(i)} />
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
                const tot = rows.reduce((s, m) => s + m.gainEUR, 0);
                const posM = rows.filter(m => m.gainEUR > 0).length;
                return (
                  <div className="p-5 bg-slate-50 dark:bg-gray-900/30 border-t border-slate-200 dark:border-gray-700">
                    <p className="text-xs text-slate-500 dark:text-gray-400 mb-2">📈 Toplam (Nisan 2026'dan beri, {rows.length} ay)</p>
                    <div className="flex items-baseline gap-4">
                      <p className={`text-2xl font-bold ${tot >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>{fmtEur(tot)}</p>
                      <p className="text-sm font-semibold text-slate-700 dark:text-gray-300">{posM}/{rows.length} ay kâr</p>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-gray-400 mt-2">
                      Kâr = euro servetin artışı; kur hareketi kâr sayılmaz. Maaş = (kâr − %2/yıl enflasyon payı, zarar devirli) × 0,85 (Kâr Cüzdanı).
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
