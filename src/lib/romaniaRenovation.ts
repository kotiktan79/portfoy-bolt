// Romanya ev tadilatı — yalnız bilgi kartı.
// 1 Eylül 2025 uygulamanın veri başlangıcından (20 Şubat 2026) önce; veritabanında yok.
// 3 Temmuz 2026 satırları, tarih + para birimi + tutar tek bir kayıtla örtüşürse
// cash_transactions (yoksa transactions) içinden okunur. Örtüşmezse aynı tutarlar sabittir.
// Bu modül portföy, getiri, kâr, hedef ve maaş hesabına girmez.

import { dayInTZ } from './eurPnl';

export const APP_DATA_START = '2026-02-20';

/** Uygulama öncesi, veritabanında karşılığı olmayan satır. */
export const PRE_APP_RENOVATION = {
  isoDate: '2025-09-01',
  amountEUR: 20_000,
  note: 'uygulama öncesi, sadece bilgi',
} as const;

/** 3 Temmuz 2026 parmak izi. Tutarlar euro veya RON cinsinden, işaretli çekim de kabul edilir. */
export const JULY_RENOVATION_LINES = [
  { id: '2026-07-03-eur-3500', isoDate: '2026-07-03', currency: 'EUR', amount: 3_500 },
  { id: '2026-07-03-eur-4050', isoDate: '2026-07-03', currency: 'EUR', amount: 4_050 },
  { id: '2026-07-03-ron-25000', isoDate: '2026-07-03', currency: 'RON', amount: 25_000 },
] as const;

/** Kur serisinde RON veya EUR yoksa: 25.000 RON ≈ €4.920. */
export const RON_EUR_FALLBACK = { ron: 25_000, eur: 4_920 } as const;

const TR_MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const AMOUNT_EPS = 0.51;

export type LineSource = 'sabit' | 'cash_transactions' | 'transactions';

export interface LedgerAmountRow {
  at: string;
  currency?: string | null;
  amount?: number | string | null;
  notes?: string | null;
}

export interface RenovationLine {
  id: string;
  isoDate: string;
  dateLabel: string;
  currency: 'EUR' | 'RON';
  /** Görünen euro, tam sayıya yuvarlanmış. */
  amountEUR: number;
  nativeText: string;
  eurText: string;
  note: string | null;
  source: LineSource;
  approximate: boolean;
}

export interface RenovationSummary {
  lines: RenovationLine[];
  totalEUR: number;
  /** 1 RON kaç euro. Yalnız gösterim. */
  eurPerRon: number;
  fxSource: 'exchange_rates_daily' | 'fallback';
}

export interface RateRow {
  day?: string | null;
  from_currency?: string | null;
  rate?: number | string | null;
}

export function formatTrDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const month = TR_MONTHS[(m || 1) - 1] || '';
  return `${d} ${month} ${y}`;
}

export function fmtEuro(amount: number): string {
  return '€' + Math.round(amount).toLocaleString('tr-TR');
}

export function fmtRon(amount: number): string {
  return Math.round(amount).toLocaleString('tr-TR') + ' RON';
}

export function formatTotalEUR(summary: Pick<RenovationSummary, 'lines' | 'totalEUR'>): string {
  const approx = summary.lines.some(l => l.approximate);
  return (approx ? '≈ ' : '') + fmtEuro(summary.totalEUR);
}

function asNumber(v: unknown): number | null {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

export function normRenovationCurrency(raw: string | null | undefined): string {
  const u = String(raw || '').trim().toUpperCase();
  if (u === 'EURO') return 'EUR';
  if (u === 'LEI' || u === 'RON') return 'RON';
  return u;
}

/** TRY karşılığı kurlar: 1 RON = ronTry/eurTry euro. İkisi de yoksa 4.920/25.000. */
export function eurPerRonFromTry(ronTry: number | null, eurTry: number | null): { eurPerRon: number; fxSource: 'exchange_rates_daily' | 'fallback' } {
  if (ronTry != null && eurTry != null && ronTry > 0 && eurTry > 0) {
    return { eurPerRon: ronTry / eurTry, fxSource: 'exchange_rates_daily' };
  }
  return { eurPerRon: RON_EUR_FALLBACK.eur / RON_EUR_FALLBACK.ron, fxSource: 'fallback' };
}

export function latestTryRate(rates: readonly RateRow[], currency: string): number | null {
  const want = currency.toUpperCase();
  let bestDay = '';
  let best: number | null = null;
  for (const row of rates) {
    if (String(row.from_currency || '').toUpperCase() !== want) continue;
    const day = String(row.day || '').slice(0, 10);
    const rate = asNumber(row.rate);
    if (!day || rate == null || rate <= 0) continue;
    if (day >= bestDay) {
      bestDay = day;
      best = rate;
    }
  }
  return best;
}

function renovationNote(notes: string | null | undefined): boolean {
  return /tadilat|renov/i.test(String(notes || ''));
}

/** Aynı gün, aynı birim, aynı tutar. Birden fazla satır varsa notu tadilat/renov olan tek satır kalır. */
export function matchRenovationRow(
  rows: readonly LedgerAmountRow[],
  isoDate: string,
  currency: string,
  amount: number,
): LedgerAmountRow | null {
  const want = normRenovationCurrency(currency);
  const hits = rows.filter(row => {
    if (dayInTZ(row.at) !== isoDate) return false;
    if (normRenovationCurrency(row.currency) !== want) return false;
    const n = asNumber(row.amount);
    if (n == null) return false;
    return Math.abs(Math.abs(n) - amount) < AMOUNT_EPS;
  });
  if (hits.length === 1) return hits[0];
  const noted = hits.filter(row => renovationNote(row.notes));
  return noted.length === 1 ? noted[0] : null;
}

export function buildRenovationSummary(input: {
  cashRows?: readonly LedgerAmountRow[];
  txRows?: readonly LedgerAmountRow[];
  ronTry?: number | null;
  eurTry?: number | null;
} = {}): RenovationSummary {
  const cash = input.cashRows ?? [];
  const txs = input.txRows ?? [];
  const { eurPerRon, fxSource } = eurPerRonFromTry(input.ronTry ?? null, input.eurTry ?? null);

  const pre: RenovationLine = {
    id: 'pre-app',
    isoDate: PRE_APP_RENOVATION.isoDate,
    dateLabel: formatTrDate(PRE_APP_RENOVATION.isoDate),
    currency: 'EUR',
    amountEUR: PRE_APP_RENOVATION.amountEUR,
    nativeText: fmtEuro(PRE_APP_RENOVATION.amountEUR),
    eurText: fmtEuro(PRE_APP_RENOVATION.amountEUR),
    note: PRE_APP_RENOVATION.note,
    source: 'sabit',
    approximate: false,
  };

  const july: RenovationLine[] = JULY_RENOVATION_LINES.map(spec => {
    const fromCash = matchRenovationRow(cash, spec.isoDate, spec.currency, spec.amount);
    const fromTx = fromCash ? null : matchRenovationRow(txs, spec.isoDate, spec.currency, spec.amount);
    const row = fromCash || fromTx;
    const source: LineSource = fromCash ? 'cash_transactions' : fromTx ? 'transactions' : 'sabit';
    const native = row ? Math.abs(asNumber(row.amount) || spec.amount) : spec.amount;
    const amountEUR = Math.round(spec.currency === 'EUR' ? native : native * eurPerRon);
    const approximate = spec.currency !== 'EUR';
    return {
      id: spec.id,
      isoDate: spec.isoDate,
      dateLabel: formatTrDate(spec.isoDate),
      currency: spec.currency,
      amountEUR,
      nativeText: spec.currency === 'EUR' ? fmtEuro(native) : fmtRon(native),
      eurText: fmtEuro(amountEUR),
      note: null,
      source,
      approximate,
    };
  });

  const lines = [pre, ...july];
  const totalEUR = lines.reduce((sum, line) => sum + line.amountEUR, 0);
  return { lines, totalEUR, eurPerRon, fxSource };
}

export function summaryFromRecords(input: {
  cash?: ReadonlyArray<{ created_at?: string | null; currency?: string | null; amount?: number | string | null; notes?: string | null }>;
  transactions?: ReadonlyArray<{ transaction_date?: string | null; currency?: string | null; total_amount?: number | string | null; notes?: string | null }>;
  rates?: readonly RateRow[];
}): RenovationSummary {
  const rates = input.rates ?? [];
  return buildRenovationSummary({
    cashRows: (input.cash ?? []).map(row => ({
      at: String(row.created_at || ''),
      currency: row.currency,
      amount: row.amount,
      notes: row.notes,
    })),
    txRows: (input.transactions ?? []).map(row => ({
      at: String(row.transaction_date || ''),
      currency: row.currency,
      amount: row.total_amount,
      notes: row.notes,
    })),
    ronTry: latestTryRate(rates, 'RON'),
    eurTry: latestTryRate(rates, 'EUR'),
  });
}
