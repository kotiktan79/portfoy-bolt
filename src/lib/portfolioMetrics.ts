// Unified portfolio metrics — TEK doğru kaynak.
// Her PnL/değer/oran hesabı bu dosyadan geçer. Component'lar burada hesaplanan
// değerleri kullanır, kendileri formül yazmaz.
//
// Tasarım kuralları:
//  1. Tüm tutarlar TRY base'inde döner (UI USD'ye çevirmek için fxRates.usd kullansın)
//  2. Cash holding'ler (asset_type === 'cash') yatırım metriklerine dahil değil
//  3. holding.currency içinde tutulan current_price/purchase_price doğrudur (kontrat)
//  4. FX rates holdings içindeki USD/EUR/GBP sembollerinden okunur, yoksa fallback
//  5. Pure functions — DB çağrısı YOK, sadece input → output (test edilebilir)

import { Holding } from './supabase';
import { FxRates, getFxRatesFromHoldings, holdingValueTRY, holdingCostTRY } from './fx';

// ============================================================
// TYPES
// ============================================================

export interface PortfolioMetrics {
  totalValueTRY: number;
  totalCostTRY: number;
  totalPnLTRY: number;
  totalPnLPct: number;
  totalValueUSD: number;
  totalCostUSD: number;
  totalPnLUSD: number;
  holdingCount: number;
  fxRates: FxRates;
}

export interface HoldingMetric {
  holding: Holding;
  valueTRY: number;
  costTRY: number;
  pnlTRY: number;
  pnlPct: number;
  weight: number;
}

export interface ClassMetric {
  asset_type: string;
  count: number;
  valueTRY: number;
  costTRY: number;
  pnlTRY: number;
  pnlPct: number;
  weight: number;
}

export interface PeriodChange {
  changeTRY: number;
  changePct: number;
  prevValueTRY: number;
  currentValueTRY: number;
  cashFlowTRY: number;
}

export interface SnapshotLite {
  total_value: number | string;
  total_investment?: number | string | null;
  total_pnl?: number | string | null;
  total_deposits?: number | string | null;
  total_withdrawals?: number | string | null;
}

/** Snapshot'tan unrealized kârı al (varsa total_pnl, yoksa value − investment). */
function snapshotPnL(s: SnapshotLite): number {
  if (s.total_pnl != null && s.total_pnl !== '') return Number(s.total_pnl);
  return (Number(s.total_value) || 0) - (Number(s.total_investment) || 0);
}

// ============================================================
// CORE METRICS
// ============================================================

/**
 * Sadece yatırım pozisyonları (cash hariç).
 * Tüm metric fonksiyonları bunu kullanır.
 */
function investmentOnly(holdings: Holding[]): Holding[] {
  return holdings.filter(h => h.asset_type !== 'cash');
}

/**
 * Portföyün toplam değer/maliyet/PnL metriği.
 * Tüm hesaplar TRY base'inde.
 */
export function computePortfolioMetrics(holdings: Holding[]): PortfolioMetrics {
  const fxRates = getFxRatesFromHoldings(holdings);
  const positions = investmentOnly(holdings);

  let totalValueTRY = 0;
  let totalCostTRY = 0;
  for (const h of positions) {
    totalValueTRY += holdingValueTRY(h, fxRates);
    totalCostTRY += holdingCostTRY(h, fxRates);
  }
  const totalPnLTRY = totalValueTRY - totalCostTRY;
  const totalPnLPct = totalCostTRY > 0 ? (totalPnLTRY / totalCostTRY) * 100 : 0;
  const usd = fxRates.usd > 0 ? fxRates.usd : 1;
  return {
    totalValueTRY,
    totalCostTRY,
    totalPnLTRY,
    totalPnLPct,
    totalValueUSD: totalValueTRY / usd,
    totalCostUSD: totalCostTRY / usd,
    totalPnLUSD: totalPnLTRY / usd,
    holdingCount: positions.length,
    fxRates,
  };
}

/**
 * Per-holding metrikler (sıralama, filtreleme için).
 */
export function computeHoldingMetrics(holdings: Holding[]): HoldingMetric[] {
  const fxRates = getFxRatesFromHoldings(holdings);
  const positions = investmentOnly(holdings);
  const totalValueTRY = positions.reduce((s, h) => s + holdingValueTRY(h, fxRates), 0);
  return positions.map(h => {
    const valueTRY = holdingValueTRY(h, fxRates);
    const costTRY = holdingCostTRY(h, fxRates);
    const pnlTRY = valueTRY - costTRY;
    const pnlPct = costTRY > 0 ? (pnlTRY / costTRY) * 100 : 0;
    const weight = totalValueTRY > 0 ? (valueTRY / totalValueTRY) * 100 : 0;
    return { holding: h, valueTRY, costTRY, pnlTRY, pnlPct, weight };
  });
}

/**
 * Asset class (stock/crypto/fund/...) bazında toplam metrikler.
 */
export function computeClassMetrics(holdings: Holding[]): ClassMetric[] {
  const fxRates = getFxRatesFromHoldings(holdings);
  const positions = investmentOnly(holdings);
  const totalValueTRY = positions.reduce((s, h) => s + holdingValueTRY(h, fxRates), 0);
  const groups = new Map<string, { count: number; value: number; cost: number }>();
  for (const h of positions) {
    const key = h.asset_type;
    const g = groups.get(key) || { count: 0, value: 0, cost: 0 };
    g.count += 1;
    g.value += holdingValueTRY(h, fxRates);
    g.cost += holdingCostTRY(h, fxRates);
    groups.set(key, g);
  }
  return Array.from(groups.entries()).map(([asset_type, g]) => {
    const pnlTRY = g.value - g.cost;
    const pnlPct = g.cost > 0 ? (pnlTRY / g.cost) * 100 : 0;
    const weight = totalValueTRY > 0 ? (g.value / totalValueTRY) * 100 : 0;
    return {
      asset_type,
      count: g.count,
      valueTRY: g.value,
      costTRY: g.cost,
      pnlTRY,
      pnlPct,
      weight,
    };
  });
}

// ============================================================
// PERIOD CHANGE (snapshot-based: günlük / haftalık / aylık)
// ============================================================

/**
 * İki snapshot arasındaki gerçek piyasa hareketi — KÂR (unrealized PnL) deltası.
 *
 * change = current_pnl - previous_pnl   (pnl = değer - maliyet)
 *
 * NEDEN deposit'e bakmıyoruz:
 *   Yeni para eklenince değer +X, maliyet +X → kâr +0. Yani yeni para/çekim
 *   kârı YAPISAL olarak etkilemez. Deposit takibine, cash flow çıkarmaya,
 *   kur düzeltmesine GEREK YOK. Bu yüzden bozulması imkansız.
 *   Sadece fiyat hareketi kârı değiştirir → günlük PnL = saf piyasa hareketi.
 *
 * Sanity check: |pct| > maxPct ise 0 döner (bozuk snapshot koruması).
 */
export function computePeriodChange(
  current: SnapshotLite | null | undefined,
  previous: SnapshotLite | null | undefined,
  maxPct: number = 30,
): PeriodChange {
  if (!current || !previous) {
    return { changeTRY: 0, changePct: 0, prevValueTRY: 0, currentValueTRY: 0, cashFlowTRY: 0 };
  }
  const currentValueTRY = Number(current.total_value) || 0;
  const prevValueTRY = Number(previous.total_value) || 0;
  const changeTRY = snapshotPnL(current) - snapshotPnL(previous);
  const changePct = prevValueTRY > 0 ? (changeTRY / prevValueTRY) * 100 : 0;
  if (Math.abs(changePct) > maxPct) {
    return { changeTRY: 0, changePct: 0, prevValueTRY, currentValueTRY, cashFlowTRY: 0 };
  }
  return { changeTRY, changePct, prevValueTRY, currentValueTRY, cashFlowTRY: 0 };
}

// ============================================================
// DİNAMİK GÜVENLİ MAAŞ (USD bazlı reel büyümeye göre)
// ============================================================

export interface DynamicWithdrawal {
  safeMonthlyUSD: number;     // güvenli aylık çekim (USD)
  annualGrowthPct: number;    // yıllıklandırılmış reel büyüme %
  realGrowthUSD: number;      // dönem reel büyümesi (USD, yeni para hariç)
  periodDays: number;
  startValueUSD: number;
  endValueUSD: number;
  newMoneyUSD: number;
  status: 'positive' | 'low' | 'negative';  // pozitif / düşük / negatif büyüme
}

export interface SnapshotForGrowth {
  snapshot_date: string;
  total_value: number | string;
  total_deposits?: number | string | null;
  total_withdrawals?: number | string | null;
  usdRate: number;  // o tarihteki USD/TRY kuru
}

/**
 * Dinamik güvenli maaş hesabı.
 *
 * Mantık (eski MonthlyWithdrawalPlan'dan):
 *  1. Son ≤365 günün USD bazlı reel büyümesini hesapla (yeni para çıkarılır).
 *  2. Yıllıklandır.
 *  3. Güvenli aylık max = yıllık büyümenin (safetyFactor=%85'i) / 12.
 *
 * USD bazlı çünkü TL enflasyonu otomatik düşülmeli — gerçek satın alma gücü.
 *
 * Negatif büyümede 0 döner (anaparaya dokunma).
 */
export function computeDynamicWithdrawal(
  snapshots: SnapshotForGrowth[],
  safetyFactor: number = 0.85,
): DynamicWithdrawal | null {
  if (!snapshots || snapshots.length < 2) return null;

  // Tarihe göre sırala, son ≤365 gün penceresini al
  const sorted = [...snapshots].sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date));
  const last = sorted[sorted.length - 1];
  const lastDate = new Date(last.snapshot_date);
  const windowStart = new Date(lastDate);
  windowStart.setDate(lastDate.getDate() - 365);
  const windowStartStr = windowStart.toISOString().split('T')[0];
  const inWindow = sorted.filter(s => s.snapshot_date >= windowStartStr);
  if (inWindow.length < 2) return null;

  const first = inWindow[0];
  const usdFirst = first.usdRate > 0 ? first.usdRate : 1;
  const usdLast = last.usdRate > 0 ? last.usdRate : 1;

  const startValueUSD = (Number(first.total_value) || 0) / usdFirst;
  const endValueUSD = (Number(last.total_value) || 0) / usdLast;

  // Yeni para (net deposit değişimi), ortalama kurla USD'ye çevir
  const firstNet = (Number(first.total_deposits || 0)) - (Number(first.total_withdrawals || 0));
  const lastNet = (Number(last.total_deposits || 0)) - (Number(last.total_withdrawals || 0));
  const avgRate = (usdFirst + usdLast) / 2;
  const newMoneyUSD = avgRate > 0 ? (lastNet - firstNet) / avgRate : 0;

  const realGrowthUSD = (endValueUSD - startValueUSD) - newMoneyUSD;
  const periodDays = Math.max(1, (lastDate.getTime() - new Date(first.snapshot_date).getTime()) / 86400000);
  const growthPct = startValueUSD > 0 ? (realGrowthUSD / startValueUSD) * 100 : 0;
  const annualGrowthPct = growthPct * (365 / periodDays);

  let safeMonthlyUSD = 0;
  let status: DynamicWithdrawal['status'] = 'negative';
  if (annualGrowthPct > 5) {
    status = 'positive';
    safeMonthlyUSD = (endValueUSD * (annualGrowthPct / 100) * safetyFactor) / 12;
  } else if (annualGrowthPct > 0) {
    status = 'low';
    safeMonthlyUSD = (endValueUSD * (annualGrowthPct / 100) * safetyFactor) / 12;
  } else {
    status = 'negative';
    safeMonthlyUSD = 0;
  }

  return {
    safeMonthlyUSD,
    annualGrowthPct,
    realGrowthUSD,
    periodDays,
    startValueUSD,
    endValueUSD,
    newMoneyUSD,
    status,
  };
}

// ============================================================
// KÂR-BAZLI GÜVENLİ MAAŞ (biriken kâr + sürdürülebilir SWR tavanı)
// ============================================================

/**
 * Çekilebilir aylık maaş — BİRİKEN KÂRA göre (yıllık büyüme extrapolasyonu DEĞİL).
 *
 * Mantık (kullanıcı talebi + deep-research SWR literatürü):
 *  1. Rezervuar (biriken kâr = portföy − anapara − yeni para) ≤ 0 ise → 0
 *     (anaparanın altındasın, maaş yok).
 *  2. Pozitifse iki tavanın KÜÇÜĞÜ:
 *     - Sürdürülebilirlik tavanı: portföyün swrAnnual'ı /12 (araştırma: %3-4 →
 *       anaparayı reel olarak korur, kalıcı gelir).
 *     - Biriken-kâr tavanı: rezervuarı profitSpreadYears'a yayma → kârı aşma.
 *
 * Eski computeDynamicWithdrawal son-dönem büyümeyi yıllığa çevirip %85'ini
 * veriyordu → boğa döneminde 4-5× şişiyordu (ör. $2.300/ay). Bu fonksiyon
 * gerçek biriken kâra dayanır, şişmez.
 */
export function computeSafeSalaryFromProfit(
  reservoirUSD: number,
  portfolioUSD: number,
  swrAnnual: number = 0.04,
  profitSpreadYears: number = 4,
): number {
  if (!(reservoirUSD > 0) || !(portfolioUSD > 0)) return 0;
  const swrMonthly = (portfolioUSD * swrAnnual) / 12;
  const profitMonthly = reservoirUSD / (profitSpreadYears * 12);
  return Math.max(0, Math.min(swrMonthly, profitMonthly));
}

// ============================================================
// INTRADAY CHANGE (sessionStorage tabanlı "bugün açılışından beri")
// ============================================================

/**
 * Bugün ilk açılıştan şimdiki ana kadar net hareket.
 *
 * Her holding için openPrice ile current_price karşılaştırılır.
 * Sanity check: open/current oranı [0.75, 1.25] dışındaysa açılış stale sayılır,
 * o holding için intraday hareket = 0 (current = open varsayımı).
 */
export function computeIntradayChange(
  holdings: Holding[],
  openPrices: Record<string, number>,
  maxPortfolioPct: number = 30,
): PeriodChange {
  const fxRates = getFxRatesFromHoldings(holdings);
  const positions = investmentOnly(holdings);

  let currentValueTRY = 0;
  let openValueTRY = 0;
  for (const h of positions) {
    const cur = Number(h.current_price) || 0;
    const op = openPrices[h.id];
    currentValueTRY += holdingValueTRY(h, fxRates);
    // Per-holding sanity: open/current ratio'sı %25'ten fazla saparsa açılışı current'a eşitle.
    let safeOpen = op && op > 0 ? op : cur;
    if (cur > 0 && safeOpen > 0) {
      const ratio = safeOpen / cur;
      if (ratio < 0.75 || ratio > 1.25) safeOpen = cur;
    } else {
      safeOpen = cur;
    }
    openValueTRY += holdingValueTRY({ ...h, current_price: safeOpen }, fxRates);
  }
  const changeTRY = currentValueTRY - openValueTRY;
  const changePct = openValueTRY > 0 ? (changeTRY / openValueTRY) * 100 : 0;
  if (Math.abs(changePct) > maxPortfolioPct) {
    return { changeTRY: 0, changePct: 0, prevValueTRY: openValueTRY, currentValueTRY, cashFlowTRY: 0 };
  }
  return { changeTRY, changePct, prevValueTRY: openValueTRY, currentValueTRY, cashFlowTRY: 0 };
}

// ============================================================
// UTILITY: top winners / losers
// ============================================================

// ============================================================
// PASSIVE YEARLY INCOME (yıllık beklenen dividend/coupon, USD)
// ============================================================

// Holding bazlı yıllık temettü/kupon getirisi (GERÇEKÇİ, 2026-06).
// BIST: TOASO 6.45% / SAHOL 3.39% / SISE 2.2% / EREGL ~1.1% araştırma; gerisi makul
// tahmin (Türk temettüsü yıllık değişir). Yabancı: V3YL ~1.4% (eskiden hatalı 4.5%
// yazılıydı), JNJ ~3%, ASML ~1%. Tahmindir, yıllık güncellenmeli.
const YIELD_BY_SYMBOL: Record<string, number> = {
  // Yabancı hisse / ETF
  JNJ: 0.03, ASML: 0.01, V3YL: 0.014, KO: 0.03, PG: 0.025, SCHD: 0.035, NESN: 0.03,
  // Revolut Robo (88% hisse/11% tahvil/1% nakit) → harmanlanmış ~%1,8
  'REVOLUT-ROBO': 0.018,
  // USD tahvil / eurobond (kupon getirisi)
  IB01: 0.043, IBTL: 0.045, JNK: 0.07, HYG: 0.07, TLT: 0.04, SGOV: 0.052, IUSB: 0.04, BND: 0.04,
  // BIST temettü ödeyenler (2026 ~gerçekçi)
  TOASO: 0.064, TUPRS: 0.035, SAHOL: 0.034, TCELL: 0.025, SISE: 0.022,
  BIMAS: 0.02, ENKAI: 0.02, CCOLA: 0.015, EREGL: 0.015, AKSEN: 0.01, ASELS: 0.008,
  // THYAO/EKGYO temettü ~0 → listede yok (fallback 0)
};
function symbolYield(h: Holding): number {
  if (YIELD_BY_SYMBOL[h.symbol]) return YIELD_BY_SYMBOL[h.symbol];
  if (h.asset_type === 'eurobond') return 0.04;
  if (h.asset_type === 'fund') return 0.015; // TEFAS fonları çoğu accumulating → düşük nakit dağıtım
  return 0;
}

/**
 * Yıllık beklenen pasif gelir (kupon + dividend), USD bazında.
 * Tek kaynak — HeroDashboard, LivePage hep buradan çağırsın.
 */
export function computePassiveYearlyUSD(holdings: Holding[]): number {
  const m = computePortfolioMetrics(holdings);
  const fx = m.fxRates;
  let yearlyTRY = 0;
  for (const h of holdings.filter(x => x.asset_type !== 'cash')) {
    const vTRY = holdingValueTRY(h, fx);
    yearlyTRY += vTRY * symbolYield(h);
  }
  return fx.usd > 0 ? yearlyTRY / fx.usd : 0;
}

export function topWinners(holdings: Holding[], limit: number = 5): HoldingMetric[] {
  return computeHoldingMetrics(holdings)
    .filter(m => m.pnlTRY > 0)
    .sort((a, b) => b.pnlTRY - a.pnlTRY)
    .slice(0, limit);
}

export function topLosers(holdings: Holding[], limit: number = 5): HoldingMetric[] {
  return computeHoldingMetrics(holdings)
    .filter(m => m.pnlTRY < 0)
    .sort((a, b) => a.pnlTRY - b.pnlTRY)
    .slice(0, limit);
}
