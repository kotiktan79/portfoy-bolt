// Bu ay maaşı kartının cümleleri.
// Hesap burada yapılmaz. Tutarlar Kâr Cüzdanı ile aynı planSalary sonucudur:
//   toplam = "Toplam maaş", kârdan = "Bu ay havuzdan", kasadan = "Bu ay kasadan".
// Çekilen tutar da mevcut withdrawnMap ile aynı aya toplanır.

import { withdrawnMap } from './eurPnl';
import { planSalary, SALARY_START_MONTH } from './salaryPlan';

export const SALARY_RULE_LINE = 'Sadece bu kadar çek, fazlasını değil.';
export const INFLATION_NOTE = 'Enflasyon payı yıl sonunda senin onayınla düşülecek';

const TR_MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

export interface MonthSalaryInputs {
  /** İçinde bulunulan ay, YYYY-AA. Kâr Cüzdanı currentYM() ile aynı. */
  asOfMonth: string;
  poolEUR: number;
  realGainEUR: number;
  kasaEUR: number;
  withdrawnThisMonthEUR?: number;
  kasaDrawnOutstandingEUR?: number;
  floorEUR?: number;
  capEUR?: number;
  kasaMinEUR?: number;
  kasaStartEUR?: number;
  refillRatio?: number;
  salaryStartMonth?: string;
  /** İçinde bulunulan ayın akışa göre düzeltilmiş kârı/zararı (EUR). Para giriş/çıkışı ve düzeltme hariç, enflasyon düşülmez. */
  monthProfitEUR?: number | null;
  /** Yıl sonunda düşülmesi beklenen enflasyon payı (mevcut ayarla tahmin). */
  yearEndInflationEUR?: number | null;
  /** Yıl sonu payının onay durumu cümlesi ("Enflasyon payı onay bekliyor: ~€X"). Varsa tahmin notunun yerine geçer. */
  inflationStatusNote?: string | null;
}

export type MonthSalaryState = 'not_started' | 'open' | 'withdrawn';

export interface MonthSalaryCardView {
  state: MonthSalaryState;
  /** Maaş henüz başlamadıysa üst cümle. */
  notice: string | null;
  /** Büyük satır. */
  primary: string;
  sourceLine: string | null;
  rule: string;
  /** Ekranda yazılan tutar (çekildiyse o ayın maaşı). */
  shownEUR: number;
  fromPoolEUR: number;
  fromKasaEUR: number;
  /** Kâr Cüzdanı "Toplam maaş" — bu ayki çekim düşülmeden. */
  plannedTotalEUR: number;
  plannedFromPoolEUR: number;
  plannedFromKasaEUR: number;
  withdrawnThisMonthEUR: number;
  /** "Ekim 2026 kârı: −€535" — ayın TEK kâr rakamı. Veri yoksa null. */
  profitLine: string | null;
  monthProfitEUR: number | null;
  /** "Enflasyon payı yıl sonunda düşülecek (tahmini €X)". */
  inflationNote: string;
}

export function salaryMonthLabel(ym: string): string {
  const i = Number(ym.slice(5, 7)) - 1;
  return TR_MONTHS[i] ? `${TR_MONTHS[i]} ${ym.slice(0, 4)}` : ym;
}

export function salaryStartPhrase(ym: string): string {
  return `Maaş ${salaryMonthLabel(ym)}'de başlıyor`;
}

/** Kâr Cüzdanı fmt() ile aynı: en yakın euro, binlik ayırıcı nokta. */
export function formatSalaryEUR(n: number): string {
  return `€${Math.round(Math.abs(n)).toLocaleString('de-DE')}`;
}

/** İşaretli tutar: +€1.234 / −€535 / €0 */
export function formatSignedEUR(n: number): string {
  const r = Math.round(n);
  if (r === 0) return '€0';
  return `${r > 0 ? '+' : '−'}${formatSalaryEUR(r)}`;
}

export function monthProfitLine(ym: string, profitEUR: number | null | undefined): string | null {
  if (profitEUR == null || !Number.isFinite(Number(profitEUR))) return null;
  const v = Number(profitEUR);
  return `${salaryMonthLabel(ym)} ${Math.round(v) < 0 ? 'zararı' : 'kârı'}: ${formatSignedEUR(v)}`;
}

export function inflationNoteLine(yearEndEUR: number | null | undefined): string {
  const v = Number(yearEndEUR);
  return Number.isFinite(v) && Math.round(v) > 0 ? `${INFLATION_NOTE} (tahmini ${formatSalaryEUR(v)})` : INFLATION_NOTE;
}

/** Yalnız sıfır olmayan parça. İkisi de varsa: "Kârdan €A + kasadan €B". */
export function salarySourceLine(fromPoolEUR: number, fromKasaEUR: number): string | null {
  const pool = Math.round(fromPoolEUR);
  const kasa = Math.round(fromKasaEUR);
  if (pool === 0 && kasa === 0) return null;
  if (pool !== 0 && kasa !== 0) return `Kârdan ${formatSalaryEUR(pool)} + kasadan ${formatSalaryEUR(kasa)}`;
  if (pool !== 0) return `Kârdan ${formatSalaryEUR(pool)}`;
  return `Kasadan ${formatSalaryEUR(kasa)}`;
}

export function withdrawnThisMonthEUR(
  rows: Array<{ withdrawn_at: string; amount_usd?: number | string | null; amount_eur?: number | string | null }>,
  monthKey: string,
  eurRates: Array<{ recorded_at: string; rate: number }>,
  usdRates: Array<{ recorded_at: string; rate: number }>,
): number {
  return withdrawnMap(rows, eurRates, usdRates).get(monthKey) ?? 0;
}

export function buildMonthSalaryCard(inp: MonthSalaryInputs): MonthSalaryCardView {
  const plan = planSalary({
    poolEUR: inp.poolEUR,
    realGainEUR: inp.realGainEUR,
    kasaEUR: inp.kasaEUR,
    kasaDrawnOutstandingEUR: inp.kasaDrawnOutstandingEUR,
    floorEUR: inp.floorEUR,
    capEUR: inp.capEUR,
    kasaMinEUR: inp.kasaMinEUR,
    kasaStartEUR: inp.kasaStartEUR,
    refillRatio: inp.refillRatio,
    asOfMonth: inp.asOfMonth,
    salaryStartMonth: inp.salaryStartMonth,
  });
  const start = inp.salaryStartMonth || SALARY_START_MONTH;
  const withdrawn = Math.max(0, Number(inp.withdrawnThisMonthEUR) || 0);

  let fromPool = plan.fromPoolEUR;
  let fromKasa = plan.fromKasaEUR;
  let shown = plan.totalEUR;
  if (!plan.preview && withdrawn > 0) {
    fromPool = Math.max(0, plan.fromPoolEUR - withdrawn);
    fromKasa = Math.max(0, plan.fromKasaEUR - Math.max(0, withdrawn - plan.fromPoolEUR));
    shown = fromPool + fromKasa;
  }

  const shared = {
    rule: SALARY_RULE_LINE,
    plannedTotalEUR: plan.totalEUR,
    plannedFromPoolEUR: plan.fromPoolEUR,
    plannedFromKasaEUR: plan.fromKasaEUR,
    withdrawnThisMonthEUR: withdrawn,
    profitLine: monthProfitLine(inp.asOfMonth, inp.monthProfitEUR),
    monthProfitEUR: inp.monthProfitEUR == null || !Number.isFinite(Number(inp.monthProfitEUR)) ? null : Number(inp.monthProfitEUR),
    inflationNote: inp.inflationStatusNote || inflationNoteLine(inp.yearEndInflationEUR),
  };

  if (plan.preview) {
    return {
      ...shared,
      state: 'not_started',
      notice: salaryStartPhrase(start),
      primary: `Şu an başlasaydı: ${formatSalaryEUR(plan.totalEUR)}`,
      sourceLine: salarySourceLine(plan.fromPoolEUR, plan.fromKasaEUR),
      shownEUR: plan.totalEUR,
      fromPoolEUR: plan.fromPoolEUR,
      fromKasaEUR: plan.fromKasaEUR,
    };
  }

  if (plan.totalEUR > 0 && Math.round(shown) <= 0) {
    return {
      ...shared,
      state: 'withdrawn',
      notice: null,
      primary: `✅ Bu ayın maaşı çekildi (${formatSalaryEUR(plan.totalEUR)})`,
      sourceLine: null,
      shownEUR: plan.totalEUR,
      fromPoolEUR: 0,
      fromKasaEUR: 0,
    };
  }

  return {
    ...shared,
    state: 'open',
    notice: null,
    primary: `Bu ay çekebileceğin maaş: ${formatSalaryEUR(shown)}`,
    sourceLine: salarySourceLine(fromPool, fromKasa),
    shownEUR: shown,
    fromPoolEUR: fromPool,
    fromKasaEUR: fromKasa,
  };
}
