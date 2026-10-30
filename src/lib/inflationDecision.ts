// YIL SONU ENFLASYON PAYI — SAHİBİN ONAYI OLMADAN DÜŞÜLMEZ (kullanıcı kuralı 2026-10-30)
// Motor (monthlyRows) yıl boyunca payı yalnız biriktirir. Yılın son ayında:
//   · karar yok          → hiçbir şey düşülmez, "onay bekliyor" gösterilir
//   · 'approved'         → onaylanan tutar O YILIN SON AYINDA bir kez düşülür
//   · 'declined'         → o yıl hiçbir şey düşülmez
// Karar portfoy_bolt_salary_policy.inflation_decisions (jsonb) sütununda yıl anahtarıyla durur:
//   { "2026": { year, decision, rate, amountEUR, decidedAt } }
// Sütun yoksa (migration henüz uygulanmadıysa) karar yok sayılır → yine hiçbir şey düşülmez.

export type InflationDecisionKind = 'approved' | 'declined';

export interface InflationDecision {
  year: number;
  decision: InflationDecisionKind;
  /** Yıllık oran, 0.022 = %2,2 */
  rate: number;
  /** Onaylanan (düşülecek) tutar, EUR. 'declined' için 0. */
  amountEUR: number;
  /** ISO zaman damgası */
  decidedAt: string;
}

export type InflationDecisions = Record<string, InflationDecision>;

/** Aylık oran: (1 + yıllık)^(1/12) − 1 */
export function monthlyInflationRate(annual: number): number {
  return Math.pow(1 + annual, 1 / 12) - 1;
}

/** Yılın enflasyon tabanından (Σ ay başı servet × gün oranı) verilen yıllık oranla tutar. */
export function inflationAmountForRate(yearBaseEUR: number, annualRate: number): number {
  if (!Number.isFinite(yearBaseEUR) || yearBaseEUR <= 0) return 0;
  if (!Number.isFinite(annualRate) || annualRate < 0) return 0;
  return yearBaseEUR * monthlyInflationRate(annualRate);
}

/** "2,2" / "2.2" / "%2,2" → 0.022. Geçersiz ya da 0–25 dışıysa null. */
export function parseRatePercent(input: string): number | null {
  const s = String(input ?? '').replace('%', '').replace(',', '.').trim();
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0 || n > 25) return null;
  return n / 100;
}

/** jsonb'den gelen ham değeri doğrular. Bozuk kayıt yok sayılır (yok sayılan yıl düşülmez). */
export function parseInflationDecisions(raw: unknown): InflationDecisions {
  let obj: unknown = raw;
  if (typeof raw === 'string') { try { obj = JSON.parse(raw); } catch { return {}; } }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return {};
  const out: InflationDecisions = {};
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (!/^\d{4}$/.test(k) || !v || typeof v !== 'object') continue;
    const d = v as Record<string, unknown>;
    const decision = d.decision;
    if (decision !== 'approved' && decision !== 'declined') continue;
    const rate = Number(d.rate);
    const amount = Number(d.amountEUR);
    if (!Number.isFinite(rate) || rate < 0 || rate > 0.25) continue;
    if (decision === 'approved' && !(Number.isFinite(amount) && amount >= 0)) continue;
    out[k] = {
      year: Number(k),
      decision,
      rate,
      amountEUR: decision === 'approved' ? amount : 0,
      decidedAt: typeof d.decidedAt === 'string' ? d.decidedAt : '',
    };
  }
  return out;
}

/** Yeni kararı ekler. O yıl zaten karar varsa DEĞİŞTİRMEZ (yılda tek karar) ve null döner. */
export function addInflationDecision(
  existing: InflationDecisions,
  d: { year: number; decision: InflationDecisionKind; rate: number; amountEUR: number },
  now: Date = new Date(),
): InflationDecisions | null {
  const key = String(d.year);
  if (existing[key]) return null;
  const amountEUR = d.decision === 'approved' ? Math.round(Math.max(0, d.amountEUR) * 100) / 100 : 0;
  return { ...existing, [key]: { year: d.year, decision: d.decision, rate: d.rate, amountEUR, decidedAt: now.toISOString() } };
}

/** Onay kartında gösterilecek yıllar: yılın son satırına ulaşılmış (Aralık ya da sonraki yılın verisi var) ve kararı olmayan yıllar. */
export interface PendingInflationYear { year: number; month: string; baseEUR: number; defaultAmountEUR: number }
export function pendingInflationYears(
  rows: Array<{ month: string; inflationDecision?: 'approved' | 'declined' | 'pending'; inflationYearBaseEUR?: number; inflationAwaitingApprovalEUR?: number }>,
): PendingInflationYear[] {
  return rows
    .filter(r => r.inflationDecision === 'pending' && (r.inflationAwaitingApprovalEUR ?? 0) > 0)
    .map(r => ({ year: Number(r.month.slice(0, 4)), month: r.month, baseEUR: r.inflationYearBaseEUR ?? 0, defaultAmountEUR: r.inflationAwaitingApprovalEUR ?? 0 }));
}

const eurInt = (n: number) => `€${Math.round(Math.abs(n)).toLocaleString('de-DE')}`;

/** Ekranlar ve raporlar için TEK cümle. Düşülmüş bir pay varsa null (çağıran düşülen tutarı kendisi yazar). */
export function inflationStatusText(r: {
  inflationEUR?: number;
  inflationDecision?: 'approved' | 'declined' | 'pending';
  inflationAwaitingApprovalEUR?: number;
} | null | undefined): string | null {
  if (!r) return INFLATION_RULE_TEXT;
  if ((r.inflationEUR ?? 0) > 0) return null;
  if (r.inflationDecision === 'pending' && (r.inflationAwaitingApprovalEUR ?? 0) > 0) return `Enflasyon payı onay bekliyor: ~${eurInt(r.inflationAwaitingApprovalEUR ?? 0)}`;
  if (r.inflationDecision === 'declined') return 'Bu yıl enflasyon payı düşülmedi (senin kararın)';
  return INFLATION_RULE_TEXT;
}

export const INFLATION_RULE_TEXT = 'Enflasyon payı yıl sonunda yalnız senin onayınla düşülür';
