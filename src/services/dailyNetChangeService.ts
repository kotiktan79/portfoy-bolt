import { supabase } from '../lib/supabase';
import { dayInTZ } from '../lib/eurPnl';
import type { DailyClose } from '../lib/dailyNetChange';

export async function loadDailyChangeBasis(today = dayInTZ(new Date())) {
  const [reports, snaps] = await Promise.all([
    supabase.from('daily_reports').select('report_date,pnl_eur_day,wealth_eur').lte('report_date', today).not('pnl_eur_day', 'is', null).order('report_date', { ascending: false }).limit(1),
    supabase.from('portfolio_snapshots').select('snapshot_date,total_value,created_at').lt('snapshot_date', today).order('snapshot_date', { ascending: false }).order('created_at', { ascending: false }).limit(1),
  ]);
  if (reports.error) throw new Error('Günlük değişim okunamadı.');
  const report = (reports.data?.[0] ?? null) as DailyClose | null;
  if (report?.report_date === today) return { report, snap: null, prevPrices: null };
  if (snaps.error) throw new Error('Kapanış kaydı okunamadı.');
  const snap = snaps.data?.[0];
  if (!snap) return { report, snap: null, prevPrices: null };
  const at = String(snap.created_at), t = Date.parse(at);
  const [history, rates] = await Promise.all([
    supabase.from('price_history').select('holding_id,symbol,price,recorded_at').gte('recorded_at', new Date(t - 30 * 60_000).toISOString()).lte('recorded_at', new Date(t + 30 * 60_000).toISOString()),
    supabase.from('exchange_rates_daily').select('rate').eq('day', snap.snapshot_date).eq('from_currency', 'EUR').eq('to_currency', 'TRY').eq('source', 'api').limit(1),
  ]);
  if (history.error || rates.error) throw new Error('Kapanış kuru okunamadı.');
  const eurClose = (history.data || []).filter(p => ['EURO', 'EUR'].includes(p.symbol) && Number(p.price) > 1)
    .sort((a, b) => Math.abs(Date.parse(a.recorded_at) - t) - Math.abs(Date.parse(b.recorded_at) - t))[0];
  const rate = Number(eurClose?.price ?? rates.data?.[0]?.rate);
  return { report, snap: { v: Number(snap.total_value), d: String(snap.snapshot_date), at, eurRate: rate > 0 ? rate : null }, prevPrices: history.data || [] };
}
