// Günlük net değişim: bugünkü toplam (TL) vs son portfolio_snapshots kaydı (TL).
// İkisi de dashboard toplamının kullandığı EUR/TRY kuruyla euroya çevrilir.
export interface DailyNetChange { nowEUR: number; prevEUR: number; changeEUR: number; changePct: number; prevDate: string }

export function dailyNetChange(nowTRY: number, prevTRY: number | null | undefined, eurTry: number, prevDate: string): DailyNetChange | null {
  if (!(eurTry > 0) || !(nowTRY > 0) || !prevTRY || !(prevTRY > 0)) return null;
  const nowEUR = nowTRY / eurTry;
  const prevEUR = prevTRY / eurTry;
  const changeEUR = nowEUR - prevEUR;
  return { nowEUR, prevEUR, changeEUR, changePct: (changeEUR / prevEUR) * 100, prevDate };
}
