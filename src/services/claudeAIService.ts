import { Holding } from '../lib/supabase';
import { getTotalCashValue } from './cashService';
import { computePortfolioMetrics, computeHoldingMetrics } from '../lib/portfolioMetrics';

interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

function buildPortfolioData(holdings: Holding[], cashBalance: number, riskScore: number) {
  const portfolio = computePortfolioMetrics(holdings);
  const perHolding = computeHoldingMetrics(holdings);

  return {
    holdings: perHolding.map(m => ({
      symbol: m.holding.symbol,
      asset_type: m.holding.asset_type,
      currency: m.holding.currency || 'TRY',
      quantity: m.holding.quantity,
      purchase_price: m.holding.purchase_price,
      current_price: m.holding.current_price,
      total_value: m.valueTRY,
      pnl: m.pnlTRY,
      pnl_percent: m.pnlPct,
      weight: m.weight,
    })),
    total_value: portfolio.totalValueTRY,
    total_invested: portfolio.totalCostTRY,
    total_pnl: portfolio.totalPnLTRY,
    total_pnl_percent: portfolio.totalPnLPct,
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
