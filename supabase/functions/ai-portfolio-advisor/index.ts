import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface HoldingData {
  symbol: string;
  asset_type: string;
  quantity: number;
  purchase_price: number;
  current_price: number;
  total_value: number;
  pnl: number;
  pnl_percent: number;
  weight: number;
}

interface PortfolioData {
  holdings: HoldingData[];
  total_value: number;
  total_invested: number;
  total_pnl: number;
  total_pnl_percent: number;
  cash_balance: number;
  risk_score: number;
}

interface AIRequest {
  portfolio: PortfolioData;
  question: string;
  conversationHistory?: Array<{ role: string; content: string }>;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { portfolio, question, conversationHistory = [] }: AIRequest = await req.json();

    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!anthropicKey) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Claude API key not configured',
          fallback: true,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const systemPrompt = buildSystemPrompt(portfolio);

    const messages = [
      ...conversationHistory.slice(-6).map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
      { role: 'user' as const, content: question },
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
      return new Response(
        JSON.stringify({
          success: false,
          error: 'AI service temporarily unavailable',
          fallback: true,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    const aiResponse = data.content[0].text;

    return new Response(
      JSON.stringify({
        success: true,
        response: aiResponse,
        model: 'claude-sonnet-4-20250514',
        timestamp: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message, fallback: true }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

function buildSystemPrompt(portfolio: PortfolioData): string {
  const { holdings, total_value, total_invested, total_pnl_percent, cash_balance, risk_score } = portfolio;

  const byType: Record<string, { count: number; value: number; pnl: number }> = {};
  holdings.forEach(h => {
    if (!byType[h.asset_type]) byType[h.asset_type] = { count: 0, value: 0, pnl: 0 };
    byType[h.asset_type].count++;
    byType[h.asset_type].value += h.total_value;
    byType[h.asset_type].pnl += h.pnl;
  });

  const typeNames: Record<string, string> = {
    stock: 'Hisse', crypto: 'Kripto', currency: 'Döviz',
    fund: 'Fon', eurobond: 'Eurobond', commodity: 'Emtia', cash: 'Nakit',
  };

  const distribution = Object.entries(byType)
    .sort((a, b) => b[1].value - a[1].value)
    .map(([type, d]) => `${typeNames[type] || type}: ${d.count} adet, ${d.value.toFixed(0)} TL (%${((d.value / total_value) * 100).toFixed(1)}), KZ: ${d.pnl.toFixed(0)} TL`)
    .join('\n');

  const topHoldings = [...holdings]
    .sort((a, b) => b.total_value - a.total_value)
    .slice(0, 10)
    .map(h => `${h.symbol} (${typeNames[h.asset_type] || h.asset_type}): ${h.quantity} adet, Alış: ${h.purchase_price.toFixed(2)} TL, Güncel: ${h.current_price.toFixed(2)} TL, Değer: ${h.total_value.toFixed(0)} TL, KZ: ${h.pnl >= 0 ? '+' : ''}${h.pnl.toFixed(0)} TL (%${h.pnl_percent >= 0 ? '+' : ''}${h.pnl_percent.toFixed(1)}), Ağırlık: %${h.weight.toFixed(1)}`)
    .join('\n');

  const winners = holdings.filter(h => h.pnl_percent > 0).sort((a, b) => b.pnl_percent - a.pnl_percent).slice(0, 3);
  const losers = holdings.filter(h => h.pnl_percent < 0).sort((a, b) => a.pnl_percent - b.pnl_percent).slice(0, 3);

  return `Sen profesyonel bir Türk yatırım danışmanısın. Kullanıcının portföyünü analiz edip kişiselleştirilmiş, uygulanabilir öneriler sunuyorsun.

KURALLAR:
- Her zaman Türkçe yanıtla
- Somut, uygulanabilir öneriler ver (hangi varlık, ne kadar, neden)
- Risk uyarılarını açıkça belirt
- Yatırım tavsiyesi verirken "yatırım tavsiyesi değildir" disclaimer'ı kullanma - kullanıcı zaten biliyor
- Kısa ve öz ol, gereksiz açıklama yapma
- Emoji kullan ama abartma
- Fiyat ve yüzde bilgilerini portföy verisinden al, uydurma

KULLANICININ PORTFÖYÜ:
Toplam Değer: ${total_value.toFixed(0)} TL
Toplam Yatırım: ${total_invested.toFixed(0)} TL
Toplam KZ: %${total_pnl_percent >= 0 ? '+' : ''}${total_pnl_percent.toFixed(1)} (${(total_value - total_invested).toFixed(0)} TL)
Nakit: ${cash_balance.toFixed(0)} TL
Risk Skoru: ${risk_score}/100
Pozisyon Sayısı: ${holdings.length}

VARLIK DAĞILIMI:
${distribution}

EN BÜYÜK POZİSYONLAR:
${topHoldings}

EN KARLI: ${winners.map(w => `${w.symbol} %+${w.pnl_percent.toFixed(1)}`).join(', ') || 'Yok'}
EN ZARARLI: ${losers.map(l => `${l.symbol} %${l.pnl_percent.toFixed(1)}`).join(', ') || 'Yok'}`;
}
