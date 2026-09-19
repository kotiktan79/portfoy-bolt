import type { DailySnapshot, WeeklySnapshot, MonthlySnapshot } from './email.js';

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '';

export interface TelegramResult {
  sent: boolean;
  reason?: string;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export async function sendTelegram(text: string): Promise<TelegramResult> {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    return { sent: false, reason: 'TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set' };
  }
  try {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    });
    if (!resp.ok) {
      const body = await resp.text();
      return { sent: false, reason: `HTTP ${resp.status}: ${body.slice(0, 200)}` };
    }
    return { sent: true };
  } catch (err: any) {
    return { sent: false, reason: err.message || 'send error' };
  }
}

const fmt = (n: number) =>
  (Math.abs(n) || 0).toLocaleString('tr-TR', { maximumFractionDigits: 0 });

const eur = (n: number) => `€${fmt(n)}`;
const seur = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${eur(n)}`;
const spct = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toFixed(2)}%`;
const arrow = (n: number) => (n > 0 ? '🟢' : n < 0 ? '🔴' : '⚪');

// TEK ÖLÇÜ EUR (2026-09-19): kâr = servet farkı − dış akış; maaş = geçen ayın reel kârı × 0,85
export function buildDailyTelegram(d: DailySnapshot): string {
  const lines = [
    `📊 <b>Günlük · ${escapeHtml(d.date)}</b>`,
    `Servet ${eur(d.wealthEUR)} (≈ ₺${fmt(d.wealthTRY)} · ${d.eurRate.toFixed(2)})`,
    ``,
    `${arrow(d.dayGainEUR)} Gün: ${seur(d.dayGainEUR)} (${spct(d.dayGainPct)})`,
    `${arrow(d.weekGainEUR)} 7 gün: ${seur(d.weekGainEUR)} (${spct(d.weekGainPct)})`,
    `${arrow(d.mtdGainEUR)} Bu ay: ${seur(d.mtdGainEUR)} nominal · reel ${seur(d.mtdRealEUR)}`,
    ``,
    `💸 ${escapeHtml(d.salaryMonthLabel)} maaşı: <b>${eur(d.salaryEUR)}</b> (${escapeHtml(d.salaryBasisLabel)} çekilebilir × 0,85)`,
    d.carryInEUR < 0 ? `⛔ Devreden açık ${seur(d.carryInEUR)} → ${escapeHtml(d.nextMonthLabel)} ön izleme ${eur(d.projectedSalaryEUR)}` : `➡️ ${escapeHtml(d.nextMonthLabel)} ön izleme ${eur(d.projectedSalaryEUR)}`,
  ];
  if (!d.healthOk) lines.push('', '⚠️ Kur serisi güncel değil — rakamlar güvenilmez olabilir.');
  if (d.topPick) {
    lines.push('', `🥇 ${escapeHtml(d.topPick.slice(0, 200))}`);
  }
  return lines.join('\n');
}

export function buildWeeklyTelegram(w: WeeklySnapshot): string {
  const lines = [
    `📈 <b>Hafta · ${escapeHtml(w.weekStart)} → ${escapeHtml(w.weekEnd)}</b>`,
    `${arrow(w.weekGainEUR)} Kâr: ${seur(w.weekGainEUR)} (${spct(w.weekGainPct)}) · akış düzeltilmiş`,
    `Servet: ${eur(w.wealthEUR)}`,
  ];
  if (w.bestPerformer) {
    lines.push('', `🟢 En iyi (nominal): <b>${escapeHtml(w.bestPerformer.symbol)}</b> +${w.bestPerformer.pnlPct.toFixed(1)}%`);
  }
  if (w.worstPerformer) {
    lines.push(`🔴 En kötü (nominal): <b>${escapeHtml(w.worstPerformer.symbol)}</b> ${w.worstPerformer.pnlPct.toFixed(1)}%`);
  }
  lines.push('', `💰 Bu hafta kaydedilen gelir: +${eur(w.weekIncomeEUR)}`);
  if (!w.healthOk) lines.push('', '⚠️ Kur serisi güncel değil.');
  if (w.thisWeekTodos.length > 0) {
    lines.push('', `📋 Yapılacak (${w.thisWeekTodos.length}):`);
    w.thisWeekTodos.slice(0, 3).forEach((t, i) => {
      lines.push(`${i + 1}. ${escapeHtml(t.slice(0, 120))}`);
    });
  }
  return lines.join('\n');
}

export function buildMonthlyTelegram(m: MonthlySnapshot): string {
  const lines = [
    `🗓️ <b>${escapeHtml(m.monthLabel)} kapanışı</b>`,
    `${arrow(m.gainEUR)} Nominal kâr: ${seur(m.gainEUR)} · servet ${eur(m.startWealthEUR)} → ${eur(m.endWealthEUR)}`,
    `Enflasyon payı −${eur(m.inflationEUR)} → reel ${seur(m.realGainEUR)}`,
    `Devreden açık: ${seur(m.carryInEUR)} → ${seur(m.carryOutEUR)}`,
    ``,
    `💸 <b>${escapeHtml(m.salaryMonthLabel)} maaşı: ${eur(m.salaryEUR)}</b> (çekilebilir ${eur(m.withdrawableEUR)} × 0,85)`,
  ];
  if (m.salaryEUR === 0) lines.push(`⛔ Maaş yok — açık ${eur(m.carryOutEUR)} kapanınca başlar. Ana paraya dokunulmaz.`);
  lines.push('', `💰 Kaydedilen gelir: +${eur(m.realizedIncomeEUR)}`);
  if (m.yearRows.length) {
    lines.push('', `📆 Ay ay:`);
    m.yearRows.forEach(r => lines.push(`• ${escapeHtml(r.month)}: ${seur(r.gainEUR)} · maaş ${eur(r.salaryEUR)}`));
  }
  if (!m.healthOk) lines.push('', '⚠️ Kur serisi güncel değil.');
  return lines.join('\n');
}
