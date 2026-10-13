// DİNAMİK MAAŞ — taban, kasa tamponu, iyi ayda kasa doldurma (2026-10-13).
//
// Mevcut kural AYNEN durur (eurPnl.entitlementEUR):
//   havuzdan = min(aylık tavan €1.000, havuz × %85), havuz tavanı €12.000.
// Bu dosya onun ÜSTÜNE ekler:
//   havuzdan gelen tutar tabanın (€700) altındaysa fark kasadan önerilir,
//   kasa bu yüzden €15.000 altına inecekse önerilmez.
//   Havuzdan gelen tutar tavana dayandıysa, kalan reel kârın bir kısmı
//   (varsayılan %50) daha önce kasadan alınan tutarı, kasa €29.400'e çıkana kadar geri koyar.
//
// Saf fonksiyon: ekran, test ve AI aynı hesabı kullanır. Para hareketi yapmaz.

import { entitlementEUR, MONTHLY_CAP_EUR, SALARY_SAFETY } from './eurPnl';

export const SALARY_FLOOR_EUR = 700;
export const KASA_MIN_EUR = 15_000;
export const KASA_START_EUR = 29_400;
export const KASA_REFILL_RATIO = 0.5;
export const SALARY_START_MONTH = '2027-04';

export interface SalaryPlanInput {
  /** Kapanmış ayın havuz bakiyesi (carryOut). Eksi = açık. */
  poolEUR: number;
  /** O ayın reel kârı. İyi ayda kasa doldurma buna bakar. */
  realGainEUR: number;
  /** Kasanın bugünkü euro karşılığı. */
  kasaEUR: number;
  /** Daha önce maaş için kasadan alınıp henüz geri konmamış tutar. */
  kasaDrawnOutstandingEUR?: number;
  floorEUR?: number;
  capEUR?: number;
  kasaMinEUR?: number;
  kasaStartEUR?: number;
  refillRatio?: number;
  /** Bakılan takvim ayı (YYYY-AA). Maaş başlangıcından önceyse ön izleme. */
  asOfMonth?: string;
  salaryStartMonth?: string;
  safety?: number;
}

export interface SalaryPlan {
  fromPoolEUR: number;
  fromKasaEUR: number;
  totalEUR: number;
  kasaEUR: number;
  kasaMinEUR: number;
  /** Kasa − alt sınır. Eksi ise kasa sınırın altında. */
  distanceToFloorEUR: number;
  /** Fark vardı ama kasa sınırın altına ineceği için tamamlanmadı. */
  topUpBlocked: boolean;
  refillEUR: number;
  preview: boolean;
  floorEUR: number;
  capEUR: number;
  kasaStartEUR: number;
  refillRatio: number;
}

export function planSalary(inp: SalaryPlanInput): SalaryPlan {
  const floor = num(inp.floorEUR, SALARY_FLOOR_EUR);
  const cap = num(inp.capEUR, MONTHLY_CAP_EUR);
  const kasaMin = num(inp.kasaMinEUR, KASA_MIN_EUR);
  const kasaStart = num(inp.kasaStartEUR, KASA_START_EUR);
  const ratio = clamp01(inp.refillRatio ?? KASA_REFILL_RATIO);
  const safety = inp.safety ?? SALARY_SAFETY;
  const kasa = Math.max(0, Number(inp.kasaEUR) || 0);

  // Havuzdan: mevcut %85 ve aylık tavan. Taban bu tutarla kıyaslanır.
  const fromPool = round2(Math.min(cap, entitlementEUR(Number(inp.poolEUR) || 0, safety, cap)));
  const gap = round2(Math.max(0, floor - fromPool));

  let fromKasa = 0;
  let topUpBlocked = false;
  if (gap > 0) {
    if (kasa - gap >= kasaMin) fromKasa = gap;
    else topUpBlocked = true;
  }

  // İyi ay: havuzdan gelen maaş tavana dayandıysa, kalan reel kârın bir kısmı kasayı doldurur.
  const hitCap = cap > 0 && fromPool >= cap - 0.001;
  const remainingReal = Math.max(0, (Number(inp.realGainEUR) || 0) - fromPool);
  const drawn = Math.max(0, Number(inp.kasaDrawnOutstandingEUR) || 0);
  const room = Math.max(0, kasaStart - kasa);
  const refill = hitCap ? round2(Math.min(remainingReal * ratio, drawn, room)) : 0;

  const start = inp.salaryStartMonth ?? SALARY_START_MONTH;
  const preview = !!(inp.asOfMonth && start && inp.asOfMonth < start);

  return {
    fromPoolEUR: fromPool,
    fromKasaEUR: fromKasa,
    totalEUR: round2(fromPool + fromKasa),
    kasaEUR: kasa,
    kasaMinEUR: kasaMin,
    distanceToFloorEUR: round2(kasa - kasaMin),
    topUpBlocked,
    refillEUR: refill,
    preview,
    floorEUR: floor,
    capEUR: cap,
    kasaStartEUR: kasaStart,
    refillRatio: ratio,
  };
}

/** Kasa defterinden hâlâ geri konmamış tutar: topup − refill. */
export function kasaOutstandingEUR(moves: Array<{ kind: string; amount_eur: number | string | null }>): number {
  let top = 0, back = 0;
  for (const m of moves) {
    const a = Math.max(0, Number(m.amount_eur) || 0);
    if (m.kind === 'topup') top += a;
    else if (m.kind === 'refill') back += a;
  }
  return round2(Math.max(0, top - back));
}

function num(v: number | undefined, fallback: number): number {
  return Number.isFinite(v) ? Number(v) : fallback;
}
function clamp01(n: number): number {
  if (!Number.isFinite(n)) return KASA_REFILL_RATIO;
  return Math.min(1, Math.max(0, n));
}
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
