// Ay başı adedi × fiyat farkı. Aylık ekran bunu artık kullanmaz;
// orası alış/satışlı dökümü (monthlyPositionBreakdown) gösterir.

export interface QtyTx {
  date: string;
  type: string;
  quantity: number | string | null;
}

/** `day` günü kapanışında eldeki adet. O günden sonraki işlemler geri alınır. */
export function qtyAsOf(currentQty: number, txs: QtyTx[], day: string): number {
  let q = currentQty;
  for (const t of txs) {
    const d = String(t.date).slice(0, 10);
    if (d <= day) continue;
    const n = Number(t.quantity) || 0;
    if (t.type === 'buy') q -= n;
    else if (t.type === 'sell') q += n;
  }
  return Math.max(0, q);
}

/** Ay içinde eklenen adet, ay başı fiyatından kâr yazmaz. Örnek: 100 adet 10→12, sonra 100 alış = +200, +400 değil. */
export function heldPriceMove(qtyAtStart: number, startPx: number, endPx: number): number {
  return qtyAtStart * (endPx - startPx);
}
