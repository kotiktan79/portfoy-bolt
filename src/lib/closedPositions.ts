// Kapalı pozisyon (adet 0) ekranı. Kâr motoruna girmez; realize euro yalnız gösterimdir.
import { inceptionDay } from './inceptionLots';

export function isClosedHolding(h: { quantity?: number | string | null }): boolean {
  return (Number(h.quantity) || 0) <= 0;
}

export interface ClosedSale {
  day: string;
  native: number;
  currency: string;
}

export function salesForHolding(
  holding: {
    id: string;
    currency?: string | null;
    total_realized_pnl?: number | string | null;
    updated_at?: string | null;
  },
  txs: Array<{
    holding_id?: string | number | null;
    transaction_type?: string | null;
    realized_profit?: number | string | null;
    transaction_date?: string | null;
  }>,
): ClosedSale[] {
  const currency = String(holding.currency || 'TRY').toUpperCase();
  const sales = txs.filter(t =>
    String(t.holding_id) === String(holding.id)
    && String(t.transaction_type) === 'sell'
    && Number(t.realized_profit),
  );
  if (sales.length) {
    return sales.map(t => ({
      day: inceptionDay(t.transaction_date),
      native: Number(t.realized_profit) || 0,
      currency,
    }));
  }
  const stored = Number(holding.total_realized_pnl) || 0;
  if (!stored) return [];
  return [{ day: inceptionDay(holding.updated_at), native: stored, currency }];
}

/** Satış gününün kuruyla euro. Kur yoksa null (uydurma kur yok). */
export function sumRealizedEUR(
  sales: ClosedSale[],
  rateAt: (ccy: 'EUR' | 'USD', day: string) => number,
): number | null {
  if (!sales.length) return 0;
  let sum = 0;
  for (const s of sales) {
    if (s.currency === 'EUR') { sum += s.native; continue; }
    if (s.currency === 'USD') {
      const usd = rateAt('USD', s.day);
      const eur = rateAt('EUR', s.day);
      if (!(usd > 1) || !(eur > 1)) return null;
      sum += (s.native * usd) / eur;
      continue;
    }
    const eur = rateAt('EUR', s.day);
    if (!(eur > 1)) return null;
    sum += s.native / eur;
  }
  return sum;
}
