import { useEffect, useState } from 'react';
import { Brain, RefreshCw, Check, X, Clock, AlertTriangle, Sparkles, TrendingUp, TrendingDown, Globe, ChevronDown, ChevronUp } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { PageHeader } from '../components/ui/PageHeader';

interface Recommendation {
  id: string;
  action: 'trim' | 'sell' | 'buy' | 'rotate' | 'hold' | 'watch';
  symbol: string;
  target_qty: number | null;
  target_amount: number | null;
  target_currency: string;
  priority: number;
  reason: string;
  status: 'pending' | 'applied' | 'snoozed' | 'dismissed';
  status_updated_at: string | null;
  status_note: string | null;
  created_at: string;
}

interface ReportContent {
  headline?: string;
  macro_summary?: {
    bist100?: string;
    eur_try?: string;
    tcmb?: string;
    global?: string;
  };
  per_holding_view?: Array<{ symbol: string; action: string; view: string }>;
  risks?: string[];
  opportunities?: string[];
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

const ACTION_STYLES: Record<string, { bg: string; text: string; label: string; icon: typeof TrendingUp }> = {
  trim:   { bg: 'bg-amber-100 dark:bg-amber-950/40', text: 'text-amber-800 dark:text-amber-300', label: 'TRİM', icon: TrendingDown },
  sell:   { bg: 'bg-red-100 dark:bg-red-950/40', text: 'text-red-800 dark:text-red-300', label: 'SAT', icon: TrendingDown },
  buy:    { bg: 'bg-emerald-100 dark:bg-emerald-950/40', text: 'text-emerald-800 dark:text-emerald-300', label: 'AL', icon: TrendingUp },
  rotate: { bg: 'bg-purple-100 dark:bg-purple-950/40', text: 'text-purple-800 dark:text-purple-300', label: 'ROTASYON', icon: RefreshCw },
  hold:   { bg: 'bg-slate-100 dark:bg-gray-800', text: 'text-slate-700 dark:text-gray-300', label: 'TUT', icon: Check },
  watch:  { bg: 'bg-blue-100 dark:bg-blue-950/40', text: 'text-blue-800 dark:text-blue-300', label: 'İZLE', icon: Clock },
};

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  pending:   { bg: 'bg-yellow-50 dark:bg-yellow-950/20', text: 'text-yellow-700 dark:text-yellow-400', label: 'Bekliyor' },
  applied:   { bg: 'bg-emerald-50 dark:bg-emerald-950/20', text: 'text-emerald-700 dark:text-emerald-400', label: 'Uygulandı ✓' },
  snoozed:   { bg: 'bg-slate-50 dark:bg-gray-800', text: 'text-slate-600 dark:text-gray-400', label: 'Ertelendi' },
  dismissed: { bg: 'bg-rose-50 dark:bg-rose-950/20', text: 'text-rose-600 dark:text-rose-400', label: 'Reddedildi' },
};

export default function ResearchPage() {
  const [report, setReport] = useState<Report | null>(null);
  const [recs, setRecs] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedRecs, setExpandedRecs] = useState<Set<string>>(new Set());
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
        setRecs([]);
        return;
      }
      setReport(latestReport as Report);
      const { data: r } = await supabase
        .from('ai_recommendations')
        .select('*')
        .eq('report_id', latestReport.id)
        .order('priority', { ascending: true });
      setRecs((r as Recommendation[]) || []);
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

  const updateStatus = async (recId: string, status: Recommendation['status'], note?: string) => {
    await supabase.from('ai_recommendations').update({
      status,
      status_updated_at: new Date().toISOString(),
      status_note: note || null,
    }).eq('id', recId);
    setRecs(prev => prev.map(r => r.id === recId ? { ...r, status, status_updated_at: new Date().toISOString(), status_note: note || null } : r));
  };

  const toggleExpand = (id: string) => {
    setExpandedRecs(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const pendingRecs = recs.filter(r => r.status === 'pending');
  const handledRecs = recs.filter(r => r.status !== 'pending');

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-gray-950 p-4 md:p-6">
      <div className="max-w-5xl mx-auto">
        <PageHeader
          icon={Brain}
          title="AI Araştırma Motoru"
          subtitle="Günlük portföy + makro + web araştırması · Romanya/EUR profili"
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
            <p className="text-sm text-slate-600 dark:text-gray-400 mb-4">İlk araştırmayı şimdi çalıştır veya yarın 08:00 UTC cron'unu bekle.</p>
            <button onClick={runNow} disabled={running} className="px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold disabled:opacity-50">
              {running ? 'Çalışıyor...' : 'İlk Raporu Üret'}
            </button>
          </div>
        )}

        {!loading && report && (
          <>
            {/* Headline kartı */}
            <div className="mb-4 rounded-2xl bg-gradient-to-br from-brand-50 to-accent-50 dark:from-brand-950/30 dark:to-accent-950/30 border border-brand-200 dark:border-brand-900 p-5">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles size={16} className="text-brand-600 dark:text-brand-400" />
                <span className="text-xs font-bold uppercase tracking-wider text-brand-700 dark:text-brand-300">
                  Bugünkü Tema · {new Date(report.report_date).toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' })}
                </span>
              </div>
              <p className="text-base sm:text-lg font-medium text-gray-900 dark:text-white leading-relaxed">
                {report.headline || (report.content as any)?.headline || 'Bugünkü rapor yüklendi.'}
              </p>
              <div className="flex items-center gap-3 mt-3 text-[10px] text-slate-500 dark:text-gray-400">
                <span>Üretildi: {new Date(report.generated_at).toLocaleString('tr-TR', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' })}</span>
                {report.tokens_used != null && <span>·</span>}
                {report.tokens_used != null && <span>{report.tokens_used.toLocaleString()} token</span>}
              </div>
            </div>

            {/* Macro özet */}
            {report.content?.macro_summary && (
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

            {/* Recommendations */}
            <div className="mb-4 rounded-2xl bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 overflow-hidden">
              <div className="p-4 border-b border-slate-200 dark:border-gray-700 flex items-center justify-between">
                <h3 className="text-base font-bold text-gray-900 dark:text-white">
                  Öneriler {pendingRecs.length > 0 && <span className="ml-2 text-xs bg-yellow-100 dark:bg-yellow-950/40 text-yellow-700 dark:text-yellow-400 px-2 py-0.5 rounded">{pendingRecs.length} bekliyor</span>}
                </h3>
                <span className="text-xs text-slate-500">Tıklayıp uyguladığını işaretle</span>
              </div>

              {pendingRecs.length === 0 && handledRecs.length === 0 && (
                <p className="text-center text-sm text-slate-500 dark:text-gray-400 py-8">Bugün için öneri yok.</p>
              )}

              <div className="divide-y divide-slate-100 dark:divide-gray-700">
                {pendingRecs.map(rec => (
                  <RecommendationRow key={rec.id} rec={rec} expanded={expandedRecs.has(rec.id)} onToggle={() => toggleExpand(rec.id)} onUpdate={updateStatus} />
                ))}
              </div>

              {handledRecs.length > 0 && (
                <details className="border-t border-slate-200 dark:border-gray-700">
                  <summary className="px-4 py-3 text-sm font-semibold text-slate-600 dark:text-gray-400 cursor-pointer hover:bg-slate-50 dark:hover:bg-gray-700/30">
                    İşlenmiş öneriler ({handledRecs.length})
                  </summary>
                  <div className="divide-y divide-slate-100 dark:divide-gray-700">
                    {handledRecs.map(rec => (
                      <RecommendationRow key={rec.id} rec={rec} expanded={expandedRecs.has(rec.id)} onToggle={() => toggleExpand(rec.id)} onUpdate={updateStatus} />
                    ))}
                  </div>
                </details>
              )}
            </div>

            {/* Per-holding view */}
            {Array.isArray(report.content?.per_holding_view) && report.content!.per_holding_view!.length > 0 && (
              <div className="mb-4 rounded-2xl bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 p-4">
                <h3 className="text-base font-bold text-gray-900 dark:text-white mb-3">Pozisyon Görüşleri</h3>
                <div className="space-y-2">
                  {report.content!.per_holding_view!.map((v: any, i: number) => {
                    const a = ACTION_STYLES[v.action?.toLowerCase()] || ACTION_STYLES.hold;
                    return (
                      <div key={i} className="flex items-start gap-2 p-2 rounded-lg bg-slate-50 dark:bg-gray-900/40">
                        <span className="font-bold text-sm text-gray-900 dark:text-white w-16 shrink-0">{v.symbol}</span>
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${a.bg} ${a.text} shrink-0`}>{a.label}</span>
                        <span className="text-xs text-slate-600 dark:text-gray-300 flex-1">{v.view}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Risks & opportunities */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              {Array.isArray(report.content?.risks) && report.content!.risks!.length > 0 && (
                <div className="rounded-2xl bg-rose-50/50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900 p-4">
                  <h4 className="text-sm font-bold text-rose-700 dark:text-rose-400 mb-2 flex items-center gap-1">
                    <AlertTriangle size={12} /> Riskler
                  </h4>
                  <ul className="space-y-1 text-xs text-rose-700 dark:text-rose-300">
                    {report.content!.risks!.map((r, i) => <li key={i}>• {r}</li>)}
                  </ul>
                </div>
              )}
              {Array.isArray(report.content?.opportunities) && report.content!.opportunities!.length > 0 && (
                <div className="rounded-2xl bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900 p-4">
                  <h4 className="text-sm font-bold text-emerald-700 dark:text-emerald-400 mb-2 flex items-center gap-1">
                    <Sparkles size={12} /> Fırsatlar
                  </h4>
                  <ul className="space-y-1 text-xs text-emerald-700 dark:text-emerald-300">
                    {report.content!.opportunities!.map((o, i) => <li key={i}>• {o}</li>)}
                  </ul>
                </div>
              )}
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

function RecommendationRow({ rec, expanded, onToggle, onUpdate }: {
  rec: Recommendation;
  expanded: boolean;
  onToggle: () => void;
  onUpdate: (id: string, status: Recommendation['status'], note?: string) => void;
}) {
  const a = ACTION_STYLES[rec.action] || ACTION_STYLES.watch;
  const s = STATUS_STYLES[rec.status];
  const Icon = a.icon;

  return (
    <div className="p-4 hover:bg-slate-50 dark:hover:bg-gray-700/20">
      <div className="flex items-start gap-3">
        <div className={`p-1.5 rounded-lg ${a.bg} ${a.text} shrink-0`}>
          <Icon size={14} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${a.bg} ${a.text}`}>{a.label}</span>
            <span className="text-sm font-bold text-gray-900 dark:text-white">{rec.symbol}</span>
            {rec.target_amount && (
              <span className="text-xs text-slate-600 dark:text-gray-400">~{rec.target_amount} {rec.target_currency}</span>
            )}
            {rec.target_qty && !rec.target_amount && (
              <span className="text-xs text-slate-600 dark:text-gray-400">{rec.target_qty} adet</span>
            )}
            <span className="text-[10px] text-slate-400 ml-auto">Öncelik {rec.priority}</span>
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${s.bg} ${s.text}`}>{s.label}</span>
          </div>
          <p className={`text-xs text-slate-700 dark:text-gray-300 leading-relaxed ${!expanded && rec.reason.length > 120 ? 'line-clamp-2' : ''}`}>
            {rec.reason}
          </p>
          {rec.reason.length > 120 && (
            <button onClick={onToggle} className="text-[10px] text-brand-600 dark:text-brand-400 mt-1 hover:underline">
              {expanded ? 'Daha az' : 'Devamı'}
            </button>
          )}
          {rec.status_note && (
            <p className="text-[10px] italic text-slate-500 dark:text-gray-400 mt-1">Not: {rec.status_note}</p>
          )}
        </div>
      </div>
      {rec.status === 'pending' && (
        <div className="flex items-center gap-2 mt-2 pl-9">
          <button onClick={() => onUpdate(rec.id, 'applied')} className="px-2 py-1 text-[11px] font-semibold rounded bg-emerald-600 hover:bg-emerald-700 text-white">
            <Check size={11} className="inline mr-0.5" /> Uygulandı
          </button>
          <button onClick={() => onUpdate(rec.id, 'snoozed')} className="px-2 py-1 text-[11px] font-semibold rounded bg-slate-200 dark:bg-gray-700 text-slate-700 dark:text-gray-300 hover:bg-slate-300 dark:hover:bg-gray-600">
            <Clock size={11} className="inline mr-0.5" /> Ertele
          </button>
          <button onClick={() => onUpdate(rec.id, 'dismissed')} className="px-2 py-1 text-[11px] font-semibold rounded bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-950/50">
            <X size={11} className="inline mr-0.5" /> Reddet
          </button>
        </div>
      )}
    </div>
  );
}
