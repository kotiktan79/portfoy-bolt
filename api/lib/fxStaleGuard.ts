// 2026-10-13: EUR/TRY gün boyu 55.11 kaldı (36 satır), Yahoo kapanışı ~55.31.
// Sapma %0.36, kapanış kârı günler arasında ~€460 kaydı. Bu modül yalnız karar verir;
// euro motoruna dokunmaz. Çağıran, seçilen kuru eskisi gibi source='api' yazar
// (motor exchange_rates'te source=api / ecb okur).

export const FX_DEVIATION_LIMIT = 0.002; // %0.2 — bunun üstü yedek kaynağa geçer
export const FX_SANITY_LIMIT = 0.10; // %10 — tek yedek bu kadar ayrılıyorsa bozuk sayılır
export const FX_STALE_REPEAT = 6;
export const FX_STALE_HOURS = 6;

export interface FxSample {
  rate: number;
  recordedAt: string;
}

export interface FxDecision {
  rate: number | null;
  action: 'primary' | 'secondary' | 'none';
  stale: boolean;
  deviation: number | null;
  secondaryName: string | null;
  /** Doluysa çağıran bunu günlüğe yazmalı. */
  log: string | null;
}

function positive(n: number | null | undefined): n is number {
  return typeof n === 'number' && Number.isFinite(n) && n > 0;
}

function sameQuote(a: number, b: number): boolean {
  return Math.abs(a - b) <= 0.00005;
}

function fmt(n: number): string {
  return n.toFixed(4);
}

function pct(fraction: number): string {
  return (fraction * 100).toFixed(2);
}

/** recent en yeni başta olmak zorunda değil; içeride sıralanır. */
export function isStuckPrimary(
  primary: number,
  recent: FxSample[],
  now: number,
  repeat = FX_STALE_REPEAT,
  staleHours = FX_STALE_HOURS,
): boolean {
  const samples = recent
    .filter(s => positive(s.rate) && Number.isFinite(Date.parse(s.recordedAt)))
    .sort((a, b) => Date.parse(b.recordedAt) - Date.parse(a.recordedAt));
  if (samples.length < repeat) return false;
  const window = samples.slice(0, repeat);
  if (!window.every(s => sameQuote(s.rate, primary))) return false;
  const oldest = Math.min(...window.map(s => Date.parse(s.recordedAt)));
  return now - oldest >= staleHours * 3_600_000;
}

export function decideFxRate(input: {
  pair: string;
  primary: number | null;
  secondary: number | null;
  secondaryName?: string | null;
  recent?: FxSample[];
  now?: number;
}): FxDecision {
  const now = input.now ?? Date.now();
  const primary = positive(input.primary) ? input.primary : null;
  const secondary = positive(input.secondary) ? input.secondary : null;
  const name = input.secondaryName || 'yedek';
  const stale = primary != null && isStuckPrimary(primary, input.recent ?? [], now);
  const deviation = primary != null && secondary != null
    ? Math.abs(primary - secondary) / secondary
    : null;
  const base = {
    stale,
    deviation,
    secondaryName: secondary != null ? name : null,
  };

  if (primary == null && secondary == null) {
    return { ...base, rate: null, action: 'none', log: null };
  }

  if (primary == null && secondary != null) {
    return {
      ...base,
      rate: secondary,
      action: 'secondary',
      log: `${input.pair}: birincil yok — yedek ${name} ${fmt(secondary)} kullanıldı`,
    };
  }

  if (secondary == null || primary == null) {
    return {
      ...base,
      rate: primary,
      action: 'primary',
      log: stale
        ? `${input.pair}: birincil ${fmt(primary!)} son ${FX_STALE_REPEAT} kayıtta aynı (≥${FX_STALE_HOURS} saat) ama yedek kaynak yok — birincil korundu`
        : null,
    };
  }

  if (deviation != null && deviation > FX_SANITY_LIMIT) {
    return {
      ...base,
      rate: primary,
      action: 'primary',
      log: `${input.pair}: yedek ${name} ${fmt(secondary)} sapma %${pct(deviation)} (> %${pct(FX_SANITY_LIMIT)}), yok sayıldı — birincil ${fmt(primary)} korundu`,
    };
  }

  const disagrees = deviation != null && deviation > FX_DEVIATION_LIMIT && !sameQuote(primary, secondary);
  if (stale || disagrees) {
    if (sameQuote(primary, secondary)) {
      return { ...base, rate: primary, action: 'primary', log: null };
    }
    const why: string[] = [];
    if (stale) why.push(`birincil ${fmt(primary)} son ${FX_STALE_REPEAT} kayıtta aynı (≥${FX_STALE_HOURS} saat)`);
    if (disagrees && deviation != null) why.push(`sapma %${pct(deviation)} (> %${pct(FX_DEVIATION_LIMIT)})`);
    return {
      ...base,
      rate: secondary,
      action: 'secondary',
      log: `${input.pair}: ${why.join('; ')} — yedek ${name} ${fmt(secondary)} kullanıldı`,
    };
  }

  return { ...base, rate: primary, action: 'primary', log: null };
}
