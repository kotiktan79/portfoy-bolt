// Fiyat: son işlem gününden eskiyse rozet. Araştırma: takvim günü X'i geçerse rozet.
// Hafta sonu işlem günü sayılmaz. Bilinmeyen tarih rozet basmaz.

export const RESEARCH_STALE_DAYS = 7;

function utcDay(iso: string): Date {
  return new Date(iso.slice(0, 10) + 'T00:00:00Z');
}

function fmt(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Bugünden bir önceki hafta içi (Pazartesi–Cuma). */
export function previousWeekday(today: string): string {
  const d = utcDay(today);
  d.setUTCDate(d.getUTCDate() - 1);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() - 1);
  return fmt(d);
}

/** Fiyat günü, bugün veya bir önceki işlem gününden eskiyse bayat. */
export function isPriceStale(priceDay: string | null | undefined, today: string): boolean {
  if (!priceDay) return false;
  const day = priceDay.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  if (day >= today.slice(0, 10)) return false;
  return day < previousWeekday(today);
}

export function researchAgeDays(reportDay: string, today: string): number {
  const ms = utcDay(today).getTime() - utcDay(reportDay).getTime();
  return Math.round(ms / 86400000);
}

export function isResearchStale(
  reportDay: string | null | undefined,
  today: string,
  maxDays = RESEARCH_STALE_DAYS,
): boolean {
  if (!reportDay) return false;
  return researchAgeDays(reportDay, today) > maxDays;
}

/** Manuel fiyatta elle giriş günü; yoksa fiyat geçmişi; o da yoksa kaydın güncellenme günü. */
export function holdingPriceDay(
  holding: { manual_price?: boolean | null; manual_price_updated_at?: string | null; updated_at?: string | null },
  historyDay?: string | null,
): string | null {
  if (holding.manual_price && holding.manual_price_updated_at) return holding.manual_price_updated_at.slice(0, 10);
  if (historyDay) return historyDay.slice(0, 10);
  if (holding.updated_at) return holding.updated_at.slice(0, 10);
  return null;
}
