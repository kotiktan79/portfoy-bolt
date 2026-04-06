import { supabase } from '../lib/supabase';
import { API_URLS } from '../config';

export interface ExchangeRate {
  from: string;
  to: string;
  rate: number;
  timestamp: Date;
}

const rateCache = new Map<string, { rate: number; timestamp: number }>();
const CACHE_DURATION = 60 * 60 * 1000;

export async function getExchangeRate(from: string, to: string): Promise<number> {
  if (from === to) return 1;

  const cacheKey = `${from}-${to}`;
  const cached = rateCache.get(cacheKey);

  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return cached.rate;
  }

  try {
    const { data, error } = await supabase
      .from('exchange_rates')
      .select('rate')
      .eq('from_currency', from)
      .eq('to_currency', to)
      .order('recorded_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;

    if (data) {
      rateCache.set(cacheKey, { rate: data.rate, timestamp: Date.now() });
      return data.rate;
    }

    const fetchedRate = await fetchExchangeRateFromAPI(from, to);
    if (fetchedRate) {
      await saveExchangeRate(from, to, fetchedRate);
      rateCache.set(cacheKey, { rate: fetchedRate, timestamp: Date.now() });
      return fetchedRate;
    }

    return 1;
  } catch (error) {
    console.error(`Error getting exchange rate ${from}/${to}:`, error);
    return 1;
  }
}

async function fetchExchangeRateFromAPI(from: string, to: string): Promise<number | null> {
  try {
    const response = await fetch(
      `${API_URLS.EXCHANGE_RATE}/${from}`,
      { signal: AbortSignal.timeout(5000) }
    );

    if (!response.ok) {
      console.warn(`Exchange rate API returned status ${response.status}`);
      return null;
    }

    const data = await response.json();

    if (!data || typeof data !== 'object') {
      console.warn('Invalid response format from exchange rate API');
      return null;
    }

    if (data.rates && typeof data.rates[to] === 'number') {
      return data.rates[to];
    }

    console.warn(`Rate not found for ${from}/${to} in API response`);
    return null;
  } catch (error) {
    if (error instanceof Error) {
      console.error(`Error fetching exchange rate from API: ${error.message}`);
    } else {
      console.error('Error fetching exchange rate from API:', error);
    }
    return null;
  }
}

async function saveExchangeRate(from: string, to: string, rate: number): Promise<void> {
  try {
    await supabase.from('exchange_rates').insert([
      {
        from_currency: from,
        to_currency: to,
        rate,
        recorded_at: new Date().toISOString(),
        source: 'api',
      },
    ]);
  } catch (error) {
    console.error('Error saving exchange rate:', error);
  }
}

export async function convertAmount(
  amount: number,
  fromCurrency: string,
  toCurrency: string
): Promise<number> {
  if (fromCurrency === toCurrency) return amount;

  const rate = await getExchangeRate(fromCurrency, toCurrency);
  return amount * rate;
}

export async function updateExchangeRates(): Promise<void> {
  const currencies = ['USD', 'EUR', 'GBP', 'TRY', 'RON', 'RUB', 'CHF'];
  const rates: Array<{ from: string; to: string; rate: number }> = [];

  for (const from of currencies) {
    for (const to of currencies) {
      if (from === to) continue;

      const rate = await fetchExchangeRateFromAPI(from, to);
      if (rate) {
        rates.push({ from, to, rate });
      }
    }
  }

  if (rates.length > 0) {
    try {
      await supabase.from('exchange_rates').insert(
        rates.map((r) => ({
          from_currency: r.from,
          to_currency: r.to,
          rate: r.rate,
          recorded_at: new Date().toISOString(),
          source: 'api',
        }))
      );
    } catch (error) {
      console.error('Error updating exchange rates:', error);
    }
  }
}

export async function convertToTRY(amount: number, currency: string): Promise<number> {
  if (currency === 'TRY') return amount;
  const rate = await getExchangeRate(currency, 'TRY');
  return amount * (rate || 1);
}

export function getCurrencySymbol(currency: string): string {
  const symbols: Record<string, string> = {
    TRY: '₺',
    USD: '$',
    EUR: '€',
    GBP: '£',
    JPY: '¥',
    CNY: '¥',
    CHF: 'Fr',
    RON: 'Lei',
    RUB: '₽',
  };

  return symbols[currency] || currency;
}

export function formatCurrencyAmount(amount: number, currency: string): string {
  const symbol = getCurrencySymbol(currency);
  const formatted = new Intl.NumberFormat('tr-TR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);

  if (currency === 'TRY') {
    return `${formatted} ${symbol}`;
  }

  return `${symbol}${formatted}`;
}

export function detectCurrency(symbol: string, assetType: string): string {
  const upperSymbol = symbol.toUpperCase();

  if (assetType === 'crypto') {
    return 'USD';
  }

  if (assetType === 'currency') {
    if (upperSymbol.includes('USD') || upperSymbol === 'DOLLAR') return 'USD';
    if (upperSymbol.includes('EUR') || upperSymbol === 'EURO') return 'EUR';
    if (upperSymbol.includes('GBP') || upperSymbol === 'POUND') return 'GBP';
    if (upperSymbol.includes('TRY') || upperSymbol === 'LIRA') return 'TRY';
    return 'USD';
  }

  if (assetType === 'commodity') {
    if (upperSymbol.includes('GOLD') || upperSymbol.includes('ALTIN')) return 'TRY';
    if (upperSymbol.includes('SILVER') || upperSymbol.includes('GUMUS')) return 'USD';
    if (upperSymbol.includes('BRENT') || upperSymbol.includes('OIL')) return 'USD';
    return 'USD';
  }

  if (assetType === 'eurobond') {
    if (upperSymbol.includes('USD')) return 'USD';
    if (upperSymbol.includes('EUR')) return 'EUR';
    return 'USD';
  }

  if (assetType === 'stock') {
    if (upperSymbol.match(/^[A-Z]{3,5}$/)) {
      return 'TRY';
    }
    return 'TRY';
  }

  return 'TRY';
}

export async function calculatePnLWithCurrency(
  purchasePrice: number,
  purchaseCurrency: string,
  currentPrice: number,
  currentCurrency: string,
  quantity: number,
  displayCurrency: string = 'TRY'
): Promise<{
  investedAmount: number;
  currentValue: number;
  pnl: number;
  pnlPercent: number;
  currency: string;
}> {
  const investedInPurchaseCurrency = purchasePrice * quantity;
  const investedInDisplayCurrency = await convertAmount(
    investedInPurchaseCurrency,
    purchaseCurrency,
    displayCurrency
  );

  const currentInCurrentCurrency = currentPrice * quantity;
  const currentInDisplayCurrency = await convertAmount(
    currentInCurrentCurrency,
    currentCurrency,
    displayCurrency
  );

  const pnl = currentInDisplayCurrency - investedInDisplayCurrency;
  const pnlPercent = investedInDisplayCurrency > 0
    ? (pnl / investedInDisplayCurrency) * 100
    : 0;

  return {
    investedAmount: investedInDisplayCurrency,
    currentValue: currentInDisplayCurrency,
    pnl,
    pnlPercent,
    currency: displayCurrency,
  };
}

export async function normalizeToBaseCurrency(
  holdings: any[],
  baseCurrency: string = 'TRY'
): Promise<any[]> {
  const normalized = [];

  for (const holding of holdings) {
    const currency = holding.currency || detectCurrency(holding.symbol, holding.asset_type);
    const purchaseCurrency = holding.purchase_currency || currency;

    const pnlData = await calculatePnLWithCurrency(
      holding.purchase_price,
      purchaseCurrency,
      holding.current_price,
      currency,
      holding.quantity,
      baseCurrency
    );

    normalized.push({
      ...holding,
      currency,
      purchase_currency: purchaseCurrency,
      normalized_invested: pnlData.investedAmount,
      normalized_current: pnlData.currentValue,
      normalized_pnl: pnlData.pnl,
      normalized_pnl_percent: pnlData.pnlPercent,
      display_currency: baseCurrency,
    });
  }

  return normalized;
}

let exchangeRateInterval: ReturnType<typeof setInterval> | null = null;

export async function startExchangeRateUpdates(): Promise<void> {
  if (exchangeRateInterval) return;

  await updateExchangeRates();

  exchangeRateInterval = setInterval(async () => {
    try {
      await updateExchangeRates();
    } catch (error) {
      console.error('Exchange rate update failed:', error);
    }
  }, 3600000);
}

export function stopExchangeRateUpdates(): void {
  if (exchangeRateInterval) {
    clearInterval(exchangeRateInterval);
    exchangeRateInterval = null;
  }
}
