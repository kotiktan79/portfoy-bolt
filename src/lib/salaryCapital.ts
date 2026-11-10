import type { Holding } from './supabase.js';
import { allocationClassFor, isHouseMoney } from '../config/portfolioPolicy.js';
import { isClosedHolding } from './openPosition.js';

/** Maaş sermayesi: kasa ve Ev Parası hariç. Sunucu/tarayıcıda aynı; gizli kur önbelleği yok. */
export function salaryCapitalEUR(holdings: Holding[], dailyRates: ReadonlyMap<string, number> = new Map()): number {
  const rates = new Map(dailyRates);
  rates.set('TRY', 1);
  for (const h of holdings) {
    const ccy = h.symbol === 'EURO' ? 'EUR' : h.symbol;
    if (h.asset_type === 'currency' && Number(h.current_price) > 1) rates.set(ccy, Number(h.current_price));
  }
  return holdings.reduce((sum, h) => {
    if (isClosedHolding(h) || isHouseMoney(h) || !allocationClassFor(h)) return sum;
    const currency = (h.currency || 'TRY').toUpperCase();
    const value = Number(h.quantity) * Number(h.current_price);
    if (currency === 'EUR') return sum + value;
    const rate = rates.get(currency), eurRate = rates.get('EUR');
    if (!rate || !eurRate) throw new Error('Maaş için döviz kuru eksik.');
    return sum + value * rate / eurRate;
  }, 0);
}
