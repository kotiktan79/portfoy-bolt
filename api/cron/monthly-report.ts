import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { sendEmail, buildMonthlyEmail } from '../lib/email.js';

const SALARY_TARGET_USD = Number(process.env.SALARY_TARGET_USD || 1000);

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
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers.authorization !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const log: string[] = [];
  try {
    const supabase = getSupabase();

    // Bir önceki ayın özeti — her ayın 1'inde, geçen ay raporlanır
    const today = new Date();
    const reportMonth = new Date(today);
    reportMonth.setDate(0); // bir önceki ayın son günü
    const reportYear = reportMonth.getFullYear();
    const reportMonthIdx = reportMonth.getMonth();
    const monthStart = new Date(reportYear, reportMonthIdx, 1).toISOString().split('T')[0];
    const monthEnd = new Date(reportYear, reportMonthIdx + 1, 0).toISOString().split('T')[0];
    const yearStart = new Date(reportYear, 0, 1).toISOString().split('T')[0];
    const monthLabel = reportMonth.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' });

    // Snapshot: ay başı ve ay sonu
    const { data: snapshots } = await supabase
      .from('portfolio_snapshots')
      .select('snapshot_date, total_value')
      .gte('snapshot_date', monthStart)
      .lte('snapshot_date', monthEnd)
      .order('snapshot_date', { ascending: true });
    const list = snapshots || [];
    if (list.length === 0) {
      log.push('Snapshot yok, email atlandı.');
      return res.status(200).json({ success: false, log });
    }
    const monthStartValue = Number(list[0].total_value);
    const totalValueTry = Number(list[list.length - 1].total_value);
    const monthChange = totalValueTry - monthStartValue;
    const monthChangePct = monthStartValue > 0 ? (monthChange / monthStartValue) * 100 : 0;

    // Bu ay gerçekleşen gelir + breakdown
    const { data: incomes } = await supabase
      .from('income_records')
      .select('income_type, source_symbol, amount_try, income_date')
      .gte('income_date', monthStart)
      .lte('income_date', monthEnd)
      .eq('is_projected', false);
    const realizedIncomeTry = (incomes || []).reduce((s, r) => s + (r.amount_try || 0), 0);
    const breakdownMap = new Map<string, number>();
    for (const r of (incomes || [])) {
      const key = `${r.income_type}${r.source_symbol ? ' ' + r.source_symbol : ''}`;
      breakdownMap.set(key, (breakdownMap.get(key) || 0) + (r.amount_try || 0));
    }
    const monthIncomeBreakdown = Array.from(breakdownMap.entries()).map(([type, amount]) => ({ type, amount }));

    // YTD toplam temettü
    const { data: ytdIncomes } = await supabase
      .from('income_records')
      .select('amount_try')
      .gte('income_date', yearStart)
      .eq('is_projected', false);
    const totalDividendsYearTry = (ytdIncomes || []).reduce((s, r) => s + (r.amount_try || 0), 0);

    // USD rate
    const { data: holdings } = await supabase.from('holdings').select('*');
    const usdRate = (holdings || []).find((h: any) => h.symbol === 'USD' && h.asset_type === 'currency')?.current_price || 45;

    // Salary fulfilled (bu ayki gerçekleşen gelir USD)
    const salaryActualUsd = realizedIncomeTry / usdRate;
    const salaryFulfilledPct = (salaryActualUsd / SALARY_TARGET_USD) * 100;

    // YTD çekim oranı: yıl boyu çekilen / portföy değeri × (12/aysayısı)
    const monthsElapsed = today.getMonth() === 0 ? 12 : today.getMonth();
    const annualizedWithdrawal = (totalDividendsYearTry / Math.max(1, monthsElapsed)) * 12;
    const withdrawalRatePctYTD = totalValueTry > 0 ? (annualizedWithdrawal / totalValueTry) * 100 : 0;

    // Top gainers (mevcut)
    const topGainersThisMonth = (holdings || [])
      .filter((h: any) => h.purchase_price > 0 && h.asset_type === 'stock')
      .map((h: any) => ({ symbol: h.symbol, pnlPct: ((h.current_price - h.purchase_price) / h.purchase_price) * 100 }))
      .sort((a: any, b: any) => b.pnlPct - a.pnlPct)
      .slice(0, 5);

    // Son AI yorum
    const { data: lastReport } = await supabase
      .from('daily_reports')
      .select('portfolio_diagnosis')
      .order('report_date', { ascending: false })
      .limit(1)
      .single();

    const { subject, html } = buildMonthlyEmail({
      monthLabel,
      totalValueTry,
      monthStartValueTry: monthStartValue,
      monthChangeTry: monthChange,
      monthChangePct,
      realizedIncomeTry,
      monthIncomeBreakdown,
      totalDividendsYearTry,
      salaryTargetUsd: SALARY_TARGET_USD,
      salaryActualUsd,
      salaryFulfilledPct,
      topGainersThisMonth,
      withdrawalRatePctYTD,
      diagnosisAi: lastReport?.portfolio_diagnosis || '',
    });
    const emailRes = await sendEmail(subject, html);
    log.push(emailRes.sent ? `Email gönderildi: ${emailRes.id}` : `Email atlandı: ${emailRes.reason}`);

    return res.status(200).json({ success: true, log });
  } catch (err: any) {
    log.push(`HATA: ${err.message}`);
    return res.status(500).json({ success: false, error: err.message, log });
  }
}
