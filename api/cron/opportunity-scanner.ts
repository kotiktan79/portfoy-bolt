import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Supabase credentials missing');
  return createClient(url, key);
}

interface Opportunity {
  type: 'oversold' | 'near_52w_low' | 'high_dividend' | 'crypto_dip' | 'discount';
  symbol: string;
  market: string;
  price: number;
  signal: string;
  detail: string;
  confidence: 'high' | 'medium' | 'low';
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers.authorization !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const opportunities: Opportunity[] = [];

    // Watchlist — kullanıcının portföyündeki + takip ettiği semboller
    const supabase = getSupabase();
    const { data: holdings } = await supabase.from('holdings').select('symbol, asset_type');
    const userSymbols = new Set(holdings?.map(h => h.symbol.toUpperCase()) || []);

    // ============================================
    // 1. BIST Fırsatları — 52h dip yakını + RSI düşük
    // ============================================
    const bistSymbols = [
      'THYAO.IS', 'ASELS.IS', 'TUPRS.IS', 'GARAN.IS', 'AKBNK.IS', 'BIMAS.IS',
      'KCHOL.IS', 'SISE.IS', 'SAHOL.IS', 'EREGL.IS', 'FROTO.IS', 'TOASO.IS',
      'PGSUS.IS', 'TCELL.IS', 'HEKTS.IS', 'KOZAL.IS', 'VESTL.IS', 'MGROS.IS',
    ];

    try {
      const bistRes = await fetch(
        `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${bistSymbols.join(',')}&fields=regularMarketPrice,regularMarketChangePercent,fiftyTwoWeekLow,fiftyTwoWeekHigh,trailingAnnualDividendYield`,
        { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(8000) }
      );
      if (bistRes.ok) {
        const data = await bistRes.json();
        for (const q of data?.quoteResponse?.result || []) {
          const sym = q.symbol.replace('.IS', '');
          const price = q.regularMarketPrice;
          const low52 = q.fiftyTwoWeekLow;
          const high52 = q.fiftyTwoWeekHigh;
          const divYield = (q.trailingAnnualDividendYield || 0) * 100;

          if (!price || !low52 || !high52) continue;

          const distFromLow = ((price - low52) / low52) * 100;
          const posInRange = ((price - low52) / (high52 - low52)) * 100;

          // 52h dipten %10 mesafede
          if (distFromLow <= 10 && posInRange <= 15) {
            opportunities.push({
              type: 'near_52w_low',
              symbol: sym,
              market: 'BIST',
              price,
              signal: `52h dip yakını: ${low52.toFixed(2)} TL (şu an %${distFromLow.toFixed(1)} üstünde)`,
              detail: `52h aralık: ${low52.toFixed(2)}-${high52.toFixed(2)} TL. Pozisyon: %${posInRange.toFixed(0)}.${userSymbols.has(sym) ? ' [PORTFÖYÜNDE]' : ''}`,
              confidence: distFromLow <= 5 ? 'high' : 'medium',
            });
          }

          // Yüksek temettü
          if (divYield >= 5) {
            opportunities.push({
              type: 'high_dividend',
              symbol: sym,
              market: 'BIST',
              price,
              signal: `Temettü verimi: %${divYield.toFixed(1)}`,
              detail: `Fiyat: ${price.toFixed(2)} TL. Pasif gelir fırsatı.${userSymbols.has(sym) ? ' [PORTFÖYÜNDE]' : ''}`,
              confidence: divYield >= 8 ? 'high' : 'medium',
            });
          }
        }
      }
    } catch { /* skip */ }

    // ============================================
    // 2. ABD Hisse Fırsatları
    // ============================================
    const usSymbols = [
      'NVDA', 'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'TSLA',
      'JNJ', 'KO', 'PG', 'O', 'SCHD', 'VZ', 'T', 'ABBV',
      'JPM', 'V', 'ASML', 'WMT', 'MCD',
    ];

    try {
      const usRes = await fetch(
        `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${usSymbols.join(',')}&fields=regularMarketPrice,regularMarketChangePercent,fiftyTwoWeekLow,fiftyTwoWeekHigh,trailingAnnualDividendYield`,
        { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(8000) }
      );
      if (usRes.ok) {
        const data = await usRes.json();
        for (const q of data?.quoteResponse?.result || []) {
          const price = q.regularMarketPrice;
          const low52 = q.fiftyTwoWeekLow;
          const high52 = q.fiftyTwoWeekHigh;
          const divYield = (q.trailingAnnualDividendYield || 0) * 100;
          const changePct = q.regularMarketChangePercent || 0;

          if (!price || !low52 || !high52) continue;

          const posInRange = ((price - low52) / (high52 - low52)) * 100;

          // 52h dipten %15 mesafe + kaliteli hisse
          if (posInRange <= 20) {
            opportunities.push({
              type: 'near_52w_low',
              symbol: q.symbol,
              market: 'US',
              price,
              signal: `52h aralığın alt %${posInRange.toFixed(0)}'inde ($${low52.toFixed(2)}-$${high52.toFixed(2)})`,
              detail: `Fiyat: $${price.toFixed(2)} (${changePct >= 0 ? '+' : ''}${changePct.toFixed(1)}%).${userSymbols.has(q.symbol) ? ' [PORTFÖYÜNDE]' : ''}`,
              confidence: posInRange <= 10 ? 'high' : 'medium',
            });
          }

          // Temettü aristokratları
          if (divYield >= 3 && ['JNJ', 'KO', 'PG', 'O', 'VZ', 'T', 'ABBV', 'MCD'].includes(q.symbol)) {
            opportunities.push({
              type: 'high_dividend',
              symbol: q.symbol,
              market: 'US',
              price,
              signal: `Temettü aristokratı, verim: %${divYield.toFixed(1)}`,
              detail: `Fiyat: $${price.toFixed(2)}. Güvenli pasif gelir.${userSymbols.has(q.symbol) ? ' [PORTFÖYÜNDE]' : ''}`,
              confidence: 'high',
            });
          }
        }
      }
    } catch { /* skip */ }

    // ============================================
    // 3. Kripto Fırsatları — 24s dip
    // ============================================
    try {
      const cryptoSymbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT', 'LINKUSDT', 'ADAUSDT', 'AVAXUSDT', 'DOTUSDT', 'SUIUSDT'];
      let cryptoEntries: Array<{ sym: string; price: number; changePct: number; lowPrice: number; highPrice: number }> = [];

      // Binance dene
      const cryptoRes = await fetch(
        `https://api.binance.com/api/v3/ticker/24hr?symbols=${JSON.stringify(cryptoSymbols)}`,
        { signal: AbortSignal.timeout(5000) }
      );
      if (cryptoRes.ok) {
        const data = await cryptoRes.json();
        for (const c of data) {
          cryptoEntries.push({
            sym: c.symbol.replace('USDT', ''),
            price: parseFloat(c.lastPrice),
            changePct: parseFloat(c.priceChangePercent),
            lowPrice: parseFloat(c.lowPrice),
            highPrice: parseFloat(c.highPrice),
          });
        }
      } else {
        // CoinGecko fallback
        const cgIds: Record<string, string> = {
          BTC: 'bitcoin', ETH: 'ethereum', SOL: 'solana', BNB: 'binancecoin',
          XRP: 'ripple', LINK: 'chainlink', ADA: 'cardano', AVAX: 'avalanche-2',
          DOT: 'polkadot', SUI: 'sui',
        };
        const ids = Object.values(cgIds).join(',');
        const cgRes = await fetch(
          `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true`,
          { signal: AbortSignal.timeout(5000) }
        );
        if (cgRes.ok) {
          const cgData = await cgRes.json();
          const idToSym: Record<string, string> = {};
          for (const [sym, id] of Object.entries(cgIds)) idToSym[id] = sym;
          for (const [id, info] of Object.entries(cgData)) {
            const sym = idToSym[id];
            if (sym) {
              const p = (info as any).usd || 0;
              cryptoEntries.push({
                sym,
                price: p,
                changePct: (info as any).usd_24h_change || 0,
                lowPrice: p,
                highPrice: p,
              });
            }
          }
        }
      }

      for (const { sym, price, changePct, lowPrice, highPrice } of cryptoEntries) {
        // %8+ düşüş = flash dip
        if (changePct <= -8) {
          opportunities.push({
            type: 'crypto_dip',
            symbol: sym,
            market: 'CRYPTO',
            price,
            signal: `24s düşüş: %${changePct.toFixed(1)} — flash dip!`,
            detail: `$${price.toFixed(2)} (24s aralık: $${lowPrice.toFixed(2)}-$${highPrice.toFixed(2)}).${userSymbols.has(sym) ? ' [PORTFÖYÜNDE]' : ''}`,
            confidence: changePct <= -15 ? 'high' : 'medium',
          });
        }

        // %5-8 düşüş = ilginç
        if (changePct <= -5 && changePct > -8) {
          opportunities.push({
            type: 'crypto_dip',
            symbol: sym,
            market: 'CRYPTO',
            price,
            signal: `24s düşüş: %${changePct.toFixed(1)}`,
            detail: `$${price.toFixed(2)}. Kademeli alım fırsatı olabilir.${userSymbols.has(sym) ? ' [PORTFÖYÜNDE]' : ''}`,
            confidence: 'low',
          });
        }
      }
    } catch { /* skip */ }

    // ============================================
    // 4. Altın fırsatı
    // ============================================
    try {
      const goldRes = await fetch('https://api.metals.live/v1/spot/gold', { signal: AbortSignal.timeout(5000) });
      if (goldRes.ok) {
        const goldData = await goldRes.json();
        const goldPrice = goldData[0]?.price;
        // Son fiyattan %3+ düşüş varsa fırsat
        const { data: lastGold } = await supabase
          .from('price_history')
          .select('price')
          .ilike('symbol', '%gold%')
          .order('recorded_at', { ascending: false })
          .limit(1);

        if (goldPrice && lastGold?.[0]?.price) {
          const goldChange = ((goldPrice - Number(lastGold[0].price)) / Number(lastGold[0].price)) * 100;
          if (goldChange <= -2) {
            opportunities.push({
              type: 'discount',
              symbol: 'GOLD',
              market: 'COMMODITY',
              price: goldPrice,
              signal: `Altın %${goldChange.toFixed(1)} düştü`,
              detail: `$${goldPrice.toFixed(0)}/oz. Güvenli liman varlığı indirimde.`,
              confidence: goldChange <= -5 ? 'high' : 'medium',
            });
          }
        }
      }
    } catch { /* skip */ }

    // Sonuçları sırala: high confidence önce
    const confidenceOrder = { high: 0, medium: 1, low: 2 };
    opportunities.sort((a, b) => confidenceOrder[a.confidence] - confidenceOrder[b.confidence]);

    return res.status(200).json({
      success: true,
      scan_time: new Date().toISOString(),
      total_opportunities: opportunities.length,
      by_type: {
        near_52w_low: opportunities.filter(o => o.type === 'near_52w_low').length,
        high_dividend: opportunities.filter(o => o.type === 'high_dividend').length,
        crypto_dip: opportunities.filter(o => o.type === 'crypto_dip').length,
        discount: opportunities.filter(o => o.type === 'discount').length,
      },
      opportunities,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
}
