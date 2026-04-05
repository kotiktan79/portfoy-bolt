import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface CacheEntry {
  data: unknown;
  timestamp: number;
}

const cache = new Map<string, CacheEntry>();
const CACHE_DURATION_SHORT = 15000;
const CACHE_DURATION_MEDIUM = 30000;
const CACHE_DURATION_LONG = 60000;

function getCached<T>(key: string, duration: number = CACHE_DURATION_MEDIUM): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > duration) {
    cache.delete(key);
    return null;
  }
  return entry.data as T;
}

function setCache(key: string, data: unknown): void {
  if (cache.size > 200) {
    const keysToDelete: string[] = [];
    const now = Date.now();
    for (const [k, v] of cache) {
      if (now - v.timestamp > CACHE_DURATION_LONG) keysToDelete.push(k);
    }
    keysToDelete.forEach(k => cache.delete(k));
    if (cache.size > 200) {
      const oldest = Array.from(cache.keys()).slice(0, 50);
      oldest.forEach(k => cache.delete(k));
    }
  }
  cache.set(key, { data, timestamp: Date.now() });
}

async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 8000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timer);
    return res;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

interface PriceResponse {
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
  cached?: boolean;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const type = url.searchParams.get('type');
    const symbols = url.searchParams.get('symbols')?.split(',').filter(Boolean) || [];

    let result: PriceResponse;

    switch (type) {
      case 'usd':
        result = await fetchUSDTRY();
        break;
      case 'eur':
        result = await fetchEURTRY();
        break;
      case 'gold':
        result = await fetchGold();
        break;
      case 'silver':
        result = await fetchSilver();
        break;
      case 'crypto':
        result = await fetchCrypto(symbols);
        break;
      case 'bist':
        result = await fetchBIST(symbols);
        break;
      case 'european':
        result = await fetchEuropeanStock(symbols[0]);
        break;
      default:
        result = { success: false, error: 'Invalid type parameter' };
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: msg }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function fetchUSDTRY(): Promise<PriceResponse> {
  const cacheKey = 'usd-try-rate';
  const cached = getCached<PriceResponse>(cacheKey, CACHE_DURATION_LONG);
  if (cached) return { ...cached, cached: true };

  try {
    const response = await fetchWithTimeout('https://api.exchangerate-api.com/v4/latest/USD', {}, 6000);
    if (!response.ok) throw new Error(`Status ${response.status}`);
    const data = await response.json();
    if (!data.rates?.TRY) throw new Error('No TRY rate');
    const result: PriceResponse = { success: true, data: { rate: data.rates.TRY } };
    setCache(cacheKey, result);
    return result;
  } catch {
    try {
      const response = await fetchWithTimeout('https://open.er-api.com/v6/latest/USD', {}, 6000);
      if (!response.ok) throw new Error('Alt API failed');
      const data = await response.json();
      const rate = data.rates?.TRY || 38.5;
      const result: PriceResponse = { success: true, data: { rate } };
      setCache(cacheKey, result);
      return result;
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : 'USD/TRY fetch failed' };
    }
  }
}

async function fetchEURTRY(): Promise<PriceResponse> {
  const cacheKey = 'eur-try-rate';
  const cached = getCached<PriceResponse>(cacheKey, CACHE_DURATION_LONG);
  if (cached) return { ...cached, cached: true };

  try {
    const response = await fetchWithTimeout('https://api.exchangerate-api.com/v4/latest/EUR', {}, 6000);
    if (!response.ok) throw new Error(`Status ${response.status}`);
    const data = await response.json();
    if (!data.rates?.TRY) throw new Error('No TRY rate');
    const result: PriceResponse = { success: true, data: { rate: data.rates.TRY } };
    setCache(cacheKey, result);
    return result;
  } catch {
    try {
      const response = await fetchWithTimeout('https://open.er-api.com/v6/latest/EUR', {}, 6000);
      if (!response.ok) throw new Error('Alt API failed');
      const data = await response.json();
      const rate = data.rates?.TRY || 41.5;
      const result: PriceResponse = { success: true, data: { rate } };
      setCache(cacheKey, result);
      return result;
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : 'EUR/TRY fetch failed' };
    }
  }
}

async function getUSDTRYRate(): Promise<number> {
  const result = await fetchUSDTRY();
  return (result.success && result.data?.rate) ? result.data.rate as number : 38.5;
}

async function fetchGold(): Promise<PriceResponse> {
  const cacheKey = 'gold-price';
  const cached = getCached<PriceResponse>(cacheKey, CACHE_DURATION_MEDIUM);
  if (cached) return { ...cached, cached: true };

  const sources = [
    tryTruncgilGold,
    tryCollectAPIGold,
    tryGoldPriceOrg,
    tryMetalsLiveGold,
  ];

  for (const source of sources) {
    try {
      const result = await source();
      if (result) {
        setCache(cacheKey, result);
        return result;
      }
    } catch {
      continue;
    }
  }

  return { success: false, error: 'All gold APIs failed' };
}

async function tryTruncgilGold(): Promise<PriceResponse | null> {
  const response = await fetchWithTimeout('https://finans.truncgil.com/v4/today.json', {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
  }, 6000);

  if (!response.ok) return null;
  const data = await response.json();
  const gramAltin = (data as Array<{ code: string; selling?: string }>).find(item => item.code === 'gram-altin');
  if (!gramAltin?.selling) return null;

  const price = parseFloat(gramAltin.selling);
  if (isNaN(price) || price <= 0) return null;

  return { success: true, data: { pricePerGramTRY: price } };
}

async function tryCollectAPIGold(): Promise<PriceResponse | null> {
  const apiKey = Deno.env.get('COLLECTAPI_KEY');
  if (!apiKey) return null;

  const response = await fetchWithTimeout('https://api.collectapi.com/economy/goldPrice', {
    headers: { 'authorization': `apikey ${apiKey}`, 'content-type': 'application/json' }
  }, 6000);

  if (!response.ok) return null;
  const data = await response.json();
  const gramAltin = (data.result as Array<{ name: string; selling?: string }>)?.find(item =>
    item.name === 'Gram Altin' || item.name === 'Gram Altın'
  );
  if (!gramAltin?.selling) return null;

  const price = parseFloat(gramAltin.selling.replace(',', '.'));
  if (isNaN(price) || price <= 0) return null;

  return { success: true, data: { pricePerGramTRY: price } };
}

async function tryGoldPriceOrg(): Promise<PriceResponse | null> {
  const response = await fetchWithTimeout('https://data-asg.goldprice.org/dbXRates/USD', {}, 6000);
  if (!response.ok) return null;

  const data = await response.json();
  const ozPrice = data.items?.[0]?.xauPrice;
  if (!ozPrice) return null;

  const usdTryRate = await getUSDTRYRate();
  const pricePerGramTRY = (ozPrice / 31.1035) * usdTryRate;

  return { success: true, data: { pricePerOz: ozPrice, pricePerGramTRY } };
}

async function tryMetalsLiveGold(): Promise<PriceResponse | null> {
  const response = await fetchWithTimeout('https://api.metals.live/v1/spot/gold', {}, 6000);
  if (!response.ok) return null;

  const data = await response.json();
  const ozPrice = data[0]?.price || data.price;
  if (!ozPrice) return null;

  const usdTryRate = await getUSDTRYRate();
  const pricePerGramTRY = (ozPrice / 31.1035) * usdTryRate;

  return { success: true, data: { pricePerOz: ozPrice, pricePerGramTRY } };
}

async function fetchSilver(): Promise<PriceResponse> {
  const cacheKey = 'silver-price';
  const cached = getCached<PriceResponse>(cacheKey, CACHE_DURATION_MEDIUM);
  if (cached) return { ...cached, cached: true };

  const sources = [
    tryMetalsLiveSilver,
    tryGoldPriceOrgSilver,
    tryTruncgilSilver,
  ];

  for (const source of sources) {
    try {
      const result = await source();
      if (result) {
        setCache(cacheKey, result);
        return result;
      }
    } catch {
      continue;
    }
  }

  return { success: false, error: 'All silver APIs failed' };
}

async function tryMetalsLiveSilver(): Promise<PriceResponse | null> {
  const response = await fetchWithTimeout('https://api.metals.live/v1/spot/silver', {}, 6000);
  if (!response.ok) return null;

  const data = await response.json();
  const ozPrice = data[0]?.price || data.price;
  if (!ozPrice) return null;

  const usdTryRate = await getUSDTRYRate();
  const pricePerGramTRY = (ozPrice / 31.1035) * usdTryRate;

  return { success: true, data: { pricePerOz: ozPrice, pricePerGramTRY } };
}

async function tryGoldPriceOrgSilver(): Promise<PriceResponse | null> {
  const response = await fetchWithTimeout('https://data-asg.goldprice.org/dbXRates/USD', {}, 6000);
  if (!response.ok) return null;

  const data = await response.json();
  const ozPrice = data.items?.[0]?.xagPrice;
  if (!ozPrice) return null;

  const usdTryRate = await getUSDTRYRate();
  const pricePerGramTRY = (ozPrice / 31.1035) * usdTryRate;

  return { success: true, data: { pricePerOz: ozPrice, pricePerGramTRY } };
}

async function tryTruncgilSilver(): Promise<PriceResponse | null> {
  const response = await fetchWithTimeout('https://finans.truncgil.com/v4/today.json', {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
  }, 6000);

  if (!response.ok) return null;
  const data = await response.json();
  const gramGumus = (data as Array<{ code: string; selling?: string }>).find(item => item.code === 'gram-gumus');
  if (!gramGumus?.selling) return null;

  const price = parseFloat(gramGumus.selling);
  if (isNaN(price) || price <= 0) return null;

  return { success: true, data: { pricePerGramTRY: price } };
}

const CRYPTO_MAP: Record<string, string> = {
  'BTC': 'BTCUSDT', 'ETH': 'ETHUSDT', 'SOL': 'SOLUSDT', 'XRP': 'XRPUSDT',
  'LINK': 'LINKUSDT', 'ADA': 'ADAUSDT', 'AVAX': 'AVAXUSDT', 'DOT': 'DOTUSDT',
  'MATIC': 'MATICUSDT', 'BNB': 'BNBUSDT', 'DOGE': 'DOGEUSDT', 'FF': 'FFUSDT',
};

async function fetchCrypto(symbols: string[]): Promise<PriceResponse> {
  try {
    const prices: Record<string, number> = {};

    for (const symbol of symbols) {
      const cacheKey = `crypto-${symbol}`;
      const cached = getCached<number>(cacheKey, CACHE_DURATION_SHORT);
      if (cached !== null) {
        prices[symbol] = cached;
        continue;
      }

      const binanceSymbol = CRYPTO_MAP[symbol];
      if (!binanceSymbol) continue;

      try {
        const response = await fetchWithTimeout(
          `https://api.binance.com/api/v3/ticker/price?symbol=${binanceSymbol}`,
          {},
          5000
        );
        if (response.ok) {
          const data = await response.json();
          const price = parseFloat(data.price);
          if (price > 0) {
            prices[symbol] = price;
            setCache(cacheKey, price);
          }
        }
      } catch {
        // skip this symbol
      }
    }

    return { success: true, data: prices };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Crypto fetch failed' };
  }
}

async function fetchBIST(symbols: string[]): Promise<PriceResponse> {
  try {
    const prices: Record<string, { price: number; change: number; changePercent: number; volume: number }> = {};

    const uncachedSymbols: string[] = [];
    for (const symbol of symbols) {
      const trimmed = symbol.trim();
      const cacheKey = `bist-${trimmed}`;
      const cached = getCached<{ price: number; change: number; changePercent: number; volume: number }>(cacheKey, CACHE_DURATION_SHORT);
      if (cached) {
        prices[trimmed] = cached;
      } else {
        uncachedSymbols.push(trimmed);
      }
    }

    if (uncachedSymbols.length > 0) {
      const results = await Promise.allSettled(
        uncachedSymbols.map(s => fetchBISTPrice(s))
      );

      results.forEach((result, index) => {
        if (result.status === 'fulfilled' && result.value) {
          const sym = uncachedSymbols[index];
          prices[sym] = result.value;
          setCache(`bist-${sym}`, result.value);
        }
      });
    }

    return { success: true, data: prices };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'BIST fetch failed' };
  }
}

async function fetchBISTPrice(symbol: string): Promise<{ price: number; change: number; changePercent: number; volume: number } | null> {
  try {
    const response = await fetchWithTimeout(
      `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${symbol}.IS&fields=regularMarketPrice,regularMarketChange,regularMarketChangePercent,regularMarketVolume&_=${Date.now()}`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json',
        },
      },
      8000
    );

    if (response.ok) {
      const data = await response.json();
      const quote = data?.quoteResponse?.result?.[0];
      if (quote?.regularMarketPrice) {
        return {
          price: quote.regularMarketPrice,
          change: quote.regularMarketChange || 0,
          changePercent: quote.regularMarketChangePercent || 0,
          volume: quote.regularMarketVolume || 0,
        };
      }
    }
  } catch {
    // fall through to v8
  }

  return await fetchBISTFromV8(symbol);
}

async function fetchBISTFromV8(symbol: string): Promise<{ price: number; change: number; changePercent: number; volume: number } | null> {
  try {
    const response = await fetchWithTimeout(
      `https://query2.finance.yahoo.com/v8/finance/chart/${symbol}.IS?interval=1m&range=1d`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15',
          'Accept': 'application/json',
        },
      },
      8000
    );

    if (!response.ok) return null;

    const data = await response.json();
    const meta = data?.chart?.result?.[0]?.meta;
    if (!meta?.regularMarketPrice) return null;

    const currentPrice = meta.regularMarketPrice;
    const previousClose = meta.chartPreviousClose || meta.previousClose || currentPrice;

    return {
      price: currentPrice,
      change: currentPrice - previousClose,
      changePercent: previousClose > 0 ? ((currentPrice - previousClose) / previousClose) * 100 : 0,
      volume: meta.regularMarketVolume || 0,
    };
  } catch {
    return null;
  }
}

const STOCK_MAP: Record<string, string> = {
  'ASML': 'ASML.AS', 'LVMH': 'MC.PA', 'SAP': 'SAP.DE', 'TTE': 'TTE.PA',
  'OR': 'OR.PA', 'SAN': 'SAN.PA', 'AIR': 'AIR.PA', 'SU': 'SU.PA',
  'NOKIA': 'NOKIA.HE', 'BMW': 'BMW.DE', 'SIEMENS': 'SIE.DE',
  'ADYEN': 'ADYEN.AS', 'PROSUS': 'PRX.AS',
};

async function fetchEuropeanStock(symbol: string): Promise<PriceResponse> {
  if (!symbol) return { success: false, error: 'No symbol provided' };

  const cacheKey = `eu-stock-${symbol}`;
  const cached = getCached<PriceResponse>(cacheKey, CACHE_DURATION_MEDIUM);
  if (cached) return { ...cached, cached: true };

  const tickerSymbol = STOCK_MAP[symbol];
  if (!tickerSymbol) return { success: false, error: 'Unknown European stock symbol' };

  try {
    const response = await fetchWithTimeout(
      `https://query1.finance.yahoo.com/v8/finance/chart/${tickerSymbol}`,
      {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
      },
      8000
    );

    if (!response.ok) throw new Error(`Yahoo returned ${response.status}`);
    const data = await response.json();
    const price = data?.chart?.result?.[0]?.meta?.regularMarketPrice;
    if (!price) throw new Error('No price data');

    const result: PriceResponse = { success: true, data: { price } };
    setCache(cacheKey, result);
    return result;
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'European stock fetch failed' };
  }
}
