import { useEffect, useState } from 'react';
import { TrendingUp, TrendingDown, Calendar, BarChart2, ArrowUp, ArrowDown, CalendarDays } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { formatCurrency, formatCurrencyUSD, getCachedUSDRate } from '../services/priceService';
import { DEFAULT_USD_TRY_RATE } from '../config';

interface DayRecord {
  date: string;
  total_value: number;
  total_pnl: number;
  pnl_percentage: number;
  daily_change: number;
  daily_change_pct: number;
}

interface PeriodRecord {
  key: string;
  label: string;
  start_value: number;
  end_value: number;
  change: number;
  change_pct: number;
}

type Tab = 'daily' | 'weekly' | 'monthly';

function PnLBadge({ value, pct }: { value: number; pct: number }) {
  const pos = value >= 0;
  return (
    <div className={`flex items-center gap-1 text-sm font-bold ${pos ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
      {pos ? <ArrowUp size={14} /> : <ArrowDown size={14} />}
      <span>{pos ? '+' : ''}{formatCurrency(value)} ₺</span>
      <span className="font-semibold">({pos ? '+' : ''}{pct.toFixed(2)}%)</span>
    </div>
  );
}

function UsdSubLine({ value, usdRate }: { value: number; usdRate: number }) {
  const pos = value >= 0;
  return (
    <p className={`text-xs font-semibold mt-0.5 ${pos ? 'text-green-600/80 dark:text-green-400/80' : 'text-red-600/80 dark:text-red-400/80'}`}>
      {pos ? '+' : ''}${formatCurrencyUSD(value, usdRate)}
    </p>
  );
}

// Pazartesi başlangıçlı haftanın ISO key'i (YYYY-WNN) ve label'i
function weekKeyAndLabel(dateStr: string): { key: string; label: string } {
  const d = new Date(dateStr + 'T00:00:00');
  const day = (d.getDay() + 6) % 7; // Pzt=0
  const monday = new Date(d);
  monday.setDate(d.getDate() - day);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  // ISO week numarası
  const tmp = new Date(Date.UTC(monday.getFullYear(), monday.getMonth(), monday.getDate()));
  const dayNum = (tmp.getUTCDay() + 6) % 7;
  tmp.setUTCDate(tmp.getUTCDate() - dayNum + 3);
  const firstThu = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((tmp.getTime() - firstThu.getTime()) / 86400000 - 3 + ((firstThu.getUTCDay() + 6) % 7)) / 7);

  const fmt = (x: Date) =>
    `${String(x.getDate()).padStart(2, '0')}.${String(x.getMonth() + 1).padStart(2, '0')}`;
  return {
    key: `${tmp.getUTCFullYear()}-W${String(week).padStart(2, '0')}`,
    label: `${fmt(monday)} – ${fmt(sunday)} ${sunday.getFullYear()}`,
  };
}

export function DailyMonthlyPnL() {
  const [tab, setTab] = useState<Tab>('daily');
  const [dailyRecords, setDailyRecords] = useState<DayRecord[]>([]);
  const [weeklyRecords, setWeeklyRecords] = useState<PeriodRecord[]>([]);
  const [monthlyRecords, setMonthlyRecords] = useState<PeriodRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [usdRate, setUsdRate] = useState(DEFAULT_USD_TRY_RATE);

  useEffect(() => {
    loadData();
    getCachedUSDRate().then(setUsdRate);
  }, []);

  async function loadData() {
    setLoading(true);
    const { data: rawData, error } = await supabase
      .from('portfolio_snapshots')
      .select('snapshot_date, total_value, total_pnl, pnl_percentage, total_deposits, total_withdrawals, created_at')
      .order('snapshot_date', { ascending: true })
      .order('created_at', { ascending: false });

    if (error || !rawData) {
      setLoading(false);
      return;
    }

    // Defansif: aynı tarihte birden çok satır varsa en yenisini tut
    const dedup = new Map<string, typeof rawData[0]>();
    for (const r of rawData) {
      if (!dedup.has(r.snapshot_date)) dedup.set(r.snapshot_date, r);
    }
    const data = Array.from(dedup.values()).sort(
      (a, b) => a.snapshot_date.localeCompare(b.snapshot_date)
    );

    const daily: DayRecord[] = data.map((row, i) => {
      const prev = i > 0 ? data[i - 1] : null;
      const prevValue = prev ? Number(prev.total_value) : Number(row.total_value);
      const currValue = Number(row.total_value);

      const currNetCash = (Number(row.total_deposits) || 0) - (Number(row.total_withdrawals) || 0);
      const prevNetCash = prev
        ? (Number(prev.total_deposits) || 0) - (Number(prev.total_withdrawals) || 0)
        : currNetCash;
      const cashFlowToday = currNetCash - prevNetCash;

      const dailyChange = i === 0 ? 0 : (currValue - prevValue) - cashFlowToday;
      const dailyChangePct = prevValue > 0 && i > 0 ? (dailyChange / prevValue) * 100 : 0;

      return {
        date: row.snapshot_date,
        total_value: currValue,
        total_pnl: Number(row.total_pnl),
        pnl_percentage: Number(row.pnl_percentage),
        daily_change: dailyChange,
        daily_change_pct: dailyChangePct,
      };
    });

    // Generic gruplayıcı: snapshot satırlarını verilen key/label fonksiyonuna göre periyoda topla
    type Bucket = { label: string; values: { date: string; value: number; deposits: number; withdrawals: number }[] };
    const groupBy = (keyFn: (date: string) => { key: string; label: string }): PeriodRecord[] => {
      const map = new Map<string, Bucket>();
      for (const row of data) {
        const { key, label } = keyFn(row.snapshot_date);
        if (!map.has(key)) map.set(key, { label, values: [] });
        map.get(key)!.values.push({
          date: row.snapshot_date,
          value: Number(row.total_value),
          deposits: Number(row.total_deposits) || 0,
          withdrawals: Number(row.total_withdrawals) || 0,
        });
      }
      const out: PeriodRecord[] = [];
      const keys = Array.from(map.keys()).sort();
      let prevEnd: number | null = null;
      for (const k of keys) {
        const { label, values } = map.get(k)!;
        const endValue = values[values.length - 1].value;
        const endNetCash = (values[values.length - 1].deposits || 0) - (values[values.length - 1].withdrawals || 0);
        const startNetCash = (values[0].deposits || 0) - (values[0].withdrawals || 0);
        const netCashFlow = endNetCash - startNetCash;
        const startValue = prevEnd !== null ? prevEnd : values[0].value;
        const change = prevEnd !== null ? (endValue - startValue) - netCashFlow : 0;
        const changePct = startValue > 0 && prevEnd !== null ? (change / startValue) * 100 : 0;
        out.push({ key: k, label, start_value: startValue, end_value: endValue, change, change_pct: changePct });
        prevEnd = endValue;
      }
      return out;
    };

    const monthly = groupBy((d) => {
      const key = d.substring(0, 7);
      const [year, mon] = key.split('-');
      const monthNames = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
      return { key, label: `${monthNames[parseInt(mon) - 1]} ${year}` };
    });

    const weekly = groupBy(weekKeyAndLabel);

    setDailyRecords([...daily].reverse());
    setWeeklyRecords([...weekly].reverse());
    setMonthlyRecords([...monthly].reverse());
    setLoading(false);
  }

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric', weekday: 'short' });
  };

  const totals = dailyRecords.length > 0 ? {
    bestDay: dailyRecords.reduce((best, d) => d.daily_change > best.daily_change ? d : best, dailyRecords[0]),
    worstDay: dailyRecords.reduce((worst, d) => d.daily_change < worst.daily_change ? d : worst, dailyRecords[0]),
    positiveDays: dailyRecords.filter(d => d.daily_change > 0).length,
    negativeDays: dailyRecords.filter(d => d.daily_change < 0).length,
  } : null;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-slate-200 dark:border-gray-700 overflow-hidden">
      <div className="p-5 border-b border-slate-200 dark:border-gray-700">
        <div className="flex items-center gap-2 mb-4">
          <BarChart2 className="text-brand-600 dark:text-brand-400" size={22} />
          <h3 className="text-lg font-bold text-gray-900 dark:text-white">Kar/Zarar Geçmişi</h3>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => setTab('daily')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all border ${
              tab === 'daily'
                ? 'bg-brand-600 text-white border-brand-600'
                : 'bg-slate-50 dark:bg-gray-700 text-slate-700 dark:text-gray-300 border-slate-200 dark:border-gray-600 hover:border-brand-400'
            }`}
          >
            <Calendar size={15} />
            Günlük
          </button>
          <button
            onClick={() => setTab('weekly')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all border ${
              tab === 'weekly'
                ? 'bg-brand-600 text-white border-brand-600'
                : 'bg-slate-50 dark:bg-gray-700 text-slate-700 dark:text-gray-300 border-slate-200 dark:border-gray-600 hover:border-brand-400'
            }`}
          >
            <CalendarDays size={15} />
            Haftalık
          </button>
          <button
            onClick={() => setTab('monthly')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all border ${
              tab === 'monthly'
                ? 'bg-brand-600 text-white border-brand-600'
                : 'bg-slate-50 dark:bg-gray-700 text-slate-700 dark:text-gray-300 border-slate-200 dark:border-gray-600 hover:border-brand-400'
            }`}
          >
            <BarChart2 size={15} />
            Aylık
          </button>
        </div>
      </div>

      {loading ? (
        <div className="p-6 space-y-3">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="h-16 bg-slate-100 dark:bg-gray-700 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : (
        <>
          {tab === 'daily' && (
            <div>
              {totals && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-5 bg-slate-50 dark:bg-gray-900/30 border-b border-slate-200 dark:border-gray-700">
                  <div className="text-center">
                    <p className="text-xs text-slate-500 dark:text-gray-400 mb-1">Pozitif Gün</p>
                    <p className="text-xl font-bold text-green-600">{totals.positiveDays}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-slate-500 dark:text-gray-400 mb-1">Negatif Gün</p>
                    <p className="text-xl font-bold text-red-600">{totals.negativeDays}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-slate-500 dark:text-gray-400 mb-1">En İyi Gün</p>
                    <p className="text-sm font-bold text-green-600">+{formatCurrency(totals.bestDay.daily_change)} ₺</p>
                    <p className="text-xs font-semibold text-green-600/80">+${formatCurrencyUSD(totals.bestDay.daily_change, usdRate)}</p>
                    <p className="text-xs text-slate-400">{formatDate(totals.bestDay.date)}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-slate-500 dark:text-gray-400 mb-1">En Kötü Gün</p>
                    <p className="text-sm font-bold text-red-600">{formatCurrency(totals.worstDay.daily_change)} ₺</p>
                    <p className="text-xs font-semibold text-red-600/80">${formatCurrencyUSD(totals.worstDay.daily_change, usdRate)}</p>
                    <p className="text-xs text-slate-400">{formatDate(totals.worstDay.date)}</p>
                  </div>
                </div>
              )}

              <div className="divide-y divide-slate-100 dark:divide-gray-700 max-h-[520px] overflow-y-auto">
                {dailyRecords.length === 0 ? (
                  <p className="text-center text-slate-400 dark:text-gray-500 py-10">Henüz günlük veri yok</p>
                ) : (
                  dailyRecords.map((rec) => {
                    const pos = rec.daily_change >= 0;
                    return (
                      <div
                        key={rec.date}
                        className={`flex items-center justify-between p-4 hover:bg-slate-50 dark:hover:bg-gray-700/50 transition-colors ${
                          pos ? 'border-l-4 border-l-green-500' : 'border-l-4 border-l-red-500'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center ${pos ? 'bg-green-100 dark:bg-green-900/30' : 'bg-red-100 dark:bg-red-900/30'}`}>
                            {pos ? <TrendingUp size={16} className="text-green-600" /> : <TrendingDown size={16} className="text-red-600" />}
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-gray-900 dark:text-white">{formatDate(rec.date)}</p>
                            <p className="text-xs text-slate-500 dark:text-gray-400">Değer: {formatCurrency(rec.total_value)} ₺</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <PnLBadge value={rec.daily_change} pct={rec.daily_change_pct} />
                          <UsdSubLine value={rec.daily_change} usdRate={usdRate} />
                          <p className="text-xs text-slate-400 dark:text-gray-500 mt-0.5">
                            Toplam K/Z:{' '}
                            <span className={rec.total_pnl >= 0 ? 'text-green-600' : 'text-red-600'}>
                              {formatCurrency(rec.total_pnl)} ₺ / ${formatCurrencyUSD(rec.total_pnl, usdRate)}
                            </span>
                          </p>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {tab === 'weekly' && (
            <div>
              <div className="divide-y divide-slate-100 dark:divide-gray-700 max-h-[640px] overflow-y-auto">
                {weeklyRecords.length === 0 ? (
                  <p className="text-center text-slate-400 dark:text-gray-500 py-10">Henüz haftalık veri yok</p>
                ) : (
                  weeklyRecords.map((rec) => {
                    const pos = rec.change >= 0;
                    const barWidth = Math.min(Math.abs(rec.change_pct) * 5, 100);
                    return (
                      <div
                        key={rec.key}
                        className={`p-4 hover:bg-slate-50 dark:hover:bg-gray-700/50 transition-colors border-l-4 ${pos ? 'border-l-green-500' : 'border-l-red-500'}`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${pos ? 'bg-green-100 dark:bg-green-900/30' : 'bg-red-100 dark:bg-red-900/30'}`}>
                              {pos ? <TrendingUp size={16} className="text-green-600" /> : <TrendingDown size={16} className="text-red-600" />}
                            </div>
                            <div>
                              <p className="text-sm font-bold text-gray-900 dark:text-white">{rec.label}</p>
                              <p className="text-xs text-slate-500 dark:text-gray-400">
                                {formatCurrency(rec.start_value)} ₺ → {formatCurrency(rec.end_value)} ₺
                              </p>
                            </div>
                          </div>
                          <div className="text-right">
                            <PnLBadge value={rec.change} pct={rec.change_pct} />
                            <UsdSubLine value={rec.change} usdRate={usdRate} />
                          </div>
                        </div>
                        <div className="w-full bg-slate-100 dark:bg-gray-700 rounded-full h-1.5 mt-2">
                          <div
                            className={`h-1.5 rounded-full transition-all duration-500 ${pos ? 'bg-green-500' : 'bg-red-500'}`}
                            style={{ width: `${barWidth}%` }}
                          />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {weeklyRecords.length > 0 && (
                <div className="p-5 bg-slate-50 dark:bg-gray-900/30 border-t border-slate-200 dark:border-gray-700">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-slate-500 dark:text-gray-400 mb-1">En İyi Hafta</p>
                      {(() => {
                        const best = weeklyRecords.reduce((b, w) => w.change > b.change ? w : b, weeklyRecords[0]);
                        return (
                          <>
                            <p className="font-bold text-green-600">+{formatCurrency(best.change)} ₺</p>
                            <p className="text-xs font-semibold text-green-600/80">+${formatCurrencyUSD(best.change, usdRate)}</p>
                            <p className="text-xs text-slate-400">{best.label} ({best.change_pct >= 0 ? '+' : ''}{best.change_pct.toFixed(2)}%)</p>
                          </>
                        );
                      })()}
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 dark:text-gray-400 mb-1">En Kötü Hafta</p>
                      {(() => {
                        const worst = weeklyRecords.reduce((w, x) => x.change < w.change ? x : w, weeklyRecords[0]);
                        return (
                          <>
                            <p className="font-bold text-red-600">{formatCurrency(worst.change)} ₺</p>
                            <p className="text-xs font-semibold text-red-600/80">${formatCurrencyUSD(worst.change, usdRate)}</p>
                            <p className="text-xs text-slate-400">{worst.label} ({worst.change_pct >= 0 ? '+' : ''}{worst.change_pct.toFixed(2)}%)</p>
                          </>
                        );
                      })()}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {tab === 'monthly' && (
            <div>
              <div className="divide-y divide-slate-100 dark:divide-gray-700 max-h-[640px] overflow-y-auto">
                {monthlyRecords.length === 0 ? (
                  <p className="text-center text-slate-400 dark:text-gray-500 py-10">Henüz aylık veri yok</p>
                ) : (
                  monthlyRecords.map((rec) => {
                    const pos = rec.change >= 0;
                    const barWidth = Math.min(Math.abs(rec.change_pct) * 3, 100);
                    return (
                      <div
                        key={rec.key}
                        className={`p-4 hover:bg-slate-50 dark:hover:bg-gray-700/50 transition-colors border-l-4 ${pos ? 'border-l-green-500' : 'border-l-red-500'}`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${pos ? 'bg-green-100 dark:bg-green-900/30' : 'bg-red-100 dark:bg-red-900/30'}`}>
                              {pos ? <TrendingUp size={16} className="text-green-600" /> : <TrendingDown size={16} className="text-red-600" />}
                            </div>
                            <div>
                              <p className="text-sm font-bold text-gray-900 dark:text-white">{rec.label}</p>
                              <p className="text-xs text-slate-500 dark:text-gray-400">
                                {formatCurrency(rec.start_value)} ₺ → {formatCurrency(rec.end_value)} ₺
                              </p>
                            </div>
                          </div>
                          <div className="text-right">
                            <PnLBadge value={rec.change} pct={rec.change_pct} />
                            <UsdSubLine value={rec.change} usdRate={usdRate} />
                          </div>
                        </div>
                        <div className="w-full bg-slate-100 dark:bg-gray-700 rounded-full h-1.5 mt-2">
                          <div
                            className={`h-1.5 rounded-full transition-all duration-500 ${pos ? 'bg-green-500' : 'bg-red-500'}`}
                            style={{ width: `${barWidth}%` }}
                          />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {monthlyRecords.length > 0 && (
                <div className="p-5 bg-slate-50 dark:bg-gray-900/30 border-t border-slate-200 dark:border-gray-700">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-slate-500 dark:text-gray-400 mb-1">En İyi Ay</p>
                      {(() => {
                        const best = monthlyRecords.reduce((b, m) => m.change > b.change ? m : b, monthlyRecords[0]);
                        return (
                          <>
                            <p className="font-bold text-green-600">+{formatCurrency(best.change)} ₺</p>
                            <p className="text-xs font-semibold text-green-600/80">+${formatCurrencyUSD(best.change, usdRate)}</p>
                            <p className="text-xs text-slate-400">{best.label} ({best.change_pct >= 0 ? '+' : ''}{best.change_pct.toFixed(2)}%)</p>
                          </>
                        );
                      })()}
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 dark:text-gray-400 mb-1">En Kötü Ay</p>
                      {(() => {
                        const worst = monthlyRecords.reduce((w, m) => m.change < w.change ? m : w, monthlyRecords[0]);
                        return (
                          <>
                            <p className="font-bold text-red-600">{formatCurrency(worst.change)} ₺</p>
                            <p className="text-xs font-semibold text-red-600/80">${formatCurrencyUSD(worst.change, usdRate)}</p>
                            <p className="text-xs text-slate-400">{worst.label} ({worst.change_pct >= 0 ? '+' : ''}{worst.change_pct.toFixed(2)}%)</p>
                          </>
                        );
                      })()}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
