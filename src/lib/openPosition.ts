// Açık pozisyon = adet gerçekten duruyor. Tam 0, boş ve kayan nokta artığı kapalıdır.
// 0,081 BTC açık kalır. Kapanmış satırın cost_basis alanı bayat olabilir; toplama girmez.

/** Sayısal artık. Bundan küçük adet ekranda ve açık toplamda yok sayılır. */
export const QTY_EPSILON = 1e-8;

export function isClosedHolding(h: { quantity?: number | string | null } | null | undefined): boolean {
  const q = Number(h?.quantity);
  if (!Number.isFinite(q)) return true;
  return Math.abs(q) <= QTY_EPSILON;
}

export function isOpenHolding(h: { quantity?: number | string | null } | null | undefined): boolean {
  return !isClosedHolding(h);
}

/**
 * Açık pozisyonun yerli maliyeti = adet × alış fiyatı.
 * Adet 0 iken holdings.cost_basis duruyor olabilir (ör. itfa etmiş eurobond 75.000).
 * O alan okunmaz; realize kâr işlem satırında kalır.
 */
export function openCostNative(h: {
  quantity?: number | string | null;
  purchase_price?: number | string | null;
  cost_basis?: number | string | null;
}): number {
  if (isClosedHolding(h)) return 0;
  return (Number(h.quantity) || 0) * (Number(h.purchase_price) || 0);
}

/** Açık pozisyonun yerli piyasa değeri. Kapalı satırda güncel fiyat duruyor olsa da 0. */
export function openValueNative(h: {
  quantity?: number | string | null;
  current_price?: number | string | null;
}): number {
  if (isClosedHolding(h)) return 0;
  return (Number(h.quantity) || 0) * (Number(h.current_price) || 0);
}
