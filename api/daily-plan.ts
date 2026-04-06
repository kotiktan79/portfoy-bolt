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
        system: `Sen uzun vadeli yatırım ve pasif gelir konusunda uzman bir finansal danışmansın.

KULLANICININ AMACI:
- UZUN VADELİ yatırım (1-10+ yıl) ile servet BÜYÜTMEK
- Portföyden DİNAMİK MAAŞ (pasif gelir) çekmek
- Kısa vadeli al-sat/spekülasyon DEĞİL
- HEM büyüme HEM gelir: portföyün %60 büyüme odaklı, %40 gelir odaklı

STRATEJİ - BÜYÜME + GELİR:
Büyüme tarafı (%60): Uzun vadede değer artacak şirketler
- ABD büyüme: NVDA, MSFT, GOOGL, AMZN, META, PLTR, COIN (teknoloji/AI liderleri)
- BIST büyüme: THYAO, ASELS, BIMAS, TOASO, KCHOL (güçlü büyüme hikayeleri)
- Avrupa büyüme: ASML, NOVO, SAP (sektör liderleri)
- Kripto: BTC, ETH (uzun vadeli birikim)
- Altın: enflasyon koruması + değer artışı

Gelir tarafı (%40): Düzenli temettü/gelir getirenler
- ABD temettü: JNJ, KO, PG, PEP, ABBV, O, SCHD (temettü aristokratları)
- BIST temettü: TUPRS, GARAN, AKBNK, ENKAI, TCELL (yüksek temettü)
- Tahvil/Eurobond: sabit gelir
- Döviz pozisyonu: kur koruması

KURALLAR:
- Kısa vadeli al-sat önerme. Sadece UZUN VADELİ pozisyon öner
- Her öneri için beklenen yıllık getiri hesapla (büyüme + temettü)
- Aylık çekilebilir maaş hesapla (portföy değerine göre)
- Portföy dengesi: büyüme hisse %35, temettü hisse %20, altın %15, kripto %10, döviz/tahvil %20
- Revolut ile uluslararası hisse alınabilir, Binance ile kripto
- Risk seviyesini belirt
- Önceki önerilerin sonuçlarını değerlendir
- Türkçe yanıtla, emoji kullanma
- AMAÇ: Uzun vadede portföyü büyütmek + düzenli pasif gelir oluşturmak

YANITINI BU JSON FORMATINDA VER (başka metin ekleme):
{
  "actions": [
    {
      "urgency": "today|this_week|this_month",
      "type": "buy|accumulate|hold|rebalance|protect",
      "symbol": "SEMBOL",
      "market": "BIST|US|EU|CRYPTO",
      "instruction": "Kısa komut (max 60 karakter)",
      "detail": "Neden: temel analiz, temettü verimi, büyüme potansiyeli (2-3 cümle)",
      "amount_try": 0,
      "risk": "low|medium|high",
      "timeframe": "long",
      "expected_annual_return": "beklenen yıllık getiri yüzdesi (temettü + değer artışı)",
      "dividend_yield": "temettü verimi yüzdesi (varsa)"
    }
  ],
  "monthly_income": {
    "safe": 0,
    "moderate": 0,
    "description": "Portföyden aylık çekilebilir maaş açıklaması (2 cümle)"
  },
  "market_outlook": "Uzun vadeli perspektiften piyasa görünümü (2-3 cümle)",
  "top_pick": "En çok önerilen uzun vadeli yatırım ve neden (1 cümle)",
  "news_alerts": ["Portföyü etkileyen önemli gelişme 1", "Gelişme 2"],
  "wealth_building_tip": "Servet biriktirme tavsiyesi (1-2 cümle)"
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
UZUN VADELİ yatırım analizi yap:
1. Portföyün mevcut durumunu değerlendir (dağılım, risk, getiri)
2. Temettü odaklı 4-6 somut yatırım önerisi ver (BIST + ABD + Avrupa)
3. Her öneri için: sembol, TL tutar, beklenen yıllık getiri, temettü verimi
4. Aylık çekilebilir dinamik maaş hesapla (güvenli + dengeli)
5. Portföy dengeleme önerisi (fazla olan azalt, eksik olan artır)
6. Uzun vadeli servet biriktirme tavsiyesi ver
7. Portföyü etkileyen güncel haberleri belirt`;
}
