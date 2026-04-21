import { useState, useEffect } from 'react';
import { Calendar, ChevronLeft, ChevronRight, TrendingUp } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface IncomeRecord {
  id: string;
  income_date: string;
  income_type: string;
  source_symbol: string | null;
  amount: number;
  currency: string;
  amount_try: number;
  notes: string | null;
  is_projected: boolean;
}

interface IncomeCalendarProps {
  onRefresh?: number; // increment to trigger refresh
}

const TYPE_LABELS: Record<string, string> = {
  dividend: 'Temettü', interest: 'Faiz', staking: 'Staking',
  coupon: 'Kupon', profit_taking: 'Kâr Real.', other: 'Diğer',
};

const TYPE_COLORS: Record<string, string> = {
  dividend: 'bg-green-500', interest: 'bg-brand-500', staking: 'bg-brand-500',
  coupon: 'bg-amber-500', profit_taking: 'bg-brand-500', other: 'bg-gray-500',
};

const TYPE_BG: Record<string, string> = {
  dividend: 'bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800/50',
  interest: 'bg-brand-50 dark:bg-brand-950/20 border-brand-200 dark:border-brand-800/50',
  staking: 'bg-brand-50 dark:bg-brand-950/20 border-brand-200 dark:border-brand-800/50',
  coupon: 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800/50',
  profit_taking: 'bg-brand-50 dark:bg-brand-950/20 border-brand-200 dark:border-brand-800/50',
  other: 'bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700',
};

export default function IncomeCalendar({ onRefresh }: IncomeCalendarProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [records, setRecords] = useState<IncomeRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadRecords();
  }, [currentMonth, onRefresh]);

  const loadRecords = async () => {
    setLoading(true);
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const start = new Date(year, month, 1).toISOString().split('T')[0];
    const end = new Date(year, month + 1, 0).toISOString().split('T')[0];

    const { data } = await supabase
      .from('income_records')
      .select('*')
      .gte('income_date', start)
      .lte('income_date', end)
      .order('income_date', { ascending: true });

    setRecords(data || []);
    setLoading(false);
  };

  const navigate = (dir: number) => {
    setCurrentMonth(prev => {
      const d = new Date(prev);
      d.setMonth(d.getMonth() + dir);
      return d;
    });
  };

  const monthLabel = currentMonth.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' });

  // Aylık toplam
  const totalRealized = records.filter(r => !r.is_projected).reduce((s, r) => s + r.amount_try, 0);
  const totalProjected = records.filter(r => r.is_projected).reduce((s, r) => s + r.amount_try, 0);

  // Tipe göre grupla
  const byType: Record<string, { realized: number; projected: number; count: number }> = {};
  for (const r of records) {
    if (!byType[r.income_type]) byType[r.income_type] = { realized: 0, projected: 0, count: 0 };
    byType[r.income_type].count++;
    if (r.is_projected) byType[r.income_type].projected += r.amount_try;
    else byType[r.income_type].realized += r.amount_try;
  }

  // Güne göre grupla (takvim görünümü)
  const byDay: Record<string, IncomeRecord[]> = {};
  for (const r of records) {
    const day = r.income_date;
    if (!byDay[day]) byDay[day] = [];
    byDay[day].push(r);
  }

  const formatMoney = (n: number) => n.toLocaleString('tr-TR', { maximumFractionDigits: 0 });

  return (
    <div className="space-y-3">
      {/* Ay Navigasyonu + Özet */}
      <div className="flex items-center justify-between">
        <button onClick={() => navigate(-1)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-gray-800">
          <ChevronLeft className="w-4 h-4 text-gray-600 dark:text-gray-400" />
        </button>
        <div className="text-center">
          <span className="text-sm font-bold text-gray-800 dark:text-gray-200 capitalize">{monthLabel}</span>
          <div className="flex items-center justify-center gap-3 mt-0.5">
            <span className="text-xs text-accent-600 font-medium">{formatMoney(totalRealized)} TL gerçekleşen</span>
            {totalProjected > 0 && (
              <span className="text-xs text-gray-400 font-medium">+{formatMoney(totalProjected)} TL tahmini</span>
            )}
          </div>
        </div>
        <button onClick={() => navigate(1)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-gray-800">
          <ChevronRight className="w-4 h-4 text-gray-600 dark:text-gray-400" />
        </button>
      </div>

      {/* Tip bazında özet */}
      {Object.keys(byType).length > 0 && (
        <div className="flex gap-1.5 flex-wrap">
          {Object.entries(byType).map(([type, data]) => (
            <div key={type} className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-slate-50 dark:bg-gray-800/50">
              <div className={`w-2 h-2 rounded-full ${TYPE_COLORS[type] || 'bg-gray-400'}`} />
              <span className="text-[10px] text-gray-600 dark:text-gray-400">{TYPE_LABELS[type]}</span>
              <span className="text-[10px] font-bold text-gray-800 dark:text-gray-200">{formatMoney(data.realized + data.projected)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Gelir Listesi (kronolojik) */}
      {loading ? (
        <div className="space-y-2 py-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-10 rounded-lg bg-slate-100 dark:bg-gray-800 animate-pulse" />
          ))}
        </div>
      ) : records.length === 0 ? (
        <div className="text-center py-6">
          <Calendar className="w-8 h-8 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
          <p className="text-xs text-gray-400">Bu ay gelir kaydı yok</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {Object.entries(byDay).map(([day, dayRecords]) => (
            <div key={day}>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1 px-1">
                {new Date(day).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', weekday: 'short' })}
              </p>
              {dayRecords.map(record => (
                <div
                  key={record.id}
                  className={`flex items-center justify-between rounded-xl p-3 border ${TYPE_BG[record.income_type] || TYPE_BG.other} ${record.is_projected ? 'opacity-60 border-dashed' : ''}`}
                >
                  <div className="flex items-center gap-2.5">
                    <div className={`w-2 h-8 rounded-full ${TYPE_COLORS[record.income_type] || 'bg-gray-400'}`} />
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-semibold text-gray-800 dark:text-gray-200">
                          {TYPE_LABELS[record.income_type]}
                        </span>
                        {record.source_symbol && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/60 dark:bg-gray-900/60 text-gray-600 dark:text-gray-400 font-medium">
                            {record.source_symbol}
                          </span>
                        )}
                        {record.is_projected && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-200 dark:bg-gray-700 text-gray-500 font-medium">TAHMİNİ</span>
                        )}
                      </div>
                      {record.notes && (
                        <p className="text-[10px] text-gray-500 mt-0.5">{record.notes}</p>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-gray-900 dark:text-white">
                      {formatMoney(record.amount_try)} <span className="text-[10px] text-gray-400">TL</span>
                    </p>
                    {record.currency !== 'TRY' && (
                      <p className="text-[10px] text-gray-400">{record.amount} {record.currency}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Yıllık Gelir Trendi (basit) */}
      {totalRealized > 0 && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-accent-50 dark:bg-accent-950/20 border border-accent-200 dark:border-accent-800/50">
          <TrendingUp className="w-4 h-4 text-accent-600" />
          <span className="text-xs text-accent-700 dark:text-accent-400">
            Bu ay toplam <span className="font-bold">{formatMoney(totalRealized)} TL</span> gelir elde edildi
            {totalProjected > 0 && <> + <span className="font-bold">{formatMoney(totalProjected)} TL</span> bekleniyor</>}
          </span>
        </div>
      )}
    </div>
  );
}
