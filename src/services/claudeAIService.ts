// AI sohbet istemcisi — 2026-09-22: bağlam SUNUCUDA kuruluyor (api/lib/aiContext, EUR motoru, tek plan).
// Eski sürüm TL/USD nominal portföyü gönderiyordu; sunucu artık onu kullanmıyor → yalnız soru + geçmiş gider.
import { Holding } from '../lib/supabase';

interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

export async function askClaude(
  question: string,
  _holdings: Holding[],
  conversationHistory: ConversationMessage[] = [],
  _riskScore: number = 50
): Promise<{ response: string; isAI: boolean }> {
  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, conversationHistory: conversationHistory.slice(-6) }),
    });
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    const data = await res.json();
    if (data.success && data.response) return { response: data.response, isAI: true };
    return { response: '', isAI: false };
  } catch (error) {
    console.error('Claude API error:', error);
    return { response: '', isAI: false };
  }
}
