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

    // Fetch real-time market data to give Claude current context
    const marketData = await fetchMarketData();

    const prompt = buildPrompt(portfolio, memory, trigger, marketData);

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

ÖNEMLİ: Bilgi kesim tarihin Mayıs 2025. Bugün Nisan 2026. Bu yüzden sana GÜNCEL PİYASA VERİLERİ sağlanıyor. Önerilerini bu gerçek zamanlı verilere dayandır, eski bilgilerine değil. Bir varlık hakkında güncel bilgin yoksa, bunu belirt ve sadece verilen verilere göre yorum yap.

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

async function fetchMarketData(): Promise<string> {
  const lines: string[] = ['GÜNCEL PİYASA VERİLERİ (canlı):'];

  try {
    // USD/TRY
    const fxRes = await fetch('https://open.er-api.com/v6/latest/USD');
    if (fxRes.ok) {
      const fxData = await fxRes.json();
      const usdTry = fxData.rates?.TRY || 0;
      const eurTry = (fxData.rates?.TRY || 0) / (fxData.rates?.EUR ? 1 / fxData.rates.EUR * fxData.rates.TRY / fxData.rates.TRY : 1);
      lines.push(`USD/TRY: ${usdTry.toFixed(2)}`);

      // EUR/TRY
      try {
        const eurRes = await fetch('https://open.er-api.com/v6/latest/EUR');
        if (eurRes.ok) {
          const eurData = await eurRes.json();
          lines.push(`EUR/TRY: ${(eurData.rates?.TRY || 0).toFixed(2)}`);
        }
      } catch { /* skip */ }

      // Crypto prices
      try {
        const cryptoRes = await fetch('https://api.binance.com/api/v3/ticker/price?symbols=["BTCUSDT","ETHUSDT","SOLUSDT","BNBUSDT"]');
        if (cryptoRes.ok) {
          const cryptoData = await cryptoRes.json();
          cryptoData.forEach((c: any) => {
            const usdPrice = parseFloat(c.price);
            const name = c.symbol.replace('USDT', '');
            lines.push(`${name}: $${usdPrice.toFixed(2)} (${(usdPrice * usdTry).toFixed(0)} TL)`);
          });
        }
      } catch { /* skip */ }

      // Gold price
      try {
        const goldRes = await fetch('https://api.metals.live/v1/spot/gold');
        if (goldRes.ok) {
          const goldData = await goldRes.json();
          const ozPrice = goldData[0]?.price || goldData.price;
          if (ozPrice) {
            const gramTry = (ozPrice / 31.1035) * usdTry;
            lines.push(`ALTIN: $${ozPrice.toFixed(0)}/oz = ${gramTry.toFixed(0)} TL/gram`);
          }
        }
      } catch { /* skip */ }

      // Major US stock prices
      try {
        const symbols = ['NVDA', 'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'TSLA', 'JNJ', 'KO', 'PG'];
        const yahooRes = await fetch(
          `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${symbols.join(',')}&fields=regularMarketPrice,regularMarketChangePercent`,
          { headers: { 'User-Agent': 'Mozilla/5.0' } }
        );
        if (yahooRes.ok) {
          const yahooData = await yahooRes.json();
          const quotes = yahooData?.quoteResponse?.result || [];
          if (quotes.length > 0) {
            lines.push('');
            lines.push('ABD HİSSELERİ (canlı):');
            quotes.forEach((q: any) => {
              const price = q.regularMarketPrice;
              const changePct = q.regularMarketChangePercent;
              if (price) {
                lines.push(`${q.symbol}: $${price.toFixed(2)} (${changePct >= 0 ? '+' : ''}${changePct?.toFixed(1) || '0'}%) = ${(price * usdTry).toFixed(0)} TL`);
              }
            });
          }
        }
      } catch { /* skip */ }

      // BIST stocks
      try {
        const bistSymbols = ['THYAO.IS', 'ASELS.IS', 'TUPRS.IS', 'GARAN.IS', 'AKBNK.IS', 'BIMAS.IS', 'KCHOL.IS', 'SISE.IS'];
        const bistRes = await fetch(
          `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${bistSymbols.join(',')}&fields=regularMarketPrice,regularMarketChangePercent`,
          { headers: { 'User-Agent': 'Mozilla/5.0' } }
        );
        if (bistRes.ok) {
          const bistData = await bistRes.json();
          const quotes = bistData?.quoteResponse?.result || [];
          if (quotes.length > 0) {
            lines.push('');
            lines.push('BIST HİSSELERİ (canlı):');
            quotes.forEach((q: any) => {
              const price = q.regularMarketPrice;
              const changePct = q.regularMarketChangePercent;
              const sym = q.symbol.replace('.IS', '');
              if (price) {
                lines.push(`${sym}: ${price.toFixed(2)} TL (${changePct >= 0 ? '+' : ''}${changePct?.toFixed(1) || '0'}%)`);
              }
            });
          }
        }
      } catch { /* skip */ }
    }
  } catch (e) {
    lines.push('Piyasa verileri alınamadı: ' + (e instanceof Error ? e.message : 'bilinmeyen hata'));
  }

  return lines.join('\n');
}

function buildPrompt(portfolio: any, memory?: string, trigger?: string, marketData?: string): string {
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

${marketData || ''}

${memory ? `\n${memory}\n` : ''}
${trigger ? `TETIKLEYICI: ${trigger}\nBu olay bağlamında özel öneriler ver.\n` : ''}
Yukarıdaki GÜNCEL PİYASA VERİLERİNE dayanarak uzun vadeli yatırım analizi yap:
1. Portföyün mevcut durumunu değerlendir (dağılım, risk, getiri)
2. Temettü odaklı 4-6 somut yatırım önerisi ver (BIST + ABD + Avrupa)
3. Her öneri için: sembol, TL tutar, beklenen yıllık getiri, temettü verimi
4. Aylık çekilebilir dinamik maaş hesapla (güvenli + dengeli)
5. Portföy dengeleme önerisi (fazla olan azalt, eksik olan artır)
6. Uzun vadeli servet biriktirme tavsiyesi ver
7. Portföyü etkileyen güncel haberleri belirt`;
}
