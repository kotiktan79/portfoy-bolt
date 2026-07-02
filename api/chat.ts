import type { VercelRequest, VercelResponse } from '@vercel/node';

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
    const { portfolio, question, conversationHistory = [] } = req.body;

    const systemPrompt = buildSystemPrompt(portfolio);

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
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1500,
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
      model: 'claude-sonnet-4-20250514',
    });
  } catch (error: any) {
    console.error('Error:', error);
    return res.status(200).json({ success: false, fallback: true, error: error.message });
  }
}

function buildSystemPrompt(portfolio: any): string {
  if (!portfolio || !portfolio.holdings) {
    return 'Sen profesyonel bir Türk yatırım danışmanısın. Kullanıcının sorularını Türkçe yanıtla.';
  }

  const { holdings, total_value, total_invested, total_pnl_percent, cash_balance, risk_score } = portfolio;

  const typeNames: Record<string, string> = {
    stock: 'Hisse', crypto: 'Kripto', currency: 'Döviz',
    fund: 'Fon', eurobond: 'Eurobond', commodity: 'Emtia', cash: 'Nakit',
  };

  const byType: Record<string, { count: number; value: number; pnl: number }> = {};
  holdings.forEach((h: any) => {
    if (!byType[h.asset_type]) byType[h.asset_type] = { count: 0, value: 0, pnl: 0 };
    byType[h.asset_type].count++;
    byType[h.asset_type].value += h.total_value;
    byType[h.asset_type].pnl += h.pnl;
  });

  const distribution = Object.entries(byType)
    .sort((a: any, b: any) => b[1].value - a[1].value)
    .map(([type, d]: [string, any]) => `${typeNames[type] || type}: ${d.count} adet, ${d.value.toFixed(0)} TL (%${((d.value / total_value) * 100).toFixed(1)})`)
    .join('\n');

  const topHoldings = [...holdings]
    .sort((a: any, b: any) => b.total_value - a.total_value)
    .slice(0, 10)
    .map((h: any) => `${h.symbol} (${typeNames[h.asset_type] || h.asset_type}): ${h.quantity} adet, Alış: ${h.purchase_price.toFixed(2)}₺, Güncel: ${h.current_price.toFixed(2)}₺, KZ: ${h.pnl >= 0 ? '+' : ''}${h.pnl.toFixed(0)}₺ (%${h.pnl_percent.toFixed(1)}), Ağırlık: %${h.weight.toFixed(1)}`)
    .join('\n');

  return `Sen profesyonel bir yatırım danışmanısın. Kullanıcının portföyünü analiz edip kişiselleştirilmiş öneriler sunuyorsun.

KURALLAR:
- Türkçe yanıtla, somut ve öz ol, portföy verilerinden gerçek rakam kullan

MÜŞTERİ PROFİLİ & POLİTİKA (kaynak: src/config/portfolioPolicy.ts — değişirse burayı da güncelle):
- Romanya'da yerleşik (AB), getiriyi USD bazında ölçer, 10+ yıl ufuk, ORTA risk (kötü yıl maks ~−%20), gelir = DİNAMİK MAAŞ (reel büyümenin %85'i; sabit $2000/ay ancak ~$600K portföyde sürdürülebilir).
- HEDEF DAĞILIM: %50 global hisse · %30 USD/hard-currency tahvil (IB01/eurobond) · %10 altın · %5 kripto · %5 likit nakit.
- KISITLAR: Hisse için GLOBAL ETF (V3YL) tercih, tek-tek hisse yığını önerme · Türk varlıklarını (BIST/TEFAS/TRY) ARTIRMA, azalt (yabancı EM+kur riski) · ALTIN FİZİKİ, satma önerme · İrlanda-UCITS ETF tercih · yeni para deposit=kâr değil · geçmiş işlemlere "hata" deme.

PORTFÖY:
Toplam Değer: ${total_value?.toFixed(0) || 0} TL
Yatırım: ${total_invested?.toFixed(0) || 0} TL
KZ: %${total_pnl_percent?.toFixed(1) || 0}
Nakit: ${cash_balance?.toFixed(0) || 0} TL
Risk: ${risk_score || 50}/100
Pozisyon: ${holdings.length}

DAĞILIM:
${distribution}

POZİSYONLAR:
${topHoldings}`;
}
