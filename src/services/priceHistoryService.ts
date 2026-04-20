import { supabase } from '../lib/supabase';

export interface PricePoint {
  price: number;
  recorded_at: string;
}

export async function getSparklineData(symbols: string[], days = 30): Promise<Record<string, number[]>> {
  if (symbols.length === 0) return {};

  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceIso = since.toISOString();

  const { data, error } = await supabase
    .from('price_history')
    .select('symbol, price, recorded_at')
    .in('symbol', symbols)
    .gte('recorded_at', sinceIso)
    .order('recorded_at', { ascending: true });

  if (error || !data) return {};

  const bySymbol: Record<string, number[]> = {};
  for (const row of data) {
    const price = Number(row.price);
    if (!isFinite(price)) continue;
    if (!bySymbol[row.symbol]) bySymbol[row.symbol] = [];
    bySymbol[row.symbol].push(price);
  }
  return bySymbol;
}
