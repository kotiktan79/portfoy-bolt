interface CacheEntry {
  price: number;
  timestamp: number;
}

interface CacheData {
  [symbol: string]: CacheEntry;
}

const CACHE_KEY = 'portfolio_price_cache';
const MAX_CACHE_AGE = 24 * 60 * 60 * 1000;
const SAVE_DEBOUNCE_MS = 2000;

let memoryCache: CacheData | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let isDirty = false;

function ensureLoaded(): CacheData {
  if (memoryCache !== null) return memoryCache;

  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (!cached) {
      memoryCache = {};
      return memoryCache;
    }

    const data: CacheData = JSON.parse(cached);
    const now = Date.now();
    const cleaned: CacheData = {};

    for (const [symbol, entry] of Object.entries(data)) {
      if (now - entry.timestamp < MAX_CACHE_AGE) {
        cleaned[symbol] = entry;
      }
    }

    memoryCache = cleaned;
    return memoryCache;
  } catch (error) {
    console.warn('Price cache corrupted, resetting:', error);
    memoryCache = {};
    return memoryCache;
  }
}

function scheduleSave(): void {
  if (saveTimer) return;

  saveTimer = setTimeout(() => {
    saveTimer = null;
    if (isDirty && memoryCache) {
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(memoryCache));
        isDirty = false;
      } catch (error) {
        console.warn('Failed to save price cache:', error);
      }
    }
  }, SAVE_DEBOUNCE_MS);
}

export function getCachedPrice(symbol: string, maxAge: number): number | null {
  const cache = ensureLoaded();
  const entry = cache[symbol];
  if (!entry) return null;

  if (Date.now() - entry.timestamp < maxAge) {
    return entry.price;
  }

  return null;
}

export function setCachedPrice(symbol: string, price: number): void {
  const cache = ensureLoaded();
  cache[symbol] = { price, timestamp: Date.now() };
  isDirty = true;
  scheduleSave();
}

export function clearPriceCache(): void {
  memoryCache = {};
  isDirty = false;
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {
    // ignore
  }
}

export function loadPriceCache(): CacheData {
  return ensureLoaded();
}

export function savePriceCache(cache: CacheData): void {
  memoryCache = cache;
  isDirty = true;
  scheduleSave();
}
