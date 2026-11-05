// Alış/satışta kasa hareketi varlığın kendi para biriminde yazılır.
// cash_balances her birim için ayrı satır tutar (TRY, USD, EUR, GBP, CHF, RON, RUB).
const KASA_CCY = new Set(['TRY', 'USD', 'EUR', 'GBP', 'CHF', 'RON', 'RUB']);

export function cashCurrencyFor(ccy: string | null | undefined): string {
  const c = String(ccy || 'TRY').toUpperCase();
  return KASA_CCY.has(c) ? c : 'TRY';
}

export function ccySymbol(ccy: string): string {
  return ({ TRY: '₺', USD: '$', EUR: '€', GBP: '£', CHF: 'CHF', RON: 'lei', RUB: '₽' } as Record<string, string>)[ccy] || ccy;
}
