import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { sendEmail, buildMonthlyEmail } from '../lib/email.js';
import { sendTelegram, buildMonthlyTelegram } from '../lib/telegram.js';
import { requireCronAuth } from '../lib/auth.js';
import { sendPushToAll } from '../lib/push.js';
import { loadEurModel, monthLabelTR, fmtEUR, fmtSignedEUR } from '../lib/eurEngine.js';

// AYLIK RAPOR — TEK ÖLÇÜ EUR (2026-09-19). Her ayın 1'i 07:00 UTC: geçen ayın kârı (servet farkı − dış akış),
// enflasyon payı, zarar devri ve BU AYIN MAAŞI (= geçen ayın çekilebilir reel kârı × 0,85) ilan edilir.
// Hesap: api/lib/eurEngine → src/lib/eurPnl.ts (uygulamayla aynı fonksiyon).

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

    // Ay sınırları UTC (snapshot_date UTC günüdür; yerel TZ'ye bağlı kaymasın)
    const now = new Date();
    const thisYM = now.toISOString().slice(0, 7);
    const y = now.getUTCFullYear(), m0 = now.getUTCMonth();               // 0-based, bu ay
    const prevFirst = new Date(Date.UTC(y, m0 - 1, 1));
    const prevLast = new Date(Date.UTC(y, m0, 0));
    const monthStart = prevFirst.toISOString().slice(0, 10);
    const monthEnd = prevLast.toISOString().slice(0, 10);
    const reportYM = monthStart.slice(0, 7);
    const monthLabel = monthLabelTR(reportYM);

    const model = await loadEurModel(supabase);
    const row = model.months.find(r => r.month === reportYM);
    if (!row) {
      log.push(`EUR motorunda ${reportYM} satırı yok, rapor atlandı.`);
      return res.status(200).json({ success: false, log });
    }
    log.push(`EUR motoru: ${monthLabel} kâr ${fmtSignedEUR(row.gainEUR)}, reel ${fmtSignedEUR(row.realGainEUR)}, maaş ${fmtEUR(row.salaryEUR)}, kur ${model.health.ok ? 'güncel' : 'ESKİ'}`);
    const eurRateAtEnd = model.daily.filter(d => d.date <= monthEnd).pop()?.eurRate || model.daily[model.daily.length - 1]?.eurRate || 0;
    const toEUR = (tl: number) => (eurRateAtEnd > 0 ? tl / eurRateAtEnd : 0);

    // Bu ay kaydedilen gelir (income_records TL → ay sonu kuruyla EUR)
    const { data: incomes } = await supabase
      .from('income_records')
      .select('income_type, source_symbol, amount_try, income_date')
      .gte('income_date', monthStart)
      .lte('income_date', monthEnd)
      .eq('is_projected', false);
    const realizedIncomeEUR = toEUR((incomes || []).reduce((s, r) => s + (Number(r.amount_try) || 0), 0));
    const breakdownMap = new Map<string, number>();
    for (const r of (incomes || [])) {
      const key = `${r.income_type}${r.source_symbol ? ' ' + r.source_symbol : ''}`;
      breakdownMap.set(key, (breakdownMap.get(key) || 0) + toEUR(Number(r.amount_try) || 0));
    }
    const monthIncomeBreakdown = Array.from(breakdownMap.entries()).map(([type, amount]) => ({ type, amount }));

    // En yüksek nominal kazançlar (yerel para, kuruluştan) — bilgi amaçlı; EUR bazlı pozisyon K/Z ayrı iş
    const { data: holdings } = await supabase.from('holdings').select('symbol,asset_type,purchase_price,current_price');
    const topGainersThisMonth = (holdings || [])
      .filter((h: any) => Number(h.purchase_price) > 0 && h.asset_type === 'stock')
      .map((h: any) => ({ symbol: h.symbol, pnlPct: ((Number(h.current_price) - Number(h.purchase_price)) / Number(h.purchase_price)) * 100 }))
      .sort((a: any, b: any) => b.pnlPct - a.pnlPct)
      .slice(0, 5);

    // Son AI yorum
    const { data: lastReport } = await supabase
      .from('daily_reports')
      .select('portfolio_diagnosis')
      .order('report_date', { ascending: false })
      .limit(1)
      .maybeSingle();

    const snapshot = {
      monthLabel,
      salaryMonthLabel: monthLabelTR(thisYM),
      startWealthEUR: row.startWealthEUR, endWealthEUR: row.endWealthEUR,
      gainEUR: row.gainEUR, inflationEUR: row.inflationEUR, realGainEUR: row.realGainEUR,
      carryInEUR: row.carryInEUR, withdrawableEUR: row.withdrawableEUR, carryOutEUR: row.carryOutEUR,
      salaryEUR: row.salaryEUR,
      realizedIncomeEUR,
      monthIncomeBreakdown,
      topGainersThisMonth,
      yearRows: model.months.filter(r => r.month <= reportYM).map(r => ({ month: monthLabelTR(r.month), gainEUR: r.gainEUR, salaryEUR: r.salaryEUR })),
      diagnosisAi: lastReport?.portfolio_diagnosis || '',
      healthOk: model.health.ok,
    };
    const { subject, html } = buildMonthlyEmail(snapshot);
    const emailRes = await sendEmail(subject, html);
    log.push(emailRes.sent ? `Email gönderildi: ${emailRes.id}` : `Email atlandı: ${emailRes.reason}`);

    const tgRes = await sendTelegram(buildMonthlyTelegram(snapshot));
    log.push(tgRes.sent ? `Telegram gönderildi` : `Telegram atlandı: ${tgRes.reason}`);

    await sendPushToAll({
      title: `💸 ${snapshot.salaryMonthLabel} maaşı: ${fmtEUR(row.salaryEUR)}`,
      body: `${monthLabel}: nominal ${fmtSignedEUR(row.gainEUR)} · reel ${fmtSignedEUR(row.realGainEUR)} · devir ${fmtSignedEUR(row.carryOutEUR)}`,
      url: '/performance',
      tag: 'monthly-report',
    }).catch((e) => console.error('[push] gönderim hatası:', e));

    return res.status(200).json({ success: true, month: reportYM, row, log });
  } catch (err: any) {
    log.push(`HATA: ${err.message}`);
    return res.status(500).json({ success: false, error: err.message, log });
  }
}
