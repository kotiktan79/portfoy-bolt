import type { Holding } from './supabase';

/** Okuma sonuçlarını alan sırası yüzünden değişmiş sayma. Yalnız düz veri için kullanılır. */
export function dataKey(value: unknown): string | undefined {
  return JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item)
    ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
}
export function keepPrevious<T>(previous: T, next: T): T {
  return dataKey(previous) === dataKey(next) ? previous : next;
}

/** Ekran fiyatın gününü kullanır; aynı günün yalnız otomatik zaman damgası değişirse sayfayı oynatma. */
export function keepHoldings(previous: Holding[], next: Holding[]): Holding[] {
  const screenData = (rows: Holding[]) => rows.map(h => ({ ...h, updated_at: h.updated_at?.slice(0, 10) }));
  return dataKey(screenData(previous)) === dataKey(screenData(next)) ? previous : next;
}
