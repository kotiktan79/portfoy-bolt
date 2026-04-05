import { Holding } from '../lib/supabase';
import { getTotalCashValue } from './cashService';

interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

function buildPortfolioData(holdings: Holding[], cashBalance: number, riskScore: number) {
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
    cash_balance: cashBalance,
    risk_score: riskScore,
  };
}

export async function askClaude(
  question: string,
  holdings: Holding[],
  conversationHistory: ConversationMessage[] = [],
  riskScore: number = 50
): Promise<{ response: string; isAI: boolean }> {
  try {
    const cashBalance = await getTotalCashValue();
    const portfolioData = buildPortfolioData(holdings, cashBalance, riskScore);

    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        portfolio: portfolioData,
        question,
        conversationHistory: conversationHistory.slice(-6),
      }),
    });

    if (!res.ok) throw new Error(`API error: ${res.status}`);

    const data = await res.json();

    if (data.success && data.response) {
      return { response: data.response, isAI: true };
    }

    return { response: '', isAI: false };
  } catch (error) {
    console.error('Claude API error:', error);
    return { response: '', isAI: false };
  }
}
