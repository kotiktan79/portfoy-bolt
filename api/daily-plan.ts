import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) {
    return res.status(200).json({ success: false, fallback: true });
  }

  try {
    const { portfolio, memory, trigger } = req.body;

    const prompt = buildPrompt(portfolio, memory, trigger);

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        system: `Sen profesyonel bir yatırım danışmanısın. Türk ve uluslararası piyasaları yakından takip ediyorsun.

GÖREV: Kullanıcının portföyünü analiz et ve BUGÜN yapması gereken somut aksiyonları listele.

KURALLAR:
- Her öneri SOMUT olmalı: sembol adı, TL miktar, neden
- Sadece BIST değil, ABD (AAPL, MSFT, NVDA, TSLA, AMZN, GOOGL, META, PLTR, COIN) ve Avrupa (ASML, SAP, LVMH, NOVO) hisseleri de öner
- Revolut ile uluslararası hisse alınabilir, bunu belirt
- Her önerinin NEDEN'ini açıkla (sektör trendi, değerleme, büyüme potansiyeli, makro etki)
- Risk seviyesini belirt
- Kısa vadeli (1-3 ay) ve uzun vadeli (1+ yıl) ayrı öner
- Önceki önerilerinin sonuçlarını analiz et - isabetli olanları güçlendir, hatalı olanlardan ders çıkar
- Portföy dengesini gözet - eksik sektörlere yönlendir
- AMACI: Kullanıcıyı KAZANDIRMAK. Somut, uygulanabilir, araştırılmış öneriler ver
- Türkçe yanıtla, emoji kullanma

YANITINI BU JSON FORMATINDA VER (başka metin ekleme):
{
  "actions": [
    {
      "urgency": "now|today|this_week",
      "type": "sell|buy|reduce|hold|protect",
      "symbol": "SEMBOL",
      "market": "BIST|US|EU|CRYPTO",
      "instruction": "Kısa komut (max 60 karakter)",
      "detail": "Neden ve nasıl (2-3 cümle). Temel analiz ve güncel gelişmelere değin.",
      "amount_try": 0,
      "risk": "low|medium|high",
      "timeframe": "short|long"
    }
  ],
  "market_outlook": "2-3 cümle: bugün piyasaları etkileyen gelişmeler, Fed/TCMB, sektör trendleri",
  "top_pick": "Bugün en çok önerdiğin tek varlık ve neden (1 cümle)",
  "news_alerts": ["Portföyü etkileyen önemli haber/gelişme 1", "Gelişme 2"],
  "weekly_strategy": "Bu hafta genel strateji önerisi (1-2 cümle)"
}`,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('Claude API error:', err);
      return res.status(200).json({ success: false, fallback: true });
    }

    const data = await response.json();
    const text = data.content[0].text;

    // Parse JSON from response
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return res.status(200).json({ success: true, plan: parsed });
      }
    } catch {
      // If JSON parse fails, return raw text
      return res.status(200).json({ success: true, raw: text });
    }

    return res.status(200).json({ success: true, raw: text });
  } catch (error: any) {
    console.error('Error:', error);
    return res.status(200).json({ success: false, fallback: true, error: error.message });
  }
}

function buildPrompt(portfolio: any, memory?: string, trigger?: string): string {
  if (!portfolio?.holdings?.length) return 'Portföy boş. Yeni başlayan biri için öneriler ver.';

  const { holdings, totalValue, totalInvested, totalPnlPct, cashBalance } = portfolio;

  const typeNames: Record<string, string> = {
    stock: 'Hisse', crypto: 'Kripto', currency: 'Döviz',
    fund: 'Fon', eurobond: 'Eurobond', commodity: 'Emtia',
  };

  // Type distribution
  const byType: Record<string, { value: number; count: number }> = {};
  holdings.forEach((h: any) => {
    if (!byType[h.asset_type]) byType[h.asset_type] = { value: 0, count: 0 };
    byType[h.asset_type].value += h.total_value;
    byType[h.asset_type].count++;
  });

  const dist = Object.entries(byType)
    .sort((a: any, b: any) => b[1].value - a[1].value)
    .map(([type, d]: [string, any]) => `${typeNames[type] || type}: %${(d.value / totalValue * 100).toFixed(1)} (${d.count} adet)`)
    .join(', ');

  // Top holdings
  const topHoldings = [...holdings]
    .sort((a: any, b: any) => b.total_value - a.total_value)
    .slice(0, 15)
    .map((h: any) => `${h.symbol}(${typeNames[h.asset_type]||h.asset_type}): ${h.total_value.toFixed(0)}₺, KZ:%${h.pnl_percent>=0?'+':''}${h.pnl_percent.toFixed(1)}, ağırlık:%${h.weight.toFixed(1)}`)
    .join('\n');

  return `PORTFÖY ANALİZİ İSTİYORUM.

ÖZET:
- Toplam Değer: ${totalValue?.toFixed(0)} TL
- Toplam Yatırım: ${totalInvested?.toFixed(0)} TL
- Getiri: %${totalPnlPct?.toFixed(1)}
- Nakit: ${cashBalance?.toFixed(0)} TL
- Pozisyon: ${holdings.length} adet

DAĞILIM: ${dist}

POZİSYONLAR:
${topHoldings}

NOT: Kullanıcı Türkiye'de yaşıyor. BIST hisseleri + Revolut üzerinden ABD ve Avrupa hisseleri + Binance üzerinden kripto alabilir.

${memory ? `\n${memory}\n` : ''}
${trigger ? `TETIKLEYICI: ${trigger}\nBu olay bağlamında özel öneriler ver.\n` : ''}
Portföyü analiz et ve bugün yapılması gereken 5-8 somut aksiyon ver. Her biri için spesifik sembol, TL tutar ve neden belirt. Önceki önerilerin sonuçlarını değerlendir. Portföydeki varlıklarla ilgili güncel haberleri de dikkate al. AMAC: Kullanıcıyı kazandırmak.`;
}
