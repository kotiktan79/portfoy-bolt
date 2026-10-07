// ÖLÇÜ KARŞILAŞTIRMA — IO katmanı. Saf çekirdek: src/lib/measureCompare.ts
import { supabase } from '../lib/supabase';
import { fetchAll, getEurMonths } from './eurPnlService';
import { RELIABLE_FROM } from '../lib/eurPnl';
import { computeMeasureCompare, type MeasureCompare, type SnapRow, type RateRow } from '../lib/measureCompare';

export { SMOOTHED_RATE, SMOOTH_WINDOW, computeMeasureCompare } from '../lib/measureCompare';
export type { MeasureCompare, MeasureRow, SnapRow, RateRow } from '../lib/measureCompare';

let _cache: { ts: number; value: MeasureCompare } | null = null;
const TTL = 5 * 60 * 1000;

export async function getMeasureCompare(): Promise<MeasureCompare> {
  if (_cache && Date.now() - _cache.ts < TTL) return _cache.value;
  const [months, snaps, rates] = await Promise.all([
    getEurMonths(),
    fetchAll<SnapRow>('measureSnaps', () => supabase
      .from('portfolio_snapshots').select('snapshot_date,total_value,total_investment')
      .gte('snapshot_date', RELIABLE_FROM)
      .order('snapshot_date', { ascending: true }).order('created_at', { ascending: true })),
    fetchAll<RateRow>('measureRates', () => supabase
      .from('exchange_rates_daily').select('day,rate')
      .eq('from_currency', 'EUR').eq('to_currency', 'TRY').eq('source', 'api')
      .gte('day', RELIABLE_FROM).order('day', { ascending: true })),
  ]);
  const value = computeMeasureCompare(months, snaps, rates);
  _cache = { ts: Date.now(), value };
  return value;
}
