// Elle EUR değer. Revolut robotunun Yahoo kodu yok; TRY'ye sabitlenirse EUR karşılığı kurla kayar.
// holdings.currency = 'EUR' ve manual_price = true iken current_price zaten EUR'dur
// (adet × fiyat = euro değer). Günlük iş ve 5 dakikalık tur bu sembole dokunmaz.

export function isManualEurValue(symbol: string | null | undefined): boolean {
  return String(symbol || '').trim().toUpperCase() === 'REVOLUT-ROBO';
}

/** Takvimden bağımsız geçen süre; tam 7 gün henüz eski değildir. */
export function manualPriceWarning(h: {
  manual_price?: boolean; quantity?: number | string | null;
  manual_price_updated_at?: string | null;
}, now = Date.now()): string | null {
  if (h.manual_price !== true || !(Number(h.quantity) > 0)) return null;
  const entered = h.manual_price_updated_at ? Date.parse(h.manual_price_updated_at) : NaN;
  if (!Number.isFinite(entered)) return 'Fiyat giriş tarihi bilinmiyor, güncelle';
  const elapsed = now - entered;
  if (elapsed <= 7 * 86400000) return null;
  return `Fiyat ${Math.floor(elapsed / 86400000)} gün önce girildi, güncelle`;
}
