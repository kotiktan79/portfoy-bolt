import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { sendTelegram } from '../lib/telegram.js';
import { requireCronAuth } from '../lib/auth.js';
import { syncBinanceHoldings } from '../lib/binanceSync.js';

// Yaygın BIST/US hisse split oranları. Fiyat bu oranlardan birine yakın bir
// faktör kadar düştüyse split olarak şüphelen.
const SPLIT_RATIOS = [2, 3, 4, 5, 10];
function detectSplit(oldPrice: number, newPrice: number): number | null {
  if (!oldPrice || !newPrice || newPrice >= oldPrice * 0.99) return null;
  const ratio = oldPrice / newPrice;
  for (const r of SPLIT_RATIOS) {
    if (Math.abs(ratio - r) / r < 0.05) return r; // ±5% tolerans
  }
  return null;
}

interface SplitDetection {
  symbol: string;
  ratio: number;
  oldPrice: number;
  newPrice: number;
  quantity: number;
}

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
  if (requireCronAuth(req, res)) return;

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

    // 1.5. Binance gerçek-hesap senkronu — notlu kripto + USDC adetlerini gerçeğe
    // eşitle (fiyat güncelleme + snapshot'tan ÖNCE, ki değerler doğru hesaplansın).
    await syncBinanceHoldings(supabase, log);

    // 2. Her holding için güncel fiyat çek ve güncelle
    const priceUpdates = await updateAllPrices(supabase, holdings, log);
    log.push(`${priceUpdates.updated} fiyat güncellendi, ${priceUpdates.failed} başarısız`);

    // 3. Güncellenmiş holding'leri tekrar çek
    const { data: updatedHoldings } = await supabase.from('holdings').select('*');
    const allHoldings = updatedHoldings || holdings;

    // 4. Portfolio snapshot hesapla ve kaydet — currency-aware
    // current_price holding'in currency field'ı cinsinden tutuluyor.
    // TRY toplamı için USD/EUR fiyatları FX ile çevriliyor.
    // ÖNCELİK SIRASI: USD/EUR holding (kullanıcı tutuyorsa) > live API > son cache.
    // Eskiden || 45 / || 51 hardcoded fallback vardı — USD holding silindiği gün
    // snapshot'lar 45 ile yazılır, sonra 32 ile yazılır → sahte ₺13M sıçraması.
    const usdHolding = allHoldings.find((h: any) => h.symbol === 'USD' && h.asset_type === 'currency');
    const eurHolding = allHoldings.find((h: any) => (h.symbol === 'EURO' || h.symbol === 'EUR') && h.asset_type === 'currency');
    const usdFromHolding = Number(usdHolding?.current_price) || 0;
    const eurFromHolding = Number(eurHolding?.current_price) || 0;
    const usdRateForTotal = usdFromHolding > 1 ? usdFromHolding : await fetchUsdTry();
    const eurRateForTotal = eurFromHolding > 1 ? eurFromHolding : await fetchEurTry();
    log.push(`FX: USD=${usdRateForTotal.toFixed(4)} (${usdFromHolding > 1 ? 'holding' : 'live'}), EUR=${eurRateForTotal.toFixed(4)} (${eurFromHolding > 1 ? 'holding' : 'live'})`);

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

    // Deposit/withdraw kümülatif toplamını cash_balances'tan canlı hesapla.
    // Eski mantık önceki snapshot'tan kopyalıyordu → 25 Mayıs'ta €1000 ek alım
    // cash_balances'a yazıldı ama snapshot'a yansımadı; ayrıca eski FX kuruyla
    // donmuş kalıyordu (€2787 = ₺95K eski, oysa ₺132K güncel).
    let totalDepositsTRY = 0;
    let totalWithdrawalsTRY = 0;
    const { data: cashBalances } = await supabase
      .from('cash_balances')
      .select('currency, total_deposits, total_withdrawals');
    const ccyRate = (c: string): number => {
      const cur = (c || 'TRY').toUpperCase();
      if (cur === 'USD') return usdRateForTotal;
      if (cur === 'EUR') return eurRateForTotal;
      if (cur === 'GBP') return usdRateForTotal * 1.27;
      if (cur === 'CHF') return usdRateForTotal * 1.13;
      if (cur === 'RON') return eurRateForTotal / 4.95;
      if (cur === 'RUB') return usdRateForTotal / 100;
      return 1;
    };
    for (const cb of cashBalances || []) {
      const rate = ccyRate(cb.currency);
      totalDepositsTRY += (Number(cb.total_deposits) || 0) * rate;
      totalWithdrawalsTRY += (Number(cb.total_withdrawals) || 0) * rate;
    }
    // USD karşılığını da yaz: native→TRY-bugün / USD-bugün = native × (ccyTRY/usdTRY),
    // yani EUR deposit için EUR×EURUSD → TRY hareketinden BAĞIMSIZ, kümülatif USD stabil.
    // KarCuzdani iki snapshot'ın USD farkını alır → sahte FX-deposit'i ortadan kalkar.
    const totalDepositsUSD = usdRateForTotal > 0 ? totalDepositsTRY / usdRateForTotal : 0;
    const totalWithdrawalsUSD = usdRateForTotal > 0 ? totalWithdrawalsTRY / usdRateForTotal : 0;
    log.push(`Deposits: ₺${totalDepositsTRY.toFixed(0)} ($${totalDepositsUSD.toFixed(0)}, canlı FX), Withdrawals: ₺${totalWithdrawalsTRY.toFixed(0)}`);

    const snapshotData = {
      snapshot_date: today,
      total_value: totalValue,
      total_investment: totalInvestment,
      total_pnl: totalPnl,
      pnl_percentage: pnlPercentage,
      total_deposits: totalDepositsTRY,
      total_withdrawals: totalWithdrawalsTRY,
      total_deposits_usd: totalDepositsUSD,
      total_withdrawals_usd: totalWithdrawalsUSD,
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
    promises.push(updateFundPrices(supabase, byType.fund, result));
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
    const splits: SplitDetection[] = [];

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
        // Önce split tespiti — eğer split ise anomali sayma, fiyatı yaz ve uyar
        const splitRatio = price ? detectSplit(oldPrice, price) : null;
        if (splitRatio) {
          splits.push({ symbol: h.symbol, ratio: splitRatio, oldPrice, newPrice: price, quantity: Number(h.quantity) || 0 });
          await supabase.from('holdings').update({ current_price: price, updated_at: new Date().toISOString() }).eq('id', h.id);
          result.updated++;
          result.details[h.symbol] = price;
          log.push(`${h.symbol}: olası ${splitRatio}:1 split — Telegram'a alert gönderildi`);
          continue;
        }
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

    // Split'leri Telegram'a bildir
    if (splits.length > 0) {
      const baseUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://portfoy-bolt.vercel.app';
      const secret = process.env.CRON_SECRET || '';
      const lines = splits.map(s => {
        const newQty = (s.quantity * s.ratio).toFixed(4);
        const url = `${baseUrl}/api/confirm-split?symbol=${s.symbol}&ratio=${s.ratio}&key=${secret}`;
        return `🔔 <b>${s.symbol}</b> olası ${s.ratio}:1 split\n  Fiyat: ${s.oldPrice.toFixed(2)} → ${s.newPrice.toFixed(2)}\n  Adet ${s.quantity} → ${newQty}\n  <a href="${url}">Onayla</a>`;
      }).join('\n\n');
      await sendTelegram(`📢 <b>Stock Split Tespiti</b>\n\n${lines}\n\nLink ile onaylayınca adet/alış fiyatı otomatik düzelir.`);
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
          // KORUMA: USD/EUR holding'in DB değeri muhtemelen TL-converted yanlış kayıt
          // (örn. JNJ 225 USD ama DB'de 10343 yazıyor = 225 × 45.9). Anomali yerine düzelt.
          const isFxCorruptionFix = isAnomalous
            && (holdingCurrency === 'USD' || holdingCurrency === 'EUR')
            && oldPrice > priceToWrite * 20
            && priceToWrite > 1 && priceToWrite < 5000;
          if (!isAnomalous || isFxCorruptionFix) {
            await supabase.from('holdings').update({ current_price: priceToWrite, updated_at: new Date().toISOString() }).eq('id', h.id);
            result.updated++;
            result.details[h.symbol] = priceToWrite;
            if (isFxCorruptionFix) {
              log.push(`${h.symbol}: TL-corrupted değer düzeltildi (${oldPrice} → ${priceToWrite} ${holdingCurrency})`);
            }
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
        // Türkiye gram altın (yerel prim dahil) — kullanıcının takip ettiği fiyat.
        // truncgil zaten TRY/gram döner, oz→USD→TRY çevrimi YOK. Başarısızsa
        // uluslararası spot'a düş (eski mantık).
        const trGram = await fetchTRGramGold();
        if (trGram) {
          price = trGram;
          log.push(`Altın: TR gram altın ${trGram.toFixed(2)} TRY (truncgil)`);
        } else {
          const goldOz = await fetchGoldPrice();
          if (goldOz) { price = (goldOz / 31.1035) * usdTry; log.push(`Altın: spot fallback ${price.toFixed(2)} TRY`); }
        }
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

async function updateFundPrices(supabase: any, holdings: any[], result: PriceResult) {
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

// Türkiye gram altın (satış) — truncgil. Değer zaten TRY/gram, yerel prim dahil.
// Format "6.409,16" → 6409.16 (binlik nokta sil, ondalık virgülü noktaya çevir).
async function fetchTRGramGold(): Promise<number | null> {
  try {
    const res = await fetch('https://finans.truncgil.com/today.json', {
      headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const d = await res.json();
    const raw = d?.['gram-altin']?.['Satış'] ?? d?.['gram-altin']?.['Selling'];
    if (!raw) return null;
    const num = parseFloat(String(raw).replace(/\./g, '').replace(',', '.'));
    // Sanity: gram altın makul aralıkta mı (1.000–50.000 TRY)
    if (isFinite(num) && num > 1000 && num < 50000) return num;
    return null;
  } catch { return null; }
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
