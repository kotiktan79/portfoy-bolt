import { useState, useEffect, useCallback } from 'react';
import {
  FileText, TrendingUp, AlertTriangle, Target, DollarSign,
  RefreshCw, ChevronLeft, ChevronRight, Wallet, BarChart3, Globe, Newspaper,
  ArrowUpRight, Clock, Zap, Shield, PiggyBank
} from 'lucide-react';
import { getLatestReport, getReportHistory, getMonthlySalaryHistory, triggerDailyReport, triggerDailySnapshot, type DailyReport, type MonthlySalary } from '../services/reportService';
import IncomeRecordModal from '../components/IncomeRecordModal';
import IncomeCalendar from '../components/IncomeCalendar';
import { supabase } from '../lib/supabase';

export default function DailyReportPage() {
  const [report, setReport] = useState<DailyReport | null>(null);
  const [reports, setReports] = useState<DailyReport[]>([]);
  const [salaryHistory, setSalaryHistory] = useState<MonthlySalary[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [showIncomeModal, setShowIncomeModal] = useState(false);
  const [holdings, setHoldings] = useState<Array<{ symbol: string; asset_type: string }>>([]);
  const [incomeRefreshKey, setIncomeRefreshKey] = useState(0);
  const [activeTab, setActiveTab] = useState<'report' | 'income' | 'history'>('report');

  const loadData = useCallback(async () => {
    setLoading(true);
    const [reportData, historyData, salaryData] = await Promise.all([
      getLatestReport(),
      getReportHistory(30),
      getMonthlySalaryHistory(12),
    ]);
    if (reportData) setReport(reportData);
    setReports(historyData);
    setSalaryHistory(salaryData);
    setSelectedIndex(0);
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    supabase.from('holdings').select('symbol, asset_type').then(({ data }) => {
      if (data) setHoldings(data);
    });
  }, []);

  const handleGenerate = async () => {
    setGenerating(true);
    await triggerDailySnapshot();
    await triggerDailyReport();
    await loadData();
    setGenerating(false);
  };

  const navigateReport = (direction: number) => {
    const newIndex = selectedIndex + direction;
    if (newIndex >= 0 && newIndex < reports.length) {
      setSelectedIndex(newIndex);
      setReport(reports[newIndex]);
    }
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  };

  const formatMoney = (n: number) => {
    if (!n || !isFinite(n)) return '0';
    return n.toLocaleString('tr-TR', { maximumFractionDigits: 0 });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-gray-950">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
          <p className="text-sm text-gray-500 dark:text-gray-400">Raporlar yükleniyor...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-gray-950">
      <div className="max-w-4xl mx-auto px-3 md:px-5 py-4 space-y-3 pb-24">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-blue-600" />
            <h1 className="text-lg font-bold text-gray-900 dark:text-white">Günlük Rapor</h1>
          </div>
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${generating ? 'animate-spin' : ''}`} />
            {generating ? 'Üretiliyor...' : 'Rapor Üret'}
          </button>
        </div>

        {/* Tab Bar */}
        <div className="flex gap-1 p-1 bg-slate-100 dark:bg-gray-800 rounded-xl">
          {[
            { key: 'report' as const, label: 'Günlük Rapor', icon: FileText },
            { key: 'income' as const, label: 'Gelir & Maaş', icon: PiggyBank },
            { key: 'history' as const, label: 'Geçmiş', icon: Clock },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium transition-all ${
                activeTab === tab.key
                  ? 'bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-sm'
                  : 'text-gray-500 dark:text-gray-400'
              }`}
            >
              <tab.icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          ))}
        </div>

        {!report && activeTab === 'report' && (
          <div className="rounded-2xl border border-slate-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-8 text-center">
            <FileText className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">Henüz rapor yok</p>
            <button onClick={handleGenerate} disabled={generating} className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
              {generating ? 'Üretiliyor...' : 'İlk Raporu Üret'}
            </button>
          </div>
        )}

        {/* ==================== RAPOR TAB ==================== */}
        {activeTab === 'report' && report && (
          <>
            {/* Date Navigator */}
            <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800">
              <button onClick={() => navigateReport(1)} disabled={selectedIndex >= reports.length - 1} className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-gray-800 disabled:opacity-30">
                <ChevronLeft className="w-4 h-4 text-gray-600 dark:text-gray-400" />
              </button>
              <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{formatDate(report.report_date)}</span>
              <button onClick={() => navigateReport(-1)} disabled={selectedIndex <= 0} className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-gray-800 disabled:opacity-30">
                <ChevronRight className="w-4 h-4 text-gray-600 dark:text-gray-400" />
              </button>
            </div>

            {/* Portföy Özeti */}
            <div className="rounded-2xl border border-slate-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
              <div className="flex items-center gap-2 mb-3">
                <Wallet className="w-4 h-4 text-blue-600" />
                <span className="text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400">Portföy Durumu</span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-slate-50 dark:bg-gray-800/50 rounded-xl p-3">
                  <p className="text-[10px] uppercase tracking-wider text-gray-400">Toplam Değer</p>
                  <p className="text-lg font-bold text-gray-900 dark:text-white">{formatMoney(report.portfolio_value)} <span className="text-xs text-gray-400">TL</span></p>
                </div>
                <div className={`rounded-xl p-3 ${report.portfolio_pnl >= 0 ? 'bg-emerald-50 dark:bg-emerald-950/20' : 'bg-red-50 dark:bg-red-950/20'}`}>
                  <p className="text-[10px] uppercase tracking-wider text-gray-400">K/Z</p>
                  <p className={`text-lg font-bold ${report.portfolio_pnl >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    {report.portfolio_pnl >= 0 ? '+' : ''}{formatMoney(report.portfolio_pnl)} <span className="text-xs">TL</span>
                  </p>
                  <p className={`text-[10px] ${report.portfolio_pnl_pct >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                    %{report.portfolio_pnl_pct?.toFixed(1)}
                  </p>
                </div>
                <div className="bg-purple-50 dark:bg-purple-950/20 rounded-xl p-3">
                  <p className="text-[10px] uppercase tracking-wider text-gray-400">Güvenli Maaş</p>
                  <p className="text-lg font-bold text-purple-600">{formatMoney(report.safe_monthly_income)} <span className="text-xs">TL/ay</span></p>
                </div>
                <div className="bg-blue-50 dark:bg-blue-950/20 rounded-xl p-3">
                  <p className="text-[10px] uppercase tracking-wider text-gray-400">Dengeli Maaş</p>
                  <p className="text-lg font-bold text-blue-600">{formatMoney(report.moderate_monthly_income)} <span className="text-xs">TL/ay</span></p>
                </div>
              </div>
            </div>

            {/* Piyasa Araştırması */}
            {report.actions?.length > 0 && report.market_research && (
              <div className="rounded-2xl border border-slate-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Globe className="w-4 h-4 text-indigo-600" />
                  <span className="text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400">Piyasa Araştırması</span>
                </div>
                <div className="space-y-2">
                  {Object.entries(report.market_research || {}).map(([key, value]) => {
                    if (!value) return null;
                    const labels: Record<string, string> = {
                      global_trend: 'Küresel Trend',
                      sector_analysis: 'Sektör Analizi',
                      risk_environment: 'Risk Ortamı',
                      fx_impact: 'Döviz Etkisi',
                      opportunities: 'Fırsatlar',
                    };
                    return (
                      <div key={key} className="bg-slate-50 dark:bg-gray-800/50 rounded-xl p-3">
                        <p className="text-[10px] uppercase tracking-wider text-indigo-500 font-semibold mb-1">{labels[key] || key}</p>
                        <p className="text-xs text-gray-700 dark:text-gray-300">{value as string}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Piyasa Görünümü + Teşhis */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {report.market_outlook && (
                <div className="rounded-2xl border border-slate-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <BarChart3 className="w-4 h-4 text-cyan-600" />
                    <span className="text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400">Piyasa Görünümü</span>
                  </div>
                  <p className="text-xs text-gray-700 dark:text-gray-300 leading-relaxed">{report.market_outlook}</p>
                </div>
              )}
              {report.portfolio_diagnosis && (
                <div className="rounded-2xl border border-slate-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Shield className="w-4 h-4 text-amber-600" />
                    <span className="text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400">Portföy Teşhisi</span>
                  </div>
                  <p className="text-xs text-gray-700 dark:text-gray-300 leading-relaxed">{report.portfolio_diagnosis}</p>
                </div>
              )}
            </div>

            {/* Haberler */}
            {report.news_alerts && report.news_alerts.length > 0 && (
              <div className="rounded-2xl border border-slate-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Newspaper className="w-4 h-4 text-orange-600" />
                  <span className="text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400">Haberler & Uyarılar</span>
                </div>
                <div className="space-y-1.5">
                  {report.news_alerts.map((alert, i) => (
                    <div key={i} className="flex items-start gap-2 bg-amber-50 dark:bg-amber-950/20 rounded-lg p-2.5">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-500 mt-0.5 shrink-0" />
                      <p className="text-xs text-gray-700 dark:text-gray-300">{alert}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Aksiyon Planı */}
            {report.actions && report.actions.length > 0 && (
              <div className="rounded-2xl border border-slate-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Zap className="w-4 h-4 text-yellow-600" />
                  <span className="text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400">Günlük Aksiyonlar</span>
                </div>
                <div className="space-y-2">
                  {report.actions.map((action: any, i: number) => {
                    const urgencyColors: Record<string, string> = {
                      today: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
                      this_week: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
                      this_month: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
                    };
                    const typeIcons: Record<string, any> = {
                      buy: ArrowUpRight,
                      accumulate: TrendingUp,
                      hold: Shield,
                      rebalance: RefreshCw,
                      protect: Shield,
                      take_profit: DollarSign,
                    };
                    const TypeIcon = typeIcons[action.type] || Target;
                    const typeColors: Record<string, string> = {
                      buy: 'text-emerald-600', accumulate: 'text-emerald-500',
                      hold: 'text-blue-500', rebalance: 'text-purple-500',
                      protect: 'text-amber-500', take_profit: 'text-cyan-500',
                    };

                    return (
                      <div key={i} className="bg-slate-50 dark:bg-gray-800/50 rounded-xl p-3">
                        <div className="flex items-center gap-2 mb-1.5">
                          <TypeIcon className={`w-4 h-4 ${typeColors[action.type] || 'text-gray-500'}`} />
                          <span className="text-sm font-semibold text-gray-900 dark:text-white">{action.symbol}</span>
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${urgencyColors[action.urgency] || urgencyColors.this_month}`}>
                            {action.urgency === 'today' ? 'BUGÜN' : action.urgency === 'this_week' ? 'BU HAFTA' : 'BU AY'}
                          </span>
                          <span className="text-[10px] text-gray-400 uppercase">{action.platform}</span>
                        </div>
                        <p className="text-xs font-medium text-gray-800 dark:text-gray-200 mb-1">{action.instruction}</p>
                        {action.detail && <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed">{action.detail}</p>}
                        <div className="flex items-center gap-3 mt-2">
                          {action.amount_try > 0 && (
                            <span className="text-[10px] text-gray-500"><DollarSign className="w-3 h-3 inline" /> {formatMoney(action.amount_try)} TL</span>
                          )}
                          {action.expected_annual_return > 0 && (
                            <span className="text-[10px] text-emerald-500"><TrendingUp className="w-3 h-3 inline" /> %{action.expected_annual_return} yıllık</span>
                          )}
                          {action.dividend_yield > 0 && (
                            <span className="text-[10px] text-purple-500"><PiggyBank className="w-3 h-3 inline" /> %{action.dividend_yield} temettü</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Top Pick + Wealth Tip */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {report.top_pick && (
                <div className="rounded-2xl border border-emerald-200 dark:border-emerald-800/50 bg-emerald-50 dark:bg-emerald-950/20 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Target className="w-4 h-4 text-emerald-600" />
                    <span className="text-xs font-bold uppercase tracking-widest text-emerald-600">Günün Seçimi</span>
                  </div>
                  <p className="text-xs text-gray-700 dark:text-gray-300 leading-relaxed">{report.top_pick}</p>
                </div>
              )}
              {report.wealth_building_tip && (
                <div className="rounded-2xl border border-blue-200 dark:border-blue-800/50 bg-blue-50 dark:bg-blue-950/20 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <TrendingUp className="w-4 h-4 text-blue-600" />
                    <span className="text-xs font-bold uppercase tracking-widest text-blue-600">Servet Stratejisi</span>
                  </div>
                  <p className="text-xs text-gray-700 dark:text-gray-300 leading-relaxed">{report.wealth_building_tip}</p>
                </div>
              )}
            </div>
          </>
        )}

        {/* ==================== GELİR TAB ==================== */}
        {activeTab === 'income' && (
          <>
            {/* Gelir Kaydet Butonu */}
            <div className="flex justify-end">
              <button
                onClick={() => setShowIncomeModal(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700"
              >
                <DollarSign className="w-3.5 h-3.5" />
                Gelir Kaydet
              </button>
            </div>

            {/* Gelir Takvimi */}
            <div className="rounded-2xl border border-slate-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
              <IncomeCalendar onRefresh={incomeRefreshKey} />
            </div>

            {/* Aylık Maaş Özeti */}
            {salaryHistory.length > 0 && (
              <div className="rounded-2xl border border-slate-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <PiggyBank className="w-4 h-4 text-purple-600" />
                  <span className="text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400">Aylık Dinamik Maaş</span>
                </div>
                <div className="space-y-2">
                  {salaryHistory.map((salary) => {
                    const month = new Date(salary.salary_month).toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' });
                    return (
                      <div key={salary.id} className="bg-slate-50 dark:bg-gray-800/50 rounded-xl p-3">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">{month}</span>
                          <span className="text-xs text-gray-400">Portföy: {formatMoney(salary.portfolio_value)} TL</span>
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          <div>
                            <p className="text-[10px] uppercase text-gray-400">Güvenli</p>
                            <p className="text-sm font-bold text-emerald-600">{formatMoney(salary.safe_amount)} TL</p>
                          </div>
                          <div>
                            <p className="text-[10px] uppercase text-gray-400">Dengeli</p>
                            <p className="text-sm font-bold text-blue-600">{formatMoney(salary.moderate_amount)} TL</p>
                          </div>
                          <div>
                            <p className="text-[10px] uppercase text-gray-400">Gerçekleşen</p>
                            <p className="text-sm font-bold text-purple-600">{formatMoney(salary.actual_income)} TL</p>
                          </div>
                        </div>
                        {/* Gelir kaynakları */}
                        <div className="flex gap-2 mt-2 flex-wrap">
                          {salary.dividend_income > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">Temettü: {formatMoney(salary.dividend_income)}</span>}
                          {salary.interest_income > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400">Faiz: {formatMoney(salary.interest_income)}</span>}
                          {salary.staking_income > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400">Staking: {formatMoney(salary.staking_income)}</span>}
                          {salary.coupon_income > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">Kupon: {formatMoney(salary.coupon_income)}</span>}
                        </div>
                        {salary.ai_recommendation && (
                          <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-2 italic">{salary.ai_recommendation}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {salaryHistory.length === 0 && (
              <div className="rounded-2xl border border-slate-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-8 text-center">
                <PiggyBank className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                <p className="text-sm text-gray-500 dark:text-gray-400">Henüz maaş hesaplaması yok</p>
                <p className="text-xs text-gray-400 mt-1">İlk günlük rapor üretildiğinde maaş otomatik hesaplanacak</p>
              </div>
            )}

            {/* Income Modal */}
            <IncomeRecordModal
              isOpen={showIncomeModal}
              onClose={() => setShowIncomeModal(false)}
              onSaved={() => {
                setIncomeRefreshKey(k => k + 1);
                loadData();
              }}
              holdings={holdings}
            />
          </>
        )}

        {/* ==================== GEÇMİŞ TAB ==================== */}
        {activeTab === 'history' && (
          <div className="rounded-2xl border border-slate-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
            <div className="flex items-center gap-2 mb-3">
              <Clock className="w-4 h-4 text-gray-600" />
              <span className="text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400">Rapor Geçmişi</span>
            </div>
            {reports.length > 0 ? (
              <div className="space-y-1.5">
                {reports.map((r, i) => (
                  <button
                    key={r.id}
                    onClick={() => { setReport(r); setSelectedIndex(i); setActiveTab('report'); }}
                    className="w-full flex items-center justify-between bg-slate-50 dark:bg-gray-800/50 rounded-xl p-3 hover:bg-slate-100 dark:hover:bg-gray-800 transition-colors text-left"
                  >
                    <div>
                      <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{formatDate(r.report_date)}</p>
                      <p className="text-[10px] text-gray-400 mt-0.5">
                        {r.actions?.length || 0} aksiyon | {formatMoney(r.portfolio_value)} TL
                      </p>
                    </div>
                    <div className="text-right">
                      <p className={`text-sm font-bold ${r.portfolio_pnl >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                        {r.portfolio_pnl >= 0 ? '+' : ''}{formatMoney(r.portfolio_pnl)} TL
                      </p>
                      <p className={`text-[10px] ${r.portfolio_pnl_pct >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                        %{r.portfolio_pnl_pct?.toFixed(1)}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">Henüz rapor geçmişi yok</p>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
