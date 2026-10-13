// Bilinen araçlar. Yeni sembol yazılınca kategori ve para birimi kendiliğinden gelir.
// VWCE henüz portföyde yoksa da Xetra fiyatı ve ISIN burada durur.

export interface InstrumentHint {
  assetType: 'stock' | 'money_market' | 'treasury_etf';
  currency: 'EUR' | 'USD';
  note: string;
  yahoo: string;
}

export const INSTRUMENT_HINTS: Record<string, InstrumentHint> = {
  VWCE: {
    assetType: 'stock',
    currency: 'EUR',
    note: 'Xetra VWCE.DE · ISIN IE00BK5BQT80 · EUR',
    yahoo: 'VWCE.DE',
  },
  V3YL: {
    assetType: 'stock',
    currency: 'EUR',
    note: 'Xetra V3YL.DE · EUR',
    yahoo: 'V3YL.DE',
  },
  XEON: {
    assetType: 'money_market',
    currency: 'EUR',
    note: 'Para piyasası · Xetra XEON.DE · EUR',
    yahoo: 'XEON.DE',
  },
  IB01: {
    assetType: 'treasury_etf',
    currency: 'USD',
    note: 'Hazine bonosu ETF · IB01.L',
    yahoo: 'IB01.L',
  },
};

export function instrumentHint(symbol: string): InstrumentHint | null {
  return INSTRUMENT_HINTS[String(symbol || '').trim().toUpperCase()] || null;
}
