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
  (n || 0).toLocaleString('tr-TR', { maximumFractionDigits: 0 });

const sign = (n: number) => (n >= 0 ? '+' : '');
const arrow = (n: number) => (n >= 0 ? '🟢' : '🔴');

export function buildDailyTelegram(d: DailySnapshot): string {
  const lines = [
    `📊 <b>Günlük · ${escapeHtml(d.date)}</b>`,
    `₺${fmt(d.totalValueTry)} (≈$${fmt(d.totalValueUsd)})`,
    ``,
    `${arrow(d.dailyChangeTry)} Gün: ${sign(d.dailyChangeTry)}₺${fmt(d.dailyChangeTry)} (${sign(d.dailyChangePct)}${d.dailyChangePct.toFixed(2)}%)`,
    `${arrow(d.weeklyChangeTry)} Hafta: ${sign(d.weeklyChangeTry)}₺${fmt(d.weeklyChangeTry)} (${sign(d.weeklyChangePct)}${d.weeklyChangePct.toFixed(2)}%)`,
    `${arrow(d.monthlyChangeTry)} Ay: ${sign(d.monthlyChangeTry)}₺${fmt(d.monthlyChangeTry)} (${sign(d.monthlyChangePct)}${d.monthlyChangePct.toFixed(2)}%)`,
    ``,
    `🎯 Maaş hedef: $${d.salaryTargetUsd}/ay`,
    `Pasif: $${d.passiveMonthlyUsd.toFixed(0)}/ay · Güvenli: ₺${fmt(d.safeMonthly)}/ay`,
  ];
  if (d.topPick) {
    lines.push('', `🥇 ${escapeHtml(d.topPick.slice(0, 200))}`);
  }
  return lines.join('\n');
}

export function buildWeeklyTelegram(w: WeeklySnapshot): string {
  const lines = [
    `📈 <b>Hafta · ${escapeHtml(w.weekStart)} → ${escapeHtml(w.weekEnd)}</b>`,
    `${sign(w.weekChangeTry)}₺${fmt(w.weekChangeTry)} (${sign(w.weekChangePct)}${w.weekChangePct.toFixed(2)}%)`,
    `Portföy: ₺${fmt(w.totalValueTry)}`,
  ];
  if (w.bestPerformer) {
    lines.push('', `🟢 En iyi: <b>${escapeHtml(w.bestPerformer.symbol)}</b> +${w.bestPerformer.pnlPct.toFixed(1)}%`);
  }
  if (w.worstPerformer) {
    lines.push(`🔴 En kötü: <b>${escapeHtml(w.worstPerformer.symbol)}</b> ${w.worstPerformer.pnlPct.toFixed(1)}%`);
  }
  lines.push('', `💰 Bu hafta gelir: +₺${fmt(w.weekIncomeTry)}`);
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
    `🗓️ <b>Aylık · ${escapeHtml(m.monthLabel)}</b>`,
    `${sign(m.monthChangeTry)}₺${fmt(m.monthChangeTry)} (${sign(m.monthChangePct)}${m.monthChangePct.toFixed(2)}%)`,
    `Portföy: ₺${fmt(m.totalValueTry)}`,
    ``,
    `💸 Maaş: $${m.salaryActualUsd.toFixed(0)} / $${m.salaryTargetUsd} (${m.salaryFulfilledPct.toFixed(0)}%)`,
    `YTD çekim oranı: %${m.withdrawalRatePctYTD.toFixed(1)}/yıl`,
    ``,
    `💰 Gerçekleşen gelir: +₺${fmt(m.realizedIncomeTry)}`,
  ];
  if (m.topGainersThisMonth.length > 0) {
    lines.push('', `🏆 Top yükselen:`);
    m.topGainersThisMonth.slice(0, 3).forEach(g => {
      lines.push(`• ${escapeHtml(g.symbol)} +${g.pnlPct.toFixed(1)}%`);
    });
  }
  return lines.join('\n');
}
