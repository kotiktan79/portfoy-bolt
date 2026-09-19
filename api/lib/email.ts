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
// DAILY EMAIL — TEK ÖLÇÜ EUR (2026-09-19). Kâr = servet farkı − dış akış (api/lib/eurEngine).
// ============================================================
const eur = (n: number, dec = 0) => `€${fmt(Math.abs(n), dec)}`;
const seur = (n: number, dec = 0) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${eur(n, dec)}`;
const spct = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toFixed(2)}%`;   // tek hassasiyet: eurEngine.fmtSignedPct ile aynı

export interface DailySnapshot {
  date: string;
  asOf: string;                 // rakamların snapshot günü
  wealthEUR: number; wealthTRY: number; eurRate: number;
  dayGainEUR: number; dayGainPct: number;
  weekGainEUR: number; weekGainPct: number;
  mtdGainEUR: number; mtdInflationEUR: number; mtdRealEUR: number; carryInEUR: number;
  salaryEUR: number; salaryMonthLabel: string; salaryBasisLabel: string;   // bu ayın maaşı = geçen ay (basis) çekilebilir × 0,85
  projectedSalaryEUR: number; nextMonthLabel: string;                      // MTD'ye göre gelecek ay ön izleme
  healthOk: boolean;
  topPick: string;
  portfolioDiagnosis: string;
  marketOutlook: string;
  actions: any[];
}

const statBox = (label: string, valueEUR: number, pct?: number) => `
  <div>
    <div style="font-size:10px;color:#94a3b8;text-transform:uppercase;">${label}</div>
    <div style="font-size:14px;font-weight:700;color:${greenIfPos(valueEUR)};">${seur(valueEUR)}</div>
    ${pct === undefined ? '' : `<div style="font-size:11px;color:${greenIfPos(valueEUR)};">${spct(pct)}</div>`}
  </div>`;

export function buildDailyEmail(d: DailySnapshot): { subject: string; html: string } {
  const subject = `📊 Tandor Finans · Günlük · ${d.date} · ${seur(d.dayGainEUR)}`;

  const actionList = (d.actions || []).slice(0, 5).map((a, i) => `
    <div style="padding:10px 0;border-bottom:1px solid #f1f5f9;">
      <div style="font-size:13px;font-weight:600;color:#0f172a;">
        ${i + 1}. ${a.symbol || '—'} · <span style="color:#6366f1;text-transform:uppercase;font-size:11px;">${a.type || 'hold'}</span>${Number(a.amount_eur) > 0 ? ` · ${eur(Number(a.amount_eur))}` : ''}
      </div>
      <div style="font-size:12px;color:#475569;margin-top:2px;">${a.instruction || a.detail || ''}</div>
    </div>
  `).join('') || '<div style="color:#64748b;font-size:13px;">Bugün için aksiyon yok.</div>';

  const html = `
    <div style="${styleBase}">
      <h1 style="font-size:18px;margin:0 0 4px;color:#312e81;">Günaydın, Tandor Finans</h1>
      <p style="font-size:13px;color:#64748b;margin:0 0 16px;">${d.date} · Günlük brifing · tek ölçü EUR</p>
      ${d.healthOk ? '' : `<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:10px;margin-bottom:14px;font-size:12px;color:#7f1d1d;">⚠️ Kur serisi güncel değil — EUR rakamları güvenilmez olabilir.</div>`}
      ${d.asOf === d.date ? '' : `<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:10px;margin-bottom:14px;font-size:12px;color:#78350f;">⚠️ Rakamlar ${d.asOf} snapshot'ına ait — bugünün snapshot'ı alınmamış.</div>`}

      ${card(`
        <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:1px;font-weight:700;">Servet · ${d.asOf}</div>
        <div style="font-size:28px;font-weight:800;color:#0f172a;margin:4px 0;">${eur(d.wealthEUR)}</div>
        <div style="font-size:13px;color:#64748b;">≈ ₺${fmt(d.wealthTRY)} · EUR/TRY ${d.eurRate.toFixed(2)}</div>
        <div style="display:flex;gap:18px;margin-top:14px;">
          ${statBox('Son gün', d.dayGainEUR, d.dayGainPct)}
          ${statBox('Son 7 gün', d.weekGainEUR, d.weekGainPct)}
          ${statBox('Bu ay (nominal)', d.mtdGainEUR)}
        </div>
      `)}

      ${card(`
        <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:1px;font-weight:700;">Dinamik Maaş — ${d.salaryMonthLabel}</div>
        <div style="display:flex;align-items:baseline;gap:8px;margin-top:6px;">
          <div style="font-size:24px;font-weight:800;color:${d.salaryEUR > 0 ? '#059669' : '#64748b'};">${eur(d.salaryEUR)}</div>
          <div style="font-size:12px;color:#64748b;">= ${d.salaryBasisLabel} çekilebilir reel kârı × 0,85</div>
        </div>
        <div style="display:flex;gap:18px;margin-top:12px;">
          <div>
            <div style="font-size:10px;color:#94a3b8;text-transform:uppercase;">Bu ay reel</div>
            <div style="font-size:14px;font-weight:700;color:${greenIfPos(d.mtdRealEUR)};">${seur(d.mtdRealEUR)}</div>
            <div style="font-size:11px;color:#94a3b8;">enflasyon payı −${eur(d.mtdInflationEUR)}</div>
          </div>
          <div>
            <div style="font-size:10px;color:#94a3b8;text-transform:uppercase;">Devreden açık</div>
            <div style="font-size:14px;font-weight:700;color:${d.carryInEUR < 0 ? '#dc2626' : '#059669'};">${seur(d.carryInEUR)}</div>
          </div>
          <div>
            <div style="font-size:10px;color:#94a3b8;text-transform:uppercase;">${d.nextMonthLabel} ön izleme</div>
            <div style="font-size:14px;font-weight:700;color:#6366f1;">${eur(d.projectedSalaryEUR)}</div>
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
// WEEKLY EMAIL — EUR
// ============================================================
export interface WeeklySnapshot {
  weekStart: string;
  weekEnd: string;
  wealthEUR: number;
  weekGainEUR: number;          // motor: akış düzeltilmiş
  weekGainPct: number;
  bestPerformer: { symbol: string; pnlPct: number; name?: string } | null;   // yerel para nominal %
  worstPerformer: { symbol: string; pnlPct: number; name?: string } | null;
  weekIncomeEUR: number;
  weekIncomeBreakdown: { type: string; amount: number }[];   // EUR
  weekActionsCompleted: string[];
  thisWeekTodos: string[];
  healthOk: boolean;
}

export function buildWeeklyEmail(w: WeeklySnapshot): { subject: string; html: string } {
  const subject = `📈 Tandor Finans · Hafta ${w.weekStart} → ${w.weekEnd} · ${seur(w.weekGainEUR)}`;

  const incomeRows = w.weekIncomeBreakdown.length > 0
    ? w.weekIncomeBreakdown.map(r => `
        <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #f1f5f9;">
          <span style="font-size:13px;color:#475569;">${r.type}</span>
          <span style="font-size:13px;font-weight:700;color:${greenIfPos(r.amount)};">${seur(r.amount)}</span>
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
      <p style="font-size:13px;color:#64748b;margin:0 0 16px;">${w.weekStart} → ${w.weekEnd} · tek ölçü EUR</p>
      ${w.healthOk ? '' : `<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:10px;margin-bottom:14px;font-size:12px;color:#7f1d1d;">⚠️ Kur serisi güncel değil.</div>`}

      ${card(`
        <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:1px;font-weight:700;">Hafta Kârı (akış düzeltilmiş)</div>
        <div style="font-size:28px;font-weight:800;color:${greenIfPos(w.weekGainEUR)};margin:6px 0;">${seur(w.weekGainEUR)}</div>
        <div style="font-size:14px;color:${greenIfPos(w.weekGainEUR)};">${spct(w.weekGainPct)} · Servet ${eur(w.wealthEUR)}</div>
      `)}

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
        ${w.bestPerformer ? `<div style="background:#ecfdf5;border:1px solid #a7f3d0;border-radius:10px;padding:14px;">
          <div style="font-size:10px;color:#065f46;text-transform:uppercase;font-weight:700;">En İyi (nominal, yerel para)</div>
          <div style="font-size:16px;font-weight:800;color:#0f172a;">${w.bestPerformer.symbol}</div>
          <div style="font-size:13px;color:${greenIfPos(w.bestPerformer.pnlPct)};">${spct(w.bestPerformer.pnlPct)}</div>
        </div>` : ''}
        ${w.worstPerformer ? `<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:14px;">
          <div style="font-size:10px;color:#7f1d1d;text-transform:uppercase;font-weight:700;">En Kötü (nominal, yerel para)</div>
          <div style="font-size:16px;font-weight:800;color:#0f172a;">${w.worstPerformer.symbol}</div>
          <div style="font-size:13px;color:${greenIfPos(w.worstPerformer.pnlPct)};">${spct(w.worstPerformer.pnlPct)}</div>
        </div>` : ''}
      </div>

      ${card(`
        <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:1px;font-weight:700;margin-bottom:6px;">Bu Haftanın Geliri</div>
        <div style="font-size:20px;font-weight:800;color:${greenIfPos(w.weekIncomeEUR)};margin-bottom:8px;">${seur(w.weekIncomeEUR)}</div>
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
// MONTHLY EMAIL — EUR (ayın 1'i: geçen ayın kârı + bu ayın maaşı ilanı)
// ============================================================
export interface MonthlySnapshot {
  monthLabel: string;              // raporlanan (geçen) ay
  salaryMonthLabel: string;        // maaşın ödeneceği (bu) ay
  startWealthEUR: number; endWealthEUR: number;
  gainEUR: number; inflationEUR: number; realGainEUR: number;
  carryInEUR: number; withdrawableEUR: number; carryOutEUR: number;
  salaryEUR: number;
  realizedIncomeEUR: number;
  monthIncomeBreakdown: { type: string; amount: number }[];   // EUR
  topGainersThisMonth: { symbol: string; pnlPct: number }[];  // yerel para nominal (kuruluştan)
  yearRows: { month: string; gainEUR: number; salaryEUR: number }[];   // güvenilir dönem, ay ay
  diagnosisAi: string;
  healthOk: boolean;
}

export function buildMonthlyEmail(m: MonthlySnapshot): { subject: string; html: string } {
  const subject = `🗓️ Tandor Finans · ${m.monthLabel} kârı ${seur(m.gainEUR)} · ${m.salaryMonthLabel} maaşı ${eur(m.salaryEUR)}`;

  const incomeRows = m.monthIncomeBreakdown.length > 0
    ? m.monthIncomeBreakdown.map(r => `
        <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #f1f5f9;">
          <span style="font-size:13px;color:#475569;">${r.type}</span>
          <span style="font-size:13px;font-weight:700;color:${greenIfPos(r.amount)};">${seur(r.amount)}</span>
        </div>
      `).join('')
    : '<div style="font-size:13px;color:#94a3b8;">Bu ay gelir kaydı yok.</div>';

  const gainers = m.topGainersThisMonth.length
    ? m.topGainersThisMonth.slice(0, 5).map(g => `
        <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #f1f5f9;">
          <span style="font-size:13px;font-weight:600;color:#0f172a;">${g.symbol}</span>
          <span style="font-size:13px;font-weight:700;color:${greenIfPos(g.pnlPct)};">${spct(g.pnlPct)}</span>
        </div>
      `).join('')
    : '';

  const yearRows = m.yearRows.map(r => `
      <div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid #f1f5f9;font-size:12px;">
        <span style="color:#475569;">${r.month}</span>
        <span style="font-weight:700;color:${greenIfPos(r.gainEUR)};">${seur(r.gainEUR)}</span>
        <span style="color:#64748b;">maaş ${eur(r.salaryEUR)}</span>
      </div>`).join('');

  const row = (label: string, v: number, signed = true, color?: string) => `
      <div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid #f1f5f9;font-size:13px;">
        <span style="color:#475569;">${label}</span>
        <span style="font-weight:700;color:${color || greenIfPos(v)};">${signed ? seur(v) : eur(v)}</span>
      </div>`;

  const html = `
    <div style="${styleBase}">
      <h1 style="font-size:18px;margin:0 0 4px;color:#312e81;">Aylık Rapor · ${m.monthLabel}</h1>
      <p style="font-size:13px;color:#64748b;margin:0 0 16px;">tek ölçü EUR · kâr = servet farkı − dış akış · enflasyon %2/yıl · zarar devreder</p>
      ${m.healthOk ? '' : `<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:10px;margin-bottom:14px;font-size:12px;color:#7f1d1d;">⚠️ Kur serisi güncel değil — rakamlar güvenilmez olabilir.</div>`}

      ${card(`
        <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:1px;font-weight:700;">${m.monthLabel} Kârı</div>
        <div style="font-size:28px;font-weight:800;color:${greenIfPos(m.gainEUR)};margin:6px 0;">${seur(m.gainEUR)}</div>
        <div style="font-size:13px;color:#64748b;">Servet ${eur(m.startWealthEUR)} → ${eur(m.endWealthEUR)}</div>
        <div style="margin-top:10px;">
          ${row('Nominal kâr', m.gainEUR)}
          ${row('Enflasyon payı (sermaye koruma)', -m.inflationEUR, true, '#64748b')}
          ${row('Reel kâr', m.realGainEUR)}
          ${row('Devreden açık (ay başı)', m.carryInEUR, true, m.carryInEUR < 0 ? '#dc2626' : '#64748b')}
          ${row('Çekilebilir', m.withdrawableEUR, false, '#0f172a')}
          ${row('Devreden açık (ay sonu)', m.carryOutEUR, true, m.carryOutEUR < 0 ? '#dc2626' : '#64748b')}
        </div>
      `)}

      ${card(`
        <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:1px;font-weight:700;">${m.salaryMonthLabel} Maaşı</div>
        <div style="display:flex;align-items:baseline;gap:8px;margin-top:6px;">
          <div style="font-size:28px;font-weight:800;color:${m.salaryEUR > 0 ? '#059669' : '#64748b'};">${eur(m.salaryEUR)}</div>
          <div style="font-size:13px;color:#64748b;">= çekilebilir ${eur(m.withdrawableEUR)} × 0,85</div>
        </div>
        ${m.salaryEUR === 0 ? `<div style="font-size:12px;color:#7f1d1d;margin-top:6px;">Bu ay maaş yok: açık ${eur(m.carryOutEUR)} kapanınca başlar. Ana paraya dokunulmaz.</div>` : ''}
      `)}

      ${card(`
        <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:1px;font-weight:700;margin-bottom:6px;">Ay Ay (güvenilir dönem)</div>
        ${yearRows || '<div style="font-size:13px;color:#94a3b8;">Veri yok.</div>'}
      `)}

      ${card(`
        <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:1px;font-weight:700;margin-bottom:6px;">Bu Ayın Kaydedilen Geliri</div>
        <div style="font-size:20px;font-weight:800;color:${greenIfPos(m.realizedIncomeEUR)};margin-bottom:8px;">${seur(m.realizedIncomeEUR)}</div>
        ${incomeRows}
      `)}

      ${gainers ? card(`
        <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:1px;font-weight:700;margin-bottom:6px;">En Yüksek Nominal Kazançlar (yerel para, kuruluştan)</div>
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
