// Aylık maaş hedefi — Hedef sayfasının birincil ölçüsü.
// Sermaye hedefi bundan türetilir (requiredRealCapital). Şema ve maaş motoru değişmez.

/** Planlanan çekim oranı. Sayfa varsayılanı budur. */
export const PLANNED_WITHDRAWAL_PCT = 5;
/** Planlanan nominal getiri. Yaklaşık %6–8 bandı. Eski sayfa varsayılanı %4'tü. */
export const PLANNED_NOMINAL_RETURN_PCT = 6.5;
/** Muhafazakâr çekim oranı. Eski varsayılan; seçenek olarak durur. */
export const CONSERVATIVE_WITHDRAWAL_PCT = 4;

/**
 * Görünen sürdürülebilir maaş, hedefin bu kadar altındaysa "sınırda".
 * Hedefi karşılıyorsa sürdürülebilir; daha altta kısa geliyor.
 */
export const SALARY_SHORTFALL_BAND = 0.1;

export type SalaryCoverage = 'sürdürülebilir' | 'sınırda' | 'kısa geliyor';

/**
 * Durum, ekranda yuvarlanan euro ile kıyaslanır (fmtEUR0 ile aynı yuvarlama).
 * Hedef yoksa kısa geliyor.
 */
export function salaryCoverage(sustainableMonthly: number, goalMonthly: number): SalaryCoverage {
  const goal = Number(goalMonthly);
  if (!(goal > 0) || !Number.isFinite(goal)) return 'kısa geliyor';
  const raw = Number(sustainableMonthly);
  const shown = Number.isFinite(raw) ? Math.round(Math.max(0, raw)) : 0;
  const shownGoal = Math.round(goal);
  if (shown >= shownGoal) return 'sürdürülebilir';
  const border = Math.round(shownGoal * (1 - SALARY_SHORTFALL_BAND));
  if (shown >= border) return 'sınırda';
  return 'kısa geliyor';
}

/** Sürdürülebilir maaş / aylık hedef, yüzde. Üst sınır yok. Hedef yoksa 0. */
export function salaryProgressPct(sustainableMonthly: number, goalMonthly: number): number {
  const goal = Number(goalMonthly);
  if (!(goal > 0) || !Number.isFinite(goal)) return 0;
  const raw = Number(sustainableMonthly);
  const shown = Number.isFinite(raw) ? Math.max(0, raw) : 0;
  return (shown / goal) * 100;
}

/**
 * Sabit reel aylık çekim bugünkü sermayeyi yaklaşık kaç yıl taşır.
 * Ay sonu çekim, reel getiri aylık bileşik: g = (1+r)^(1/12) − 1,
 * ay = ln(w / (w − C·g)) / ln(1+g).
 * Çekim reel getirinin altındaysa Infinity (sermaye erimez).
 * Sermaye 0 ise 0. Çekim 0 ise Infinity. Geçersizse null.
 */
export function fixedRealWithdrawalYears(
  capitalEUR: number,
  monthlyEUR: number,
  realReturnPct: number,
): number | null {
  const capital = Number(capitalEUR);
  const monthly = Number(monthlyEUR);
  const annualReal = Number(realReturnPct) / 100;
  if (!Number.isFinite(capital) || capital < 0) return null;
  if (capital === 0) return 0;
  if (!Number.isFinite(monthly) || monthly < 0) return null;
  if (monthly === 0) return Infinity;
  if (!Number.isFinite(annualReal)) return null;
  if (annualReal <= -1) return 0;

  const growth = Math.pow(1 + annualReal, 1 / 12) - 1;
  if (growth > 0 && monthly <= capital * growth + 1e-9) return Infinity;
  if (Math.abs(growth) < 1e-15) return capital / (monthly * 12);

  const denom = monthly - capital * growth;
  if (!(denom > 0)) return Infinity;
  const ratio = monthly / denom;
  if (!(ratio > 0) || !(1 + growth > 0)) return null;
  const months = Math.log(ratio) / Math.log(1 + growth);
  if (!Number.isFinite(months) || months < 0) return null;
  return months / 12;
}

/** "yaklaşık 16,0 yıl" / "sermayeyi eritmez" / "süremez". null ise boş. */
export function roughYearsPhrase(years: number | null): string {
  if (years == null) return '';
  if (!Number.isFinite(years)) return 'sermayeyi eritmez';
  if (years <= 0) return 'süremez';
  const shown = Math.round(years * 10) / 10;
  const text = shown.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return `yaklaşık ${text} yıl`;
}
