/**
 * AI Memory Service - Tandor Finans
 *
 * Claude'un önceki önerilerini hatırlaması ve sonuçları takip etmesi.
 * LocalStorage'da saklanır, Claude'a context olarak gönderilir.
 */

export interface AIRecommendation {
  id: string;
  date: string;
  symbol: string;
  action: 'buy' | 'sell' | 'hold' | 'reduce';
  market: string;
  reason: string;
  priceAtRecommendation: number;
  amountTry: number;
  status: 'active' | 'followed' | 'ignored' | 'expired';
  followedDate?: string;
  currentPrice?: number;
  result?: number; // % change since recommendation
}

export interface PortfolioEvent {
  id: string;
  date: string;
  type: 'buy' | 'sell' | 'add' | 'remove' | 'deposit' | 'withdrawal';
  symbol?: string;
  amount?: number;
  note: string;
}

export interface AIMemory {
  recommendations: AIRecommendation[];
  events: PortfolioEvent[];
  lastAnalysisDate: string;
  portfolioValueHistory: Array<{ date: string; value: number }>;
}

const MEMORY_KEY = 'tandor_ai_memory';

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function getToday(): string {
  return new Date().toISOString().split('T')[0];
}

export function loadMemory(): AIMemory {
  try {
    const raw = localStorage.getItem(MEMORY_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return { recommendations: [], events: [], lastAnalysisDate: '', portfolioValueHistory: [] };
}

function saveMemory(memory: AIMemory) {
  // Keep last 90 days only
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 90);
  const cutoffStr = cutoff.toISOString().split('T')[0];

  memory.recommendations = memory.recommendations.filter(r => r.date >= cutoffStr);
  memory.events = memory.events.filter(e => e.date >= cutoffStr);
  memory.portfolioValueHistory = memory.portfolioValueHistory.filter(h => h.date >= cutoffStr);

  localStorage.setItem(MEMORY_KEY, JSON.stringify(memory));
}

// ── Save AI Recommendations ─────────────────────────────────

export function saveRecommendations(actions: Array<{
  symbol: string;
  type: string;
  market: string;
  instruction: string;
  amount_try: number;
}>, currentPrices: Record<string, number>) {
  const memory = loadMemory();

  // Don't duplicate today's recommendations
  const today = getToday();
  const todayRecs = memory.recommendations.filter(r => r.date === today);
  if (todayRecs.length > 0) return;

  actions.forEach(a => {
    memory.recommendations.push({
      id: generateId(),
      date: today,
      symbol: a.symbol,
      action: a.type as any || 'buy',
      market: a.market || 'BIST',
      reason: a.instruction,
      priceAtRecommendation: currentPrices[a.symbol] || 0,
      amountTry: a.amount_try || 0,
      status: 'active',
    });
  });

  saveMemory(memory);
}

// ── Track Portfolio Events ──────────────────────────────────

export function recordEvent(type: PortfolioEvent['type'], symbol?: string, amount?: number, note?: string) {
  const memory = loadMemory();
  memory.events.push({
    id: generateId(),
    date: getToday(),
    type,
    symbol,
    amount,
    note: note || `${type} ${symbol || ''} ${amount ? amount.toFixed(0) + '₺' : ''}`.trim(),
  });
  saveMemory(memory);
}

// ── Update Recommendation Status ────────────────────────────

export function markRecommendationFollowed(id: string) {
  const memory = loadMemory();
  const rec = memory.recommendations.find(r => r.id === id);
  if (rec) {
    rec.status = 'followed';
    rec.followedDate = getToday();
  }
  saveMemory(memory);
}

// ── Update Prices & Calculate Results ───────────────────────

export function updateRecommendationResults(currentPrices: Record<string, number>) {
  const memory = loadMemory();
  let changed = false;

  memory.recommendations.forEach(rec => {
    if (rec.priceAtRecommendation > 0 && currentPrices[rec.symbol]) {
      const newPrice = currentPrices[rec.symbol];
      rec.currentPrice = newPrice;
      rec.result = ((newPrice - rec.priceAtRecommendation) / rec.priceAtRecommendation) * 100;
      changed = true;
    }

    // Expire recommendations older than 30 days
    const daysSince = (Date.now() - new Date(rec.date).getTime()) / 86400000;
    if (daysSince > 30 && rec.status === 'active') {
      rec.status = 'expired';
      changed = true;
    }
  });

  if (changed) saveMemory(memory);
}

// ── Save Daily Portfolio Value ──────────────────────────────

export function recordPortfolioValue(value: number) {
  const memory = loadMemory();
  const today = getToday();

  const existing = memory.portfolioValueHistory.find(h => h.date === today);
  if (existing) {
    existing.value = value;
  } else {
    memory.portfolioValueHistory.push({ date: today, value });
  }

  saveMemory(memory);
}

// ── Build Context for Claude ────────────────────────────────

export function buildMemoryContext(): string {
  const memory = loadMemory();
  const lines: string[] = [];

  // Recent recommendations and their results
  const recent = memory.recommendations.slice(-15);
  if (recent.length > 0) {
    lines.push('ÖNCEKİ ÖNERİLERİM VE SONUÇLARI:');
    recent.forEach(r => {
      const resultStr = r.result !== undefined ? `sonuç: %${r.result >= 0 ? '+' : ''}${r.result.toFixed(1)}` : 'sonuç: beklemede';
      const statusStr = r.status === 'followed' ? '(uygulandı)' : r.status === 'ignored' ? '(uygulanmadı)' : r.status === 'expired' ? '(süresi doldu)' : '(aktif)';
      lines.push(`- ${r.date}: ${r.action.toUpperCase()} ${r.symbol} [${r.market}] - ${r.reason} → ${resultStr} ${statusStr}`);
    });
    lines.push('');
  }

  // Win/loss statistics
  const withResults = memory.recommendations.filter(r => r.result !== undefined);
  if (withResults.length >= 3) {
    const wins = withResults.filter(r =>
      (r.action === 'buy' && (r.result || 0) > 0) ||
      (r.action === 'sell' && (r.result || 0) < 0)
    );
    const avgResult = withResults.reduce((s, r) => s + (r.result || 0), 0) / withResults.length;
    lines.push(`ÖNERİ İSTATİSTİKLERİM: ${wins.length}/${withResults.length} isabetli, ortalama sonuç: %${avgResult >= 0 ? '+' : ''}${avgResult.toFixed(1)}`);
    lines.push('');
  }

  // Recent portfolio events
  const recentEvents = memory.events.slice(-10);
  if (recentEvents.length > 0) {
    lines.push('SON İŞLEMLER:');
    recentEvents.forEach(e => {
      lines.push(`- ${e.date}: ${e.note}`);
    });
    lines.push('');
  }

  // Portfolio value trend
  const history = memory.portfolioValueHistory.slice(-7);
  if (history.length >= 2) {
    const first = history[0];
    const last = history[history.length - 1];
    const change = ((last.value - first.value) / first.value * 100).toFixed(1);
    lines.push(`PORTFÖY TRENDİ (${history.length} gün): ${first.value.toFixed(0)}₺ → ${last.value.toFixed(0)}₺ (%${change})`);
  }

  return lines.join('\n');
}
