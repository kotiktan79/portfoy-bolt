import { Resend } from 'resend';

// Resend API key Vercel env'den okunur. Yoksa email atılmaz, sessizce geçer.
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const EMAIL_TO = process.env.EMAIL_TO || 'tanertuncer@yahoo.com';
const EMAIL_FROM = process.env.EMAIL_FROM || 'Tandor Finans <onboarding@resend.dev>';

export interface EmailResult {
  sent: boolean;
  reason?: string;
  id?: string;
}

export async function sendEmail(subject: string, html: string): Promise<EmailResult> {
  if (!RESEND_API_KEY) {
    return { sent: false, reason: 'RESEND_API_KEY not set' };
  }
  try {
    const resend = new Resend(RESEND_API_KEY);
    const { data, error } = await resend.emails.send({
      from: EMAIL_FROM,
      to: EMAIL_TO,
      subject,
      html,
    });
    if (error) return { sent: false, reason: error.message || String(error) };
    return { sent: true, id: data?.id };
  } catch (err: any) {
    return { sent: false, reason: err.message || 'send error' };
  }
}

// Ortak HTML stil (inline — email client compat)
const styleBase = `
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: #f8fafc;
  color: #0f172a;
  padding: 24px;
  max-width: 640px;
  margin: 0 auto;
`;

const card = (content: string) => `
  <div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:18px;margin-bottom:14px;">
    ${content}
  </div>
`;

const fmt = (n: number, dec = 0) =>
  (n || 0).toLocaleString('tr-TR', { minimumFractionDigits: dec, maximumFractionDigits: dec });

const greenIfPos = (n: number) => (n >= 0 ? '#059669' : '#dc2626');

// ============================================================
// DAILY EMAIL
// ============================================================
export interface DailySnapshot {
  date: string;
  totalValueTry: number;
  totalValueUsd: number;
  dailyChangeTry: number;
  dailyChangePct: number;
  weeklyChangeTry: number;
  weeklyChangePct: number;
  monthlyChangeTry: number;
  monthlyChangePct: number;
  topPick: string;
  portfolioDiagnosis: string;
  marketOutlook: string;
  actions: any[];
  safeMonthly: number;
  moderateMonthly: number;
  passiveMonthlyUsd: number;
  salaryTargetUsd: number;
}

export function buildDailyEmail(d: DailySnapshot): { subject: string; html: string } {
  const subject = `📊 Tandor Finans · Günlük · ${d.date} · ${d.dailyChangePct >= 0 ? '+' : ''}${d.dailyChangePct.toFixed(2)}%`;

  const actionList = (d.actions || []).slice(0, 5).map((a, i) => `
    <div style="padding:10px 0;border-bottom:1px solid #f1f5f9;">
      <div style="font-size:13px;font-weight:600;color:#0f172a;">
        ${i + 1}. ${a.symbol || '—'} · <span style="color:#6366f1;text-transform:uppercase;font-size:11px;">${a.type || 'hold'}</span>
      </div>
      <div style="font-size:12px;color:#475569;margin-top:2px;">${a.instruction || a.detail || ''}</div>
    </div>
  `).join('') || '<div style="color:#64748b;font-size:13px;">Bugün için aksiyon yok.</div>';

  const html = `
    <div style="${styleBase}">
      <h1 style="font-size:18px;margin:0 0 4px;color:#312e81;">Günaydın, Tandor Finans</h1>
      <p style="font-size:13px;color:#64748b;margin:0 0 16px;">${d.date} · Günlük brifing</p>

      ${card(`
        <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:1px;font-weight:700;">Toplam Varlık</div>
        <div style="font-size:28px;font-weight:800;color:#0f172a;margin:4px 0;">₺${fmt(d.totalValueTry)}</div>
        <div style="font-size:13px;color:#64748b;">≈ $${fmt(d.totalValueUsd)} USD</div>
        <div style="display:flex;gap:18px;margin-top:14px;">
          <div>
            <div style="font-size:10px;color:#94a3b8;text-transform:uppercase;">Günlük</div>
            <div style="font-size:14px;font-weight:700;color:${greenIfPos(d.dailyChangeTry)};">
              ${d.dailyChangeTry >= 0 ? '+' : ''}${fmt(d.dailyChangeTry)} ₺
            </div>
            <div style="font-size:11px;color:${greenIfPos(d.dailyChangeTry)};">
              ${d.dailyChangePct >= 0 ? '+' : ''}${d.dailyChangePct.toFixed(2)}%
            </div>
          </div>
          <div>
            <div style="font-size:10px;color:#94a3b8;text-transform:uppercase;">Haftalık</div>
            <div style="font-size:14px;font-weight:700;color:${greenIfPos(d.weeklyChangeTry)};">
              ${d.weeklyChangeTry >= 0 ? '+' : ''}${fmt(d.weeklyChangeTry)} ₺
            </div>
            <div style="font-size:11px;color:${greenIfPos(d.weeklyChangeTry)};">
              ${d.weeklyChangePct >= 0 ? '+' : ''}${d.weeklyChangePct.toFixed(2)}%
            </div>
          </div>
          <div>
            <div style="font-size:10px;color:#94a3b8;text-transform:uppercase;">Aylık</div>
            <div style="font-size:14px;font-weight:700;color:${greenIfPos(d.monthlyChangeTry)};">
              ${d.monthlyChangeTry >= 0 ? '+' : ''}${fmt(d.monthlyChangeTry)} ₺
            </div>
            <div style="font-size:11px;color:${greenIfPos(d.monthlyChangeTry)};">
              ${d.monthlyChangePct >= 0 ? '+' : ''}${d.monthlyChangePct.toFixed(2)}%
            </div>
          </div>
        </div>
      `)}

      ${card(`
        <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:1px;font-weight:700;">Maaş Durumu — $${d.salaryTargetUsd}/ay hedef</div>
        <div style="display:flex;gap:18px;margin-top:8px;">
          <div>
            <div style="font-size:10px;color:#94a3b8;text-transform:uppercase;">Mevcut pasif</div>
            <div style="font-size:18px;font-weight:800;color:#059669;">$${d.passiveMonthlyUsd.toFixed(0)}/ay</div>
          </div>
          <div>
            <div style="font-size:10px;color:#94a3b8;text-transform:uppercase;">Güvenli (%4)</div>
            <div style="font-size:18px;font-weight:800;color:#0f172a;">₺${fmt(d.safeMonthly)}/ay</div>
          </div>
          <div>
            <div style="font-size:10px;color:#94a3b8;text-transform:uppercase;">Dengeli (%6)</div>
            <div style="font-size:18px;font-weight:800;color:#6366f1;">₺${fmt(d.moderateMonthly)}/ay</div>
          </div>
        </div>
      `)}

      ${d.topPick ? card(`
        <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:1px;font-weight:700;">Top Pick</div>
        <div style="font-size:14px;color:#0f172a;margin-top:4px;line-height:1.5;">${d.topPick}</div>
      `) : ''}

      ${d.portfolioDiagnosis ? card(`
        <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:1px;font-weight:700;">Portföy Tanı</div>
        <div style="font-size:13px;color:#334155;margin-top:4px;line-height:1.6;">${d.portfolioDiagnosis}</div>
      `) : ''}

      ${d.actions?.length ? card(`
        <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:1px;font-weight:700;margin-bottom:6px;">Bugünün Aksiyonları</div>
        ${actionList}
      `) : ''}

      ${d.marketOutlook ? card(`
        <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:1px;font-weight:700;">Piyasa Görünümü</div>
        <div style="font-size:12px;color:#475569;margin-top:4px;line-height:1.6;">${d.marketOutlook}</div>
      `) : ''}

      <div style="text-align:center;font-size:11px;color:#94a3b8;margin-top:20px;">
        Detay: <a href="https://portfoy-bolt.vercel.app/daily-report" style="color:#6366f1;">portfoy-bolt.vercel.app/daily-report</a>
      </div>
    </div>
  `;

  return { subject, html };
}

// ============================================================
// WEEKLY EMAIL
// ============================================================
export interface WeeklySnapshot {
  weekStart: string;
  weekEnd: string;
  totalValueTry: number;
  weekStartValueTry: number;
  weekChangeTry: number;
  weekChangePct: number;
  bestPerformer: { symbol: string; pnlPct: number; name?: string } | null;
  worstPerformer: { symbol: string; pnlPct: number; name?: string } | null;
  weekIncomeTry: number;
  weekIncomeBreakdown: { type: string; amount: number }[];
  weekActionsCompleted: string[];
  thisWeekTodos: string[];
}

export function buildWeeklyEmail(w: WeeklySnapshot): { subject: string; html: string } {
  const subject = `📈 Tandor Finans · Hafta ${w.weekStart} → ${w.weekEnd} · ${w.weekChangePct >= 0 ? '+' : ''}${w.weekChangePct.toFixed(2)}%`;

  const incomeRows = w.weekIncomeBreakdown.length > 0
    ? w.weekIncomeBreakdown.map(r => `
        <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #f1f5f9;">
          <span style="font-size:13px;color:#475569;">${r.type}</span>
          <span style="font-size:13px;font-weight:700;color:#059669;">+₺${fmt(r.amount)}</span>
        </div>
      `).join('')
    : '<div style="font-size:13px;color:#94a3b8;">Bu hafta gelir kaydı yok.</div>';

  const todoList = w.thisWeekTodos.length > 0
    ? w.thisWeekTodos.map((t, i) => `
        <div style="padding:8px 0;border-bottom:1px solid #f1f5f9;font-size:13px;">
          <span style="color:#6366f1;font-weight:700;">${i + 1}.</span> ${t}
        </div>
      `).join('')
    : '<div style="font-size:13px;color:#94a3b8;">Yapılacak iş yok.</div>';

  const html = `
    <div style="${styleBase}">
      <h1 style="font-size:18px;margin:0 0 4px;color:#312e81;">Haftalık Özet</h1>
      <p style="font-size:13px;color:#64748b;margin:0 0 16px;">${w.weekStart} → ${w.weekEnd}</p>

      ${card(`
        <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:1px;font-weight:700;">Hafta Sonucu</div>
        <div style="font-size:28px;font-weight:800;color:${greenIfPos(w.weekChangeTry)};margin:6px 0;">
          ${w.weekChangeTry >= 0 ? '+' : ''}₺${fmt(w.weekChangeTry)}
        </div>
        <div style="font-size:14px;color:${greenIfPos(w.weekChangeTry)};">
          ${w.weekChangePct >= 0 ? '+' : ''}${w.weekChangePct.toFixed(2)}% · Portföy ₺${fmt(w.totalValueTry)}
        </div>
      `)}

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
        ${w.bestPerformer ? `<div style="background:#ecfdf5;border:1px solid #a7f3d0;border-radius:10px;padding:14px;">
          <div style="font-size:10px;color:#065f46;text-transform:uppercase;font-weight:700;">En İyi</div>
          <div style="font-size:16px;font-weight:800;color:#0f172a;">${w.bestPerformer.symbol}</div>
          <div style="font-size:13px;color:#059669;">+${w.bestPerformer.pnlPct.toFixed(1)}%</div>
        </div>` : ''}
        ${w.worstPerformer ? `<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:14px;">
          <div style="font-size:10px;color:#7f1d1d;text-transform:uppercase;font-weight:700;">En Kötü</div>
          <div style="font-size:16px;font-weight:800;color:#0f172a;">${w.worstPerformer.symbol}</div>
          <div style="font-size:13px;color:#dc2626;">${w.worstPerformer.pnlPct.toFixed(1)}%</div>
        </div>` : ''}
      </div>

      ${card(`
        <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:1px;font-weight:700;margin-bottom:6px;">Bu Haftanın Geliri</div>
        <div style="font-size:20px;font-weight:800;color:#059669;margin-bottom:8px;">+₺${fmt(w.weekIncomeTry)}</div>
        ${incomeRows}
      `)}

      ${card(`
        <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:1px;font-weight:700;margin-bottom:6px;">Gelecek Hafta İşler</div>
        ${todoList}
      `)}

      <div style="text-align:center;font-size:11px;color:#94a3b8;margin-top:20px;">
        <a href="https://portfoy-bolt.vercel.app" style="color:#6366f1;">portfoy-bolt.vercel.app</a>
      </div>
    </div>
  `;

  return { subject, html };
}

// ============================================================
// MONTHLY EMAIL
// ============================================================
export interface MonthlySnapshot {
  monthLabel: string;
  totalValueTry: number;
  monthStartValueTry: number;
  monthChangeTry: number;
  monthChangePct: number;
  realizedIncomeTry: number;
  monthIncomeBreakdown: { type: string; amount: number }[];
  totalDividendsYearTry: number;
  salaryTargetUsd: number;
  salaryActualUsd: number;
  salaryFulfilledPct: number;
  topGainersThisMonth: { symbol: string; pnlPct: number }[];
  withdrawalRatePctYTD: number;
  diagnosisAi: string;
}

export function buildMonthlyEmail(m: MonthlySnapshot): { subject: string; html: string } {
  const subject = `🗓️ Tandor Finans · Aylık · ${m.monthLabel} · ${m.monthChangePct >= 0 ? '+' : ''}${m.monthChangePct.toFixed(2)}%`;

  const incomeRows = m.monthIncomeBreakdown.length > 0
    ? m.monthIncomeBreakdown.map(r => `
        <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #f1f5f9;">
          <span style="font-size:13px;color:#475569;">${r.type}</span>
          <span style="font-size:13px;font-weight:700;color:#059669;">+₺${fmt(r.amount)}</span>
        </div>
      `).join('')
    : '<div style="font-size:13px;color:#94a3b8;">Bu ay gelir kaydı yok.</div>';

  const gainers = m.topGainersThisMonth.length
    ? m.topGainersThisMonth.slice(0, 5).map(g => `
        <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #f1f5f9;">
          <span style="font-size:13px;font-weight:600;color:#0f172a;">${g.symbol}</span>
          <span style="font-size:13px;font-weight:700;color:#059669;">+${g.pnlPct.toFixed(1)}%</span>
        </div>
      `).join('')
    : '';

  const fulfilledColor = m.salaryFulfilledPct >= 100 ? '#059669' : m.salaryFulfilledPct >= 70 ? '#d97706' : '#dc2626';

  const html = `
    <div style="${styleBase}">
      <h1 style="font-size:18px;margin:0 0 4px;color:#312e81;">Aylık Rapor</h1>
      <p style="font-size:13px;color:#64748b;margin:0 0 16px;">${m.monthLabel}</p>

      ${card(`
        <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:1px;font-weight:700;">Ay Sonucu</div>
        <div style="font-size:28px;font-weight:800;color:${greenIfPos(m.monthChangeTry)};margin:6px 0;">
          ${m.monthChangeTry >= 0 ? '+' : ''}₺${fmt(m.monthChangeTry)}
        </div>
        <div style="font-size:14px;color:${greenIfPos(m.monthChangeTry)};">
          ${m.monthChangePct >= 0 ? '+' : ''}${m.monthChangePct.toFixed(2)}% · Şu an ₺${fmt(m.totalValueTry)}
        </div>
      `)}

      ${card(`
        <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:1px;font-weight:700;">Maaş Hedefi — $${m.salaryTargetUsd}/ay</div>
        <div style="display:flex;align-items:baseline;gap:8px;margin-top:6px;">
          <div style="font-size:24px;font-weight:800;color:${fulfilledColor};">$${m.salaryActualUsd.toFixed(0)}</div>
          <div style="font-size:13px;color:#64748b;">/ $${m.salaryTargetUsd}</div>
        </div>
        <div style="margin-top:10px;height:8px;background:#e2e8f0;border-radius:4px;overflow:hidden;">
          <div style="height:100%;width:${Math.min(100, m.salaryFulfilledPct).toFixed(1)}%;background:${fulfilledColor};"></div>
        </div>
        <div style="font-size:12px;color:#64748b;margin-top:6px;">
          %${m.salaryFulfilledPct.toFixed(0)} tutturuldu · YTD çekim oranı %${m.withdrawalRatePctYTD.toFixed(1)}/yıl
        </div>
      `)}

      ${card(`
        <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:1px;font-weight:700;margin-bottom:6px;">Bu Ayın Geliri</div>
        <div style="font-size:20px;font-weight:800;color:#059669;margin-bottom:8px;">+₺${fmt(m.realizedIncomeTry)}</div>
        ${incomeRows}
      `)}

      ${gainers ? card(`
        <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:1px;font-weight:700;margin-bottom:6px;">Top Yükselenler</div>
        ${gainers}
      `) : ''}

      ${m.diagnosisAi ? card(`
        <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:1px;font-weight:700;">AI Yorumu</div>
        <div style="font-size:13px;color:#334155;margin-top:4px;line-height:1.6;">${m.diagnosisAi}</div>
      `) : ''}

      <div style="text-align:center;font-size:11px;color:#94a3b8;margin-top:20px;">
        <a href="https://portfoy-bolt.vercel.app" style="color:#6366f1;">Detay için panele gir</a>
      </div>
    </div>
  `;

  return { subject, html };
}
