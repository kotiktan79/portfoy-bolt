// Görünen kâr = fiyat × adet − maliyet. holdings.unrealized_pnl bayat olabilir; okunmaz.

export interface PricedHolding {
  quantity?: number | string | null;
  current_price?: number | string | null;
  purchase_price?: number | string | null;
  currency?: string | null;
  symbol?: string | null;
}

export interface NativePnl {
  currency: string;
  quantity: number;
  cost: number;
  value: number;
  pnl: number;
  pnlPercent: number;
}

export function nativeUnrealized(h: PricedHolding): NativePnl {
  const quantity = Number(h.quantity) || 0;
  const px = Number(h.current_price) || 0;
  const pp = Number(h.purchase_price) || 0;
  const cost = pp * quantity;
  const value = px * quantity;
  const pnl = value - cost;
  return {
    currency: String(h.currency || 'TRY').toUpperCase(),
    quantity, cost, value, pnl,
    pnlPercent: cost > 0 ? (pnl / cost) * 100 : 0,
  };
}

/** ASML euro hissedir. Para birimi boşsa sembolden EUR; ekranda ₺ gibi görünmesin. */
export function displayCurrency(h: PricedHolding): string {
  const c = String(h.currency || '').toUpperCase();
  if (c) return c;
  if (String(h.symbol || '').toUpperCase() === 'ASML') return 'EUR';
  return 'TRY';
}
