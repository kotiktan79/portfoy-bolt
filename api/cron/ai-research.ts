// AI Araştırma Motoru — günlük cron
// Portföy + makro + web search → Claude → JSON rapor + öneriler → DB
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

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

const SYSTEM_PROMPT = `Sen Türkçe konuşan, Romanya'da yaşayan EUR-bazlı bir yatırımcının kişisel araştırma asistanısın.
Yatırımcı profili:
- Romanya'da ikamet, EUR ev parası, TL ve USD yabancı para
- Türkiye'den BIST hisseleri var (TL maruziyeti = yabancı para riski)
- ABD/Avrupa hisseleri (USD/EUR — JNJ, ASML, V3YL)
- IB01 eurobond, EUROFON fon, altın, crypto, EUR/USD nakit pozisyonları

Görevin:
1. Mevcut portföye + makro koşullara bakarak günlük rapor üret
2. web_search ile son haberleri çek (BIST100, EUR/TRY, TCMB, holding'lerin son haberleri)
3. Romanya/EUR perspektifinden değerlendir — TL ev parası DEĞİL, USD-gelirli holding'ler doğal hedge
4. Önceki günden uygulanan/devam eden önerileri yinelemeyi azalt
5. Aksiyon önerileri net olsun: trim/buy/sell/rotate/hold + hangi sembol + niye

ÇIKTI: Sadece geçerli JSON döndür, başka metin yok. Format:
{
  "report_date": "YYYY-MM-DD",
  "headline": "2-3 cümle ana mesaj",
  "macro_summary": {
    "bist100": "BIST endeks durumu, son hafta yön",
    "eur_try": "Kur durumu, 3-6 ay outlook",
    "tcmb": "Faiz / enflasyon görünüm",
    "global": "ABD/Avrupa makro önemli not"
  },
  "per_holding_view": [
    { "symbol": "TUPRS", "action": "hold", "view": "kısa görüş + sebep" }
  ],
  "recommendations": [
    {
      "action": "trim|sell|buy|rotate|hold|watch",
      "symbol": "TICKER",
      "target_amount": 500,
      "target_currency": "EUR",
      "priority": 1,
      "reason": "Niye bu öneri (2-3 cümle, somut)"
    }
  ],
  "risks": ["Risk 1", "Risk 2"],
  "opportunities": ["Fırsat 1"]
}

Priority: 1=en acil, 5=düşük. En fazla 5 öneri ver. Recommendation'ları symbol+action ile zaten varsa tekrarlama.`;

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
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8000,
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

  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers.authorization !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const startTime = Date.now();
  const log: string[] = [];

  try {
    const supabase = getSupabase();
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    if (!anthropicKey) return res.status(200).json({ success: false, error: 'ANTHROPIC_API_KEY missing' });

    // 1. Portföy verisi
    const [holdingsRes, snapshotsRes, cashRes, prevRecsRes] = await Promise.all([
      supabase.from('holdings').select('*'),
      supabase.from('portfolio_snapshots').select('snapshot_date, total_value, total_pnl, total_investment, total_deposits').order('snapshot_date', { ascending: false }).limit(30),
      supabase.from('cash_balances').select('currency, balance, total_deposits'),
      supabase.from('ai_recommendations').select('symbol, action, status, status_updated_at').gte('created_at', new Date(Date.now() - 14 * 86400000).toISOString()),
    ]);

    const holdings = holdingsRes.data || [];
    const snapshots = snapshotsRes.data || [];
    const cash = cashRes.data || [];
    const prevRecs = prevRecsRes.data || [];

    // 2. FX ve değer hesabı
    const usdH = holdings.find((h: any) => h.symbol === 'USD' && h.asset_type === 'currency');
    const eurH = holdings.find((h: any) => h.symbol === 'EURO' && h.asset_type === 'currency');
    const usd = Number(usdH?.current_price) || 45;
    const eur = Number(eurH?.current_price) || 51;
    const fx = (c: string) => {
      const x = (c || 'TRY').toUpperCase();
      if (x === 'USD') return usd;
      if (x === 'EUR') return eur;
      if (x === 'GBP') return usd * 1.27;
      return 1;
    };

    const inv = holdings.filter((h: any) => h.asset_type !== 'cash' && h.quantity > 0).map((h: any) => {
      const value = h.current_price * h.quantity * fx(h.currency); // fx-ok: server-side FX-aware tryValue
      const cost = h.purchase_price * h.quantity * fx(h.currency); // fx-ok: server-side FX-aware tryCost
      return { ...h, value, cost, pnl: value - cost, pnlPct: cost > 0 ? ((value - cost) / cost) * 100 : 0 };
    });
    const totalValue = inv.reduce((s: number, p: any) => s + p.value, 0);

    // 3. Portföy özeti
    const portfolioSummary = {
      total_value_try: Math.round(totalValue),
      total_value_eur: Math.round(totalValue / eur),
      total_value_usd: Math.round(totalValue / usd),
      fx: { usd_try: usd, eur_try: eur },
      holdings: inv.map((p: any) => ({
        symbol: p.symbol,
        type: p.asset_type,
        currency: p.currency,
        qty: Number(p.quantity),
        cur_price: Number(p.current_price),
        value_try: Math.round(p.value),
        weight_pct: Number(((p.value / totalValue) * 100).toFixed(2)),
        pnl_pct: Number(p.pnlPct.toFixed(1)),
      })).sort((a: any, b: any) => b.value_try - a.value_try),
      cash: cash.map((c: any) => ({ currency: c.currency, balance: Number(c.balance) })),
    };

    // 4. Snapshot delta (son 7 gün + son 30 gün)
    const today = snapshots[0];
    const week = snapshots.find((s: any) => new Date(today.snapshot_date).getTime() - new Date(s.snapshot_date).getTime() >= 7 * 86400000);
    const month = snapshots.find((s: any) => new Date(today.snapshot_date).getTime() - new Date(s.snapshot_date).getTime() >= 28 * 86400000);
    const trend = {
      this_week_pnl_change: week ? Math.round(Number(today?.total_pnl || 0) - Number(week?.total_pnl || 0)) : null,
      this_month_pnl_change: month ? Math.round(Number(today?.total_pnl || 0) - Number(month?.total_pnl || 0)) : null,
      total_pnl_now: Math.round(Number(today?.total_pnl || 0)),
    };

    // 5. Önceki öneriler (yinelememek için)
    const prevContext = prevRecs.map((r: any) => `${r.symbol} ${r.action} (${r.status})`).join(', ');

    const userPrompt = `Bugünkü portföy durumu (TRY bazında, FX-aware):
${JSON.stringify(portfolioSummary, null, 2)}

Trend:
- Bu hafta kâr değişimi: ₺${trend.this_week_pnl_change ?? '?'}
- Bu ay kâr değişimi: ₺${trend.this_month_pnl_change ?? '?'}
- Toplam kâr şu an: ₺${trend.total_pnl_now}

Son 2 haftada verilen öneriler (yinelemekten kaçın): ${prevContext || 'yok'}

Web search ile şu konuları araştır ve günceli yansıt:
1. BIST100 son hafta performansı + yabancı akım
2. EUR/TRY ve USD/TRY son hareket + 3-6 ay outlook
3. TCMB son faiz toplantısı + enflasyon verisi
4. Portföydeki büyük pozisyonların son haberleri (TUPRS, ASELS, EURO/USD nakit, IB01, BTC)
5. Romanya/EUR yatırımcı için bugün dikkat edilecek özel konular

Sonra şu format JSON ile cevap ver: report_date, headline, macro_summary, per_holding_view (en önemli 5-7 holding), recommendations (en fazla 5, priority 1-5), risks, opportunities.

UYARI: Sadece geçerli JSON ver, başka metin yok. Markdown code block kullanma. Plain JSON.`;

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

    const reportDate = parsed.report_date || new Date().toISOString().split('T')[0];
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
        model: 'claude-sonnet-4-20250514',
        tokens_used: (usage?.input_tokens || 0) + (usage?.output_tokens || 0),
        generated_at: new Date().toISOString(),
      }).eq('id', reportId);
      // Eski recommendations'ı sil (yenisini yaz)
      await supabase.from('ai_recommendations').delete().eq('report_id', reportId).eq('status', 'pending');
    } else {
      const { data: inserted, error: insErr } = await supabase
        .from('ai_research_reports')
        .insert({
          report_date: reportDate,
          content: parsed,
          headline,
          model: 'claude-sonnet-4-20250514',
          tokens_used: (usage?.input_tokens || 0) + (usage?.output_tokens || 0),
        })
        .select('id')
        .single();
      if (insErr) throw new Error(`Insert fail: ${insErr.message}`);
      reportId = inserted.id;
    }

    // 8. Önerileri ayrı tabloya yaz
    const recs = Array.isArray(parsed.recommendations) ? parsed.recommendations : [];
    if (recs.length > 0) {
      const rows = recs.map((r: any) => ({
        report_id: reportId,
        action: String(r.action || 'watch').toLowerCase(),
        symbol: String(r.symbol || 'GENERAL').toUpperCase(),
        target_qty: r.target_qty || null,
        target_amount: r.target_amount || null,
        target_currency: r.target_currency || 'EUR',
        priority: Number(r.priority) || 3,
        reason: String(r.reason || ''),
        status: 'pending',
      }));
      await supabase.from('ai_recommendations').insert(rows);
    }

    const duration = Date.now() - startTime;
    log.push(`Rapor oluşturuldu: ${recs.length} öneri, ${duration}ms`);

    return res.status(200).json({
      success: true,
      report_id: reportId,
      report_date: reportDate,
      headline,
      recommendations_count: recs.length,
      duration_ms: duration,
      log,
    });
  } catch (e: any) {
    return res.status(500).json({ success: false, error: e.message, log });
  }
}
