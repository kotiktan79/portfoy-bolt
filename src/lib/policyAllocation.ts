// Politika dağılımı — Plan, Dağılım, X-Ray ve simülatör aynı sınıfları kullanır.
// Payda: miktarı > 0 olan pozisyonlar. Kasa (cash) ve portföy dışı kasa bakiyesi yok.
// Altın (commodity) paydadadır; satılmaz, fazla ise seyreltilir.

import { Holding } from './supabase';
import { getFxRatesFromHoldings, holdingValueTRY } from './fx';
import { allocationClassFor, isHouseMoney, type AllocationClass } from '../config/portfolioPolicy';
import { planRebalance, type RebalanceAction, type RebalanceRow } from './rebalance';

export interface PolicySnapshot {
  rows: RebalanceRow[];
  actions: RebalanceAction[];
  annual: boolean;
  totalEUR: number;
  totalTRY: number;
  eurRate: number;
  xeonEUR: number;
  /** Hedef paydasının dışında. Kasadan ayrı. */
  houseMoneyEUR: number;
  houseMoneyTRY: number;
}

export function policySnapshot(holdings: Holding[], asOf: Date = new Date()): PolicySnapshot {
  const fx = getFxRatesFromHoldings(holdings);
  const eur = fx.eur > 0 ? fx.eur : 0;
  const values: Partial<Record<AllocationClass, number>> = {};
  let xeonEUR = 0;
  let totalTRY = 0;
  let houseMoneyTRY = 0;
  let houseMoneyEUR = 0;
  for (const h of holdings) {
    if ((Number(h.quantity) || 0) <= 0) continue;
    const tryValue = holdingValueTRY(h, fx);
    if (isHouseMoney(h)) {
      houseMoneyTRY += tryValue;
      if (eur > 0) houseMoneyEUR += tryValue / eur;
      continue;
    }
    const cls = allocationClassFor(h);
    if (!cls) continue;
    totalTRY += tryValue;
    if (!(eur > 0)) continue;
    const v = tryValue / eur;
    values[cls] = (values[cls] || 0) + v;
    if (String(h.symbol || '').toUpperCase() === 'XEON') xeonEUR += v;
  }
  const plan = planRebalance({ valuesEUR: values, xeonEUR, asOf });
  return { ...plan, totalTRY, eurRate: eur, xeonEUR, houseMoneyEUR, houseMoneyTRY };
}
