import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { PiggyBank, ArrowRight, TrendingUp } from 'lucide-react';
import { supabase } from '../lib/supabase';

export default function IncomeWidget() {
  const navigate = useNavigate();
  const [data, setData] = useState<{
    monthlyIncome: number;
    safeSalary: number;
    moderateSalary: number;
    latestReportDate: string | null;
    hasReport: boolean;
  }>({ monthlyIncome: 0, safeSalary: 0, moderateSalary: 0, latestReportDate: null, hasReport: false });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const monthStart = `${new Date().toISOString().substring(0, 7)}-01`;

    const [salaryRes, incomeRes, reportRes] = await Promise.all([
      supabase.from('monthly_salary').select('*').eq('salary_month', monthStart).single(),
      supabase.from('income_records').select('amount_try').gte('income_date', monthStart).eq('is_projected', false),
      supabase.from('daily_reports').select('report_date').order('report_date', { ascending: false }).limit(1).single(),
    ]);

    const monthlyIncome = (incomeRes.data || []).reduce((s: number, r: any) => s + (r.amount_try || 0), 0);

    setData({
      monthlyIncome,
      safeSalary: salaryRes.data?.safe_amount || 0,
      moderateSalary: salaryRes.data?.moderate_amount || 0,
      latestReportDate: reportRes.data?.report_date || null,
      hasReport: !!reportRes.data,
    });
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
            <p className="text-[10px] text-gray-400">Güvenli</p>
            <p className="text-sm font-bold text-accent-600">{formatMoney(data.safeSalary)} <span className="text-[10px] font-normal text-gray-400">TL/ay</span></p>
          </div>
          <div>
            <p className="text-[10px] text-gray-400">Dengeli</p>
            <p className="text-sm font-bold text-brand-600">{formatMoney(data.moderateSalary)} <span className="text-[10px] font-normal text-gray-400">TL/ay</span></p>
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
