// PARA AĞIRLIKLI GETİRİ — kasa defterinden, euro baz.
//
// portfolio_snapshots.total_deposits / total_withdrawals güvenilmez: kümülatif
// tutar her gün bugünkü kurla yeniden değerleniyor ve cash_balances.total_deposits
// bayat kalabiliyor. 2026-08-01'de ₺830 bin → ₺2,26 milyon sıçrayıp geri düşen
// kayıt, bu alanları kullanan her getiriyi bozar.
//
// Net katkı = cash_transactions içindeki deposit (+) ve withdrawal (−) kayıtları,
// işlemin kendi gününün kuruyla euroya çevrilmiş. Alım/satım iç transferdir, katkı değildir.
// Modified Dietz (GIPS): R = (bitiş − başlangıç − ΣCF) / (başlangıç + Σ CFᵢ·wᵢ),
// wᵢ = kalan gün / dönem günü. Maaş cetveli (eurPnl) bu dosyayı okumaz.

// '.js' şart: bu dosyayı api/cron/daily-snapshot Node ESM ile yükler.
// Uzantısız göreceli import modül açılışında çöker ve o günün snapshot'ı yazılmaz.
import { dayInTZ, makeRateSeries, MIN_RATE_MINOR, type RateSeries } from './eurPnl.js';

export interface LedgerTx {
  created_at?: string | null;
  currency?: string | null;
  transaction_type?: string | null;
  type?: string | null;
  amount?: number | string | null;
}

export interface ExternalFlow {
  date: string;
  kind: 'deposit' | 'withdrawal';
  /** Her zaman pozitif. İşaret kind'dan gelir. */
  amountEUR: number;
  amountTRY: number;
  amountUSD: number;
}

export interface RatePoint { date: string; rate: number }

export interface LedgerRates {
  eur: RatePoint[];
  usd: RatePoint[];
  other?: Record<string, RatePoint[]> | null;
}

export interface FlowBuild {
  flows: ExternalFlow[];
  /** Kuru bilinmeyen yatırma/çekme adedi. Sessizce 0 sayılmaz; çağıran loglar. */
  unpriced: number;
}

export interface MwrInput {
  beginDate: string;
  endDate: string;
  beginValueEUR: number;
  endValueEUR: number;
  flows: ExternalFlow[];
}

export interface MwrResult {
  beginDate: string;
  endDate: string;
  beginValueEUR: number;
  endValueEUR: number;
  /** Dönem içi net katkı (euro): yatırma − çekme. */
  netFlowEUR: number;
  /** Bitiş − başlangıç − net katkı. */
  gainEUR: number;
  /** Modified Dietz, kesir (0,04 = %4). Payda ≤ 0 ise null. */
  dietz: number | null;
  dietzPct: number | null;
  /** 30 günden kısa pencerede yıllıklaştırma yazılmaz. */
  annualizedPct: number | null;
  dayCount: number;
}

export interface LedgerTotals {
  depositsTRY: number;
  withdrawalsTRY: number;
  depositsUSD: number;
  withdrawalsUSD: number;
  depositsEUR: number;
  withdrawalsEUR: number;
}

function txKind(tx: LedgerTx): 'deposit' | 'withdrawal' | null {
  const k = String(tx.transaction_type || tx.type || '').toLowerCase();
  if (k === 'deposit') return 'deposit';
  if (k === 'withdrawal' || k === 'withdraw') return 'withdrawal';
  return null;
}

function utcDays(a: string, b: string): number {
  const ms = Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`);
  if (!Number.isFinite(ms)) return 0;
  return Math.round(ms / 86400000);
}

function seriesFor(ccy: string, eur: RateSeries, usd: RateSeries, other: Map<string, RateSeries>): RateSeries | null {
  const c = ccy.toUpperCase();
  if (c === 'EUR') return eur;
  if (c === 'USD') return usd;
  return other.get(c) ?? null;
}

/** Yatırma ve çekme kayıtlarını işlemin günündeki kurla EUR/TRY/USD'ye çevirir. */
export function externalFlowsFromLedger(txs: LedgerTx[], rates: LedgerRates): FlowBuild {
  const eur = makeRateSeries(rates.eur, NaN);
  const usd = makeRateSeries(rates.usd, NaN);
  const other = new Map<string, RateSeries>();
  for (const [ccy, pts] of Object.entries(rates.other || {})) {
    if (pts?.length) other.set(ccy.toUpperCase(), makeRateSeries(pts, NaN, MIN_RATE_MINOR));
  }
  const flows: ExternalFlow[] = [];
  let unpriced = 0;
  for (const tx of txs) {
    const kind = txKind(tx);
    if (!kind) continue;
    const amount = Number(tx.amount);
    if (!Number.isFinite(amount) || amount === 0) continue;
    const abs = Math.abs(amount);
    const day = dayInTZ(String(tx.created_at || ''));
    if (!day) { unpriced += 1; continue; }
    const ccy = String(tx.currency || 'TRY').toUpperCase();
    const eurTry = eur.rateAt(day);
    const usdTry = usd.rateAt(day);
    if (!(eurTry > 1) || !(usdTry > 1)) { unpriced += 1; continue; }
    let tryAmt: number;
    if (ccy === 'TRY') tryAmt = abs;
    else {
      const s = seriesFor(ccy, eur, usd, other);
      const r = s ? s.rateAt(day) : NaN;
      if (!Number.isFinite(r) || !(r > 0)) { unpriced += 1; continue; }
      tryAmt = abs * r;
    }
    flows.push({
      date: day,
      kind,
      amountTRY: tryAmt,
      amountEUR: tryAmt / eurTry,
      amountUSD: tryAmt / usdTry,
    });
  }
  flows.sort((a, b) => a.date.localeCompare(b.date));
  return { flows, unpriced };
}

export function signedEUR(f: ExternalFlow): number {
  return f.kind === 'deposit' ? f.amountEUR : -f.amountEUR;
}

/** (after, through] aralığındaki net katkı. Başlangıç günü bakiyenin içindedir. */
export function netFlowEUR(flows: ExternalFlow[], after: string, through: string): number {
  let s = 0;
  for (const f of flows) {
    if (f.date > after && f.date <= through) s += signedEUR(f);
  }
  return s;
}

export function modifiedDietz(input: MwrInput): MwrResult | null {
  const begin = String(input.beginDate || '').slice(0, 10);
  const end = String(input.endDate || '').slice(0, 10);
  const dayCount = utcDays(begin, end);
  if (!begin || !end || dayCount <= 0) return null;
  const bmv = Number(input.beginValueEUR);
  const emv = Number(input.endValueEUR);
  if (!Number.isFinite(bmv) || !Number.isFinite(emv)) return null;

  let net = 0;
  let weighted = 0;
  for (const f of input.flows) {
    if (f.date <= begin || f.date > end) continue;
    const cf = signedEUR(f);
    if (!Number.isFinite(cf) || cf === 0) continue;
    const elapsed = utcDays(begin, f.date);
    const w = (dayCount - elapsed) / dayCount;
    net += cf;
    weighted += cf * w;
  }
  const gain = emv - bmv - net;
  const denom = bmv + weighted;
  const dietz = denom > 0 && Number.isFinite(gain) ? gain / denom : null;
  const annualizedPct = dietz != null && dietz > -1 && dayCount >= 30
    ? (Math.pow(1 + dietz, 365.25 / dayCount) - 1) * 100
    : null;
  return {
    beginDate: begin,
    endDate: end,
    beginValueEUR: bmv,
    endValueEUR: emv,
    netFlowEUR: net,
    gainEUR: gain,
    dietz,
    dietzPct: dietz == null ? null : dietz * 100,
    annualizedPct,
    dayCount,
  };
}

/**
 * Snapshot alanına yazılacak kümülatif tutarlar.
 * Her işlem KENDİ gününün kuruyla çevrilir; bugünkü kurla stoğu yeniden
 * değerlemek (eski cron) kur hareketini sahte yatırma yapıyordu.
 */
export function ledgerCashTotals(flows: ExternalFlow[]): LedgerTotals {
  const t: LedgerTotals = {
    depositsTRY: 0, withdrawalsTRY: 0,
    depositsUSD: 0, withdrawalsUSD: 0,
    depositsEUR: 0, withdrawalsEUR: 0,
  };
  for (const f of flows) {
    if (f.kind === 'deposit') {
      t.depositsTRY += f.amountTRY;
      t.depositsUSD += f.amountUSD;
      t.depositsEUR += f.amountEUR;
    } else {
      t.withdrawalsTRY += f.amountTRY;
      t.withdrawalsUSD += f.amountUSD;
      t.withdrawalsEUR += f.amountEUR;
    }
  }
  return t;
}

/**
 * İki değer arasındaki getiri, aradaki nakiti çıkardıktan sonra.
 * Snapshot yatırma alanının farkı yerine defter akışı verilir.
 * Önceki değer ≤ 0 ise null.
 */
export function flowAdjustedReturn(prevValue: number, currValue: number, netFlow: number): number | null {
  if (!(prevValue > 0) || !Number.isFinite(currValue) || !Number.isFinite(netFlow)) return null;
  const r = (currValue - prevValue - netFlow) / prevValue;
  return Number.isFinite(r) ? r : null;
}

/** Zincirlenmiş akış-düzeltilmiş getiri. Akışlar (önceki gün, bu gün] aralığına yazılır. */
export function linkedFlowAdjustedReturn(
  points: Array<{ date: string; value: number }>,
  flows: ExternalFlow[],
  valueOf: (f: ExternalFlow) => number = (f) => f.amountTRY,
): number | null {
  if (points.length < 2) return null;
  let acc = 1;
  let n = 0;
  for (let i = 1; i < points.length; i++) {
    let net = 0;
    const after = points[i - 1].date;
    const through = points[i].date;
    for (const f of flows) {
      if (f.date > after && f.date <= through) net += f.kind === 'deposit' ? valueOf(f) : -valueOf(f);
    }
    const r = flowAdjustedReturn(points[i - 1].value, points[i].value, net);
    if (r == null) continue;
    acc *= 1 + r;
    n += 1;
  }
  if (n === 0 || !(acc > 0)) return null;
  return acc - 1;
}
