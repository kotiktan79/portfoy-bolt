import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

// Server-side Supabase client
function getSupabase() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Supabase credentials missing');
  return createClient(url, key);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Vercel Cron sends GET requests with authorization header
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Verify cron secret (optional but recommended)
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers.authorization !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const startTime = Date.now();
  const log: string[] = [];

  try {
    const supabase = getSupabase();

    // 1. Tüm holding'leri çek
    const { data: holdings, error: holdingsError } = await supabase
      .from('holdings')
      .select('*');

    if (holdingsError) throw new Error(`Holdings fetch failed: ${holdingsError.message}`);
    if (!holdings || holdings.length === 0) {
      return res.status(200).json({ success: true, message: 'No holdings found', log });
    }

    log.push(`${holdings.length} holding bulundu`);

    // 2. Her holding için güncel fiyat çek ve güncelle
    const priceUpdates = await updateAllPrices(supabase, holdings, log);
    log.push(`${priceUpdates.updated} fiyat güncellendi, ${priceUpdates.failed} başarısız`);

    // 3. Güncellenmiş holding'leri tekrar çek
    const { data: updatedHoldings } = await supabase.from('holdings').select('*');
    const allHoldings = updatedHoldings || holdings;

    // 4. Portfolio snapshot hesapla ve kaydet
    const totalValue = allHoldings.reduce((sum, h) => {
      const price = Number(h.current_price) || Number(h.purchase_price) || 0;
      const qty = Number(h.quantity) || 0;
      const value = price * qty;
      return sum + (isFinite(value) ? value : 0);
    }, 0);

    const totalInvestment = allHoldings.reduce((sum, h) => {
      const price = Number(h.purchase_price) || 0;
      const qty = Number(h.quantity) || 0;
      const value = price * qty;
      return sum + (isFinite(value) ? value : 0);
    }, 0);

    const totalPnl = totalValue - totalInvestment;
    const pnlPercentage = totalInvestment > 0 ? (totalPnl / totalInvestment) * 100 : 0;

    const today = new Date().toISOString().split('T')[0];
    const snapshotData = {
      snapshot_date: today,
      total_value: totalValue,
      total_investment: totalInvestment,
      total_pnl: totalPnl,
      pnl_percentage: pnlPercentage,
    };

    // Upsert dene, constraint yoksa delete+insert fallback
    const { error: snapshotError } = await supabase
      .from('portfolio_snapshots')
      .upsert([snapshotData], { onConflict: 'snapshot_date' });

    if (snapshotError) {
      // Constraint hatası → delete+insert fallback
      log.push(`Upsert hata (${snapshotError.message}), delete+insert deneniyor...`);
      await supabase.from('portfolio_snapshots').delete().eq('snapshot_date', today);
      const { error: insertError } = await supabase.from('portfolio_snapshots').insert([snapshotData]);
      if (insertError) {
        log.push(`Snapshot kayıt hatası: ${insertError.message}`);
      } else {
        log.push(`Snapshot kaydedildi (fallback): ${totalValue.toFixed(0)} TL`);
      }
    } else {
      log.push(`Snapshot kaydedildi: ${totalValue.toFixed(0)} TL`);
    }

    // 5. Fiyat geçmişine kaydet
    const priceHistoryRecords = allHoldings.map(h => ({
      holding_id: h.id,
      symbol: h.symbol,
      price: h.current_price || h.purchase_price || 0,
      recorded_at: new Date().toISOString(),
    }));

    const { error: priceHistError } = await supabase
      .from('price_history')
      .insert(priceHistoryRecords);

    if (priceHistError) {
      log.push(`Fiyat geçmişi hatası: ${priceHistError.message}`);
    } else {
      log.push(`${priceHistoryRecords.length} fiyat geçmişi kaydedildi`);
    }

    // 6. Fiyat alarmlarını kontrol et
    const alertsTriggered = await checkPriceAlerts(supabase, allHoldings, log);
    log.push(`${alertsTriggered} alarm tetiklendi`);

    const elapsed = Date.now() - startTime;
    log.push(`Toplam süre: ${elapsed}ms`);

    return res.status(200).json({
      success: true,
      snapshot: {
        date: today,
        total_value: totalValue,
        total_investment: totalInvestment,
        total_pnl: totalPnl,
        pnl_percentage: pnlPercentage,
        holdings_count: allHoldings.length,
      },
      prices: priceUpdates,
      alerts_triggered: alertsTriggered,
      elapsed_ms: elapsed,
      log,
    });
  } catch (error: any) {
    log.push(`HATA: ${error.message}`);
    return res.status(500).json({ success: false, error: error.message, log });
  }
}

// ================================================
// Fiyat güncelleme fonksiyonları
// ================================================

interface PriceResult {
  updated: number;
  failed: number;
  details: Record<string, number>;
}

async function updateAllPrices(supabase: any, holdings: any[], log: string[]): Promise<PriceResult> {
  const result: PriceResult = { updated: 0, failed: 0, details: {} };

  // Holding'leri tipe göre grupla
  const byType: Record<string, any[]> = {};
  for (const h of holdings) {
    const type = h.asset_type || 'unknown';
    if (!byType[type]) byType[type] = [];
    byType[type].push(h);
  }

  // Her tip için toplu fiyat çek
  const promises: Promise<void>[] = [];

  if (byType.crypto) {
    promises.push(updateCryptoPrices(supabase, byType.crypto, result, log));
  }
  if (byType.stock) {
    promises.push(updateStockPrices(supabase, byType.stock, result, log));
  }
  if (byType.currency) {
    promises.push(updateCurrencyPrices(supabase, byType.currency, result, log));
  }
  if (byType.commodity) {
    promises.push(updateCommodityPrices(supabase, byType.commodity, result, log));
  }
  if (byType.fund) {
    promises.push(updateFundPrices(supabase, byType.fund, result, log));
  }
  if (byType.eurobond) {
    promises.push(updateEurobondPrices(supabase, byType.eurobond, result, log));
  }

  await Promise.allSettled(promises);
  return result;
}

// CoinGecko ID mapping
const COINGECKO_IDS: Record<string, string> = {
  BTC: 'bitcoin', ETH: 'ethereum', SOL: 'solana', BNB: 'binancecoin',
  XRP: 'ripple', ADA: 'cardano', DOGE: 'dogecoin', LINK: 'chainlink',
  AVAX: 'avalanche-2', DOT: 'polkadot', NEAR: 'near', ATOM: 'cosmos',
  FIL: 'filecoin', AAVE: 'aave', UNI: 'uniswap', MATIC: 'matic-network',
  ALGO: 'algorand', FTM: 'fantom', SAND: 'the-sandbox', MANA: 'decentraland',
  APT: 'aptos', ARB: 'arbitrum', OP: 'optimism', SUI: 'sui',
  SEI: 'sei-network', TIA: 'celestia', INJ: 'injective-protocol',
  RUNE: 'thorchain', LTC: 'litecoin', BCH: 'bitcoin-cash',
};

async function fetchCryptoPricesCoinGecko(symbols: string[]): Promise<Record<string, number>> {
  const priceMap: Record<string, number> = {};
  const ids = symbols.map(s => COINGECKO_IDS[s]).filter(Boolean);
  if (ids.length === 0) return priceMap;

  const res = await fetch(
    `https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(',')}&vs_currencies=usd`
  );
  if (!res.ok) throw new Error(`CoinGecko API: ${res.status}`);

  const data = await res.json();
  const idToSymbol: Record<string, string> = {};
  for (const [sym, id] of Object.entries(COINGECKO_IDS)) {
    idToSymbol[id] = sym;
  }
  for (const [id, prices] of Object.entries(data)) {
    const sym = idToSymbol[id];
    if (sym && (prices as any).usd) {
      priceMap[sym] = (prices as any).usd;
    }
  }
  return priceMap;
}

async function updateCryptoPrices(supabase: any, holdings: any[], result: PriceResult, log: string[]) {
  let priceMap: Record<string, number> = {};
  let source = 'Binance';

  // Binance dene
  try {
    const symbols = holdings.map(h => `"${h.symbol.toUpperCase()}USDT"`).join(',');
    const res = await fetch(`https://api.binance.com/api/v3/ticker/price?symbols=[${symbols}]`);
    if (!res.ok) throw new Error(`Binance API: ${res.status}`);

    const data = await res.json();
    for (const item of data) {
      const sym = item.symbol.replace('USDT', '');
      priceMap[sym] = parseFloat(item.price);
    }
  } catch (binanceErr: any) {
    // CoinGecko fallback
    log.push(`Binance hata (${binanceErr.message}), CoinGecko'ya geçiliyor...`);
    try {
      const symbolList = holdings.map(h => h.symbol.toUpperCase());
      priceMap = await fetchCryptoPricesCoinGecko(symbolList);
      source = 'CoinGecko';
    } catch (cgErr: any) {
      log.push(`CoinGecko da başarısız: ${cgErr.message}`);
      result.failed += holdings.length;
      return;
    }
  }

  try {
    const usdTry = await fetchUsdTry();

    for (const h of holdings) {
      const usdPrice = priceMap[h.symbol.toUpperCase()];
      if (usdPrice) {
        const tryPrice = usdPrice * usdTry;
        await supabase.from('holdings').update({ current_price: tryPrice, updated_at: new Date().toISOString() }).eq('id', h.id);
        result.updated++;
        result.details[h.symbol] = tryPrice;
      } else {
        result.failed++;
      }
    }
    log.push(`Kripto (${source}): ${Object.keys(priceMap).length} fiyat alındı (USD/TRY: ${usdTry.toFixed(2)})`);
  } catch (e: any) {
    log.push(`Kripto fiyat hatası: ${e.message}`);
    result.failed += holdings.length;
  }
}

async function updateStockPrices(supabase: any, holdings: any[], result: PriceResult, log: string[]) {
  try {
    // BIST ve uluslararası hisseleri ayır
    const bistHoldings = holdings.filter(h => isBistStock(h.symbol));
    const intlHoldings = holdings.filter(h => !isBistStock(h.symbol));

    // BIST hisseleri
    if (bistHoldings.length > 0) {
      const symbols = bistHoldings.map(h => `${h.symbol}.IS`).join(',');
      const prices = await fetchYahooPrices(symbols);
      for (const h of bistHoldings) {
        const price = prices[`${h.symbol}.IS`];
        if (price) {
          await supabase.from('holdings').update({ current_price: price, updated_at: new Date().toISOString() }).eq('id', h.id);
          result.updated++;
          result.details[h.symbol] = price;
        } else {
          result.failed++;
        }
      }
      log.push(`BIST: ${bistHoldings.length} hisse sorgulandı`);
    }

    // Uluslararası hisseler (USD/EUR cinsinden → TRY'ye çevir)
    if (intlHoldings.length > 0) {
      const symbols = intlHoldings.map(h => h.symbol).join(',');
      const prices = await fetchYahooPrices(symbols);
      const usdTry = await fetchUsdTry();

      for (const h of intlHoldings) {
        const price = prices[h.symbol];
        if (price) {
          // Avrupa hisseleri EUR, ABD hisseleri USD
          const isEuropean = ['ASML', 'LVMH', 'SAP', 'TTE', 'OR', 'SAN', 'AIR', 'SU', 'NOKIA', 'BMW', 'SIE', 'ADYEN', 'PROSUS'].includes(h.symbol.toUpperCase());
          let tryPrice = price * usdTry;
          if (isEuropean) {
            const eurTry = await fetchEurTry();
            tryPrice = price * eurTry;
          }
          await supabase.from('holdings').update({ current_price: tryPrice, updated_at: new Date().toISOString() }).eq('id', h.id);
          result.updated++;
          result.details[h.symbol] = tryPrice;
        } else {
          result.failed++;
        }
      }
      log.push(`Uluslararası: ${intlHoldings.length} hisse sorgulandı`);
    }
  } catch (e: any) {
    log.push(`Hisse fiyat hatası: ${e.message}`);
    result.failed += holdings.length;
  }
}

async function updateCurrencyPrices(supabase: any, holdings: any[], result: PriceResult, log: string[]) {
  try {
    const usdTry = await fetchUsdTry();
    const eurTry = await fetchEurTry();

    const rateMap: Record<string, number> = {
      USD: usdTry,
      EUR: eurTry,
      GBP: usdTry * 1.27, // Approximate, will be refined
      CHF: usdTry * 1.12,
    };

    // Get actual GBP and CHF from API
    try {
      const res = await fetch('https://open.er-api.com/v6/latest/USD');
      if (res.ok) {
        const data = await res.json();
        if (data.rates) {
          if (data.rates.GBP && data.rates.TRY) rateMap.GBP = data.rates.TRY / data.rates.GBP;
          if (data.rates.CHF && data.rates.TRY) rateMap.CHF = data.rates.TRY / data.rates.CHF;
        }
      }
    } catch { /* fallback to approximations */ }

    for (const h of holdings) {
      const sym = h.symbol.toUpperCase();
      const rate = rateMap[sym];
      if (rate) {
        await supabase.from('holdings').update({ current_price: rate, updated_at: new Date().toISOString() }).eq('id', h.id);
        result.updated++;
        result.details[h.symbol] = rate;
      } else {
        result.failed++;
      }
    }
    log.push(`Döviz: USD/TRY=${usdTry.toFixed(2)}, EUR/TRY=${eurTry.toFixed(2)}`);
  } catch (e: any) {
    log.push(`Döviz fiyat hatası: ${e.message}`);
    result.failed += holdings.length;
  }
}

async function updateCommodityPrices(supabase: any, holdings: any[], result: PriceResult, log: string[]) {
  try {
    const usdTry = await fetchUsdTry();

    for (const h of holdings) {
      const sym = h.symbol.toUpperCase();
      let price: number | null = null;

      if (sym.includes('GOLD') || sym.includes('ALTIN') || sym === 'XAU') {
        const goldOz = await fetchGoldPrice();
        if (goldOz) price = (goldOz / 31.1035) * usdTry; // gram TRY
      } else if (sym.includes('SILVER') || sym.includes('GUMUS') || sym === 'XAG') {
        const silverOz = await fetchSilverPrice();
        if (silverOz) price = (silverOz / 31.1035) * usdTry;
      }

      if (price) {
        await supabase.from('holdings').update({ current_price: price, updated_at: new Date().toISOString() }).eq('id', h.id);
        result.updated++;
        result.details[h.symbol] = price;
      } else {
        result.failed++;
      }
    }
  } catch (e: any) {
    log.push(`Emtia fiyat hatası: ${e.message}`);
    result.failed += holdings.length;
  }
}

async function updateFundPrices(supabase: any, holdings: any[], result: PriceResult, log: string[]) {
  // Fonlar genellikle manual_price — sadece Yahoo'da olanları güncelle
  for (const h of holdings) {
    if (h.manual_price) {
      result.details[h.symbol] = h.current_price;
      continue;
    }
    try {
      const prices = await fetchYahooPrices(h.symbol);
      const price = prices[h.symbol];
      if (price) {
        await supabase.from('holdings').update({ current_price: price, updated_at: new Date().toISOString() }).eq('id', h.id);
        result.updated++;
        result.details[h.symbol] = price;
      } else {
        result.failed++;
      }
    } catch {
      result.failed++;
    }
  }
}

async function updateEurobondPrices(supabase: any, holdings: any[], result: PriceResult, log: string[]) {
  // Eurobondlar genellikle manuel fiyatlandırılır
  for (const h of holdings) {
    result.details[h.symbol] = h.current_price;
  }
  log.push(`Eurobond: ${holdings.length} pozisyon (manuel fiyat)`);
}

// ================================================
// Yardımcı fonksiyonlar
// ================================================

let _usdTryCache: { value: number; ts: number } | null = null;
let _eurTryCache: { value: number; ts: number } | null = null;

async function fetchUsdTry(): Promise<number> {
  if (_usdTryCache && Date.now() - _usdTryCache.ts < 60000) return _usdTryCache.value;
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/USD');
    if (res.ok) {
      const data = await res.json();
      const rate = data.rates?.TRY || 38;
      _usdTryCache = { value: rate, ts: Date.now() };
      return rate;
    }
  } catch { /* fallback */ }
  return _usdTryCache?.value || 38;
}

async function fetchEurTry(): Promise<number> {
  if (_eurTryCache && Date.now() - _eurTryCache.ts < 60000) return _eurTryCache.value;
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/EUR');
    if (res.ok) {
      const data = await res.json();
      const rate = data.rates?.TRY || 41;
      _eurTryCache = { value: rate, ts: Date.now() };
      return rate;
    }
  } catch { /* fallback */ }
  return _eurTryCache?.value || 41;
}

async function fetchYahooPrices(symbols: string): Promise<Record<string, number>> {
  const prices: Record<string, number> = {};
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${symbols}&fields=regularMarketPrice`,
      { headers: { 'User-Agent': 'Mozilla/5.0' } }
    );
    if (res.ok) {
      const data = await res.json();
      const quotes = data?.quoteResponse?.result || [];
      for (const q of quotes) {
        if (q.regularMarketPrice) {
          prices[q.symbol] = q.regularMarketPrice;
        }
      }
    }
  } catch { /* skip */ }
  return prices;
}

async function fetchGoldPrice(): Promise<number | null> {
  try {
    const res = await fetch('https://api.metals.live/v1/spot/gold');
    if (res.ok) {
      const data = await res.json();
      return data[0]?.price || null;
    }
  } catch { /* skip */ }
  return null;
}

async function fetchSilverPrice(): Promise<number | null> {
  try {
    const res = await fetch('https://api.metals.live/v1/spot/silver');
    if (res.ok) {
      const data = await res.json();
      return data[0]?.price || null;
    }
  } catch { /* skip */ }
  return null;
}

function isBistStock(symbol: string): boolean {
  const bistSymbols = [
    'THYAO', 'ASELS', 'TUPRS', 'GARAN', 'AKBNK', 'BIMAS', 'KCHOL', 'SISE',
    'SAHOL', 'EREGL', 'PETKM', 'TCELL', 'EKGYO', 'HEKTS', 'FROTO', 'TOASO',
    'ARCLK', 'TAVHL', 'KOZAA', 'KOZAL', 'SASA', 'VESTL', 'DOHOL', 'ISCTR',
    'VAKBN', 'YKBNK', 'HALKB', 'PGSUS', 'MGROS', 'TTKOM', 'ENKAI', 'GUBRF',
  ];
  return bistSymbols.includes(symbol.toUpperCase());
}

async function checkPriceAlerts(supabase: any, holdings: any[], log: string[]): Promise<number> {
  let triggered = 0;
  try {
    const { data: alerts } = await supabase
      .from('price_alerts')
      .select('*')
      .eq('is_active', true);

    if (!alerts || alerts.length === 0) return 0;

    for (const alert of alerts) {
      const holding = holdings.find((h: any) => h.symbol === alert.symbol);
      if (!holding) continue;

      const currentPrice = holding.current_price;
      const shouldTrigger =
        (alert.condition === 'above' && currentPrice >= alert.target_price) ||
        (alert.condition === 'below' && currentPrice <= alert.target_price);

      if (shouldTrigger) {
        await supabase
          .from('price_alerts')
          .update({ is_active: false, triggered_at: new Date().toISOString() })
          .eq('id', alert.id);
        triggered++;
        log.push(`ALARM: ${alert.symbol} ${alert.condition} ${alert.target_price} (güncel: ${currentPrice})`);
      }
    }
  } catch (e: any) {
    log.push(`Alarm kontrol hatası: ${e.message}`);
  }
  return triggered;
}
