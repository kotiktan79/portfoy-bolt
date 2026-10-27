// Romanya ev tadilatı — portföyden ayrı salt bilgi.
// 1 Eylül 2025 uygulamanın veri başlangıcından (20 Şubat 2026) önce; veritabanında yok.
// 3 Temmuz 2026 ve sonraki harcamalar cash_transactions çekim satırından okunur
// (notta tadilat veya remont). Okunamazsa 3 Temmuz tutarları sabit kalır.
// Bu modül portföy, getiri, kâr, hedef, maaş, anlık görüntü ve nakit dağılımına girmez.

import { dayInTZ } from './eurPnl';

export const APP_DATA_START = '2026-02-20';

/** Uygulama öncesi, veritabanında karşılığı olmayan satır. */
export const PRE_APP_RENOVATION = {
  isoDate: '2025-09-01',
  amountEUR: 20_000,
  note: 'uygulama öncesi, sadece bilgi',
  description: 'Ev tadilatı',
} as const;

/** 3 Temmuz 2026 bilinen tutarlar. Kasa satırı okunamazsa ekranda bunlar durur. */
export const JULY_RENOVATION_LINES = [
  { id: '2026-07-03-eur-3500', isoDate: '2026-07-03', currency: 'EUR', amount: 3_500, description: 'Ev tadilatı/remont harcaması' },
  { id: '2026-07-03-eur-4050', isoDate: '2026-07-03', currency: 'EUR', amount: 4_050, description: 'Ev remontu harcaması' },
  { id: '2026-07-03-ron-25000', isoDate: '2026-07-03', currency: 'RON', amount: 25_000, description: 'Ev tadilatı harcaması' },
] as const;

/** Kur serisinde RON veya EUR yoksa: 25.000 RON ≈ €4.920. */
export const RON_EUR_FALLBACK = { ron: 25_000, eur: 4_920 } as const;

const TR_MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const AMOUNT_EPS = 0.51;

export type LineSource = 'sabit' | 'cash_transactions' | 'transactions';
export type FxKind = 'euro' | 'harcama-gunu' | 'guncel' | 'yedek' | 'yok';

export interface LedgerAmountRow {
  id?: string | number | null;
  at: string;
  currency?: string | null;
  amount?: number | string | null;
  notes?: string | null;
  transaction_type?: string | null;
  type?: string | null;
}

export interface RenovationLine {
  id: string;
  isoDate: string;
  dateLabel: string;
  currency: string;
  nativeAmount: number;
  /** Görünen euro, tam sayıya yuvarlanmış. Çevrilemezse 0 ve included false. */
  amountEUR: number;
  included: boolean;
  nativeText: string;
  eurText: string;
  description: string;
  note: string | null;
  source: LineSource;
  approximate: boolean;
  fxKind: FxKind;
  fxNote: string;
}

export interface YearSubtotal {
  year: number;
  totalEUR: number;
  text: string;
}

export interface RenovationSummary {
  lines: RenovationLine[];
  totalEUR: number;
  /** 1 RON kaç euro. Yalnız gösterim; ilk RON satırının kuru. */
  eurPerRon: number;
  fxSource: 'exchange_rates_daily' | 'fallback';
  years: YearSubtotal[];
  missingFx: boolean;
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
  const approx = summary.lines.some(l => l.included && l.approximate);
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

/** Aynı takvim günündeki son kur. Gün yoksa null. */
export function tryRateOnDay(rates: readonly RateRow[], currency: string, isoDate: string): number | null {
  const want = currency.toUpperCase();
  let best: number | null = null;
  for (const row of rates) {
    if (String(row.from_currency || '').toUpperCase() !== want) continue;
    if (String(row.day || '').slice(0, 10) !== isoDate) continue;
    const rate = asNumber(row.rate);
    if (rate == null || rate <= 0) continue;
    best = rate;
  }
  return best;
}

export function renovationNote(notes: string | null | undefined): boolean {
  return /tadilat|remont/i.test(String(notes || ''));
}

export function isWithdrawalRow(row: Pick<LedgerAmountRow, 'transaction_type' | 'type'>): boolean {
  const k = String(row.transaction_type || row.type || '').toLowerCase();
  return k === 'withdrawal' || k === 'withdraw';
}

/** Notu tadilat/remont olan kasa çekimi. Uygulama veri başlangıcından önceki satır sabit kayda bırakılır. */
export function isRenovationWithdrawal(row: LedgerAmountRow): boolean {
  if (!isWithdrawalRow(row)) return false;
  if (!renovationNote(row.notes)) return false;
  const n = asNumber(row.amount);
  if (n == null || n === 0) return false;
  const day = dayInTZ(row.at);
  if (!day || day < APP_DATA_START) return false;
  return true;
}

function dedupeLedger(rows: readonly LedgerAmountRow[]): LedgerAmountRow[] {
  const seen = new Set<string>();
  const out: LedgerAmountRow[] = [];
  for (const row of rows) {
    const id = row.id != null && String(row.id) !== '' ? `id:${row.id}` : '';
    const n = asNumber(row.amount);
    const key = id || [
      row.at,
      normRenovationCurrency(row.currency),
      n == null ? '' : String(Math.round(Math.abs(n) * 100) / 100),
      String(row.notes || ''),
      String(row.transaction_type || row.type || ''),
    ].join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}

function rowMatchesSpec(row: LedgerAmountRow, isoDate: string, currency: string, amount: number): boolean {
  if (dayInTZ(row.at) !== isoDate) return false;
  if (normRenovationCurrency(row.currency) !== normRenovationCurrency(currency)) return false;
  const n = asNumber(row.amount);
  if (n == null) return false;
  return Math.abs(Math.abs(n) - amount) < AMOUNT_EPS;
}

/** Aynı gün, aynı birim, aynı tutar. Birden fazla satır varsa notu tadilat/remont olan tek satır kalır. */
export function matchRenovationRow(
  rows: readonly LedgerAmountRow[],
  isoDate: string,
  currency: string,
  amount: number,
): LedgerAmountRow | null {
  const hits = rows.filter(row => rowMatchesSpec(row, isoDate, currency, amount));
  if (hits.length === 1) return hits[0];
  const noted = hits.filter(row => renovationNote(row.notes));
  return noted.length === 1 ? noted[0] : null;
}

interface FxContext {
  rates: readonly RateRow[];
  current: Map<string, number>;
}

function fxContext(input: {
  ronTry?: number | null;
  eurTry?: number | null;
  rates?: readonly RateRow[];
}): FxContext {
  const rates = input.rates ?? [];
  const current = new Map<string, number>();
  const currencies = new Set<string>();
  for (const row of rates) {
    const c = String(row.from_currency || '').toUpperCase();
    if (c) currencies.add(c);
  }
  for (const c of currencies) {
    const v = latestTryRate(rates, c);
    if (v != null && v > 0) current.set(c, v);
  }
  if (input.eurTry != null && input.eurTry > 0) current.set('EUR', input.eurTry);
  if (input.ronTry != null && input.ronTry > 0) current.set('RON', input.ronTry);
  return { rates, current };
}

function eurPerNative(currency: string, isoDate: string, fx: FxContext): { per: number | null; kind: FxKind } {
  const c = normRenovationCurrency(currency);
  if (c === 'EUR') return { per: 1, kind: 'euro' };
  if (c === 'TRY') {
    const dayE = tryRateOnDay(fx.rates, 'EUR', isoDate);
    if (dayE != null) return { per: 1 / dayE, kind: 'harcama-gunu' };
    const curE = fx.current.get('EUR');
    if (curE != null && curE > 0) return { per: 1 / curE, kind: 'guncel' };
    return { per: null, kind: 'yok' };
  }
  const dayC = tryRateOnDay(fx.rates, c, isoDate);
  const dayE = tryRateOnDay(fx.rates, 'EUR', isoDate);
  if (dayC != null && dayE != null) return { per: dayC / dayE, kind: 'harcama-gunu' };
  const curC = fx.current.get(c);
  const curE = fx.current.get('EUR');
  if (curC != null && curE != null && curC > 0 && curE > 0) return { per: curC / curE, kind: 'guncel' };
  if (c === 'RON') return { per: RON_EUR_FALLBACK.eur / RON_EUR_FALLBACK.ron, kind: 'yedek' };
  return { per: null, kind: 'yok' };
}

function fxNote(kind: FxKind, dateLabel: string, currency: string): string {
  if (kind === 'euro') return 'Euro cinsinden';
  if (kind === 'harcama-gunu') return `Harcama günü kuru (${dateLabel})`;
  if (kind === 'guncel') return 'Güncel kur — harcama gününün kuru yok';
  if (kind === 'yedek') return 'Sabit yedek kur — kur serisinde karşılık yok';
  return `${currency} için euro kuru yok`;
}

function nativeText(currency: string, amount: number): string {
  const c = normRenovationCurrency(currency);
  if (c === 'EUR') return fmtEuro(amount);
  if (c === 'RON') return fmtRon(amount);
  const rounded = Math.round(amount).toLocaleString('tr-TR');
  return `${rounded} ${c}`;
}

function makeLine(opts: {
  id: string;
  isoDate: string;
  currency: string;
  nativeAmount: number;
  description: string;
  note: string | null;
  source: LineSource;
  fx: FxContext;
}): RenovationLine {
  const currency = normRenovationCurrency(opts.currency);
  const dateLabel = formatTrDate(opts.isoDate);
  const { per, kind } = eurPerNative(currency, opts.isoDate, opts.fx);
  const included = per != null;
  const amountEUR = included ? Math.round(opts.nativeAmount * per) : 0;
  const approximate = currency !== 'EUR';
  return {
    id: opts.id,
    isoDate: opts.isoDate,
    dateLabel,
    currency,
    nativeAmount: opts.nativeAmount,
    amountEUR,
    included,
    nativeText: nativeText(currency, opts.nativeAmount),
    eurText: included ? fmtEuro(amountEUR) : 'kur yok',
    description: opts.description.trim() || 'Ev tadilatı',
    note: opts.note,
    source: opts.source,
    approximate,
    fxKind: kind,
    fxNote: fxNote(kind, dateLabel, currency),
  };
}

function yearSubtotals(lines: readonly RenovationLine[]): YearSubtotal[] {
  const map = new Map<number, number>();
  for (const line of lines) {
    if (!line.included) continue;
    const year = Number(line.isoDate.slice(0, 4));
    if (!Number.isFinite(year)) continue;
    map.set(year, (map.get(year) || 0) + line.amountEUR);
  }
  return [...map.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([year, totalEUR]) => ({ year, totalEUR, text: fmtEuro(totalEUR) }));
}

export function buildRenovationSummary(input: {
  cashRows?: readonly LedgerAmountRow[];
  txRows?: readonly LedgerAmountRow[];
  ronTry?: number | null;
  eurTry?: number | null;
  rates?: readonly RateRow[];
} = {}): RenovationSummary {
  const cash = dedupeLedger(input.cashRows ?? []);
  const txs = dedupeLedger(input.txRows ?? []);
  const fx = fxContext(input);
  const noted = cash.filter(isRenovationWithdrawal);
  const used = new Set<LedgerAmountRow>();

  const pre = makeLine({
    id: 'pre-app',
    isoDate: PRE_APP_RENOVATION.isoDate,
    currency: 'EUR',
    nativeAmount: PRE_APP_RENOVATION.amountEUR,
    description: PRE_APP_RENOVATION.description,
    note: PRE_APP_RENOVATION.note,
    source: 'sabit',
    fx,
  });

  const july = JULY_RENOVATION_LINES.map(spec => {
    const hit = noted.find(row => !used.has(row) && rowMatchesSpec(row, spec.isoDate, spec.currency, spec.amount));
    if (hit) {
      used.add(hit);
      const notes = String(hit.notes || '').trim();
      return makeLine({
        id: spec.id,
        isoDate: spec.isoDate,
        currency: spec.currency,
        nativeAmount: Math.abs(asNumber(hit.amount) || spec.amount),
        description: notes || spec.description,
        note: null,
        source: 'cash_transactions',
        fx,
      });
    }
    const fromCash = matchRenovationRow(cash, spec.isoDate, spec.currency, spec.amount);
    const fromTx = fromCash ? null : matchRenovationRow(txs, spec.isoDate, spec.currency, spec.amount);
    const row = fromCash || fromTx;
    const source: LineSource = fromCash ? 'cash_transactions' : fromTx ? 'transactions' : 'sabit';
    const native = row ? Math.abs(asNumber(row.amount) || spec.amount) : spec.amount;
    const notes = row ? String(row.notes || '').trim() : '';
    return makeLine({
      id: spec.id,
      isoDate: spec.isoDate,
      currency: spec.currency,
      nativeAmount: native,
      description: notes || spec.description,
      note: null,
      source,
      fx,
    });
  });

  const extras = noted.filter(row => !used.has(row)).map(row => {
    const day = dayInTZ(row.at);
    const currency = normRenovationCurrency(row.currency);
    const native = Math.abs(asNumber(row.amount) || 0);
    const id = row.id != null && String(row.id) !== ''
      ? `cash-${row.id}`
      : `cash-${day}-${currency}-${native}`;
    return makeLine({
      id,
      isoDate: day,
      currency,
      nativeAmount: native,
      description: String(row.notes || '').trim() || 'Ev tadilatı',
      note: null,
      source: 'cash_transactions',
      fx,
    });
  });

  const lines = [pre, ...july, ...extras].sort((a, b) => a.isoDate.localeCompare(b.isoDate) || a.id.localeCompare(b.id));
  const totalEUR = lines.reduce((sum, line) => sum + (line.included ? line.amountEUR : 0), 0);
  const ronLine = lines.find(line => line.currency === 'RON' && line.included && line.nativeAmount > 0);
  const eurPerRon = ronLine ? ronLine.amountEUR / ronLine.nativeAmount : RON_EUR_FALLBACK.eur / RON_EUR_FALLBACK.ron;
  const usedSeries = lines.some(line => line.included && (line.fxKind === 'harcama-gunu' || line.fxKind === 'guncel'));
  return {
    lines,
    totalEUR,
    eurPerRon,
    fxSource: usedSeries ? 'exchange_rates_daily' : 'fallback',
    years: yearSubtotals(lines),
    missingFx: lines.some(line => !line.included),
  };
}

export function summaryFromRecords(input: {
  cash?: ReadonlyArray<{
    id?: string | number | null;
    created_at?: string | null;
    currency?: string | null;
    amount?: number | string | null;
    notes?: string | null;
    transaction_type?: string | null;
  }>;
  transactions?: ReadonlyArray<{ transaction_date?: string | null; currency?: string | null; total_amount?: number | string | null; notes?: string | null }>;
  rates?: readonly RateRow[];
}): RenovationSummary {
  const rates = input.rates ?? [];
  return buildRenovationSummary({
    cashRows: (input.cash ?? []).map(row => ({
      id: row.id,
      at: String(row.created_at || ''),
      currency: row.currency,
      amount: row.amount,
      notes: row.notes,
      transaction_type: row.transaction_type,
    })),
    txRows: (input.transactions ?? []).map(row => ({
      at: String(row.transaction_date || ''),
      currency: row.currency,
      amount: row.total_amount,
      notes: row.notes,
    })),
    ronTry: latestTryRate(rates, 'RON'),
    eurTry: latestTryRate(rates, 'EUR'),
    rates,
  });
}
