import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * Fiyat proxy — tarayıcının CORS nedeniyle doğrudan çağıramadığı API'leri proxy'ler.
 *
 * GET /api/price-proxy?type=bist&symbols=THYAO,ASELS,AKSEN
 * GET /api/price-proxy?type=us&symbols=NVDA,AAPL
 * GET /api/price-proxy?type=european&symbols=ASML
 * GET /api/price-proxy?type=usd
 * GET /api/price-proxy?type=eur
 * GET /api/price-proxy?type=gold
 * GET /api/price-proxy?type=silver
 * GET /api/price-proxy?type=crypto&symbols=BTC,ETH
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 's-maxage=15, stale-while-revalidate=30');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const type = req.query.type as string;
  const symbols = (req.query.symbols as string || '').split(',').filter(Boolean);

  try {
    switch (type) {
      case 'bist': {
        const yahooSymbols = symbols.map(s => s + '.IS').join(',');
        const data = await fetchYahoo(yahooSymbols);
        const result: Record<string, any> = {};
        for (const q of data) {
          if (q.regularMarketPrice == null) continue;
          const sym = q.symbol.replace('.IS', '');
          result[sym] = { price: q.regularMarketPrice, change: q.regularMarketChangePercent || 0 };
        }
        return res.json({ success: true, data: result });
      }

      case 'us': {
        const data = await fetchYahoo(symbols.join(','));
        const result: Record<string, any> = {};
        for (const q of data) {
          if (q.regularMarketPrice == null) continue;
          result[q.symbol] = { price: q.regularMarketPrice, change: q.regularMarketChangePercent || 0 };
        }
        return res.json({ success: true, data: result });
      }

      case 'european': {
        // Avrupa hisseleri Yahoo ticker formatları
        const euroTickers: Record<string, string> = {
          ASML: 'ASML.AS', LVMH: 'MC.PA', SAP: 'SAP.DE', TTE: 'TTE.PA',
          OR: 'OR.PA', SAN: 'SAN.PA', AIR: 'AIR.PA', SU: 'SU.PA',
          NOKIA: 'NOKIA.HE', BMW: 'BMW.DE', SIE: 'SIE.DE', ADYEN: 'ADYEN.AS', PROSUS: 'PRX.AS',
          V3YL: 'V3YL.DE',
        };
        const tickers = symbols.map(s => euroTickers[s] || s).join(',');
        const data = await fetchYahoo(tickers);
        const result: Record<string, any> = {};
        for (const q of data) {
          if (q.regularMarketPrice == null) continue;
          const origSymbol = Object.entries(euroTickers).find(([, v]) => v === q.symbol)?.[0] || q.symbol;
          result[origSymbol] = { price: q.regularMarketPrice, change: q.regularMarketChangePercent || 0 };
        }
        return res.json({ success: true, data: result });
      }

      case 'usd': {
        const rate = await fetchFXRate('USD');
        return res.json({ success: true, data: { rate } });
      }

      case 'eur': {
        const rate = await fetchFXRate('EUR');
        return res.json({ success: true, data: { rate } });
      }

      case 'gold': {
        const usdTry = await fetchFXRate('USD');
        const goldOz = await fetchMetalPrice('gold');
        const pricePerGramTRY = goldOz ? (goldOz / 31.1035) * usdTry : null;
        return res.json({ success: true, data: { pricePerOz: goldOz, pricePerGramTRY } });
      }

      case 'silver': {
        const usdTry = await fetchFXRate('USD');
        const silverOz = await fetchMetalPrice('silver');
        const pricePerGramTRY = silverOz ? (silverOz / 31.1035) * usdTry : null;
        return res.json({ success: true, data: { pricePerOz: silverOz, pricePerGramTRY } });
      }

      case 'crypto': {
        const binanceSymbols = symbols.map(s => `"${s}USDT"`).join(',');
        const cryptoRes = await fetch(`https://api.binance.com/api/v3/ticker/price?symbols=[${binanceSymbols}]`);
        if (cryptoRes.ok) {
          const data = await cryptoRes.json();
          const result: Record<string, number> = {};
          for (const c of data) {
            result[c.symbol.replace('USDT', '')] = parseFloat(c.price);
          }
          return res.json({ success: true, data: result });
        }
        return res.json({ success: false, error: 'Binance failed' });
      }

      case 'benchmark-history': {
        // GET /api/price-proxy?type=benchmark-history&symbol=^XU100&days=30
        const symbol = (req.query.symbol as string) || '^XU100';
        const days = Math.max(1, Math.min(3650, parseInt(req.query.days as string) || 30));
        const range = days <= 7 ? '7d' : days <= 30 ? '1mo' : days <= 90 ? '3mo' : days <= 180 ? '6mo' : days <= 365 ? '1y' : days <= 1825 ? '5y' : 'max';
        const r = await fetch(
          `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=${range}`,
          { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(8000) }
        );
        if (!r.ok) return res.json({ success: false, error: `Yahoo ${r.status}` });
        const d = await r.json();
        const result = d?.chart?.result?.[0];
        const timestamps: number[] = result?.timestamp || [];
        const closes: (number | null)[] = result?.indicators?.quote?.[0]?.close || [];
        const series = timestamps
          .map((ts, i) => ({
            date: new Date(ts * 1000).toISOString().split('T')[0],
            value: closes[i],
          }))
          .filter(p => p.value != null && isFinite(p.value as number));
        return res.json({ success: true, data: { symbol, series } });
      }

      case 'tefas': {
        // GET /api/price-proxy?type=tefas&code=IPV
        // TEFAS resmi BindHistoryInfo endpoint'i — son 7 günün son satırından fiyat
        const code = ((req.query.code as string) || '').toUpperCase().trim();
        if (!code) return res.status(400).json({ error: 'code parametresi gerekli' });

        const today = new Date();
        const start = new Date(today); start.setDate(today.getDate() - 7);
        const fmt = (d: Date) =>
          `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;

        const body = new URLSearchParams({
          fontip: 'YAT',
          sfontur: '',
          fonkod: code,
          fongrup: '',
          bastarih: fmt(start),
          bittarih: fmt(today),
          fonturkod: '',
          fonunvantip: '',
        });

        const r = await fetch('https://www.tefas.gov.tr/api/DB/BindHistoryInfo', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'X-Requested-With': 'XMLHttpRequest',
            'Accept': 'application/json, text/javascript, */*; q=0.01',
            'Accept-Language': 'tr-TR,tr;q=0.9,en;q=0.8',
            'Origin': 'https://www.tefas.gov.tr',
            'Referer': 'https://www.tefas.gov.tr/TarihselVeriler.aspx',
          },
          body,
          signal: AbortSignal.timeout(10000),
        });

        if (!r.ok) {
          return res.json({ success: false, status: r.status, error: `TEFAS upstream ${r.status}` });
        }

        const ct = r.headers.get('content-type') || '';
        if (!ct.includes('json')) {
          const text = (await r.text()).slice(0, 200);
          return res.json({ success: false, error: 'TEFAS non-JSON response (bot block?)', preview: text });
        }

        const d = await r.json();
        const rows = (d?.data || []) as any[];
        if (rows.length === 0) {
          return res.json({ success: false, code, error: 'TEFAS rows=0 (kod bulunamadı veya tarih aralığında veri yok)' });
        }
        // Son satır en güncel
        const latest = rows[rows.length - 1];
        return res.json({
          success: true,
          code,
          price: Number(latest.FIYAT),
          date: latest.TARIH,
          name: latest.FONUNVAN,
          rowCount: rows.length,
        });
      }

      default:
        return res.status(400).json({ error: 'Invalid type. Use: bist, us, european, usd, eur, gold, silver, crypto, tefas, benchmark-history' });
    }
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
}

async function fetchYahoo(symbols: string): Promise<any[]> {
  // v7 first
  try {
    const r = await fetch(
      `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${symbols}&fields=regularMarketPrice,regularMarketChangePercent`,
      { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(8000) }
    );
    if (r.ok) {
      const d = await r.json();
      if (d?.quoteResponse?.result?.length > 0) return d.quoteResponse.result;
    }
  } catch { /* try v8 */ }

  // v8 fallback — tek tek
  const results: any[] = [];
  for (const sym of symbols.split(',')) {
    try {
      const r = await fetch(
        `https://query1.finance.yahoo.com/v8/finance/chart/${sym}?interval=1d&range=1d`,
        { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(5000) }
      );
      if (r.ok) {
        const d = await r.json();
        const price = d?.chart?.result?.[0]?.meta?.regularMarketPrice;
        if (price) results.push({ symbol: sym, regularMarketPrice: price, regularMarketChangePercent: 0 });
      }
    } catch { /* skip */ }
  }
  return results;
}

async function fetchFXRate(currency: string): Promise<number> {
  try {
    const r = await fetch(`https://open.er-api.com/v6/latest/${currency}`, { signal: AbortSignal.timeout(5000) });
    if (r.ok) {
      const d = await r.json();
      return d.rates?.TRY || (currency === 'USD' ? 44 : 51);
    }
  } catch { /* fallback */ }
  return currency === 'USD' ? 44 : 51;
}

async function fetchMetalPrice(metal: string): Promise<number | null> {
  try {
    const r = await fetch(`https://api.metals.live/v1/spot/${metal}`, { signal: AbortSignal.timeout(5000) });
    if (r.ok) {
      const d = await r.json();
      return d[0]?.price || null;
    }
  } catch { /* skip */ }

  // Yahoo fallback
  try {
    const sym = metal === 'gold' ? 'GC=F' : 'SI=F';
    const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${sym}?interval=1d&range=1d`, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(5000) });
    if (r.ok) {
      const d = await r.json();
      return d?.chart?.result?.[0]?.meta?.regularMarketPrice || null;
    }
  } catch { /* skip */ }
  return null;
}
