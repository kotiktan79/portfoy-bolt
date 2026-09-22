import { useState, useEffect } from 'react';
import { Brain, Shield, Sparkles, MessageSquare, Send, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { analyzeRiskProfile, type RiskProfile } from '../services/aiAdvisorService';
import { askClaude } from '../services/claudeAIService';

interface ChatMessage { role: 'user' | 'ai'; content: string; suggestions?: string[]; timestamp: Date }

// 2026-09-22 (kullanıcı kararı "küçült"): AI AÇIKLAR, işlem ÖNERMEZ, maaş HESAPLAMAZ.
// Yerel sinyal/öneri/sentiment motorları (advancedAI, smartAIChat, generateAIRecommendations) bu sayfadan çıkarıldı;
// Claude ulaşılamazsa sohbet yerel öneri motoruna DÜŞMEZ, sabit bir "ulaşılamıyor" mesajı verir.
// Sohbet geçmişi anahtarı sürümlendi: eski öneri/sinyal mesajları /api/chat'e geçmiş olarak gitmesin.
const CHAT_KEY = 'ai_chat_history_v2';
const CHAT_SUGGESTIONS = ['Bu hafta ne alıyorum?', 'Bu ay neden eksi/artı?', 'Maaşım neden bu kadar?'];
const OFFLINE_MSG = 'AI şu an ulaşılamıyor. Plan sabittir: bu haftaki dilim hisse/tahvil açıklarına oranlı V3YL + XEON — ayrıntı ve tutarlar "Hedefe Ulaşma Planı" sayfasında, maaş rakamı "Kâr Cüzdanı"nda. Biraz sonra tekrar deneyin.';

export default function AIAdvisor() {
  const [holdings, setHoldings] = useState<any[]>([]);
  const [riskProfile, setRiskProfile] = useState<RiskProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [activeTab, setActiveTab] = useState<'overview' | 'chat'>('overview');

  // Load chat history from localStorage on mount
  useEffect(() => {
    try {
      localStorage.removeItem('ai_chat_history');   // eski (öneri içeren) geçmiş
      const stored = localStorage.getItem(CHAT_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        setChatHistory(parsed.map((m: any) => ({ ...m, timestamp: new Date(m.timestamp) })));
      }
    } catch { /* ignore */ }
  }, []);

  // Save chat history to localStorage on change
  useEffect(() => {
    if (chatHistory.length > 0) {
      const toStore = chatHistory.slice(-50);
      try { localStorage.setItem(CHAT_KEY, JSON.stringify(toStore)); } catch { /* ignore */ }
    }
  }, [chatHistory]);

  const clearChatHistory = () => {
    setChatHistory([]);
    try { localStorage.removeItem(CHAT_KEY); } catch { /* ignore */ }
  };

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const { data } = await supabase.from('holdings').select('*').gt('quantity', 0);
      if (data) {
        setHoldings(data);
        await runAnalysis(data);
      }
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  }

  async function runAnalysis(holdingsData: any[]) {
    setAnalyzing(true);
    try {
      setRiskProfile(await analyzeRiskProfile(holdingsData));   // yapısal profil (çeşitlendirme/konsantrasyon) — öneri değil
    } catch (error) {
      console.error('Error running analysis:', error);
    } finally {
      setAnalyzing(false);
    }
  }

  const getRiskColor = (level: string) => {
    switch (level) {
      case 'conservative':
        return 'text-green-600 bg-green-50 border-green-200';
      case 'moderate':
        return 'text-brand-600 bg-brand-50 border-brand-200';
      case 'aggressive':
        return 'text-brand-600 bg-brand-50 border-brand-200';
      case 'very_aggressive':
        return 'text-red-600 bg-red-50 border-red-200';
      default:
        return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  const [chatLoading, setChatLoading] = useState(false);

  const handleChatSubmit = async () => {
    if (!chatInput.trim() || chatLoading) return;

    const userMsg: ChatMessage = {
      role: 'user',
      content: chatInput,
      timestamp: new Date(),
    };

    setChatHistory(prev => [...prev, userMsg]);
    setChatInput('');
    setChatLoading(true);

    try {
      const conversationHistory = chatHistory
        .filter(m => m.role === 'user' || m.role === 'ai')
        .map(m => ({
          role: (m.role === 'ai' ? 'assistant' : 'user') as 'user' | 'assistant',
          content: m.content,
        }));

      const claudeResult = await askClaude(chatInput, holdings, conversationHistory, riskProfile?.score || 50);
      const content = claudeResult.isAI && claudeResult.response ? claudeResult.response : OFFLINE_MSG;
      setChatHistory(prev => [...prev, { role: 'ai', content, suggestions: CHAT_SUGGESTIONS, timestamp: new Date() }]);
    } catch {
      setChatHistory(prev => [...prev, { role: 'ai', content: OFFLINE_MSG, suggestions: CHAT_SUGGESTIONS, timestamp: new Date() }]);
    } finally {
      setChatLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="card-secondary p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-slate-200 dark:bg-gray-800 rounded w-1/3"></div>
          <div className="h-64 bg-gradient-to-b from-slate-100 to-slate-200 dark:from-gray-800 dark:to-gray-900 rounded-xl"></div>
        </div>
      </div>
    );
  }

  if (holdings.length === 0) {
    return (
      <div className="card-secondary">
        <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
          <div className="p-4 rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 mb-4 shadow-lg shadow-brand-500/20">
            <Brain className="w-10 h-10 text-white" />
          </div>
          <h3 className="t-h2 mb-1">AI Analiz için varlık gerekli</h3>
          <p className="t-caption max-w-sm">
            Portföyünüze varlık ekleyin; AI rakamları açıklar ve anomali bildirir (işlem önermez).
          </p>
        </div>
      </div>
    );
  }

  // 2026-09-22: 'Al/Sat Sinyalleri' ve 'Akıllı Öneriler' sekmeleri KALDIRILDI — tek plan sabit, AI işlem önermez (açıklar).
  const tabs = [
    { id: 'overview' as const, label: 'Genel Bakış', icon: Shield },
    { id: 'chat' as const, label: 'AI Sohbet', icon: MessageSquare },
  ];

  return (
    <div className="space-y-5">
      {/* Hero — modern glassmorphism with brand gradient */}
      <div className="card-hero p-5 md:p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <div className="icon-badge icon-badge-brand !p-3 !rounded-2xl">
              <Brain className="w-6 h-6" />
            </div>
            <div>
              <h2 className="t-h2">AI Portföy Danışmanı</h2>
              <p className="t-caption">Rakamları açıklar, anomali bildirir — işlem önermez, maaş hesaplamaz</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => runAnalysis(holdings)}
              disabled={analyzing}
              className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-br from-brand-600 to-brand-700 hover:from-brand-500 text-white rounded-xl shadow-md shadow-brand-500/20 hover:shadow-brand-500/40 transition-all font-semibold text-sm disabled:opacity-50 hover-lift"
            >
              <Sparkles className="w-4 h-4" />
              {analyzing ? 'Analiz...' : 'Yeniden Analiz'}
            </button>
          </div>
        </div>
      </div>

      {/* Tabs — pill style */}
      <div className="card-secondary p-1.5">
        <div className="flex gap-1 overflow-x-auto">
          {tabs.map(t => {
            const Icon = t.icon;
            const isActive = activeTab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg font-semibold text-sm whitespace-nowrap transition-all ${
                  isActive
                    ? 'bg-brand-100 dark:bg-brand-950/40 text-brand-700 dark:text-brand-300 shadow-sm'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-slate-50 dark:hover:bg-gray-800/50'
                }`}
              >
                <Icon size={14} strokeWidth={isActive ? 2.5 : 2} />
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {activeTab === 'overview' && riskProfile && (
        <div className="card-secondary p-6">
          <div className="flex items-center gap-3 mb-6">
            <Shield className="w-6 h-6 text-brand-600" />
            <h3 className="text-xl font-bold text-gray-900 dark:text-white">Risk Profili</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <div
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg border-2 ${getRiskColor(
                  riskProfile.level
                )} font-bold text-lg mb-4`}
              >
                {riskProfile.level === 'conservative' && '🛡️ Muhafazakar'}
                {riskProfile.level === 'moderate' && '⚖️ Dengeli'}
                {riskProfile.level === 'aggressive' && '🚀 Agresif'}
                {riskProfile.level === 'very_aggressive' && '⚡ Çok Agresif'}
              </div>
              <div className="space-y-3">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Genel Risk Skoru
                    </span>
                    <span className="text-sm font-bold text-gray-900 dark:text-white">
                      {riskProfile.score.toFixed(0)}/100
                    </span>
                  </div>
                  <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-brand-500 to-brand-500 transition-all duration-500"
                      style={{ width: `${riskProfile.score}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-700 dark:text-gray-300">Çeşitlendirme</span>
                  <span className="text-sm font-bold">
                    {riskProfile.factors.diversification.toFixed(0)}%
                  </span>
                </div>
                <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-green-500"
                    style={{ width: `${riskProfile.factors.diversification}%` }}
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-700 dark:text-gray-300">Volatilite</span>
                  <span className="text-sm font-bold">
                    {riskProfile.factors.volatility.toFixed(0)}%
                  </span>
                </div>
                <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-brand-500"
                    style={{ width: `${riskProfile.factors.volatility}%` }}
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-700 dark:text-gray-300">Konsantrasyon</span>
                  <span className="text-sm font-bold">
                    {riskProfile.factors.concentration.toFixed(0)}%
                  </span>
                </div>
                <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-yellow-500"
                    style={{ width: `${riskProfile.factors.concentration}%` }}
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-700 dark:text-gray-300">Varlık Dağılımı</span>
                  <span className="text-sm font-bold">
                    {riskProfile.factors.asset_allocation.toFixed(0)}%
                  </span>
                </div>
                <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-brand-500"
                    style={{ width: `${riskProfile.factors.asset_allocation}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'chat' && (
        <div className="card-secondary p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <MessageSquare className="w-6 h-6 text-brand-600" />
              <h3 className="text-xl font-bold text-gray-900 dark:text-white">AI Sohbet</h3>
            </div>
            {chatHistory.length > 0 && (
              <button
                onClick={clearChatHistory}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors font-medium"
              >
                <X className="w-4 h-4" />
                Sohbeti Temizle
              </button>
            )}
          </div>

          <div className="space-y-4 mb-6 max-h-[500px] overflow-y-auto">
            {chatHistory.length === 0 && (
              <div className="text-center py-8">
                <Brain className="w-12 h-12 text-brand-300 mx-auto mb-3" />
                <p className="text-gray-600 dark:text-gray-400 mb-4">
                  Portföyünüz hakkında her şeyi sorun!
                </p>
                <div className="flex flex-wrap gap-2 justify-center">
                  {['Bu hafta ne alıyorum?', 'Bu ay neden eksi/artı?', 'Maaşım neden bu kadar?', 'Nakit neden ölü sermaye?', 'Kurlar portföyü nasıl etkiledi?', 'Dağılım hedefe ne kadar uzak?'].map(q => (
                    <button
                      key={q}
                      onClick={() => setChatInput(q)}
                      className="px-3 py-2 bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300 rounded-lg text-sm hover:bg-brand-100 dark:hover:bg-brand-900/50 font-medium transition-colors"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {chatHistory.map((msg, index) => (
              <div key={index} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`rounded-2xl px-4 py-3 max-w-lg ${
                  msg.role === 'user'
                    ? 'bg-brand-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-700'
                }`}>
                  <div className={`text-sm whitespace-pre-wrap ${msg.role === 'ai' ? 'text-gray-900 dark:text-white' : ''}`}>
                    {msg.content.split(/(\*\*.*?\*\*)/).map((part, i) =>
                      part.startsWith('**') && part.endsWith('**')
                        ? <strong key={i}>{part.slice(2, -2)}</strong>
                        : part
                    )}
                  </div>


                  {msg.suggestions && msg.suggestions.length > 0 && msg.role === 'ai' && (
                    <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-gray-200 dark:border-gray-600">
                      {msg.suggestions.map((s, idx) => (
                        <button
                          key={idx}
                          onClick={() => setChatInput(s)}
                          className="px-2.5 py-1 bg-white dark:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg text-xs hover:bg-gray-50 dark:hover:bg-gray-500 font-medium transition-colors"
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {chatLoading && (
            <div className="flex items-center gap-2 px-4 py-2 text-sm text-brand-600 dark:text-brand-400">
              <div className="animate-spin rounded-full h-4 w-4 border-2 border-brand-600 border-t-transparent" />
              Claude düşünüyor...
            </div>
          )}

          <div className="flex gap-2">
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleChatSubmit()}
              placeholder={chatLoading ? 'Claude yanıtlıyor...' : 'Portföyünüz hakkında soru sorun...'}
              disabled={chatLoading}
              className="flex-1 px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white disabled:opacity-50"
            />
            <button
              onClick={handleChatSubmit}
              disabled={chatLoading}
              className="px-6 py-3 bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors disabled:opacity-50"
            >
              <Send className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}