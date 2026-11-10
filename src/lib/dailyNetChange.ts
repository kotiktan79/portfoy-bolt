export interface DailyNetChange {
  nowEUR: number | null; prevEUR: number | null; changeEUR: number; changePct: number | null; prevDate: string;
  estimated: boolean;
}

/** Açık gün: her toplam kendi gününün kuruyla. Eski kur yoksa rakam üretilmez. */
export function dailyNetChange(nowTRY: number, prevTRY: number | null | undefined, eurTry: number, prevDate: string, prevEurTry: number): DailyNetChange | null {
  if (!(eurTry > 0) || !(prevEurTry > 0) || !(nowTRY > 0) || !prevTRY || !(prevTRY > 0)) return null;
  const nowEUR = nowTRY / eurTry;
  const prevEUR = prevTRY / prevEurTry;
  const changeEUR = nowEUR - prevEUR;
  return { nowEUR, prevEUR, changeEUR, changePct: (changeEUR / prevEUR) * 100, prevDate, estimated: true };
}

export interface DailyClose { report_date: string; pnl_eur_day: number | null; wealth_eur?: number | null }
export function officialDailyChange(report: DailyClose | null): DailyNetChange | null {
  if (report?.pnl_eur_day == null || !Number.isFinite(Number(report.pnl_eur_day))) return null;
  return { nowEUR: report.wealth_eur ?? null, prevEUR: null, changeEUR: Number(report.pnl_eur_day), changePct: null,
    prevDate: report.report_date, estimated: false };
}
