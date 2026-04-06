import { AssetType } from '../lib/supabase';
import { getCachedPrice, setCachedPrice } from './persistentCache';
import { trackAPICall, shouldUseService } from './priceMonitor';
import { API_URLS, DEFAULT_USD_TRY_RATE } from '../config';

interface PriceData {
  [symbol: string]: number;
}

export interface PriceUpdate {
  symbol: string;
  price: number;
  timestamp: number;
  source: string;
}

export type ConnectionStatus = 'connected' | 'disconnected' | 'connecting' | 'error';

const BINANCE_API = API_URLS.BINANCE_REST;
const BINANCE_WS = API_URLS.BINANCE_WS;

interface RateLimitInfo {
  requests: number[];
  limit: number;
  window: number;
}

const rateLimits: { [key: string]: RateLimitInfo } = {
  'binance': { requests: [], limit: 50, window: 60000 },
  'exchangerate': { requests: [], limit: 100, window: 3600000 },
  'proxy': { requests: [], limit: 200, window: 60000 },
};

function canMakeRequest(service: string): boolean {
  const limit = rateLimits[service];
  if (!limit) return true;

  const now = Date.now();
  limit.requests = limit.requests.filter(time => now - time < limit.window && now - time >= 0);

  if (limit.requests.length >= limit.limit) {
    return false;
  }

  limit.requests.push(now);
  return true;
}

async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs: number = 8000
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(new DOMException('Request timed out', 'TimeoutError')), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof DOMException && (error.name === 'AbortError' || error.name === 'TimeoutError')) {
      throw new Error(`Request timed out after ${timeoutMs}ms`);
    }
    throw error;
  }
}

async function waitForRateLimit(service: string): Promise<void> {
  const limit = rateLimits[service];
  if (!limit) return;

  const now = Date.now();
  const oldestRequest = limit.requests[0];
  if (oldestRequest) {
    const waitTime = limit.window - (now - oldestRequest);
    if (waitTime > 0 && waitTime < 10000) {
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }
}

async function retryFetch<T>(
  fetchFn: () => Promise<T>,
  retries: number = 2,
  delay: number = 1000
): Promise<T | null> {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fetchFn();
    } catch {
      if (i === retries) return null;
      const waitTime = delay * Math.pow(2, i) * (0.5 + Math.random() * 0.5);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }
  return null;
}

const CRYPTO_SYMBOLS: { [key: string]: string } = {
  'BTC': 'BTCUSDT',
  'ETH': 'ETHUSDT',
  'SOL': 'SOLUSDT',
  'XRP': 'XRPUSDT',
  'LINK': 'LINKUSDT',
  'ADA': 'ADAUSDT',
  'AVAX': 'AVAXUSDT',
  'DOT': 'DOTUSDT',
  'MATIC': 'MATICUSDT',
  'BNB': 'BNBUSDT',
  'DOGE': 'DOGEUSDT',
  'FF': 'FFUSDT',
};

const EURONEXT_STOCKS: { [key: string]: string } = {
  'ASML': 'ASML.AS',
  'LVMH': 'MC.PA',
  'SAP': 'SAP.DE',
  'TTE': 'TTE.PA',
  'OR': 'OR.PA',
  'SAN': 'SAN.PA',
  'AIR': 'AIR.PA',
  'SU': 'SU.PA',
  'NOKIA': 'NOKIA.HE',
  'BMW': 'BMW.DE',
  'SIEMENS': 'SIE.DE',
  'ADYEN': 'ADYEN.AS',
  'PROSUS': 'PRX.AS',
};

const US_STOCKS: Record<string, string> = {
  'AAPL': 'AAPL',
  'MSFT': 'MSFT',
  'GOOGL': 'GOOGL',
  'AMZN': 'AMZN',
  'NVDA': 'NVDA',
  'TSLA': 'TSLA',
  'META': 'META',
  'NFLX': 'NFLX',
  'AMD': 'AMD',
  'INTC': 'INTC',
  'CRM': 'CRM',
  'ORCL': 'ORCL',
  'PYPL': 'PYPL',
  'DIS': 'DIS',
  'NKE': 'NKE',
  'KO': 'KO',
  'PEP': 'PEP',
  'JNJ': 'JNJ',
  'V': 'V',
  'MA': 'MA',
  'JPM': 'JPM',
  'BAC': 'BAC',
  'WMT': 'WMT',
  'PG': 'PG',
  'NOVO': 'NOVO-B.CO',
  'PLTR': 'PLTR',
  'COIN': 'COIN',
  'MSTR': 'MSTR',
};

const FALLBACK_PRICES: PriceData = {
  'AKSEN': 55.00,
  'ALTIN': 3200,
  'GOLD': 3200,
  'XAG': 38,
  'SILVER': 38,
  'GUMUS': 38,
  'ASELS': 90.00,
  'BIMAS': 600.00,
  'BTC': 3200000,
  'CCOLA': 58.00,
  'ASML': 12000,
  'LVMH': 3900,
  'SAP': 10200,
  'TTE': 3300,
  'OR': 2500,
  'SAN': 2200,
  'AIR': 7800,
  'SU': 1850,
  'NOKIA': 185,
  'BMW': 4350,
  'SIEMENS': 9100,
  'ADYEN': 6400,
  'PROSUS': 1700,
  'EKGYO': 21.50,
  'ENKAI': 80.00,
  'EREGL': 60.00,
  'ETH': 120000,
  'EURO': 41.50,
  'EUR': 41.50,
  'GARAN': 150.00,
  'HALKB': 60.00,
  'ISCTR': 29.50,
  'KCHOL': 230.00,
  'KOZAL': 47.00,
  'PGSUS': 320.00,
  'PETKM': 170.00,
  'GPA': 20.00,
  'IPV': 66.00,
  'LINK': 750,
  'SAHOL': 95.00,
  'SISE': 50.00,
  'SOL': 8500,
  'TCELL': 120.00,
  'THYAO': 350.00,
  'TOASO': 320.00,
  'TUPRS': 230.00,
  'VAKBN': 50.00,
  'YKBNK': 45.00,
  'US900123CJ75': 43000,
  'USD': DEFAULT_USD_TRY_RATE,
  'TRY': 1.00,
  'XRP': 95,
  'ADA': 20,
  'AVAX': 1200,
  'DOT': 250,
  'MATIC': 18,
  'BNB': 25000,
  'DOGE': 8,
  'AKBNK': 70.00,
};

const CACHE_DURATIONS: Record<string, number> = {
  'stock': 30000,
  'crypto': 30000,
  'commodity': 60000,
  'currency': 300000,
  'fund': 300000,
  'eurobond': 300000,
  'other': 60000,
};

const priceCache: { [key: string]: { price: number; timestamp: number; source: string } } = {};

let usdTryRateCache: { rate: number; timestamp: number } | null = null;
const USD_RATE_CACHE_MS = 60000;

let eurTryRateCache: { rate: number; timestamp: number } | null = null;
const EUR_RATE_CACHE_MS = 60000;

function getSupabaseConfig() {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return { url, key };
}

function proxyHeaders(key: string): HeadersInit {
  return { 'Authorization': `Bearer ${key}` };
}

export async function fetchUSDTRYRate(): Promise<number> {
  if (usdTryRateCache && Date.now() - usdTryRateCache.timestamp < USD_RATE_CACHE_MS) {
    return usdTryRateCache.rate;
  }

  // Doğrudan API — Edge Function'a gerek yok
  return await fetchUSDTRYFromAlternative();
}

async function fetchUSDTRYFromAlternative(): Promise<number> {
  if (!canMakeRequest('exchangerate')) await waitForRateLimit('exchangerate');

  const result = await retryFetch(async () => {
    const response = await fetchWithTimeout(`${API_URLS.OPEN_ER_API}/USD`, {}, 5000);
    if (!response.ok) throw new Error('Alternative API failed');
    return response.json();
  }, 2, 500);

  if (result?.rates?.TRY) {
    usdTryRateCache = { rate: result.rates.TRY, timestamp: Date.now() };
    return result.rates.TRY;
  }

  return FALLBACK_PRICES['USD'];
}

export async function fetchEURTRYRate(): Promise<number> {
  if (eurTryRateCache && Date.now() - eurTryRateCache.timestamp < EUR_RATE_CACHE_MS) {
    return eurTryRateCache.rate;
  }

  // Doğrudan API — Edge Function'a gerek yok
  if (!canMakeRequest('exchangerate')) await waitForRateLimit('exchangerate');

  const result = await retryFetch(async () => {
    const response = await fetchWithTimeout(`${API_URLS.OPEN_ER_API}/EUR`, {}, 5000);
    if (!response.ok) throw new Error('Alternative API failed');
    return response.json();
  }, 2, 500);

  if (result?.rates?.TRY) {
    eurTryRateCache = { rate: result.rates.TRY, timestamp: Date.now() };
    return result.rates.TRY;
  }

  return FALLBACK_PRICES['EURO'];
}

export async function fetchCryptoPrice(symbol: string): Promise<number | null> {
  // Doğrudan Binance — Edge Function'a gerek yok
  return await fetchCryptoFromBinance(symbol);
}

async function fetchCryptoFromBinance(symbol: string): Promise<number | null> {
  const binanceSymbol = CRYPTO_SYMBOLS[symbol];
  if (!binanceSymbol) return null;

  if (!canMakeRequest('binance')) await waitForRateLimit('binance');

  if (!shouldUseService('binance')) {
    return FALLBACK_PRICES[symbol] || null;
  }

  try {
    const result = await trackAPICall('binance', async () => {
      const response = await fetchWithTimeout(
        `${BINANCE_API}?symbol=${binanceSymbol}`,
        {},
        5000
      );
      if (!response.ok) throw new Error('Binance API failed');
      return response.json();
    });

    const priceUSD = parseFloat(result.price);
    if (!priceUSD || isNaN(priceUSD)) return null;

    const usdTryRate = await fetchUSDTRYRate();
    return priceUSD * usdTryRate;
  } catch {
    return null;
  }
}

export async function fetchGoldPrice(): Promise<number> {
  const usdTryRate = await fetchUSDTRYRate();
  // Doğrudan metals.live API — Edge Function'a gerek yok
  return await fetchGoldFromAlternative(usdTryRate);
}

async function fetchGoldFromAlternative(usdTryRate: number): Promise<number> {
  try {
    const response = await fetchWithTimeout(`${API_URLS.METALS_API}/gold`, {}, 5000);
    if (!response.ok) throw new Error('Metals.live failed');

    const data = await response.json();
    const goldPricePerOunce = data[0]?.price || data.price;
    if (!goldPricePerOunce) throw new Error('No gold data');

    return (goldPricePerOunce / 31.1035) * usdTryRate;
  } catch {
    return (3300 / 31.1035) * usdTryRate;
  }
}

export async function fetchSilverPrice(): Promise<number> {
  const usdTryRate = await fetchUSDTRYRate();
  // Doğrudan metals.live API — Edge Function'a gerek yok
  return await fetchSilverFromAlternative(usdTryRate);
}

async function fetchSilverFromAlternative(usdTryRate: number): Promise<number> {
  try {
    const response = await fetchWithTimeout(`${API_URLS.METALS_API}/silver`, {}, 5000);
    if (!response.ok) throw new Error('Metals.live silver failed');

    const data = await response.json();
    const silverPricePerOunce = data[0]?.price || data.price;
    if (!silverPricePerOunce) throw new Error('No silver data');

    return (silverPricePerOunce / 31.1035) * usdTryRate;
  } catch {
    return (32 / 31.1035) * usdTryRate;
  }
}

export async function fetchEuropeanStockPrice(symbol: string): Promise<number | null> {
  if (!EURONEXT_STOCKS[symbol]) return null;

  const ticker = EURONEXT_STOCKS[symbol] || symbol;

  // Yahoo Finance — doğrudan, Edge Function'a gerek yok
  try {
    const response = await fetchWithTimeout(
      `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=1d`,
      { headers: { 'User-Agent': 'Mozilla/5.0' } },
      8000
    );
    if (response.ok) {
      const data = await response.json();
      const eurPrice = data?.chart?.result?.[0]?.meta?.regularMarketPrice;
      if (eurPrice && eurPrice > 0) {
        const eurTryRate = await fetchEURTRYRate();
        return eurPrice * eurTryRate;
      }
    }
  } catch { /* fall through */ }

  return null;
}

async function fetchUSStockPrice(symbol: string): Promise<number | null> {
  const ticker = US_STOCKS[symbol] || symbol;
  try {
    const response = await fetchWithTimeout(
      `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1m&range=1d`,
      { headers: { 'User-Agent': 'Mozilla/5.0' } },
      8000
    );
    if (!response.ok) return null;
    const data = await response.json();
    const usdPrice = data?.chart?.result?.[0]?.meta?.regularMarketPrice;
    if (!usdPrice) return null;
    const usdRate = await fetchUSDTRYRate();
    return usdPrice * usdRate;
  } catch {
    return null;
  }
}

export async function fetchBISTPrice(symbol: string): Promise<number | null> {
  // Yahoo Finance v8 — doğrudan, Edge Function'a gerek yok
  try {
    const response = await fetchWithTimeout(
      `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}.IS?interval=1d&range=1d`,
      { headers: { 'User-Agent': 'Mozilla/5.0' } },
      8000
    );
    if (response.ok) {
      const data = await response.json();
      const price = data?.chart?.result?.[0]?.meta?.regularMarketPrice;
      if (price && price > 0) return price;
    }
  } catch { /* try v7 fallback */ }

  // Yahoo Finance v7 fallback
  try {
    const response = await fetchWithTimeout(
      `https://query2.finance.yahoo.com/v7/finance/quote?symbols=${symbol}.IS&fields=regularMarketPrice`,
      { headers: { 'User-Agent': 'Mozilla/5.0' } },
      8000
    );
    if (response.ok) {
      const data = await response.json();
      const price = data?.quoteResponse?.result?.[0]?.regularMarketPrice;
      if (price && price > 0) return price;
    }
  } catch { /* fall through */ }

  // Supabase Edge Function fallback (eski yöntem)
  const config = getSupabaseConfig();
  if (config) {
    try {
      const response = await fetchWithTimeout(
        `${config.url}/functions/v1/bist-live-prices?symbols=${symbol}`,
        { headers: proxyHeaders(config.key) },
        8000
      );
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.data?.[symbol]) {
          return data.data[symbol].price;
        }
      }
    } catch { /* fall through */ }
  }

  return FALLBACK_PRICES[symbol] || null;
}

let connectionStatus: ConnectionStatus = 'disconnected';
const statusListeners: ((status: ConnectionStatus) => void)[] = [];

export function subscribeToConnectionStatus(callback: (status: ConnectionStatus) => void) {
  statusListeners.push(callback);
  callback(connectionStatus);
  return () => {
    const index = statusListeners.indexOf(callback);
    if (index > -1) statusListeners.splice(index, 1);
  };
}

function updateConnectionStatus(status: ConnectionStatus) {
  connectionStatus = status;
  statusListeners.forEach(listener => listener(status));
}

let binanceWS: WebSocket | null = null;
const wsSubscriptions = new Set<string>();
const priceUpdateListeners: ((update: PriceUpdate) => void)[] = [];
const wsNotifyThrottle = new Map<string, number>();
const WS_THROTTLE_MS = 2000;
let wsSymbolsRef: string[] = [];
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

export function subscribeToPriceUpdates(callback: (update: PriceUpdate) => void) {
  priceUpdateListeners.push(callback);
  return () => {
    const index = priceUpdateListeners.indexOf(callback);
    if (index > -1) priceUpdateListeners.splice(index, 1);
  };
}

function notifyPriceUpdate(update: PriceUpdate) {
  priceUpdateListeners.forEach(listener => listener(update));
}

let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 8;
const BASE_RECONNECT_DELAY = 3000;

export function initializeWebSocketConnection(symbols: string[]) {
  wsSymbolsRef = symbols;

  if (binanceWS && binanceWS.readyState === WebSocket.OPEN) return;
  if (binanceWS && binanceWS.readyState === WebSocket.CONNECTING) return;

  const cryptoSymbols = symbols
    .filter(s => CRYPTO_SYMBOLS[s])
    .map(s => CRYPTO_SYMBOLS[s].toLowerCase());

  if (cryptoSymbols.length === 0) return;

  updateConnectionStatus('connecting');

  const streams = cryptoSymbols.map(s => `${s}@ticker`).join('/');
  const wsUrl = `${BINANCE_WS}/${streams}`;

  try {
    binanceWS = new WebSocket(wsUrl);
  } catch {
    updateConnectionStatus('error');
    scheduleReconnect();
    return;
  }

  binanceWS.onopen = () => {
    updateConnectionStatus('connected');
    reconnectAttempts = 0;
    cryptoSymbols.forEach(s => wsSubscriptions.add(s));
  };

  binanceWS.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.e !== '24hrTicker') return;

      const symbol = Object.keys(CRYPTO_SYMBOLS).find(
        key => CRYPTO_SYMBOLS[key].toLowerCase() === data.s.toLowerCase()
      );
      if (!symbol) return;

      const usdPrice = parseFloat(data.c);
      if (!usdPrice || isNaN(usdPrice)) return;

      // Don't convert with a stale fallback rate — wait until we have a real cached rate
      // to avoid showing misleading TRY prices from the default config value
      if (!usdTryRateCache) return;
      const cachedRate = usdTryRateCache.rate;
      const tryPrice = usdPrice * cachedRate;

      priceCache[symbol] = {
        price: tryPrice,
        timestamp: Date.now(),
        source: 'websocket',
      };

      setCachedPrice(symbol, tryPrice);

      // Per-symbol throttle: only notify listeners at most once every 2 seconds
      const lastNotify = wsNotifyThrottle.get(symbol) || 0;
      const msgNow = Date.now();
      if (msgNow - lastNotify < WS_THROTTLE_MS) return;
      wsNotifyThrottle.set(symbol, msgNow);

      notifyPriceUpdate({
        symbol,
        price: tryPrice,
        timestamp: msgNow,
        source: 'Binance WebSocket',
      });
    } catch {
      // skip malformed messages
    }
  };

  binanceWS.onerror = () => {
    updateConnectionStatus('error');
  };

  binanceWS.onclose = () => {
    updateConnectionStatus('disconnected');
    wsSubscriptions.clear();
    binanceWS = null;
    scheduleReconnect();
  };
}

function scheduleReconnect() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    updateConnectionStatus('error');
    return;
  }

  const delay = Math.min(BASE_RECONNECT_DELAY * Math.pow(2, reconnectAttempts), 120000);
  reconnectAttempts++;

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    if (!binanceWS || binanceWS.readyState === WebSocket.CLOSED || binanceWS.readyState === WebSocket.CLOSING) {
      initializeWebSocketConnection(wsSymbolsRef);
    }
  }, delay);
}

export function resetAndReconnectWebSocket() {
  reconnectAttempts = 0;
  if (wsSymbolsRef.length > 0) {
    closeWebSocketConnection();
    initializeWebSocketConnection(wsSymbolsRef);
  }
}

export function closeWebSocketConnection() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (binanceWS) {
    binanceWS.close();
    binanceWS = null;
    wsSubscriptions.clear();
    updateConnectionStatus('disconnected');
  }
}

export async function fetchRealTimePrice(symbol: string, assetType: AssetType): Promise<number> {
  const now = Date.now();
  const cached = priceCache[symbol];
  const cacheDuration = CACHE_DURATIONS[assetType] || CACHE_DURATIONS['other'];

  if (cached && now - cached.timestamp < cacheDuration) {
    return cached.price;
  }

  const persistentPrice = getCachedPrice(symbol, cacheDuration);
  if (persistentPrice !== null) {
    priceCache[symbol] = { price: persistentPrice, timestamp: now, source: 'persistent' };
    return persistentPrice;
  }

  let price: number | null = null;

  try {
    switch (assetType) {
      case 'crypto':
        price = await fetchCryptoPrice(symbol);
        break;
      case 'currency':
        if (symbol === 'USD' || symbol === 'USDC' || symbol === 'USDT' || symbol === 'BUSD' || symbol === 'FDUSD') price = await fetchUSDTRYRate();
        else if (symbol === 'EURO' || symbol === 'EUR') price = await fetchEURTRYRate();
        break;
      case 'commodity':
        if (symbol === 'ALTIN' || symbol === 'GOLD') price = await fetchGoldPrice();
        else if (symbol === 'XAG' || symbol === 'SILVER' || symbol === 'GUMUS') price = await fetchSilverPrice();
        break;
      case 'stock':
        if (US_STOCKS[symbol]) {
          price = await fetchUSStockPrice(symbol);
        } else if (EURONEXT_STOCKS[symbol]) {
          price = await fetchEuropeanStockPrice(symbol);
        }
        if (!price) price = await fetchBISTPrice(symbol);
        break;
      case 'fund':
      case 'eurobond':
        // No real-time API supports fund/eurobond prices.
        // Return cached price if available; otherwise leave price as null
        // so the fallback logic below can provide a default.
        if (cached) {
          price = cached.price;
        }
        break;
    }
  } catch {
    // will use fallback
  }

  const finalPrice = (price != null && price > 0) ? price : (FALLBACK_PRICES[symbol] || null);
  if (!finalPrice) return null as unknown as number;
  // Mark as 'fallback' when no API price was fetched, or when the returned
  // price matches the hardcoded fallback (sub-functions may return fallback values directly)
  const source = (price && price !== FALLBACK_PRICES[symbol]) ? 'api' : 'fallback';

  priceCache[symbol] = { price: finalPrice, timestamp: now, source };

  if (price) {
    setCachedPrice(symbol, finalPrice);
  }

  notifyPriceUpdate({
    symbol,
    price: finalPrice,
    timestamp: now,
    source: source === 'api' ? 'REST API' : 'Fallback',
  });

  return finalPrice;
}

export async function fetchMultiplePrices(symbols: { symbol: string; assetType: AssetType }[]): Promise<PriceData> {
  const BATCH_TIMEOUT_MS = 15000;

  const batchWork = async (): Promise<PriceData> => {
    const prices: PriceData = {};
    const bistStocks = symbols.filter(s => s.assetType === 'stock' && !EURONEXT_STOCKS[s.symbol] && !US_STOCKS[s.symbol]);
    const otherAssets = symbols.filter(s => s.assetType !== 'stock' || EURONEXT_STOCKS[s.symbol] || US_STOCKS[s.symbol]);

    if (bistStocks.length > 0) {
      // Yahoo Finance batch — doğrudan, Edge Function'a gerek yok
      try {
        const symbolList = bistStocks.map(s => s.symbol + '.IS').join(',');
        const response = await fetchWithTimeout(
          `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${symbolList}&fields=regularMarketPrice`,
          { headers: { 'User-Agent': 'Mozilla/5.0' } },
          10000
        );

        if (response.ok) {
          const result = await response.json();
          for (const q of result?.quoteResponse?.result || []) {
            const sym = q.symbol.replace('.IS', '');
            const price = q.regularMarketPrice;
            if (price && price > 0) {
              prices[sym] = price;
              priceCache[sym] = { price, timestamp: Date.now(), source: 'api' };
              setCachedPrice(sym, price);
              notifyPriceUpdate({ symbol: sym, price, timestamp: Date.now(), source: 'Yahoo Finance' });
            }
          }
        }
      } catch {
        // fall through to individual
      }

      const missingSymbols = bistStocks.filter(s => !prices[s.symbol]);
      if (missingSymbols.length > 0) {
        const results = await Promise.allSettled(
          missingSymbols.map(({ symbol, assetType }) => fetchRealTimePrice(symbol, assetType))
        );
        missingSymbols.forEach((s, i) => {
          const result = results[i];
          if (result.status === 'fulfilled') {
            prices[s.symbol] = result.value;
          } else {
            prices[s.symbol] = FALLBACK_PRICES[s.symbol] || 0;
          }
        });
      }
    }

    const otherResults = await Promise.allSettled(
      otherAssets.map(({ symbol, assetType }) => fetchRealTimePrice(symbol, assetType))
    );
    otherAssets.forEach((s, i) => {
      const result = otherResults[i];
      if (result.status === 'fulfilled') {
        prices[s.symbol] = result.value;
      } else {
        prices[s.symbol] = FALLBACK_PRICES[s.symbol] || 0;
      }
    });

    return prices;
  };

  // Overall 15-second timeout for the entire batch operation
  const timeoutPromise = new Promise<PriceData>((_, reject) =>
    setTimeout(() => reject(new Error('Batch fetch timed out')), BATCH_TIMEOUT_MS)
  );

  try {
    return await Promise.race([batchWork(), timeoutPromise]);
  } catch {
    // On timeout, return fallback prices for all requested symbols
    const fallbackPrices: PriceData = {};
    symbols.forEach(({ symbol }) => {
      fallbackPrices[symbol] = FALLBACK_PRICES[symbol] || 0;
    });
    return fallbackPrices;
  }
}

export function formatCurrency(value: number, decimals: number = 2): string {
  return new Intl.NumberFormat('tr-TR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

export function formatCurrencyUSD(valueTRY: number, usdRate: number, decimals: number = 2): string {
  const valueUSD = valueTRY / usdRate;
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(valueUSD);
}

export function formatPercentage(value: number): string {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

let cachedUSDRate: { rate: number; timestamp: number } | null = null;
const USD_RATE_EXPORT_CACHE_DURATION = 5 * 60 * 1000;

export async function getCachedUSDRate(): Promise<number> {
  if (cachedUSDRate && Date.now() - cachedUSDRate.timestamp < USD_RATE_EXPORT_CACHE_DURATION) {
    return cachedUSDRate.rate;
  }

  const rate = await fetchUSDTRYRate();
  cachedUSDRate = { rate, timestamp: Date.now() };
  return rate;
}

export function getConnectionStatus(): ConnectionStatus {
  return connectionStatus;
}

export function getPriceCacheStats(): { total: number; api: number; websocket: number; fallback: number; persistent: number } {
  const entries = Object.values(priceCache);
  return {
    total: entries.length,
    api: entries.filter(e => e.source === 'api').length,
    websocket: entries.filter(e => e.source === 'websocket').length,
    fallback: entries.filter(e => e.source === 'fallback').length,
    persistent: entries.filter(e => e.source === 'persistent').length,
  };
}
