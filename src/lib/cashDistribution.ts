// Nakit dağılımı — yalnız gösterim. Portföy döviz satırları + kasa bakiyesi.
// Şema, RLS ve kasa bakiyesi değişmez. Euro karşılığı, uygulamanın kullandığı kurdan gelir:
// portföy için holding current_price (EUR/TRY, USD/TRY), kasa için exchange_rates_daily
// (computeKasaFx / getKasaFx). Ev Parası toplama girmez.

import { isHouseMoney } from '../config/portfolioPolicy';
import { getFxRatesFromHoldings, holdingValueTRY } from './fx';
import { isOpenHolding } from './openPosition';
import {
  EUR_CASH_RESERVE,
  WEEKLY_BUY_EUR,
  buildWeeklyPlan,
  euroCashEUR,
} from './buyPlan';
import type { Holding } from './supabase';

export type CashPlace = 'portfoy' | 'kasa';
export type KasaLoadStatus = 'loading' | 'ready' | 'unavailable';

export interface KasaSlice {
  currency: string;
  balance: number;
  /** Euro karşılığı. Kur yoksa null; satır durur, toplama girmez. */
  eur: number | null;
}

export interface CashDistributionRow {
  key: string;
  currency: string;
  label: string;
  place: CashPlace;
  placeLabel: string;
  amount: number;
  amountText: string;
  eur: number | null;
  eurText: string;
}

export interface CashShare {
  currency: string;
  label: string;
  eur: number;
  pct: number;
  color: string;
}

export interface CashDistribution {
  rows: CashDistributionRow[];
  totalEUR: number;
  totalText: string;
  totalLabel: string;
  shares: CashShare[];
  shareText: string;
  note: string;
  houseText: string | null;
  houseTRY: number;
  houseEUR: number | null;
  warnings: string[];
}

const LABELS: Record<string, string> = {
  EUR: 'Euro',
  USD: 'Dolar',
  GBP: 'Sterlin',
  CHF: 'Frank',
  RON: 'Ley',
  TRY: 'Lira',
  RUB: 'Ruble',
};

export const CASH_COLORS: Record<string, string> = {
  USD: '#059669',
  EUR: '#d97706',
  RUB: '#e11d48',
  GBP: '#2563eb',
  CHF: '#7c3aed',
  RON: '#ca8a04',
  TRY: '#0284c7',
};

const DUST = 0.005;

export function cashCode(symbol: string | null | undefined): string {
  const s = String(symbol || '').trim().toUpperCase();
  if (s === 'EURO' || s === 'EUR') return 'EUR';
  if (s === 'TL') return 'TRY';
  if (s === 'USDC' || s === 'USDT') return 'USD';
  return s;
}

export function cashLabel(code: string): string {
  return LABELS[code] || code;
}

/** Türkçe binlik: 26501 → 26.501. Yerel ayara bağlı değil. */
export function fmtGrouped(n: number): string {
  const neg = n < 0;
  const body = String(Math.round(Math.abs(n))).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return neg ? `−${body}` : body;
}

export function fmtEUR(n: number): string {
  return `€${fmtGrouped(n)}`;
}

export function fmtNative(amount: number, currency: string): string {
  const n = fmtGrouped(amount);
  switch (currency) {
    case 'EUR': return `€${n}`;
    case 'USD': return `$${n}`;
    case 'TRY': return `₺${n}`;
    case 'GBP': return `£${n}`;
    case 'RUB': return `₽${n}`;
    case 'CHF': return `${n} Fr`;
    case 'RON': return `${n} lei`;
    default: return `${n} ${currency}`;
  }
}

function nativeUnits(h: { symbol?: string | null; currency?: string | null; quantity?: number | string | null; current_price?: number | string | null }): number {
  const code = cashCode(h.symbol);
  if (code === 'EUR') return euroCashEUR([h]);
  const qty = Number(h.quantity);
  const price = Number(h.current_price);
  const cur = String(h.currency || 'TRY').toUpperCase();
  if (!(qty > 0)) return 0;
  if (cur === code && price > 0 && price <= 5) return qty * price;
  return qty;
}

/**
 * Euro nakitten €7.000 kenarda; kalan haftada €1.000 VWCE.
 * Tutarlar buyPlan sabitlerinden gelir (EUR_CASH_RESERVE, WEEKLY_BUY_EUR).
 */
export function euroDripNote(euroCash: number): string {
  const plan = buildWeeklyPlan({ euroCashEUR: euroCash });
  const weeks = !(plan.weeks > 0)
    ? '~0 hafta'
    : plan.weeks < 0.5
      ? '1 haftadan az'
      : `~${Math.round(plan.weeks)} hafta`;
  return `Euro nakitten €${fmtGrouped(plan.reserveEUR || EUR_CASH_RESERVE)} kenarda; kalan ~€${fmtGrouped(plan.investableEUR)} haftada €${fmtGrouped(plan.weeklyEUR || WEEKLY_BUY_EUR)} VWCE'ye gidiyor (${weeks})`;
}

function integerPercents(items: Array<{ key: string; value: number }>): Map<string, number> {
  const total = items.reduce((s, i) => s + i.value, 0);
  const out = new Map<string, number>();
  if (!(total > 0)) return out;
  const parts = items.map(i => {
    const exact = (i.value / total) * 100;
    const floor = Math.floor(exact + 1e-9);
    return { key: i.key, floor, frac: exact - floor };
  });
  let left = 100 - parts.reduce((s, p) => s + p.floor, 0);
  const order = [...parts].sort((a, b) => b.frac - a.frac || a.key.localeCompare(b.key));
  const add = new Map<string, number>();
  for (const p of order) {
    if (left > 0) { add.set(p.key, 1); left -= 1; }
  }
  for (const p of parts) out.set(p.key, p.floor + (add.get(p.key) || 0));
  return out;
}

export function buildCashDistribution(
  holdings: Holding[],
  kasa: KasaSlice[],
  kasaStatus: KasaLoadStatus,
): CashDistribution {
  const fx = getFxRatesFromHoldings(holdings);
  const eurTry = fx.eur > 0 ? fx.eur : 0;
  const warnings: string[] = [];

  type Acc = { currency: string; place: CashPlace; amount: number; eur: number | null };
  const merged = new Map<string, Acc>();
  const add = (currency: string, place: CashPlace, amount: number, eur: number | null) => {
    if (!(Math.abs(amount) > DUST) && !(eur != null && Math.abs(eur) > DUST)) return;
    const code = cashCode(currency);
    const key = `${code}|${place}`;
    const prev = merged.get(key);
    if (!prev) {
      merged.set(key, { currency: code, place, amount, eur });
      return;
    }
    prev.amount += amount;
    if (eur == null || prev.eur == null) prev.eur = eur == null ? prev.eur : eur;
    else prev.eur += eur;
  };

  let unpriced: string[] = [];
  for (const h of holdings) {
    if (!isOpenHolding(h) || isHouseMoney(h)) continue;
    if (String(h.asset_type || '') !== 'currency') continue;
    const code = cashCode(h.symbol);
    if (!code) continue;
    const amount = nativeUnits(h);
    let eur: number | null;
    if (code === 'EUR') eur = amount;
    else if (!(eurTry > 0)) eur = null;
    else eur = holdingValueTRY(h, fx) / eurTry;
    if (eur == null && amount > DUST) unpriced.push(cashLabel(code));
    add(code, 'portfoy', amount, eur);
  }

  for (const row of kasa) {
    const code = cashCode(row.currency);
    if (!code) continue;
    const amount = Number(row.balance) || 0;
    const eur = row.eur == null || !Number.isFinite(row.eur) ? null : row.eur;
    if (eur == null && Math.abs(amount) > DUST) unpriced.push(`${cashLabel(code)} (kasa)`);
    add(code, 'kasa', amount, eur);
  }
  unpriced = [...new Set(unpriced)].sort((a, b) => a.localeCompare(b, 'tr'));
  if (unpriced.length) warnings.push(`Kuru yok, toplama girmedi: ${unpriced.join(', ')}.`);

  if (kasaStatus === 'loading') warnings.push('Kasa ekleniyor.');
  if (kasaStatus === 'unavailable') warnings.push('Kasa bakiyesi veya kur yok. Toplam yalnız portföy nakdini gösterir.');

  const rows: CashDistributionRow[] = [...merged.values()]
    .map(r => ({
      key: `${r.currency}|${r.place}`,
      currency: r.currency,
      label: cashLabel(r.currency),
      place: r.place,
      placeLabel: r.place === 'portfoy' ? 'Portföy' : 'Kasa',
      amount: r.amount,
      amountText: fmtNative(r.amount, r.currency),
      eur: r.eur,
      eurText: r.eur == null ? 'kur yok' : fmtEUR(r.eur),
    }))
    .sort((a, b) => {
      const ae = a.eur ?? Number.NEGATIVE_INFINITY;
      const be = b.eur ?? Number.NEGATIVE_INFINITY;
      if (be !== ae) return be - ae;
      if (a.place !== b.place) return a.place === 'portfoy' ? -1 : 1;
      return a.currency.localeCompare(b.currency);
    });

  const totalEUR = rows.reduce((s, r) => s + (r.eur ?? 0), 0);

  const byCcy = new Map<string, number>();
  for (const r of rows) {
    if (r.eur == null || !(r.eur > 0)) continue;
    byCcy.set(r.currency, (byCcy.get(r.currency) || 0) + r.eur);
  }
  const pcts = integerPercents([...byCcy.entries()].map(([key, value]) => ({ key, value })));
  const shares: CashShare[] = kasaStatus === 'loading'
    ? []
    : [...byCcy.entries()]
      .map(([currency, eur]) => ({
        currency,
        label: cashLabel(currency),
        eur,
        pct: pcts.get(currency) || 0,
        color: CASH_COLORS[currency] || '#64748b',
      }))
      .sort((a, b) => b.eur - a.eur || a.currency.localeCompare(b.currency));

  const euroCash = rows
    .filter(r => r.currency === 'EUR')
    .reduce((s, r) => s + (r.eur ?? r.amount), 0);

  let houseTRY = 0;
  let houseCount = 0;
  for (const h of holdings) {
    if (!isOpenHolding(h) || !isHouseMoney(h)) continue;
    houseCount += 1;
    houseTRY += holdingValueTRY(h, fx);
  }
  const houseEUR = houseCount > 0 && eurTry > 0 ? houseTRY / eurTry : null;
  const houseText = houseCount > 0 && Math.abs(houseTRY) > DUST
    ? `Ev Parası (Türkiye) ${fmtNative(houseTRY, 'TRY')}${houseEUR == null ? '' : ` · ${fmtEUR(houseEUR)}`} — toplama dahil değil`
    : null;

  return {
    rows,
    totalEUR,
    totalText: kasaStatus === 'loading' ? '…' : fmtEUR(totalEUR),
    totalLabel: kasaStatus === 'loading' ? 'Portföy nakdi' : 'Toplam',
    shares,
    shareText: shares.filter(s => s.pct > 0).map(s => `${s.label} %${s.pct}`).join(', '),
    note: euroDripNote(euroCash),
    houseText,
    houseTRY,
    houseEUR,
    warnings,
  };
}
