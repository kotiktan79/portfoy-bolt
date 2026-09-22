// AI Araştırma — 'Araştır' sayfası butonu (zamanlanmış cron YOK)
// EUR bağlam + web search → Claude → haber/makro özeti → ai_research_reports. Öneri üretmez.
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { hasCronAuth } from '../lib/auth.js';
import { buildAiContext, AI_RULES } from '../lib/aiContext.js';
import { dayInTZ } from '../../src/lib/eurPnl.js';

// Vercel function timeout — Claude + web search 30-60s sürebilir
export const config = {
  maxDuration: 60,
};

function getSupabase() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Supabase credentials missing');
  return createClient(url, key);
}

// 2026-09-22: AI işlem ÖNERMEZ (kullanıcı kararı "küçült"). Eski sürüm trim/sell/buy/rotate önerisi üretip
// ai_recommendations'a yazıyor, sayfa TRİM/SAT/AL rozetleriyle gösteriyordu. Artık: AI_RULES + tek EUR bağlam,
// çıktı yalnız haber/makro özeti + pozisyon başına BİLGİ notu + riskler. 'recommendations' alanı yok, tabloya yazılmaz.
const SYSTEM_PROMPT = `${AI_RULES}

GÖREV (günlük araştırma): web_search ile son haberleri çek (BIST100 + yabancı akım, EUR/TRY ve USD/TRY, TCMB faiz/enflasyon,
ABD/Avrupa makro, portföydeki büyük pozisyonların haberleri) ve Türkçe, kısa, somut özetle. Rakamları aşağıdaki bağlamdan al.
Pozisyon notu = "ne oldu / neden" bilgisi; "al/sat/azalt/tut" DEĞİL.

ÇIKTI: Sadece geçerli JSON, başka metin yok, markdown yok:
{
  "report_date": "YYYY-MM-DD",
  "headline": "2-3 cümle: bugün portföyü ne etkiledi",
  "macro_summary": {
    "bist100": "endeks durumu, son hafta yön, yabancı akım",
    "eur_try": "kur hareketi ve sebebi (kur artışı kâr DEĞİL — TL varlıkların euro değerine etkisi)",
    "tcmb": "faiz / enflasyon görünümü",
    "global": "ABD/Avrupa makro önemli not"
  },
  "per_holding_view": [ { "symbol": "TICKER", "view": "kısa bilgi notu: ne oldu, neden" } ],
  "risks": ["portföyü etkileyebilecek somut risk"],
  "notes": ["bilgi notu (işlem önerisi değil)"]
}
per_holding_view en fazla 7 pozisyon; risks/notes en fazla 4'er madde.`;

async function callClaude(apiKey: string, userPrompt: string): Promise<any> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
      'anthropic-beta': 'web-search-2025-03-05',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-5',
      thinking: { type: 'disabled' },
      max_tokens: 3000,
      system: SYSTEM_PROMPT,
      tools: [
        {
          type: 'web_search_20250305',
          name: 'web_search',
          max_uses: 4,
        },
      ],
      messages: [{ role: 'user', content: userPrompt }],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Claude API ${response.status}: ${err.slice(0, 300)}`);
  }
  const data = await response.json();
  // Web search tool kullanımı olabilir, son text bloku JSON içerir
  const textBlocks = (data.content || []).filter((b: any) => b.type === 'text');
  const fullText = textBlocks.map((b: any) => b.text).join('\n');
  return { rawText: fullText, usage: data.usage };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // This endpoint is intentionally reachable without CRON_SECRET because it is
  // the manual "Research" button (there is no scheduled cron for it). To keep
  // it from being a public Claude-spend faucet we bound the cost: an
  // unauthenticated caller can only ever trigger ONE generation per day — once
  // today's report exists, every further unauthenticated hit returns the cached
  // report without calling Claude. Forced regeneration requires CRON_SECRET.
  const authorized = hasCronAuth(req);
  const force = authorized && (req.query?.force === 'true' || req.query?.force === '1');

  const startTime = Date.now();
  const log: string[] = [];

  try {
    const supabase = getSupabase();
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    if (!anthropicKey) return res.status(200).json({ success: false, error: 'ANTHROPIC_API_KEY missing' });

    // Cost guard: return today's cached report instead of calling Claude again,
    // unless an authenticated caller explicitly forces regeneration.
    if (!force) {
      const todayStr = dayInTZ(new Date());
      const { data: cached } = await supabase
        .from('ai_research_reports')
        .select('id, report_date, headline')
        .eq('report_date', todayStr)
        .maybeSingle();
      if (cached?.id) {
        return res.status(200).json({
          success: true,
          cached: true,
          report_id: cached.id,
          report_date: cached.report_date,
          headline: cached.headline,
          note: 'Report for today already exists; returned from cache. Pass ?force=true with CRON_SECRET to regenerate.',
        });
      }
    }

    // Bağlam: EUR motoru + tek plan + anomaliler (sohbet ve günlük raporla AYNI metin)
    const ctx = await buildAiContext(supabase, dayInTZ(new Date()));
    const userPrompt = `${ctx.text}

Web search ile şunları araştır ve günceli yansıt:
1. BIST100 son hafta performansı + yabancı akım
2. EUR/TRY ve USD/TRY son hareket + sebebi
3. TCMB son faiz kararı + enflasyon verisi
4. Portföydeki büyük pozisyonların son haberleri (ilk 15 pozisyon yukarıda)
5. Romanya'da yaşayan EUR ölçülü yatırımcı için bugün önemli makro konu

Sonra yalnız şu JSON'u ver: report_date, headline, macro_summary, per_holding_view (en önemli 5-7 pozisyon, view = bilgi notu), risks, notes.
Plain JSON, markdown code block yok.`;

    log.push('Claude API çağrılıyor (web_search etkin)...');
    const { rawText, usage } = await callClaude(anthropicKey, userPrompt);
    log.push(`Token: in=${usage?.input_tokens || '?'}, out=${usage?.output_tokens || '?'}`);

    // 6. JSON parse — markdown code fence varsa temizle
    let jsonStr = rawText.trim();
    const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (fenceMatch) jsonStr = fenceMatch[1];
    let parsed: any;
    try {
      parsed = JSON.parse(jsonStr);
    } catch (e: any) {
      // Hata durumunda raw text kaydet
      log.push(`JSON parse fail: ${e.message}`);
      parsed = { raw: rawText, parse_error: e.message };
    }

    const reportDate = dayInTZ(new Date());   // model tarihi değil, sunucu günü (Bükreş)
    const headline = parsed.headline || '';

    // 7. DB'ye yaz — upsert (tek günlük)
    const { data: existing } = await supabase
      .from('ai_research_reports')
      .select('id')
      .eq('report_date', reportDate)
      .maybeSingle();

    let reportId: string;
    if (existing?.id) {
      reportId = existing.id;
      await supabase.from('ai_research_reports').update({
        content: parsed,
        headline,
        model: 'claude-sonnet-5',
        tokens_used: (usage?.input_tokens || 0) + (usage?.output_tokens || 0),
        generated_at: new Date().toISOString(),
      }).eq('id', reportId);
    } else {
      const { data: inserted, error: insErr } = await supabase
        .from('ai_research_reports')
        .insert({
          report_date: reportDate,
          content: parsed,
          headline,
          model: 'claude-sonnet-5',
          tokens_used: (usage?.input_tokens || 0) + (usage?.output_tokens || 0),
        })
        .select('id')
        .single();
      if (insErr) throw new Error(`Insert fail: ${insErr.message}`);
      reportId = inserted.id;
    }

    const duration = Date.now() - startTime;
    log.push(`Rapor oluşturuldu: ${duration}ms`);

    return res.status(200).json({
      success: true,
      report_id: reportId,
      report_date: reportDate,
      headline,
      duration_ms: duration,
      log,
    });
  } catch (e: any) {
    return res.status(500).json({ success: false, error: e.message, log });
  }
}
