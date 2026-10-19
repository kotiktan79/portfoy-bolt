// Kotasyonlu ETF / para piyasası. Günlük fiyat işi bunları Yahoo'dan yazar.
//
// 2026-10-13'te XEON asset_type eurobond → money_market, IB01 eurobond → treasury_etf oldu.
// daily-snapshot yalnız eurobond kovasına bakınca ikisi de işin dışında kaldı:
// XEON 150.486'da (son yazılış ~14 Ekim), IB01 109.0617'de (~15 Ekim) dondu.
// Ticker'lar doğruydu (2026-10-19, Yahoo v8): XEON.DE EUR ~150.53, IB01.L USD ~122.22.
// v7 quote 401 döner; v8 chart yedeği fiyatı verir. Eksik olan yönlendirmeydi.

export const ETF_YAHOO: Record<string, string> = {
  IB01: 'IB01.L',  // iShares USD Treasury 0-1yr Acc. Xetra IB01.DE yok; Londra USD kote.
  IBTA: 'IBTA.L',
  IBTL: 'IBTL.L',
  CBU0: 'CBU0.L',
  TLT: 'TLT',
  GOVT: 'GOVT',
  SGOV: 'SGOV',
  IEF: 'IEF',
  SHY: 'SHY',
  XEON: 'XEON.DE',  // Xtrackers II EUR Overnight Rate Swap (Acc) — Xetra, EUR kote
};

const ETF_QUOTE_TYPES = new Set(['eurobond', 'money_market', 'treasury_etf']);

/** Günlük kotasyon işine girer. Tip eurobond olmasa da (XEON/IB01) haritadaki sembol girer. */
export function isEtfQuoteHolding(assetType: string | null | undefined, symbol: string | null | undefined): boolean {
  const sym = String(symbol || '').trim().toUpperCase();
  if (ETF_YAHOO[sym]) return true;
  return ETF_QUOTE_TYPES.has(String(assetType || '').toLowerCase());
}
