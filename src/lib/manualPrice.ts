// Elle EUR değer. Revolut robotunun Yahoo kodu yok; TRY'ye sabitlenirse EUR karşılığı kurla kayar.
// holdings.currency = 'EUR' ve manual_price = true iken current_price zaten EUR'dur
// (adet × fiyat = euro değer). Günlük iş ve 5 dakikalık tur bu sembole dokunmaz.

export function isManualEurValue(symbol: string | null | undefined): boolean {
  return String(symbol || '').trim().toUpperCase() === 'REVOLUT-ROBO';
}
