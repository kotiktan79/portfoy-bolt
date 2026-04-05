import { supabase } from '../lib/supabase';

const DB_CACHE_KEY = 'daily_open_prices_db_cache';

interface CachedPrices {
  date: string;
  prices: Record<string, number>;
}

function getLocalDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getStartOfLocalDay(): string {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  return start.toISOString();
}

function getEndOfLocalDay(): string {
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  return end.toISOString();
}

function getMemoryCache(): CachedPrices | null {
  try {
    const raw = localStorage.getItem(DB_CACHE_KEY);
    if (!raw) return null;
    const parsed: CachedPrices = JSON.parse(raw);
    if (parsed.date !== getLocalDateString()) return null;
    return parsed;
  } catch {
    return null;
  }
}

function setMemoryCache(prices: Record<string, number>): void {
  const data: CachedPrices = { date: getLocalDateString(), prices };
  localStorage.setItem(DB_CACHE_KEY, JSON.stringify(data));
}

export async function loadDailyOpenPrices(holdingIds: string[]): Promise<Record<string, number>> {
  if (holdingIds.length === 0) return {};

  const cached = getMemoryCache();
  if (cached) {
    const allFound = holdingIds.every(id => id in cached.prices);
    if (allFound) return cached.prices;
  }

  const { data, error } = await supabase
    .from('price_history')
    .select('holding_id, price, recorded_at')
    .in('holding_id', holdingIds)
    .gte('recorded_at', getStartOfLocalDay())
    .lte('recorded_at', getEndOfLocalDay())
    .order('recorded_at', { ascending: true });

  if (error || !data) return cached?.prices ?? {};

  const result: Record<string, number> = { ...(cached?.prices ?? {}) };
  const seen = new Set<string>();

  for (const row of data) {
    if (row.holding_id && !seen.has(row.holding_id)) {
      result[row.holding_id] = Number(row.price);
      seen.add(row.holding_id);
    }
  }

  setMemoryCache(result);
  return result;
}

export async function saveDailyOpenPrices(
  holdings: Array<{ id: string; symbol: string; current_price: number }>,
  existingPrices: Record<string, number>
): Promise<Record<string, number>> {
  const newPrices = { ...existingPrices };
  const toInsert: Array<{ holding_id: string; symbol: string; price: number; recorded_at: string }> = [];

  const now = new Date().toISOString();

  for (const h of holdings) {
    if (!(h.id in newPrices) && h.current_price > 0) {
      newPrices[h.id] = h.current_price;
      toInsert.push({
        holding_id: h.id,
        symbol: h.symbol,
        price: h.current_price,
        recorded_at: now,
      });
    }
  }

  if (toInsert.length > 0) {
    const { error } = await supabase.from('price_history').insert(toInsert);
    if (!error) {
      setMemoryCache(newPrices);
    }
  } else if (Object.keys(newPrices).length > 0) {
    setMemoryCache(newPrices);
  }

  return newPrices;
}
