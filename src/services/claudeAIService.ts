import { Holding } from '../lib/supabase';
import { supabase } from '../lib/supabase';
import { getTotalCashValue } from './cashService';

interface ClaudeResponse {
  success: boolean;
  response?: string;
  error?: string;
  fallback?: boolean;
  model?: string;
}

interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

function getSupabaseConfig() {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return { url, key };
}

function buildPortfolioData(holdings: Holding[], riskScore: number = 50) {
  const investmentHoldings = holdings.filter(h => h.asset_type !== 'cash');
  const totalValue = investmentHoldings.reduce((s, h) => s + h.current_price * h.quantity, 0);
  const totalInvested = investmentHoldings.reduce((s, h) => s + h.purchase_price * h.quantity, 0);

  return {
    holdings: investmentHoldings.map(h => {
      const value = h.current_price * h.quantity;
      const invested = h.purchase_price * h.quantity;
      const pnl = value - invested;
      return {
        symbol: h.symbol,
        asset_type: h.asset_type,
        quantity: h.quantity,
        purchase_price: h.purchase_price,
        current_price: h.current_price,
        total_value: value,
        pnl,
        pnl_percent: invested > 0 ? (pnl / invested) * 100 : 0,
        weight: totalValue > 0 ? (value / totalValue) * 100 : 0,
      };
    }),
    total_value: totalValue,
    total_invested: totalInvested,
    total_pnl: totalValue - totalInvested,
    total_pnl_percent: totalInvested > 0 ? ((totalValue - totalInvested) / totalInvested) * 100 : 0,
    cash_balance: 0,
    risk_score: riskScore,
  };
}

export async function askClaude(
  question: string,
  holdings: Holding[],
  conversationHistory: ConversationMessage[] = [],
  riskScore: number = 50
): Promise<{ response: string; isAI: boolean }> {
  const config = getSupabaseConfig();
  if (!config) {
    return { response: 'Supabase bağlantısı yapılandırılmamış.', isAI: false };
  }

  try {
    const cashBalance = await getTotalCashValue();
    const portfolioData = buildPortfolioData(holdings, riskScore);
    portfolioData.cash_balance = cashBalance;

    const res = await fetch(`${config.url}/functions/v1/ai-portfolio-advisor`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.key}`,
        'apikey': config.key,
      },
      body: JSON.stringify({
        portfolio: portfolioData,
        question,
        conversationHistory: conversationHistory.slice(-6),
      }),
    });

    if (!res.ok) {
      throw new Error(`API error: ${res.status}`);
    }

    const data: ClaudeResponse = await res.json();

    if (data.success && data.response) {
      return { response: data.response, isAI: true };
    }

    if (data.fallback) {
      return { response: '', isAI: false };
    }

    return { response: data.error || 'Bilinmeyen hata', isAI: false };
  } catch (error) {
    console.error('Claude API error:', error);
    return { response: '', isAI: false };
  }
}
