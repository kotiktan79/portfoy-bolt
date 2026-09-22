import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { buildAiContext, AI_RULES } from './lib/aiContext.js';
import { dayInTZ } from '../src/lib/eurPnl.js';

function getSupabase() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Supabase credentials missing');
  return createClient(url, key);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
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
      const ctx = await buildAiContext(getSupabase(), dayInTZ(new Date()));
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

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-5',
        thinking: { type: 'disabled' },
        max_tokens: 1200,
        system: systemPrompt,
        messages,
      }),
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
