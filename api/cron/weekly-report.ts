import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { sendEmail, buildWeeklyEmail } from '../lib/email.js';
import { sendTelegram, buildWeeklyTelegram } from '../lib/telegram.js';
import { requireCronAuth } from '../lib/auth.js';

function getSupabase() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Supabase credentials missing');
  return createClient(url, key);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (requireCronAuth(req, res)) return;

  const log: string[] = [];
  try {
    const supabase = getSupabase();
    const today = new Date();
    const weekStart = new Date(today);
    weekStart.setDate(weekStart.getDate() - 7);
    const weekStartStr = weekStart.toISOString().split('T')[0];
    const weekEndStr = today.toISOString().split('T')[0];

    // Snapshots: bugün ve 7 gün önce
    const { data: snapshots } = await supabase
      .from('portfolio_snapshots')
      .select('snapshot_date, total_value, total_investment')
      .order('snapshot_date', { ascending: false })
      .limit(20);
    const sorted = (snapshots || []);
    const todayS = sorted[0];
    const weekAgoS = sorted.find(s => s.snapshot_date <= weekStartStr) || sorted[sorted.length - 1];
    if (!todayS) {
      log.push('Snapshot yok, email atlandı.');
      return res.status(200).json({ success: false, log });
    }
    const totalValueTry = Number(todayS.total_value);
    const weekStartValue = Number(weekAgoS?.total_value || todayS.total_value);
    const weekChange = totalValueTry - weekStartValue;
    const weekChangePct = weekStartValue > 0 ? (weekChange / weekStartValue) * 100 : 0;

    // Holdings: bu hafta en iyi/kötü
    const { data: holdings } = await supabase.from('holdings').select('*');
    const holdingsList = (holdings || []).filter(h => h.purchase_price > 0 && (h.asset_type === 'stock' || h.asset_type === 'crypto'));
    const sortedByPnl = holdingsList
      .map(h => ({ symbol: h.symbol, pnlPct: ((h.current_price - h.purchase_price) / h.purchase_price) * 100 }))
      .sort((a, b) => b.pnlPct - a.pnlPct);
    const bestPerformer = sortedByPnl[0] || null;
    const worstPerformer = sortedByPnl[sortedByPnl.length - 1] || null;

    // Bu haftaki gerçekleşen gelir
    const { data: incomes } = await supabase
      .from('income_records')
      .select('income_type, source_symbol, amount_try, income_date')
      .gte('income_date', weekStartStr)
      .eq('is_projected', false);
    const weekIncomeTry = (incomes || []).reduce((s, r) => s + (r.amount_try || 0), 0);
    const breakdownMap = new Map<string, number>();
    for (const r of (incomes || [])) {
      const key = `${r.income_type}${r.source_symbol ? ' ' + r.source_symbol : ''}`;
      breakdownMap.set(key, (breakdownMap.get(key) || 0) + (r.amount_try || 0));
    }
    const weekIncomeBreakdown = Array.from(breakdownMap.entries()).map(([type, amount]) => ({ type, amount }));

    // Gelecek hafta plan: en son AI raporundan action listesi
    const { data: latestReport } = await supabase
      .from('daily_reports')
      .select('actions')
      .order('report_date', { ascending: false })
      .limit(1)
      .single();
    const thisWeekTodos = ((latestReport?.actions || []) as any[])
      .filter(a => a.urgency === 'this_week' || a.urgency === 'today')
      .slice(0, 5)
      .map(a => `${a.symbol || ''}${a.symbol ? ' · ' : ''}${a.instruction || a.detail || a.title || ''}`);

    const snapshot = {
      weekStart: weekStartStr,
      weekEnd: weekEndStr,
      totalValueTry,
      weekStartValueTry: weekStartValue,
      weekChangeTry: weekChange,
      weekChangePct,
      bestPerformer,
      worstPerformer,
      weekIncomeTry,
      weekIncomeBreakdown,
      weekActionsCompleted: [],
      thisWeekTodos,
    };
    const { subject, html } = buildWeeklyEmail(snapshot);
    const emailRes = await sendEmail(subject, html);
    log.push(emailRes.sent ? `Email gönderildi: ${emailRes.id}` : `Email atlandı: ${emailRes.reason}`);

    const tgRes = await sendTelegram(buildWeeklyTelegram(snapshot));
    log.push(tgRes.sent ? `Telegram gönderildi` : `Telegram atlandı: ${tgRes.reason}`);

    return res.status(200).json({ success: true, log });
  } catch (err: any) {
    log.push(`HATA: ${err.message}`);
    return res.status(500).json({ success: false, error: err.message, log });
  }
}
