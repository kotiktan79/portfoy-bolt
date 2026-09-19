import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { sendEmail, buildWeeklyEmail } from '../lib/email.js';
import { sendTelegram, buildWeeklyTelegram } from '../lib/telegram.js';
import { requireCronAuth } from '../lib/auth.js';
import { loadEurModel } from '../lib/eurEngine.js';

// HAFTALIK — TEK ÖLÇÜ EUR (2026-09-19): hafta kârı = motorun günlük kârlarının toplamı (akış düzeltilmiş).

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

    // EUR motoru: son 7 takvim günü (weekStartStr sonrası snapshot günleri)
    const model = await loadEurModel(supabase);
    const daily = model.daily;
    if (!daily.length) {
      log.push('EUR motorunda gün yok, email atlandı.');
      return res.status(200).json({ success: false, log });
    }
    // >= : Pazartesi snapshot günü haftaya DAHİL (taban = önceki Pazar). '>' Pazartesi kârını hiçbir haftaya saymıyordu (hakem 2026-09-19)
    const idx = daily.findIndex(d => d.date >= weekStartStr);
    const base = idx > 0 ? daily[idx - 1].wealthEUR : daily[0].wealthEUR;
    const weekGainEUR = idx >= 0 ? daily.slice(Math.max(idx, 1)).reduce((s, d) => s + d.gainEUR, 0) : 0;
    const weekGainPct = base > 0 ? (weekGainEUR / base) * 100 : 0;
    const wealthEUR = daily[daily.length - 1].wealthEUR;
    const weekEndLabel = daily[daily.length - 1].date;   // veri son snapshot gününde (Pazar) biter; cron Pazartesi çalışır
    const eurRateNow = daily[daily.length - 1].eurRate || 0;
    const toEUR = (tl: number) => (eurRateNow > 0 ? tl / eurRateNow : 0);

    // Holdings: bu hafta en iyi/kötü
    // Yerel para NOMİNAL % (TL pozisyonlarda kur/enflasyon düşülmemiş) — EUR bazlı pozisyon K/Z ayrı iş
    const { data: holdings } = await supabase.from('holdings').select('symbol,asset_type,purchase_price,current_price');
    const holdingsList = (holdings || []).filter(h => Number(h.purchase_price) > 0 && (h.asset_type === 'stock' || h.asset_type === 'crypto'));
    const sortedByPnl = holdingsList
      .map(h => ({ symbol: h.symbol, pnlPct: ((Number(h.current_price) - Number(h.purchase_price)) / Number(h.purchase_price)) * 100 }))
      .sort((a, b) => b.pnlPct - a.pnlPct);
    const bestPerformer = sortedByPnl[0] || null;
    const worstPerformer = sortedByPnl[sortedByPnl.length - 1] || null;

    // Bu haftaki gerçekleşen gelir
    const { data: incomes } = await supabase
      .from('income_records')
      .select('income_type, source_symbol, amount_try, income_date')
      .gte('income_date', weekStartStr)
      .eq('is_projected', false);
    const weekIncomeEUR = toEUR((incomes || []).reduce((s, r) => s + (Number(r.amount_try) || 0), 0));
    const breakdownMap = new Map<string, number>();
    for (const r of (incomes || [])) {
      const key = `${r.income_type}${r.source_symbol ? ' ' + r.source_symbol : ''}`;
      breakdownMap.set(key, (breakdownMap.get(key) || 0) + toEUR(Number(r.amount_try) || 0));
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
      weekEnd: weekEndLabel,
      wealthEUR,
      weekGainEUR,
      weekGainPct,
      bestPerformer,
      worstPerformer,
      weekIncomeEUR,
      weekIncomeBreakdown,
      weekActionsCompleted: [],
      thisWeekTodos,
      healthOk: model.health.ok,
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
