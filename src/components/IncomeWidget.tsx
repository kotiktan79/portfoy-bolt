import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { PiggyBank, ArrowRight, TrendingUp } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getDynamicSalary, DynamicSalary } from '../services/salaryService';

export default function IncomeWidget() {
  const navigate = useNavigate();
  // 2026-09-19: 'Güvenli/Dengeli' (AI raporunun monthly_salary tahmini) KALDIRILDI —
  // tek ölçü: geçen ayın kârı × 0,85 (salaryService). Rapor tahmini farklı rakam
  // gösterip kullanıcıyı yanıltıyordu.
  const [salary, setSalary] = useState<DynamicSalary | null>(null);
  const [data, setData] = useState<{
    monthlyIncome: number;
    latestReportDate: string | null;
    hasReport: boolean;
  }>({ monthlyIncome: 0, latestReportDate: null, hasReport: false });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const now = new Date();
    const monthStart = `${now.toISOString().substring(0, 7)}-01`;
    // Exclusive upper bound = first day of next month, so "this month" never
    // pulls in future-dated realized rows.
    const nextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    const nextMonthStart = nextMonth.toISOString().substring(0, 10);

    const [incomeRes, reportRes] = await Promise.all([
      supabase.from('income_records').select('amount_try').gte('income_date', monthStart).lt('income_date', nextMonthStart).eq('is_projected', false),
      supabase.from('daily_reports').select('report_date').order('report_date', { ascending: false }).limit(1).maybeSingle(),
    ]);

    const monthlyIncome = (incomeRes.data || []).reduce((s: number, r: any) => s + (r.amount_try || 0), 0);

    setData({
      monthlyIncome,
      latestReportDate: reportRes.data?.report_date || null,
      hasReport: !!reportRes.data,
    });
    getDynamicSalary().then(setSalary).catch(() => {});
  };

  const formatMoney = (n: number) => {
    if (!n || !isFinite(n)) return '0';
    return n.toLocaleString('tr-TR', { maximumFractionDigits: 0 });
  };

  // Eğer hiç veri yoksa gösterme
  if (!data.hasReport && data.monthlyIncome === 0) return null;

  return (
    <button
      onClick={() => navigate('/daily-report')}
      className="w-full rounded-2xl border border-brand-200 dark:border-brand-800/50 bg-gradient-to-r from-brand-50 to-brand-50 dark:from-brand-950/20 dark:to-brand-950/20 p-3 text-left hover:shadow-md transition-all"
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <PiggyBank className="w-4 h-4 text-brand-600" />
          <span className="text-xs font-bold uppercase tracking-widest text-brand-600 dark:text-brand-400">Dinamik Maaş</span>
        </div>
        <ArrowRight className="w-3.5 h-3.5 text-brand-400" />
      </div>

      <div className="flex items-end justify-between">
        <div className="flex gap-4">
          <div>
            <p className="text-[10px] text-gray-400">{salary ? (salary.carryInEUR < 0 ? `devreden açık −€${Math.round(Math.abs(salary.carryInEUR))}` : `${salary.monthLabel} çekilebilir × 0,85`) : 'Bu ay'}</p>
            <p className="text-sm font-bold text-accent-600">€{formatMoney(salary?.salaryEUR ?? 0)} <span className="text-[10px] font-normal text-gray-400">/ay</span></p>
          </div>
          {data.monthlyIncome > 0 && (
            <div>
              <p className="text-[10px] text-gray-400">Bu ay</p>
              <p className="text-sm font-bold text-brand-600 flex items-center gap-1">
                <TrendingUp className="w-3 h-3" />
                {formatMoney(data.monthlyIncome)} <span className="text-[10px] font-normal text-gray-400">TL</span>
              </p>
            </div>
          )}
        </div>
      </div>

      {data.latestReportDate && (
        <p className="text-[10px] text-gray-400 mt-1.5">
          Son rapor: {new Date(data.latestReportDate).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}
        </p>
      )}
    </button>
  );
}
