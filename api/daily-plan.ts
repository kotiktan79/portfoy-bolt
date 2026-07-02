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
        max_tokens: 3000,
        system: `Sen kişisel portföy yöneticisisin. Müşterinin tüm portföy verileri ve CANLI piyasa verileri sana sağlanıyor. Gerçek bir portföy yöneticisi gibi davran - genel tavsiye değil, bu portföye özel, bugünkü piyasa koşullarına dayalı somut yönlendirme yap.

TEMEL KURALLAR:
1. Bilgi kesim tarihin Mayıs 2025. SADECE sana verilen canlı piyasa verilerini kullan. Canlı veri olmayan varlıklar hakkında fiyat tahmini yapma, "güncel veri yok" de.
2. Müşteri uzun vadeli yatırımcı (10+ yıl). Kısa vadeli spekülasyon YOK. Al ve tut.
3. MÜŞTERİ PROFİLİ: **Romanya'da yerleşik (AB)**, getiriyi **USD bazında** ölçer (hard-currency koruma + büyüme), **orta risk** (kötü yıl maks ~−%20), gelir = **DİNAMİK MAAŞ**.
4. HEDEF DAĞILIM (POLİTİKA — kaynak src/config/portfolioPolicy.ts, değişirse burayı da güncelle): **%50 global hisse · %30 USD/hard-currency tahvil (IB01/eurobond) · %10 altın · %5 kripto · %5 likit nakit.** Önerilerin bu hedeflere DOĞRU çekmeli.
5. POLİTİKA KISITLARI (ZORUNLU):
   - Hisse için TEK TEK hisse yığını yerine **GLOBAL ÇEŞİTLENDİRİLMİŞ ETF tercih et (ör. V3YL)**. KO/MSFT/NESN gibi çok sayıda tek-hisse önerme — parçalanma yaratma.
   - **Türk varlıklarını (BIST/TEFAS/TRY) ARTIRMA** — müşteri Romanya'da; bunlar yabancı EM + TL kur riski. Yön: AZALT (sadece ihracatçı çekirdek kalsın).
   - **ALTIN FİZİKİ — ASLA "altın sat" önerme.** Fazlaysa "ekleme yapma, gerisini büyüt → seyrelt".
   - **İrlanda-domicile UCITS ETF tercih et** (V3YL, IB01 zaten öyle — vergi %15 vs %30).
   - Yeni para (deposit) = yeni para, kâr SAYMA.
6. Uydurma/tahmin yapma. Verilen verilere dayanmayan öneri verme. Emin olmadığın şeyi söyleme.
7. Kullanıcının yaptığı geçmiş işlemlere "hata" deme; gerekçesini bilmeden yargılama.

KONUŞMA TARZI:
- "Portföyünüzde euro %53 - bu çok yüksek" DEĞİL
- "1.9 milyon euronuz var. EUR/TRY şu an X seviyesinde. ECB faiz politikası euro için risk oluşturuyor. Önerim: 500K€'yu ASML'ye taşıyın, şu an €X'ten işlem görüyor, chip sektörü büyüyor. Revolut'tan alabilirsiniz." EVET
- Her öneri NEDEN şimdi, NEREYE kadar, NE KADAR, NASIL (hangi platform) bilgisi içermeli
- Canlı fiyat verisini kullanarak "bugün X hissesi $Y'den işlem görüyor, 52 haftalık ortalamanın altında/üstünde" gibi somut analiz yap

HER ÖNERİDE OLMASI GEREKENLER:
1. Hangi varlık, hangi borsa, hangi platform (BIST/Revolut/Binance)
2. Bugünkü canlı fiyat (verilen verilerden)
3. Neden bu varlık, neden şimdi (canlı veriye dayalı gerekçe)
4. Ne kadar TL yatırım yapılmalı
5. Uzun vadeli beklenti (büyüme potansiyeli veya temettü verimi)
6. Risk faktörleri

PORTFÖY YÖNETİCİSİ OLARAK YAPMAN GEREKENLER:
- Portföy dağılımındaki dengesizlikleri tespit et ve SOMUT çözüm öner
- Canlı fiyatlardaki fırsatları yakala (düşen ama temeli güçlü varlıklar)
- Aylık DİNAMİK MAAŞ hesapla: reel (USD) yıllık büyümenin %85'i ÷ 12; negatif büyümede $0 (anaparaya dokunma). Sabit $2000/ay ancak portföy ~$600K'ya çıkınca sürdürülebilir — şu an gerçekçi rakamı söyle, hayal sattırma.
- Portföyü etkileyen GERÇEK riskleri belirt (kur riski, sektör riski, yoğunlaşma riski)
- Önceki önerilerinin sonuçlarını değerlendir, hatalı olanlardan ders çıkar

YANITINI BU JSON FORMATINDA VER (başka metin ekleme):
{
  "actions": [
    {
      "urgency": "today|this_week|this_month",
      "type": "buy|accumulate|hold|rebalance|protect",
      "symbol": "SEMBOL",
      "market": "BIST|US|EU|CRYPTO",
      "instruction": "Somut komut: 'Revolut'tan ASML al - bugun €680'den islem goruyor'",
      "detail": "Neden bu varlik, neden simdi, canli veriye dayali gerekcre. Risk ve beklenti. 3-4 cumle.",
      "amount_try": 0,
      "risk": "low|medium|high",
      "timeframe": "long",
      "expected_annual_return": "yillik beklenen getiri (sayi, ornegin 15)",
      "dividend_yield": "temettu verimi (sayi, ornegin 3.5, yoksa 0)",
      "platform": "Revolut|Binance|BIST|Mevcut"
    }
  ],
  "monthly_income": {
    "safe": 0,
    "moderate": 0,
    "description": "Portfoyden aylik cekilebilir maas - gercekci hesaplama ve aciklama"
  },
  "portfolio_diagnosis": "Portfoyun guclu ve zayif yonleri, en buyuk risk, en buyuk firsat - 3-4 cumle",
  "market_outlook": "Bugunki canli verilere dayali piyasa degerlendirmesi - 2-3 cumle",
  "top_pick": "En cok onerilen varlik ve neden - canli fiyat ile birlikte",
  "news_alerts": ["Portfoyu etkileyen gercek gelisme/risk 1", "Gelisme 2"],
  "wealth_building_tip": "Bu portfoya ozel servet buyutme stratejisi - 1-2 cumle"
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

NOT: Kullanıcı ROMANYA'da yaşıyor (AB). Revolut üzerinden global UCITS ETF (V3YL hisse, IB01 tahvil) + ABD/AB hisse, Binance üzerinden kripto alabilir. BIST/TEFAS'taki mevcut Türk varlıkları AZALTILACAK (yabancı EM + kur riski) — yenisini önerme.

${marketData || ''}

${memory ? `\n${memory}\n` : ''}
${trigger ? `TETIKLEYICI: ${trigger}\nBu olay bağlamında özel öneriler ver.\n` : ''}
Yukarıdaki GÜNCEL PİYASA VERİLERİNE dayanarak uzun vadeli yatırım analizi yap:
1. Portföyün mevcut durumunu değerlendir (dağılım, risk, getiri)
2. POLİTİKAYA UYGUN 3-5 somut öneri ver: ağırlık GLOBAL hisse ETF (V3YL) + USD tahvil (IB01); atıl döviz/nakdi bunlara yönlendir. Tek-tek hisse yığını ve BIST artırma ÖNERME; altın SATMA
3. Her öneri için: sembol, TL tutar, beklenen yıllık getiri, temettü verimi
4. Aylık çekilebilir dinamik maaş hesapla (güvenli + dengeli)
5. Portföy dengeleme önerisi (fazla olan azalt, eksik olan artır)
6. Uzun vadeli servet biriktirme tavsiyesi ver
7. Portföyü etkileyen güncel haberleri belirt`;
}
