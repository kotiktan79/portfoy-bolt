import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Brain, ChevronDown, ChevronUp,
  AlertTriangle, TrendingUp, Shield,
  Clock, Sparkles
} from 'lucide-react';
import { Holding } from '../lib/supabase';
import { formatCurrency } from '../services/priceService';

interface DailyActionPlanProps {
  holdings: Holding[];
  totalValue: number;
  totalInvestment: number;
  totalProfitLoss: number;
  totalProfitLossPercent: number;
  totalCashValue: number;
}

// 2026-09-22: yerel 'adımlar' (SAT/AL/KÂR AL, TL bazlı; hiç gösterilmiyordu, sadece 0/N çubuğunu besliyordu) KALDIRILDI.
// Plan tek kaynaktan gelir: /api/daily-plan (deterministik, AI yok).

function getTodayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getGreeting(): string {
  const h = new Date().getHours();
  return h < 6 ? 'İyi geceler' : h < 12 ? 'Günaydın' : h < 18 ? 'İyi günler' : 'İyi akşamlar';
}

function getMarketStatus(): { isOpen: boolean; label: string } {
  const now = new Date();
  const day = now.getDay();
  const hour = now.getHours();
  const minute = now.getMinutes();
  const time = hour * 60 + minute;

  if (day === 0 || day === 6) return { isOpen: false, label: 'Borsa kapalı (hafta sonu)' };
  if (time >= 600 && time <= 1080) return { isOpen: true, label: 'Borsa açık (10:00-18:00)' };
  if (time < 600) return { isOpen: false, label: `Borsa ${Math.floor((600 - time) / 60)}s ${(600 - time) % 60}dk sonra açılacak` };
  return { isOpen: false, label: 'Borsa kapandı. Kripto 7/24 aktif.' };
}

interface AIAction {
  urgency: string;
  type: string;
  symbol: string;
  market: string;
  instruction: string;
  detail: string;
  amount_try: number;
  amount_eur?: number;
  risk: string;
  timeframe: string;
}

interface AIPlan {
  actions: AIAction[];
  market_outlook: string;
  top_pick: string;
  notice?: string;          // anomali/uyarı (işlem çağrışımlı 'Günün Tercihi' değil)
  news_alerts?: string[];
  source?: string;
}

const AI_CACHE_KEY = 'tandor_ai_daily_plan';
// Politika/prompt değişince BUMP et → eski cache'lenmiş planlar otomatik geçersiz,
// kullanıcı yeniden çekmek zorunda kalmadan güncel politikayla yeni plan üretilir.
const AI_PLAN_VERSION = '2026-09-22-single-plan-v2';   // tek plan (deterministik, AI yok) — eski cache geçersiz

function getCachedAIPlan(): AIPlan | null {
  try {
    const raw = localStorage.getItem(AI_CACHE_KEY);
    if (!raw) return null;
    const { date, plan, v } = JSON.parse(raw);
    if (date !== getTodayKey() || v !== AI_PLAN_VERSION) return null;
    return plan;
  } catch { return null; }
}

function cacheAIPlan(plan: AIPlan) {
  localStorage.setItem(AI_CACHE_KEY, JSON.stringify({ date: getTodayKey(), v: AI_PLAN_VERSION, plan }));
}

export function DailyActionPlan({ holdings }: DailyActionPlanProps) {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(true);
  const [aiPlan, setAiPlan] = useState<AIPlan | null>(getCachedAIPlan);
  const [aiLoading, setAiLoading] = useState(false);
  const aiLoadedRef = useRef(false);

  const market = getMarketStatus();

  // Fetch AI plan once per day
  useEffect(() => {
    if (aiLoadedRef.current || aiPlan || holdings.filter(h => h.asset_type !== 'cash').length === 0) return;
    aiLoadedRef.current = true;
    fetchAIPlan();
  }, [holdings.length]);

  async function fetchAIPlan() {
    setAiLoading(true);
    try {
      // Sunucu bağlamı kendisi kurar (EUR motoru + tek plan); istemci payload'u kullanılmaz
      const res = await fetch('/api/daily-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });

      if (!res.ok) {
        // Dev ortamında /api/daily-plan Vercel function çalışmaz — sessizce geç
        setAiLoading(false);
        return;
      }

      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        setAiLoading(false);
        return;
      }

      const data = await res.json();
      if (data.success && data.plan) {
        setAiPlan(data.plan);
        cacheAIPlan(data.plan);
      }
    } catch (e) {
      console.error('AI plan fetch failed:', e);
    }
    setAiLoading(false);
  }


  if (holdings.filter(h => h.asset_type !== 'cash').length === 0) return null;


  return (
    <div className="rounded-2xl border border-slate-200 dark:border-gray-800 overflow-hidden bg-white dark:bg-gray-900">
      {/* Header */}
      <div className="p-4 cursor-pointer hover:bg-slate-50/50 dark:hover:bg-gray-800/30 transition-colors" onClick={() => setExpanded(!expanded)}>
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gradient-to-br from-amber-500 to-brand-600 rounded-xl shadow-md flex-shrink-0">
            <Brain className="text-white" size={18} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-gray-900 dark:text-white">{getGreeting()}! Bugünkü Planınız</h3>
            </div>
            <p className="text-[10px] text-gray-400 mt-0.5">Tek plan (sabit) · haftalık dilim V3YL + XEON · işlem önerisi yok</p>
          </div>
          <div className={`text-[10px] font-bold px-2 py-1 rounded-full ${market.isOpen ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'}`}>
            <Clock size={10} className="inline mr-1" />
            {market.isOpen ? 'AÇIK' : 'KAPALI'}
          </div>
          {expanded ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
        </div>
      </div>

      {expanded && (
        <div className="px-4 pb-4 space-y-1.5">

          {/* AI loading or no plan yet */}
          {!aiPlan && !aiLoading && (
            <div className="text-center py-4">
              <p className="text-xs text-gray-400 mb-2">Haftalık plan yüklenmedi</p>
              <button onClick={fetchAIPlan} className="text-xs text-brand-600 dark:text-brand-400 font-semibold hover:underline">
                Planı Getir
              </button>
            </div>
          )}

          {aiLoading && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-brand-50 dark:bg-brand-950/20 border border-brand-200 dark:border-brand-800">
              <Sparkles size={14} className="text-brand-500 animate-pulse" />
              <span className="text-xs text-brand-700 dark:text-brand-400 font-medium">Bu haftanın planı hazırlanıyor…</span>
            </div>
          )}

          {aiPlan && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <h4 className="text-[11px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest">
                  Haftalık Plan (sabit)
                </h4>
                <button onClick={fetchAIPlan} disabled={aiLoading} className="text-[10px] text-brand-500 hover:text-brand-700 font-medium">
                  {aiLoading ? 'Yükleniyor...' : 'Yenile'}
                </button>
              </div>

              {/* Portfolio Diagnosis */}
              {(aiPlan as any).portfolio_diagnosis && (
                <div className="px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800">
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Portföy Teşhisi</p>
                  <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">{(aiPlan as any).portfolio_diagnosis}</p>
                </div>
              )}

              {/* Market Outlook */}
              {aiPlan.market_outlook && (
                <div className="px-3 py-2 rounded-lg bg-brand-50 dark:bg-brand-950/20 border border-brand-200 dark:border-brand-800">
                  <p className="text-[10px] font-bold text-brand-500 uppercase tracking-widest mb-1">Piyasa Görünümü</p>
                  <p className="text-xs text-brand-700 dark:text-brand-300 leading-relaxed">{aiPlan.market_outlook}</p>
                </div>
              )}

              {aiPlan.notice && (
                <div className="px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800">
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Not: </span>
                  <span className="text-xs text-slate-600 dark:text-slate-400">{aiPlan.notice}</span>
                </div>
              )}

              {(aiPlan as any).news_alerts?.length > 0 && (
                <div className="space-y-1">
                  {(aiPlan as any).news_alerts.map((news: string, i: number) => (
                    <div key={i} className="flex items-start gap-2 px-3 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800">
                      <AlertTriangle size={12} className="text-amber-500 mt-0.5 flex-shrink-0" />
                      <span className="text-xs text-amber-700 dark:text-amber-400">{news}</span>
                    </div>
                  ))}
                </div>
              )}

              {aiPlan.actions?.map((action, i) => {
                const marketBadge: Record<string, string> = {
                  BIST: 'bg-brand-100 text-brand-700 dark:bg-brand-900/30 dark:text-brand-400',
                  US: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
                  EU: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
                  CRYPTO: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
                };
                const typeIcon = action.symbol === 'XEON' ? <Shield size={14} className="text-brand-500" /> : <TrendingUp size={14} className="text-green-500" />;   // tek plan: yalnız alım dilimi

                return (
                  <div key={i} className="flex items-start gap-2.5 p-3 rounded-xl bg-brand-50/50 dark:bg-brand-950/10 border border-brand-100 dark:border-brand-900/50">
                    <div className="mt-0.5 flex-shrink-0">{typeIcon}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${marketBadge[action.market] || marketBadge.BIST}`}>
                          {action.market}
                        </span>
                        <span className="text-xs font-bold text-gray-900 dark:text-white">{action.symbol}</span>
                        {action.risk && (
                          <span className={`text-[9px] px-1 py-0.5 rounded ${
                            action.risk === 'low' ? 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400' :
                            action.risk === 'high' ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400' :
                            'bg-yellow-100 text-yellow-600 dark:bg-yellow-900/30 dark:text-yellow-400'
                          }`}>
                            {action.risk === 'low' ? 'düşük risk' : action.risk === 'high' ? 'yüksek risk' : 'orta risk'}
                          </span>
                        )}
                        {(action as any).platform && (
                          <span className="text-[9px] font-medium text-gray-500 bg-gray-100 dark:bg-gray-800 px-1 rounded">{(action as any).platform}</span>
                        )}
                        {action.timeframe && (
                          <span className="text-[9px] text-gray-400">{action.timeframe === 'short' ? 'kısa vade' : 'uzun vade'}</span>
                        )}
                      </div>
                      <p className="text-sm font-semibold text-gray-900 dark:text-white mt-1">{action.instruction}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{action.detail}</p>
                    </div>
                    {(action.amount_eur ?? 0) > 0 ? (
                      <span className="flex-shrink-0 text-xs font-bold text-gray-900 dark:text-gray-200 bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded-lg">
                        €{formatCurrency(action.amount_eur ?? 0)}
                      </span>
                    ) : action.amount_try > 0 && (
                      <span className="flex-shrink-0 text-xs font-bold text-gray-900 dark:text-gray-200 bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded-lg">
                        {formatCurrency(action.amount_try)} ₺
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* 2026-09-19: 'Aylık Dinamik Maaş' (servet × %2/%4/%6) KALDIRILDI — maaş tek yerden: Kâr Cüzdanı (euro motoru).
              Bu blok ₺23.300/ay gösterip Kâr Cüzdanı'nın €0'ıyla çelişiyordu. */}

          {/* Quick nav */}
          <div className="flex gap-2 pt-2 overflow-x-auto">
            <button onClick={() => navigate('/ai-advisor')} className="flex items-center gap-1 px-3 py-1.5 bg-amber-600 text-white rounded-lg text-[11px] font-semibold whitespace-nowrap">
              <Brain size={11} /> AI Sohbet
            </button>
            <button onClick={() => navigate('/performance')} className="flex items-center gap-1 px-3 py-1.5 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 rounded-lg text-[11px] font-semibold border border-gray-200 dark:border-gray-700 whitespace-nowrap">
              <TrendingUp size={11} /> Performans
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
