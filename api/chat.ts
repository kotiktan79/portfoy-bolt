import type { VercelRequest, VercelResponse } from '@vercel/node';
import { buildAiContext, AI_RULES } from './lib/aiContext.js';
import { dayInTZ } from '../src/lib/eurPnl.js';
import { requirePortfolioAccess } from './lib/auth.js';
import { applyApiCors } from './lib/cors.js';
import { getServiceSupabase } from './lib/serviceSupabase.js';
import { AI_ENABLED, aiDisabledBody, callAnthropicMessages } from './lib/anthropic.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  applyApiCors(req, res, 'POST, OPTIONS');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (await requirePortfolioAccess(req, res)) return;

  // Anahtar duruyor olsa bile çağrı yok. Tek anahtar: src/lib/aiFeature.ts
  if (!AI_ENABLED) {
    return res.status(200).json(aiDisabledBody());
  }

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) {
    return res.status(200).json({ success: false, fallback: true, error: 'API key not configured' });
  }

  try {
    const { question, conversationHistory = [] } = req.body;

    // 2026-09-22: bağlam SUNUCUDA, EUR motorundan (istemcinin TL/USD payload'u artık kullanılmıyor → cüzdanla aynı rakamlar)
    let systemPrompt: string;
    try {
      // gün/ay anahtarı Bükreş takvimi (uygulama ymInTZ/dayInTZ ile aynı) — ayın 1'i 00-03 arası UTC bir önceki ayı gösteriyordu
      const ctx = await buildAiContext(getServiceSupabase(), dayInTZ(new Date()));
      systemPrompt = `${AI_RULES}\n\n${ctx.text}`;
    } catch (e: any) {
      console.error('aiContext:', e?.message);
      systemPrompt = `${AI_RULES}\n\nPORTFÖY VERİSİ ALINAMADI (${e?.message || 'hata'}) — rakam verme, yalnız genel açıklama yap ve verinin alınamadığını söyle.`;
    }

    const messages = [
      ...conversationHistory.slice(-6).map((m: any) => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content,
      })),
      { role: 'user', content: question },
    ];

    const response = await callAnthropicMessages(anthropicKey, {
      model: 'claude-sonnet-5',
      thinking: { type: 'disabled' },
      max_tokens: 1200,
      system: systemPrompt,
      messages,
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('Claude API error:', error);
      return res.status(200).json({ success: false, fallback: true, error: 'AI service unavailable' });
    }

    const data = await response.json();

    return res.status(200).json({
      success: true,
      response: data.content[0].text,
      model: 'claude-sonnet-5',
    });
  } catch (error: any) {
    console.error('Error:', error);
    return res.status(200).json({ success: false, fallback: true, error: error.message });
  }
}
