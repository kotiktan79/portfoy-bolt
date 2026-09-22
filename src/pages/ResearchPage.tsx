import { useEffect, useState } from 'react';
import { Brain, RefreshCw, AlertTriangle, Sparkles, Globe, ChevronDown, ChevronUp, Info } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { PageHeader } from '../components/ui/PageHeader';

// 2026-09-22: AI işlem ÖNERMEZ — öneri kartları (TRİM/SAT/AL) ve ai_recommendations okuması kaldırıldı.
// Rapor = haber/makro özeti + pozisyon başına bilgi notu + riskler/notlar.
interface ReportContent {
  headline?: string;
  macro_summary?: {
    bist100?: string;
    eur_try?: string;
    tcmb?: string;
    global?: string;
  };
  per_holding_view?: Array<{ symbol: string; view: string }>;
  risks?: string[];
  notes?: string[];
  raw?: string;
  parse_error?: string;
}

interface Report {
  id: string;
  report_date: string;
  generated_at: string;
  content: ReportContent;
  headline: string;
  tokens_used: number | null;
}

export default function ResearchPage() {
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<Report[]>([]);

  const loadLatest = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: latestReport, error: rErr } = await supabase
        .from('ai_research_reports')
        .select('*')
        .order('report_date', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (rErr) throw new Error(rErr.message);
      if (!latestReport) {
        setReport(null);
        return;
      }
      setReport(latestReport as Report);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const loadHistory = async () => {
    const { data } = await supabase
      .from('ai_research_reports')
      .select('*')
      .order('report_date', { ascending: false })
      .limit(14);
    setHistory((data as Report[]) || []);
  };

  useEffect(() => { loadLatest(); }, []);

  const runNow = async () => {
    setRunning(true);
    setError(null);
    try {
      const res = await fetch('/api/cron/ai-research');
      const j = await res.json();
      if (!j.success) throw new Error(j.error || 'Cron failed');
      await loadLatest();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setRunning(false);
    }
  };

  const legacy = !!report && report.report_date < '2026-09-22';

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-gray-950 p-4 md:p-6">
      <div className="max-w-5xl mx-auto">
        <PageHeader
          icon={Brain}
          title="AI Araştırma Motoru"
          subtitle="Haber + makro özeti · EUR ölçüsü · işlem önerisi YOK (plan sabit)"
          actions={
            <button
              onClick={runNow}
              disabled={running}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold disabled:opacity-50"
            >
              <RefreshCw size={14} className={running ? 'animate-spin' : ''} />
              {running ? 'Çalışıyor...' : 'Şimdi Çalıştır'}
            </button>
          }
        />

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 text-sm text-red-700 dark:text-red-400">
            <AlertTriangle size={14} className="inline mr-1" /> {error}
          </div>
        )}

        {loading && (
          <div className="space-y-3">
            {[1, 2, 3].map(i => <div key={i} className="h-32 rounded-2xl bg-slate-200 dark:bg-gray-800 animate-pulse" />)}
          </div>
        )}

        {!loading && !report && (
          <div className="text-center p-12 rounded-2xl bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700">
            <Brain className="mx-auto mb-3 text-slate-400" size={48} />
            <p className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Henüz rapor yok</p>
            <p className="text-sm text-slate-600 dark:text-gray-400 mb-4">Zamanlanmış çalışma yok; butonla günde en fazla bir kez üretilir.</p>
            <button onClick={runNow} disabled={running} className="px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold disabled:opacity-50">
              {running ? 'Çalışıyor...' : 'İlk Raporu Üret'}
            </button>
          </div>
        )}

        {!loading && report && (
          <>
            {/* 22.09 öncesi raporlar eski prompt'la üretildi (trim/sell/buy önerisi, 'Fırsatlar') — DailyReportPage ile aynı kapı */}
            {legacy && (
              <div className="mb-4 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 text-sm text-amber-800 dark:text-amber-300">
                <AlertTriangle size={14} className="inline mr-1" /> Eski format rapor ({report.report_date}) — 22.09 öncesi AI önerileri geçersiz; pozisyon notları ve öneriler gizlendi. "Şimdi Çalıştır" ile yeni rapor üret.
              </div>
            )}
            {/* Headline kartı */}
            <div className="mb-4 rounded-2xl bg-gradient-to-br from-brand-50 to-accent-50 dark:from-brand-950/30 dark:to-accent-950/30 border border-brand-200 dark:border-brand-900 p-5">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles size={16} className="text-brand-600 dark:text-brand-400" />
                <span className="text-xs font-bold uppercase tracking-wider text-brand-700 dark:text-brand-300">
                  Bugünkü Tema · {new Date(report.report_date).toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' })}
                </span>
              </div>
              <p className="text-base sm:text-lg font-medium text-gray-900 dark:text-white leading-relaxed">
                {legacy ? 'Eski format rapor — içerik gizlendi.' : (report.headline || (report.content as any)?.headline || 'Bugünkü rapor yüklendi.')}
              </p>
              <div className="flex items-center gap-3 mt-3 text-[10px] text-slate-500 dark:text-gray-400">
                <span>Üretildi: {new Date(report.generated_at).toLocaleString('tr-TR', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' })}</span>
                {report.tokens_used != null && <span>·</span>}
                {report.tokens_used != null && <span>{report.tokens_used.toLocaleString()} token</span>}
              </div>
            </div>

            {/* Macro özet */}
            {!legacy && report.content?.macro_summary && (
              <div className="mb-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                {report.content.macro_summary.bist100 && (
                  <MacroCard label="BIST100" value={report.content.macro_summary.bist100} />
                )}
                {report.content.macro_summary.eur_try && (
                  <MacroCard label="EUR/TRY" value={report.content.macro_summary.eur_try} />
                )}
                {report.content.macro_summary.tcmb && (
                  <MacroCard label="TCMB / Enflasyon" value={report.content.macro_summary.tcmb} />
                )}
                {report.content.macro_summary.global && (
                  <MacroCard label="Global" value={report.content.macro_summary.global} />
                )}
              </div>
            )}

            {/* Per-holding view */}
            {!legacy && Array.isArray(report.content?.per_holding_view) && report.content!.per_holding_view!.length > 0 && (
              <div className="mb-4 rounded-2xl bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 p-4">
                <h3 className="text-base font-bold text-gray-900 dark:text-white mb-3">Pozisyon Notları <span className="text-xs font-normal text-slate-500">(bilgi, işlem önerisi değil)</span></h3>
                <div className="space-y-2">
                  {report.content!.per_holding_view!.map((v: any, i: number) => (
                    <div key={i} className="flex items-start gap-2 p-2 rounded-lg bg-slate-50 dark:bg-gray-900/40">
                      <span className="font-bold text-sm text-gray-900 dark:text-white w-16 shrink-0">{v.symbol}</span>
                      <span className="text-xs text-slate-600 dark:text-gray-300 flex-1">{v.view}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Risks & opportunities */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              {!legacy && Array.isArray(report.content?.risks) && report.content!.risks!.length > 0 && (
                <div className="rounded-2xl bg-rose-50/50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900 p-4">
                  <h4 className="text-sm font-bold text-rose-700 dark:text-rose-400 mb-2 flex items-center gap-1">
                    <AlertTriangle size={12} /> Riskler
                  </h4>
                  <ul className="space-y-1 text-xs text-rose-700 dark:text-rose-300">
                    {report.content!.risks!.map((r, i) => <li key={i}>• {r}</li>)}
                  </ul>
                </div>
              )}
              {(() => { const notes = legacy ? [] : report.content?.notes; return Array.isArray(notes) && notes.length > 0 && (
                <div className="rounded-2xl bg-slate-50/60 dark:bg-gray-900/30 border border-slate-200 dark:border-gray-700 p-4">
                  <h4 className="text-sm font-bold text-slate-700 dark:text-gray-300 mb-2 flex items-center gap-1">
                    <Info size={12} /> Notlar
                  </h4>
                  <ul className="space-y-1 text-xs text-slate-700 dark:text-gray-300">
                    {notes.map((o, i) => <li key={i}>• {o}</li>)}
                  </ul>
                </div>
              ); })()}
            </div>

            {/* Geçmiş raporlar */}
            <button
              onClick={() => { setShowHistory(!showHistory); if (!showHistory && history.length === 0) loadHistory(); }}
              className="w-full text-sm font-semibold text-slate-600 dark:text-gray-400 py-3 flex items-center justify-center gap-2 hover:text-slate-900 dark:hover:text-white"
            >
              {showHistory ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              Geçmiş raporlar
            </button>
            {showHistory && (
              <div className="mt-2 rounded-2xl bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 divide-y divide-slate-100 dark:divide-gray-700">
                {history.map(h => (
                  <div key={h.id} className="p-3 text-sm hover:bg-slate-50 dark:hover:bg-gray-700/30">
                    <div className="font-semibold text-gray-900 dark:text-white">{new Date(h.report_date).toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' })}</div>
                    <div className="text-xs text-slate-500 dark:text-gray-400 mt-1">{h.headline}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Parse error fallback */}
            {report.content?.parse_error && (
              <div className="mt-4 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 text-xs">
                <p className="font-bold text-amber-700 dark:text-amber-400 mb-2">JSON parse hatası — raw çıktı:</p>
                <pre className="whitespace-pre-wrap text-amber-900 dark:text-amber-200 max-h-60 overflow-auto">{report.content.raw}</pre>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function MacroCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 p-3">
      <div className="flex items-center gap-1.5 mb-1">
        <Globe size={11} className="text-slate-400" />
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-gray-400">{label}</span>
      </div>
      <p className="text-xs text-gray-700 dark:text-gray-300 leading-relaxed">{value}</p>
    </div>
  );
}
