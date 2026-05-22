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

    // 4. Portfolio snapshot hesapla ve kaydet — currency-aware
    // current_price holding'in currency field'ı cinsinden tutuluyor.
    // TRY toplamı için USD/EUR fiyatları FX ile çevriliyor.
    const usdHolding = allHoldings.find((h: any) => h.symbol === 'USD' && h.asset_type === 'currency');
    const eurHolding = allHoldings.find((h: any) => h.symbol === 'EURO' && h.asset_type === 'currency');
    const usdRateForTotal = Number(usdHolding?.current_price) || 45;
    const eurRateForTotal = Number(eurHolding?.current_price) || 51;

    const tryValueOf = (h: any, priceField: 'current_price' | 'purchase_price') => {
      const price = Number(h[priceField]) || (priceField === 'current_price' ? Number(h.purchase_price) : 0) || 0;
      const qty = Number(h.quantity) || 0;
      const raw = price * qty;
      const cur = (h.currency || 'TRY').toUpperCase();
      if (cur === 'USD') return raw * usdRateForTotal;
      if (cur === 'EUR') return raw * eurRateForTotal;
      return raw;
    };

    const totalValue = allHoldings.reduce((sum: number, h: any) => {
      const v = tryValueOf(h, 'current_price');
      return sum + (isFinite(v) ? v : 0);
    }, 0);

    const totalInvestment = allHoldings.reduce((sum: number, h: any) => {
      const v = tryValueOf(h, 'purchase_price');
      return sum + (isFinite(v) ? v : 0);
    }, 0);

    const totalPnl = totalValue - totalInvestment;
    const pnlPercentage = totalInvestment > 0 ? (totalPnl / totalInvestment) * 100 : 0;

    const today = new Date().toISOString().split('T')[0];

    // Cron deposits/withdrawals hesaplamıyor — önceki snapshot'tan kopyala.
    // Aksi halde 0 yazılır, sonraki günün cash flow hesabı sahte ₺379K zıplama yapar.
    let prevDeposits = 0;
    let prevWithdrawals = 0;
    const { data: prevSnap } = await supabase
      .from('portfolio_snapshots')
      .select('total_deposits,total_withdrawals')
      .lt('snapshot_date', today)
      .or('total_deposits.gt.0,total_withdrawals.gt.0')
      .order('snapshot_date', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (prevSnap) {
      prevDeposits = Number(prevSnap.total_deposits) || 0;
      prevWithdrawals = Number(prevSnap.total_withdrawals) || 0;
    }

    const snapshotData = {
      snapshot_date: today,
      total_value: totalValue,
      total_investment: totalInvestment,
      total_pnl: totalPnl,
      pnl_percentage: pnlPercentage,
      total_deposits: prevDeposits,
      total_withdrawals: prevWithdrawals,
    };

    // 1) Burst-protection: bugün için 10 saniye içinde yazılmış snapshot varsa SKIP.
    //    Bu Vercel'in retry/concurrent invocation senaryolarında 3 satır basmasını önler.
    const tenSecAgo = new Date(Date.now() - 10000).toISOString();
    const { data: recentToday } = await supabase
      .from('portfolio_snapshots')
      .select('id,total_value,created_at')
      .eq('snapshot_date', today)
      .gte('created_at', tenSecAgo)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (recentToday?.id) {
      // Çok yakın zamanda yazılmış — update ile birleştir (insert race'i engelle).
      const { error: updateError } = await supabase
        .from('portfolio_snapshots')
        .update(snapshotData)
        .eq('id', recentToday.id);
      if (updateError) {
        log.push(`Snapshot update hatası: ${updateError.message}`);
      } else {
        log.push(`Snapshot güncellendi (burst-protect): ${totalValue.toFixed(0)} TL`);
      }
    } else {
      // 2) Normal insert.
      const { error: insertError } = await supabase
        .from('portfolio_snapshots')
        .insert([snapshotData]);
      if (insertError) {
        log.push(`Snapshot kayıt hatası: ${insertError.message}`);
      } else {
        log.push(`Snapshot kaydedildi: ${totalValue.toFixed(0)} TL`);
      }
    }

    // 3) Dedupe — race ile yine de duplicate oluşursa en yenisini bırak.
    //    Kısa bir bekleme: paralel invocation'ların insertlerinin yerleşmesini bekle.
    await new Promise(r => setTimeout(r, 500));
    const { data: todays } = await supabase
      .from('portfolio_snapshots')
      .select('id, created_at')
      .eq('snapshot_date', today)
      .order('created_at', { ascending: false });

    if (todays && todays.length > 1) {
      const stale = todays.slice(1).map(r => r.id);
      const { error: cleanupError } = await supabase
        .from('portfolio_snapshots')
        .delete()
        .in('id', stale);
      if (cleanupError) {
        log.push(`Duplicate cleanup uyarı: ${cleanupError.message}`);
      } else {
        log.push(`${stale.length} duplicate snapshot temizlendi`);
      }
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
        // manual_price=true olan pozisyonları kullanıcı kilitlemiş, dokunma
        if (h.manual_price) {
          result.details[h.symbol] = h.current_price;
          continue;
        }
        const price = prices[`${h.symbol}.IS`];
        const oldPrice = Number(h.current_price) || 0;
        const isAnomalous = oldPrice > 0 && price && (price < oldPrice * 0.2 || price > oldPrice * 5);
        if (price && !isAnomalous) {
          await supabase.from('holdings').update({ current_price: price, updated_at: new Date().toISOString() }).eq('id', h.id);
          result.updated++;
          result.details[h.symbol] = price;
        } else if (isAnomalous) {
          log.push(`${h.symbol}: anomali reddedildi (${oldPrice} → ${price})`);
          result.failed++;
        } else {
          result.failed++;
        }
      }
      log.push(`BIST: ${bistHoldings.length} hisse sorgulandı`);
    }

    // Uluslararası hisseler (USD/EUR cinsinden → TRY'ye çevir)
    if (intlHoldings.length > 0) {
      // Avrupa hisseleri Yahoo'da özel ticker'lar kullanır (.AS/.DE/.PA/.HE)
      const EURO_YAHOO: Record<string, string> = {
        ASML: 'ASML.AS', ADYEN: 'ADYEN.AS', PROSUS: 'PRX.AS',
        LVMH: 'MC.PA', TTE: 'TTE.PA', OR: 'OR.PA', SAN: 'SAN.PA', AIR: 'AIR.PA', SU: 'SU.PA',
        SAP: 'SAP.DE', BMW: 'BMW.DE', SIE: 'SIE.DE',
        NOKIA: 'NOKIA.HE',
        V3YL: 'V3YL.DE',  // Vanguard ESG North America All Cap (EUR-quoted, Xetra)
      };
      // Her hisse için doğru ticker'ı topla
      const tickerMap: Record<string, string> = {};
      for (const h of intlHoldings) {
        const sym = h.symbol.toUpperCase();
        tickerMap[sym] = EURO_YAHOO[sym] || sym;
      }
      const yahooSymbols = Object.values(tickerMap).join(',');
      const prices = await fetchYahooPrices(yahooSymbols);
      const usdTry = await fetchUsdTry();
      const eurTry = await fetchEurTry();

      for (const h of intlHoldings) {
        // manual_price=true ise dokunma
        if (h.manual_price) {
          result.details[h.symbol] = h.current_price;
          continue;
        }
        const sym = h.symbol.toUpperCase();
        const yahooTicker = tickerMap[sym];
        const price = prices[yahooTicker];
        if (price) {
          const isEuropean = yahooTicker in EURO_YAHOO || yahooTicker !== sym;
          // Kontrat: holdings.current_price her zaman holdings.currency cinsinden tutulur.
          // Yahoo USD borsasından USD, EU borsasından EUR verir → currency'e göre yaz.
          const holdingCurrency = (h.currency || 'TRY').toUpperCase();
          let priceToWrite: number;
          if (holdingCurrency === 'USD') priceToWrite = price;
          else if (holdingCurrency === 'EUR') priceToWrite = price;
          else priceToWrite = price * (isEuropean ? eurTry : usdTry); // currency=TRY ise çevir

          // Sanity guard — aynı currency içinde karşılaştır (eski/yeni aynı birimde)
          const oldPrice = Number(h.current_price) || 0;
          const isAnomalous = oldPrice > 0 && (priceToWrite < oldPrice * 0.2 || priceToWrite > oldPrice * 5);
          if (!isAnomalous) {
            await supabase.from('holdings').update({ current_price: priceToWrite, updated_at: new Date().toISOString() }).eq('id', h.id);
            result.updated++;
            result.details[h.symbol] = priceToWrite;
          } else {
            log.push(`${h.symbol}: anomali reddedildi (${oldPrice} → ${priceToWrite})`);
            result.failed++;
          }
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
      EURO: eurTry, // db'de bazı holding'ler 'EURO' sembolüyle tutuluyor
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

// Eurobond/Treasury ETF'leri için Yahoo ticker haritası (hepsi USD-quoted).
// Holding'in currency'sine göre USD fiyatı çevrilir.
const EUROBOND_ETF_YAHOO: Record<string, string> = {
  IB01: 'IB01.L',   // iShares USD Treasury 0-1yr Acc
  IBTA: 'IBTA.L',   // iShares USD Treasury 1-3yr
  IBTL: 'IBTL.L',   // iShares USD Treasury 20+yr
  CBU0: 'CBU0.L',   // iShares USD Treasury 1-3yr Dist
  TLT: 'TLT',
  GOVT: 'GOVT',
  SGOV: 'SGOV',
  IEF: 'IEF',
  SHY: 'SHY',
};

async function updateEurobondPrices(supabase: any, holdings: any[], result: PriceResult, log: string[]) {
  let auto = 0;
  for (const h of holdings) {
    // manual_price=true ise dokunma
    if (h.manual_price) {
      result.details[h.symbol] = h.current_price;
      continue;
    }
    const sym = h.symbol.toUpperCase();
    const yahooTicker = EUROBOND_ETF_YAHOO[sym];
    if (!yahooTicker) {
      // Haritada yoksa manuel kabul et, dokunma
      result.details[h.symbol] = h.current_price;
      continue;
    }
    try {
      const prices = await fetchYahooPrices(yahooTicker);
      const usdPrice = prices[yahooTicker];
      if (!usdPrice) { result.failed++; continue; }
      // Yahoo USD verir. Holding currency'sine çevir.
      const holdingCurrency = (h.currency || 'USD').toUpperCase();
      let priceToWrite = usdPrice;
      if (holdingCurrency === 'EUR') {
        const usdTry = await fetchUsdTry();
        const eurTry = await fetchEurTry();
        priceToWrite = usdPrice * (usdTry / eurTry); // USD → EUR
      } else if (holdingCurrency === 'TRY') {
        const usdTry = await fetchUsdTry();
        priceToWrite = usdPrice * usdTry;
      }
      // Sanity guard
      const oldPrice = Number(h.current_price) || 0;
      const anomalous = oldPrice > 0 && (priceToWrite < oldPrice * 0.5 || priceToWrite > oldPrice * 2);
      if (anomalous) {
        log.push(`${h.symbol}: eurobond anomali reddedildi (${oldPrice} → ${priceToWrite.toFixed(2)})`);
        result.failed++;
        continue;
      }
      await supabase.from('holdings').update({ current_price: priceToWrite, updated_at: new Date().toISOString() }).eq('id', h.id);
      result.updated++;
      auto++;
      result.details[h.symbol] = priceToWrite;
    } catch (e: any) {
      log.push(`${h.symbol}: eurobond fiyat hatası ${e.message}`);
      result.failed++;
    }
  }
  log.push(`Eurobond: ${holdings.length} pozisyon (${auto} otomatik güncellendi)`);
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
  const symbolList = symbols.split(',').filter(Boolean);

  // v7 primary — son dönemde "Unauthorized" dönmeye başladı, yine de dene
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${symbols}&fields=regularMarketPrice`,
      { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(8000) }
    );
    if (res.ok) {
      const data = await res.json();
      const quotes = data?.quoteResponse?.result || [];
      for (const q of quotes) {
        if (q.regularMarketPrice && isFinite(q.regularMarketPrice) && q.regularMarketPrice > 0) {
          prices[q.symbol] = q.regularMarketPrice;
        }
      }
    }
  } catch { /* fall through */ }

  // v8 fallback — eksik kalan sembolleri tek tek çek
  const missing = symbolList.filter(s => !(s in prices));
  for (const sym of missing) {
    try {
      const r = await fetch(
        `https://query1.finance.yahoo.com/v8/finance/chart/${sym}?interval=1d&range=1d`,
        { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(5000) }
      );
      if (!r.ok) continue;
      const d = await r.json();
      const price = d?.chart?.result?.[0]?.meta?.regularMarketPrice;
      // Sadece geçerli pozitif sayıları kabul et, 0 veya null atla
      if (price && isFinite(price) && price > 0) {
        prices[sym] = price;
      }
    } catch { /* skip */ }
  }

  return prices;
}

async function fetchGoldPrice(): Promise<number | null> {
  try {
    const res = await fetch('https://api.metals.live/v1/spot/gold', { signal: AbortSignal.timeout(5000) });
    if (res.ok) {
      const data = await res.json();
      const p = data[0]?.price;
      if (p && isFinite(p) && p > 0) return p;
    }
  } catch { /* fall through to Yahoo */ }
  try {
    const r = await fetch(
      'https://query1.finance.yahoo.com/v8/finance/chart/GC=F?interval=1d&range=1d',
      { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(5000) }
    );
    if (r.ok) {
      const d = await r.json();
      const p = d?.chart?.result?.[0]?.meta?.regularMarketPrice;
      if (p && isFinite(p) && p > 0) return p;
    }
  } catch { /* skip */ }
  return null;
}

async function fetchSilverPrice(): Promise<number | null> {
  try {
    const res = await fetch('https://api.metals.live/v1/spot/silver', { signal: AbortSignal.timeout(5000) });
    if (res.ok) {
      const data = await res.json();
      const p = data[0]?.price;
      if (p && isFinite(p) && p > 0) return p;
    }
  } catch { /* fall through to Yahoo */ }
  try {
    const r = await fetch(
      'https://query1.finance.yahoo.com/v8/finance/chart/SI=F?interval=1d&range=1d',
      { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(5000) }
    );
    if (r.ok) {
      const d = await r.json();
      const p = d?.chart?.result?.[0]?.meta?.regularMarketPrice;
      if (p && isFinite(p) && p > 0) return p;
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
