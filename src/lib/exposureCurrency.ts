// Ekonomik para birimi. TL ile fiyatlanmış global varlık TL riski değildir.
// Revolut robo TRY fiyatla durur ama değer euro portföydür (kullanıcı kaydı).

export function exposureCurrency(h: {
  symbol?: string | null;
  asset_type?: string | null;
  currency?: string | null;
}): string {
  const sym = String(h.symbol || '').toUpperCase();
  const cur = String(h.currency || 'TRY').toUpperCase();
  if (h.asset_type === 'currency') {
    if (sym === 'EURO' || sym === 'EUR') return 'EUR';
    if (sym === 'USD' || sym === 'USDC' || sym === 'USDT') return 'USD';
    if (sym === 'GBP') return 'GBP';
    if (sym === 'CHF') return 'CHF';
    return sym || cur;
  }
  if (h.asset_type === 'crypto') return 'BTC';
  if (h.asset_type === 'commodity') return 'GOLD';
  if (sym === 'REVOLUT-ROBO') return 'EUR';
  if (cur === 'EUR' || cur === 'USD' || cur === 'GBP' || cur === 'CHF' || cur === 'TRY') return cur;
  return cur || 'TRY';
}
