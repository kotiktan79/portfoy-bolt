// Merkezi FX helper. UI ve service'lerin tek noktadan TRY karşılığı hesaplaması için.
// holding.current_price holding.currency cinsinden tutulur (kontrat).
// Bu helper currency'e göre TRY'ye çevirir.

import { Holding } from './supabase';
import { DEFAULT_USD_TRY_RATE } from '../config';

export interface FxRates {
  usd: number;
  eur: number;
  gbp?: number;
}

export function getFxRatesFromHoldings(holdings: Holding[]): FxRates {
  const usdH = holdings.find(h => h.symbol === 'USD' && h.asset_type === 'currency');
  // Currency cash row may be stored as either 'EURO' or 'EUR' across the app.
  const eurH = holdings.find(h => (h.symbol === 'EURO' || h.symbol === 'EUR') && h.asset_type === 'currency');
  const gbpH = holdings.find(h => h.symbol === 'GBP' && h.asset_type === 'currency');
  const usd = (usdH?.current_price && usdH.current_price > 1) ? usdH.current_price : DEFAULT_USD_TRY_RATE;
  const eur = (eurH?.current_price && eurH.current_price > 1) ? eurH.current_price : usd * 1.08;
  const gbp = gbpH?.current_price && gbpH.current_price > 1 ? gbpH.current_price : usd * 1.27;
  return { usd, eur, gbp };
}

// Belirtilen currency'deki tutarı TRY'ye çevirir.
export function fxToTRY(amount: number, ccy: string | null | undefined, rates: FxRates): number {
  const c = (ccy || 'TRY').toUpperCase();
  if (c === 'TRY') return amount;
  if (c === 'USD') return amount * rates.usd;
  if (c === 'EUR') return amount * rates.eur;
  if (c === 'GBP') return amount * (rates.gbp ?? rates.usd * 1.27);
  return amount;
}

// Holding'in TRY karşılığı değeri.
export function holdingValueTRY(h: Pick<Holding, 'current_price' | 'quantity' | 'currency'>, rates: FxRates): number {
  const v = (h.current_price || 0) * (h.quantity || 0);
  return fxToTRY(v, h.currency, rates);
}

// Holding'in TRY karşılığı maliyet bazı.
export function holdingCostTRY(h: Pick<Holding, 'purchase_price' | 'quantity' | 'currency'>, rates: FxRates): number {
  const v = (h.purchase_price || 0) * (h.quantity || 0);
  return fxToTRY(v, h.currency, rates);
}

// Holding listesinin toplam TRY değeri.
export function totalValueTRY(holdings: Holding[], rates?: FxRates): number {
  const r = rates || getFxRatesFromHoldings(holdings);
  return holdings.reduce((s, h) => s + holdingValueTRY(h, r), 0);
}
