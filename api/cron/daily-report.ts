import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { sendEmail, buildDailyEmail } from '../lib/email.js';
import { sendTelegram, buildDailyTelegram } from '../lib/telegram.js';
import { requireCronAuth } from '../lib/auth.js';
import { sendPushToAll } from '../lib/push.js';

// Kullanıcı maaş hedefi — env ile override edilebilir
const SALARY_TARGET_USD = Number(process.env.SALARY_TARGET_USD || 1000);
// "Total Return" hedef allokasyon: gelir + büyüme + denge.
// Maaş = mevcut temettü/kupon + kâra geçmiş hisseden trim. Sermaye uzun vadede büyür.
const TARGET_ALLOCATION = {
  stock: 35,      // temettü artıran kalite hisseler (SCHD/JNJ/KO + TUPRS/BIMAS/GARAN)
  eurobond: 20,   // sigorta + %5 kupon
  fund: 12,       // BIST temettü fonları
  commodity: 10,  // altın stabilizatör
  currency: 10,   // 12+ ay buffer
  crypto: 13,     // büyüme tilt (BTC/ETH ana, %2 staking)
};

function getSupabase() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Supabase credentials missing');
  return createClient(url, key);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (requireCronAuth(req, res)) return;

  const startTime = Date.now();
  const log: string[] = [];

  try {
    const supabase = getSupabase();
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    if (!anthropicKey) {
      return res.status(200).json({ success: false, error: 'ANTHROPIC_API_KEY missing' });
    }

    // ========================================
    // 1. Portföy verilerini topla
    // ========================================
    const [holdingsRes, snapshotsRes, cashRes, dividendsRes, incomeRes] = await Promise.all([
      supabase.from('holdings').select('*'),
      supabase.from('portfolio_snapshots').select('*').order('snapshot_date', { ascending: false }).limit(30),
      supabase.from('cash_balances').select('*'),
      supabase.from('dividends').select('*').order('payment_date', { ascending: false }).limit(50),
      supabase.from('income_records').select('*').order('income_date', { ascending: false }).limit(30),
    ]);

    const holdings = holdingsRes.data || [];
    const snapshots = snapshotsRes.data || [];
    const cashBalances = cashRes.data || [];
    const dividends = dividendsRes.data || [];
    const incomeRecords = incomeRes.data || [];

    log.push(`Veri: ${holdings.length} holding, ${snapshots.length} snapshot, ${cashBalances.length} cüzdan`);

    // FX kurları — holdings'teki USD/EUR pozisyonlarından; yoksa live API.
    // Eski hardcode || 45 / || 51, USD holding silindiğinde snapshot poisoning'e yol açıyordu.
    const usdHolding = holdings.find((h: any) => h.symbol === 'USD' && h.asset_type === 'currency');
    const eurHolding = holdings.find((h: any) => (h.symbol === 'EURO' || h.symbol === 'EUR') && h.asset_type === 'currency');
    const usdFromHolding = Number(usdHolding?.current_price) || 0;
    const eurFromHolding = Number(eurHolding?.current_price) || 0;
    const usdRate = usdFromHolding > 1 ? usdFromHolding : await fetchLiveRate('USD');
    const eurRate = eurFromHolding > 1 ? eurFromHolding : await fetchLiveRate('EUR');
    // Yardımcı kurlar (RUB/RON/GBP/CHF için yaklaşık)
    const fxRate = (ccy: string): number => {
      const c = (ccy || 'TRY').toUpperCase();
      if (c === 'TRY') return 1;
      if (c === 'USD') return usdRate;
      if (c === 'EUR') return eurRate;
      if (c === 'GBP') return usdRate * 1.27;
      if (c === 'CHF') return usdRate * 1.13;
      if (c === 'RON') return eurRate / 4.95;
      if (c === 'RUB') return usdRate / 100;
      return 1;
    };
    const tryValue = (h: any, field: 'current_price' | 'purchase_price' = 'current_price') => {
      const p = Number(h[field]) || (field === 'current_price' ? Number(h.purchase_price) : 0) || 0;
      const q = Number(h.quantity) || 0;
      return p * q * fxRate(h.currency || 'TRY');
    };

    // Portföy özeti — currency-aware
    const totalValue = holdings.reduce((sum: number, h: any) => sum + tryValue(h, 'current_price'), 0);
    const totalInvestment = holdings.reduce((sum: number, h: any) => sum + tryValue(h, 'purchase_price'), 0);
    const totalPnl = totalValue - totalInvestment;
    const totalPnlPct = totalInvestment > 0 ? (totalPnl / totalInvestment) * 100 : 0;

    // Likit nakit = cash_balances (FX'li) + currency tipi holdings (TRY karşılığı)
    const cashBalancesValue = cashBalances.reduce((sum: number, c: any) => sum + (Number(c.balance) || 0) * fxRate(c.currency), 0);
    const currencyHoldingsValue = holdings
      .filter((h: any) => h.asset_type === 'currency')
      .reduce((sum: number, h: any) => sum + tryValue(h, 'current_price'), 0);
    const totalCash = cashBalancesValue + currencyHoldingsValue;

    // Sürdürülebilir aylık çekim (deterministik, AI'dan bağımsız)
    const safeMonthly = totalValue * 0.003;     // %0.3/ay = ~%3.6/yıl
    const moderateMonthly = totalValue * 0.005; // %0.5/ay = ~%6/yıl

    // Dünkü snapshot ile karşılaştır
    const todayStr = new Date().toISOString().split('T')[0];
    const yesterdaySnapshot = snapshots.find(s => s.snapshot_date !== todayStr);
    const dailyChange = yesterdaySnapshot ? totalValue - yesterdaySnapshot.total_value : 0;
    const dailyChangePct = yesterdaySnapshot && yesterdaySnapshot.total_value > 0
      ? (dailyChange / yesterdaySnapshot.total_value) * 100 : 0;

    // ========================================
    // 2. Piyasa verilerini çek (kapsamlı)
    // ========================================
    log.push('Piyasa verileri çekiliyor...');
    const marketData = await fetchComprehensiveMarketData(log);

    // ========================================
    // 3. Piyasa haberleri araştır
    // ========================================
    log.push('Piyasa haberleri araştırılıyor...');
    const newsData = await fetchMarketNews(log);

    // ========================================
    // 4. Claude AI ile kapsamlı analiz
    // ========================================
    log.push('AI analizi başlatılıyor...');

    const portfolioContext = buildPortfolioContext(holdings, totalValue, totalInvestment, totalPnlPct, totalCash, snapshots, dividends, incomeRecords, dailyChange, dailyChangePct, fxRate);
    const marketContext = buildMarketContext(marketData, newsData);

    const aiResponse = await callClaudeForDailyReport(anthropicKey, portfolioContext, marketContext);
    log.push('AI analizi tamamlandı');

    // ========================================
    // 5. Raporu veritabanına kaydet
    // ========================================
    const reportData = {
      report_date: todayStr,
      portfolio_value: totalValue,
      portfolio_investment: totalInvestment,
      portfolio_pnl: totalPnl,
      portfolio_pnl_pct: totalPnlPct,
      market_data: marketData,
      actions: aiResponse.actions || [],
      monthly_income: aiResponse.monthly_income || {},
      market_outlook: aiResponse.market_outlook || '',
      portfolio_diagnosis: aiResponse.portfolio_diagnosis || '',
      top_pick: aiResponse.top_pick || '',
      news_alerts: aiResponse.news_alerts || [],
      wealth_building_tip: aiResponse.wealth_building_tip || '',
      safe_monthly_income: safeMonthly,
      moderate_monthly_income: moderateMonthly,
      ai_model: 'claude-sonnet-5',
      generation_time_ms: Date.now() - startTime,
    };

    const { error: reportError } = await supabase
      .from('daily_reports')
      .upsert([reportData], { onConflict: 'report_date' });

    if (reportError) {
      log.push(`Rapor kayıt hatası: ${reportError.message}`);
    } else {
      log.push('Rapor veritabanına kaydedildi');
      // Web Push: günlük rapor hazır bildirimi (abone yoksa no-op)
      const pnlPct = Number(reportData.portfolio_pnl_pct) || 0;
      await sendPushToAll({
        title: '📊 Günlük rapor hazır',
        body: `Portföy ₺${Math.round(Number(reportData.portfolio_value) || 0).toLocaleString('tr-TR')} · K/Z %${pnlPct.toFixed(1)}`,
        url: '/daily-report',
        tag: 'daily-report',
      }).catch((e) => console.error('[push] gönderim hatası:', e));
    }

    // ========================================
    // 6. Aylık maaş hesaplamasını güncelle
    // ========================================
    const monthStart = `${todayStr.substring(0, 7)}-01`;

    // Bu ayki toplam geliri hesapla
    const thisMonthIncome = (incomeRecords || [])
      .filter(r => r.income_date >= monthStart && !r.is_projected)
      .reduce((sum, r) => sum + (r.amount_try || 0), 0);

    const { error: salaryError } = await supabase
      .from('monthly_salary')
      .upsert([{
        salary_month: monthStart,
        portfolio_value: totalValue,
        safe_amount: safeMonthly,
        moderate_amount: moderateMonthly,
        actual_income: thisMonthIncome,
        ai_recommendation: aiResponse.monthly_income?.description || '',
      }], { onConflict: 'salary_month' });

    if (salaryError) {
      log.push(`Maaş hesap hatası: ${salaryError.message}`);
    } else {
      log.push(`Aylık maaş: güvenli=${safeMonthly.toFixed(0)} TL, dengeli=${moderateMonthly.toFixed(0)} TL`);
    }

    // ========================================
    // 7. Email gönder (RESEND_API_KEY varsa)
    // ========================================
    try {
      const usdRateForEmail = (() => {
        const u = holdings.find((h: any) => h.symbol === 'USD' && h.asset_type === 'currency');
        return u?.current_price || marketData.usd_try || 45;
      })();
      // 7 gün ve 30 gün öncesi snapshot
      const sortedSnapshots = [...snapshots].sort(
        (a: any, b: any) => new Date(b.snapshot_date).getTime() - new Date(a.snapshot_date).getTime()
      );
      const findDaysAgo = (days: number) => {
        const target = new Date();
        target.setDate(target.getDate() - days);
        const targetStr = target.toISOString().split('T')[0];
        return sortedSnapshots.find((s: any) => s.snapshot_date <= targetStr) || null;
      };
      const weekAgo = findDaysAgo(7);
      const monthAgo = findDaysAgo(30);
      const weeklyChange = weekAgo ? totalValue - Number(weekAgo.total_value) : 0;
      const weeklyChangePct = weekAgo && Number(weekAgo.total_value) > 0
        ? (weeklyChange / Number(weekAgo.total_value)) * 100 : 0;
      const monthlyChange = monthAgo ? totalValue - Number(monthAgo.total_value) : 0;
      const monthlyChangePct = monthAgo && Number(monthAgo.total_value) > 0
        ? (monthlyChange / Number(monthAgo.total_value)) * 100 : 0;

      const yieldByType: Record<string, number> = {
        stock: 0.03, fund: 0.02, eurobond: 0.05, crypto: 0.02, commodity: 0, currency: 0.01,
      };
      const passiveYearly = holdings.reduce((s: number, h: any) => {
        const v = tryValue(h, 'current_price'); // FX-aware (USD/EUR pozisyonlar TRY'ye)
        return s + v * (yieldByType[h.asset_type] || 0);
      }, 0);
      const passiveMonthlyUsd = (passiveYearly / 12) / usdRateForEmail;

      const snapshot = {
        date: todayStr,
        totalValueTry: totalValue,
        totalValueUsd: totalValue / usdRateForEmail,
        dailyChangeTry: dailyChange,
        dailyChangePct: dailyChangePct,
        weeklyChangeTry: weeklyChange,
        weeklyChangePct: weeklyChangePct,
        monthlyChangeTry: monthlyChange,
        monthlyChangePct: monthlyChangePct,
        topPick: aiResponse.top_pick || '',
        portfolioDiagnosis: aiResponse.portfolio_diagnosis || '',
        marketOutlook: aiResponse.market_outlook || '',
        actions: aiResponse.actions || [],
        safeMonthly,
        moderateMonthly,
        passiveMonthlyUsd,
        salaryTargetUsd: SALARY_TARGET_USD,
      };
      const { subject, html } = buildDailyEmail(snapshot);
      const emailRes = await sendEmail(subject, html);
      log.push(emailRes.sent ? `Email gönderildi: ${emailRes.id}` : `Email atlandı: ${emailRes.reason}`);

      const tgRes = await sendTelegram(buildDailyTelegram(snapshot));
      log.push(tgRes.sent ? `Telegram gönderildi` : `Telegram atlandı: ${tgRes.reason}`);
    } catch (emailErr: any) {
      log.push(`Email gönderim hatası: ${emailErr.message}`);
    }

    const elapsed = Date.now() - startTime;
    log.push(`Toplam süre: ${elapsed}ms`);

    return res.status(200).json({
      success: true,
      report: {
        date: todayStr,
        portfolio: {
          value: totalValue,
          pnl: totalPnl,
          pnl_pct: totalPnlPct,
          daily_change: dailyChange,
          daily_change_pct: dailyChangePct,
        },
        monthly_salary: {
          safe: safeMonthly,
          moderate: moderateMonthly,
          actual_income: thisMonthIncome,
        },
        ai_analysis: aiResponse,
        market_summary: {
          usd_try: marketData.usd_try,
          eur_try: marketData.eur_try,
          btc_usd: marketData.btc_usd,
          gold_usd: marketData.gold_usd,
          bist_summary: marketData.bist_summary,
        },
      },
      elapsed_ms: elapsed,
      log,
    });
  } catch (error: any) {
    log.push(`HATA: ${error.message}`);
    return res.status(500).json({ success: false, error: error.message, log });
  }
}

// ================================================
// Kapsamlı piyasa verileri
// ================================================

interface MarketData {
  usd_try: number;
  eur_try: number;
  btc_usd: number;
  eth_usd: number;
  gold_usd: number;
  silver_usd: number;
  bist_summary: string;
  us_stocks: Record<string, { price: number; change_pct: number }>;
  bist_stocks: Record<string, { price: number; change_pct: number }>;
  crypto: Record<string, { price: number; change_pct: number }>;
  indices: Record<string, any>;
  raw_text: string;
}

async function fetchComprehensiveMarketData(log: string[]): Promise<MarketData> {
  const data: MarketData = {
    usd_try: 0, eur_try: 0, btc_usd: 0, eth_usd: 0,
    gold_usd: 0, silver_usd: 0, bist_summary: '',
    us_stocks: {}, bist_stocks: {}, crypto: {}, indices: {},
    raw_text: '',
  };

  const lines: string[] = [];

  // Döviz kurları
  try {
    const [usdRes, eurRes] = await Promise.all([
      fetch('https://open.er-api.com/v6/latest/USD'),
      fetch('https://open.er-api.com/v6/latest/EUR'),
    ]);
    if (usdRes.ok) {
      const usdData = await usdRes.json();
      data.usd_try = usdData.rates?.TRY || 0;
      lines.push(`USD/TRY: ${data.usd_try.toFixed(2)}`);
    }
    if (eurRes.ok) {
      const eurData = await eurRes.json();
      data.eur_try = eurData.rates?.TRY || 0;
      lines.push(`EUR/TRY: ${data.eur_try.toFixed(2)}`);
    }
  } catch (e: any) { log.push(`Döviz hatası: ${e.message}`); }

  // Kripto fiyatları (top 10)
  try {
    const cryptoSymbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT', 'ADAUSDT', 'DOGEUSDT', 'LINKUSDT', 'AVAXUSDT', 'DOTUSDT'];
    let cryptoData: any[] = [];
    let cryptoSource = 'Binance';

    // Binance dene
    const res = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbols=${JSON.stringify(cryptoSymbols)}`);
    if (res.ok) {
      cryptoData = await res.json();
    } else {
      // CoinGecko fallback
      cryptoSource = 'CoinGecko';
      log.push(`Binance 24hr hata (${res.status}), CoinGecko'ya geçiliyor...`);
      const cgIds: Record<string, string> = {
        BTC: 'bitcoin', ETH: 'ethereum', SOL: 'solana', BNB: 'binancecoin',
        XRP: 'ripple', ADA: 'cardano', DOGE: 'dogecoin', LINK: 'chainlink',
        AVAX: 'avalanche-2', DOT: 'polkadot',
      };
      const ids = Object.values(cgIds).join(',');
      const cgRes = await fetch(
        `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`
      );
      if (cgRes.ok) {
        const cgData = await cgRes.json();
        const idToSym: Record<string, string> = {};
        for (const [sym, id] of Object.entries(cgIds)) idToSym[id] = sym;
        for (const [id, info] of Object.entries(cgData)) {
          const sym = idToSym[id];
          if (sym) {
            cryptoData.push({
              symbol: `${sym}USDT`,
              lastPrice: String((info as any).usd || 0),
              priceChangePercent: String((info as any).usd_24h_change?.toFixed(2) || '0'),
            });
          }
        }
      }
    }

    if (cryptoData.length > 0) {
      lines.push(`\nKRİPTO (${cryptoSource}, 24 saat):`);
      for (const c of cryptoData) {
        const sym = c.symbol.replace('USDT', '');
        const price = parseFloat(c.lastPrice);
        const changePct = parseFloat(c.priceChangePercent);
        data.crypto[sym] = { price, change_pct: changePct };
        if (sym === 'BTC') data.btc_usd = price;
        if (sym === 'ETH') data.eth_usd = price;
        lines.push(`${sym}: $${price.toFixed(2)} (${changePct >= 0 ? '+' : ''}${changePct.toFixed(1)}%) = ${(price * data.usd_try).toFixed(0)} TL`);
      }
    }
  } catch (e: any) { log.push(`Kripto hatası: ${e.message}`); }

  // Altın & Gümüş
  try {
    const [goldRes, silverRes] = await Promise.all([
      fetch('https://api.metals.live/v1/spot/gold'),
      fetch('https://api.metals.live/v1/spot/silver'),
    ]);
    if (goldRes.ok) {
      const goldData = await goldRes.json();
      data.gold_usd = goldData[0]?.price || 0;
      const gramTry = (data.gold_usd / 31.1035) * data.usd_try;
      lines.push(`\nEMTİA:\nALTIN: $${data.gold_usd.toFixed(0)}/oz = ${gramTry.toFixed(0)} TL/gram`);
    }
    if (silverRes.ok) {
      const silverData = await silverRes.json();
      data.silver_usd = silverData[0]?.price || 0;
      const gramTry = (data.silver_usd / 31.1035) * data.usd_try;
      lines.push(`GÜMÜŞ: $${data.silver_usd.toFixed(2)}/oz = ${gramTry.toFixed(2)} TL/gram`);
    }
  } catch (e: any) { log.push(`Emtia hatası: ${e.message}`); }

  // ABD Hisseleri
  try {
    // Total Return hedefli liste: temettü ETF + kalite temettü hisse + bir miktar büyüme
    const usSymbols = ['SCHD', 'VYM', 'VIG', 'HDV', 'O', 'JNJ', 'KO', 'PG', 'PEP', 'MCD', 'WMT', 'JPM', 'V', 'NVDA', 'MSFT', 'AAPL'];
    const yahooRes = await fetch(
      `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${usSymbols.join(',')}&fields=regularMarketPrice,regularMarketChangePercent,fiftyTwoWeekLow,fiftyTwoWeekHigh`,
      { headers: { 'User-Agent': 'Mozilla/5.0' } }
    );
    if (yahooRes.ok) {
      const yahooData = await yahooRes.json();
      const quotes = yahooData?.quoteResponse?.result || [];
      if (quotes.length > 0) {
        lines.push('\nABD HİSSELERİ:');
        for (const q of quotes) {
          const price = q.regularMarketPrice;
          const changePct = q.regularMarketChangePercent || 0;
          const low52 = q.fiftyTwoWeekLow || 0;
          const high52 = q.fiftyTwoWeekHigh || 0;
          if (price) {
            data.us_stocks[q.symbol] = { price, change_pct: changePct };
            const posInRange = high52 > low52 ? ((price - low52) / (high52 - low52) * 100).toFixed(0) : '?';
            lines.push(`${q.symbol}: $${price.toFixed(2)} (${changePct >= 0 ? '+' : ''}${changePct.toFixed(1)}%) [52h aralık: %${posInRange}] = ${(price * data.usd_try).toFixed(0)} TL`);
          }
        }
      }
    }
  } catch (e: any) { log.push(`ABD hisse hatası: ${e.message}`); }

  // BIST Hisseleri
  try {
    const bistSymbols = ['THYAO.IS', 'ASELS.IS', 'TUPRS.IS', 'GARAN.IS', 'AKBNK.IS', 'BIMAS.IS', 'KCHOL.IS', 'SISE.IS', 'SAHOL.IS', 'EREGL.IS', 'FROTO.IS', 'TOASO.IS', 'PGSUS.IS', 'TCELL.IS'];
    const bistRes = await fetch(
      `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${bistSymbols.join(',')}&fields=regularMarketPrice,regularMarketChangePercent`,
      { headers: { 'User-Agent': 'Mozilla/5.0' } }
    );
    if (bistRes.ok) {
      const bistData = await bistRes.json();
      const quotes = bistData?.quoteResponse?.result || [];
      if (quotes.length > 0) {
        lines.push('\nBIST HİSSELERİ:');
        for (const q of quotes) {
          const sym = q.symbol.replace('.IS', '');
          const price = q.regularMarketPrice;
          const changePct = q.regularMarketChangePercent || 0;
          if (price) {
            data.bist_stocks[sym] = { price, change_pct: changePct };
            lines.push(`${sym}: ${price.toFixed(2)} TL (${changePct >= 0 ? '+' : ''}${changePct.toFixed(1)}%)`);
          }
        }
        // BIST genel durum özeti
        const avgChange = quotes.reduce((sum: number, q: any) => sum + (q.regularMarketChangePercent || 0), 0) / quotes.length;
        data.bist_summary = `BIST ortalama: ${avgChange >= 0 ? '+' : ''}${avgChange.toFixed(1)}%`;
      }
    }
  } catch (e: any) { log.push(`BIST hatası: ${e.message}`); }

  // Global endeksler
  try {
    const indexSymbols = ['^GSPC', '^DJI', '^IXIC', '^XU100.IS', '^VIX'];
    const indexRes = await fetch(
      `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${indexSymbols.join(',')}&fields=regularMarketPrice,regularMarketChangePercent`,
      { headers: { 'User-Agent': 'Mozilla/5.0' } }
    );
    if (indexRes.ok) {
      const indexData = await indexRes.json();
      const quotes = indexData?.quoteResponse?.result || [];
      if (quotes.length > 0) {
        lines.push('\nGLOBAL ENDEKSLER:');
        const nameMap: Record<string, string> = {
          '^GSPC': 'S&P 500', '^DJI': 'Dow Jones', '^IXIC': 'NASDAQ',
          '^XU100.IS': 'BIST 100', '^VIX': 'VIX (Korku)',
        };
        for (const q of quotes) {
          const name = nameMap[q.symbol] || q.symbol;
          const price = q.regularMarketPrice;
          const changePct = q.regularMarketChangePercent || 0;
          if (price) {
            data.indices[q.symbol] = { name, price, change_pct: changePct };
            lines.push(`${name}: ${price.toFixed(2)} (${changePct >= 0 ? '+' : ''}${changePct.toFixed(1)}%)`);
          }
        }
      }
    }
  } catch (e: any) { log.push(`Endeks hatası: ${e.message}`); }

  data.raw_text = lines.join('\n');
  log.push(`Piyasa verisi toplandı: ${lines.length} satır`);
  return data;
}

// ================================================
// Piyasa haberleri (RSS + News API)
// ================================================

async function fetchMarketNews(log: string[]): Promise<string[]> {
  const news: string[] = [];

  // Yahoo Finance RSS - Türkiye + Global
  const rssFeeds = [
    'https://finance.yahoo.com/news/rssindex',
    'https://feeds.finance.yahoo.com/rss/2.0/headline?s=^GSPC&region=US&lang=en-US',
  ];

  for (const feedUrl of rssFeeds) {
    try {
      const res = await fetch(feedUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        const text = await res.text();
        // Basit RSS parse - title taglarını çek
        const titles = text.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/g)
          || text.match(/<title>(.*?)<\/title>/g)
          || [];
        for (const t of titles.slice(0, 5)) {
          const clean = t.replace(/<\/?title>/g, '').replace(/<!\[CDATA\[/g, '').replace(/\]\]>/g, '').trim();
          if (clean && clean.length > 10 && !clean.includes('Yahoo')) {
            news.push(clean);
          }
        }
      }
    } catch { /* skip feed */ }
  }

  // Eğer NewsAPI key varsa (opsiyonel)
  const newsApiKey = process.env.NEWS_API_KEY;
  if (newsApiKey) {
    try {
      const res = await fetch(
        `https://newsapi.org/v2/top-headlines?category=business&language=en&pageSize=5&apiKey=${newsApiKey}`,
        { signal: AbortSignal.timeout(5000) }
      );
      if (res.ok) {
        const data = await res.json();
        for (const article of (data.articles || [])) {
          if (article.title) news.push(article.title);
        }
      }
    } catch { /* skip */ }
  }

  log.push(`${news.length} haber başlığı toplandı`);
  return [...new Set(news)].slice(0, 10); // Tekrarları kaldır, max 10
}

// ================================================
// Portföy bağlam metni oluştur
// ================================================

function buildPortfolioContext(
  holdings: any[], totalValue: number, totalInvestment: number,
  totalPnlPct: number, totalCash: number, snapshots: any[],
  dividends: any[], incomeRecords: any[],
  dailyChange: number, dailyChangePct: number,
  fxRate: (ccy: string) => number,
): string {
  const typeNames: Record<string, string> = {
    stock: 'Hisse', crypto: 'Kripto', currency: 'Döviz',
    fund: 'Fon', eurobond: 'Eurobond', commodity: 'Emtia',
  };
  // FX-aware TRY value (holdings can be USD/EUR/GBP/RON/RUB)
  const tryV = (h: any, field: 'current_price' | 'purchase_price' = 'current_price') => {
    const p = Number(h[field]) || (field === 'current_price' ? Number(h.purchase_price) : 0) || 0;
    const q = Number(h.quantity) || 0;
    return p * q * fxRate(h.currency || 'TRY'); // fx-ok: tryV helper kapsüllüyor
  };

  // Tip dağılımı
  const byType: Record<string, { value: number; count: number; pnl: number }> = {};
  for (const h of holdings) {
    const type = h.asset_type || 'other';
    if (!byType[type]) byType[type] = { value: 0, count: 0, pnl: 0 };
    const value = tryV(h, 'current_price');
    const cost = tryV(h, 'purchase_price');
    byType[type].value += value;
    byType[type].count++;
    byType[type].pnl += value - cost;
  }

  const dist = Object.entries(byType)
    .sort(([, a], [, b]) => b.value - a.value)
    .map(([type, d]) => `${typeNames[type] || type}: %${(d.value / totalValue * 100).toFixed(1)} (${d.count} adet, KZ: ${d.pnl >= 0 ? '+' : ''}${d.pnl.toFixed(0)} TL)`)
    .join('\n');

  // Top 20 pozisyon (TRY karşılığıyla sıralı)
  const topHoldings = [...holdings]
    .sort((a, b) => tryV(b) - tryV(a))
    .slice(0, 20)
    .map(h => {
      const value = tryV(h, 'current_price');
      const cost = tryV(h, 'purchase_price');
      const pnlPct = cost > 0 ? ((value - cost) / cost * 100) : 0;
      const weight = totalValue > 0 ? (value / totalValue * 100) : 0;
      return `${h.symbol} (${typeNames[h.asset_type] || h.asset_type}): ${value.toFixed(0)} TL, KZ: %${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(1)}, ağırlık: %${weight.toFixed(1)}`;
    })
    .join('\n');

  // Performans trendi (son 7 gün)
  const recentSnapshots = snapshots.slice(0, 7);
  const perfTrend = recentSnapshots
    .map(s => `${s.snapshot_date}: ${Number(s.total_value).toFixed(0)} TL`)
    .join(', ');

  // Temettü özeti
  const totalDividends = dividends.reduce((sum, d) => sum + (d.amount || 0), 0);
  const recentDivs = dividends.slice(0, 5).map(d =>
    `${d.payment_date}: ${d.amount} TL`
  ).join(', ');

  // Gelir özeti
  const monthlyIncomeTotal = incomeRecords
    .filter(r => !r.is_projected)
    .reduce((sum, r) => sum + (r.amount_try || 0), 0);

  // Allokasyon sapması (hedef = Gelir preset)
  const usdRate = (() => {
    const u = holdings.find(h => h.symbol === 'USD' && h.asset_type === 'currency');
    return u?.current_price || 45;
  })();
  const salaryTargetTry = SALARY_TARGET_USD * usdRate;
  const yearlyWithdrawTry = salaryTargetTry * 12;
  const withdrawalRatePctYearly = totalValue > 0 ? (yearlyWithdrawTry / totalValue) * 100 : 0;

  const allocationGap = Object.entries(TARGET_ALLOCATION).map(([type, target]) => {
    const current = byType[type] ? (byType[type].value / totalValue * 100) : 0;
    const diff = current - target;
    const status = Math.abs(diff) < 3 ? 'OK' : diff > 0 ? 'FAZLA' : 'EKSİK';
    return `${typeNames[type] || type}: %${current.toFixed(1)} → hedef %${target} (${diff >= 0 ? '+' : ''}${diff.toFixed(1)}, ${status})`;
  }).join('\n');

  // Pasif gelir tahmini (yieldlere göre)
  const yieldByType: Record<string, number> = {
    stock: 0.03, fund: 0.02, eurobond: 0.05,
    crypto: 0.02, commodity: 0, currency: 0.01,
  };
  const passiveYearly = Object.entries(byType).reduce((sum, [type, d]) => {
    return sum + d.value * (yieldByType[type] || 0);
  }, 0);
  const passiveMonthlyUsd = (passiveYearly / 12) / usdRate;

  return `PORTFÖY DURUMU (${new Date().toISOString().split('T')[0]}):
Toplam Değer: ${totalValue.toFixed(0)} TL (${(totalValue / usdRate).toFixed(0)} USD)
Toplam Yatırım: ${totalInvestment.toFixed(0)} TL
Toplam K/Z: %${totalPnlPct.toFixed(1)} (${(totalValue - totalInvestment).toFixed(0)} TL)
Nakit: ${totalCash.toFixed(0)} TL
Günlük Değişim: ${dailyChange >= 0 ? '+' : ''}${dailyChange.toFixed(0)} TL (%${dailyChangePct.toFixed(1)})
Pozisyon Sayısı: ${holdings.length}

KULLANICININ HEDEFİ — TOTAL RETURN (Maaş + Büyüme):
Aylık çekim hedefi: $${SALARY_TARGET_USD} (${salaryTargetTry.toFixed(0)} TL)
Yıllık çekim oranı: %${withdrawalRatePctYearly.toFixed(1)} (sürdürülebilir bant: ≤%6/yıl, sınır: %6-8, riskli: >%8)
Strateji: Total Return — gelir + sermaye büyümesi + denge (saf gelir DEĞİL)
Tahmini mevcut pasif gelir: ~$${passiveMonthlyUsd.toFixed(0)}/ay (${(passiveYearly).toFixed(0)} TL/yıl) — temettü+kupon+staking
Maaş açığı: ${SALARY_TARGET_USD - passiveMonthlyUsd > 0 ? '$' + (SALARY_TARGET_USD - passiveMonthlyUsd).toFixed(0) + '/ay (trim ve buffer ile karşılanır)' : 'pasif gelir maaşı karşılıyor ✓'}
Beklenen yıllık toplam getiri (total return): hisse+ETF %8-12, eurobond %5, kripto %15+, altın %5 — denge bunları harmanlar

DAĞILIM:
${dist}

HEDEF VS MEVCUT ALLOKASYON (Gelir Odaklı strateji — Maaş Simülatörü ile uyumlu):
${allocationGap}

POZİSYONLAR (Top 20):
${topHoldings}

SON 7 GÜN PERFORMANSI:
${perfTrend}

TEMETTÜ GEÇMİŞİ:
Toplam: ${totalDividends.toFixed(0)} TL
Son: ${recentDivs || 'Henüz temettü yok'}

GELİR ÖZETİ:
Son kaydedilen gelir toplamı: ${monthlyIncomeTotal.toFixed(0)} TL`;
}

function buildMarketContext(marketData: MarketData, news: string[]): string {
  let context = `GÜNCEL PİYASA VERİLERİ (canlı):
${marketData.raw_text}`;

  if (news.length > 0) {
    context += `\n\nSON PİYASA HABERLERİ:
${news.map((n, i) => `${i + 1}. ${n}`).join('\n')}`;
  }

  return context;
}

// ================================================
// Claude AI çağrısı
// ================================================

async function callClaudeForDailyReport(apiKey: string, portfolioContext: string, marketContext: string): Promise<any> {
  const systemPrompt = `Sen profesyonel bir portföy yöneticisisin. Her sabah müşterine kapsamlı günlük brifing hazırlıyorsun.

KULLANICININ ÖNCELİKLİ HEDEFİ — TOTAL RETURN (Maaş + Büyüme + Denge):
Müşteri portföyden aylık $${SALARY_TARGET_USD} maaş çekmek istiyor — AMA aynı zamanda sermayenin uzun vadede büyümesini istiyor.
Bu yüzden strateji SAF GELİR DEĞİL — "TOTAL RETURN" yaklaşımı: temettü + sermaye değer artışı + denge.

FELSEFE (anla ve uygula):
- Temettü artıran kalite hisseler (SCHD, JNJ, KO, TUPRS, BIMAS, GARAN) MÜKEMMEL — hem %3 yield hem %7-8 büyüme = toplam %10+ yıllık
- Eurobond %20-25 sigorta için (yüksek değil) — büyüme yapmaz, sadece kupon ve stabil
- Büyüme dilim %10-15 (BTC/ETH/teknoloji) GEREKLİ — yarın daha büyük portföy = yarın daha büyük maaş
- Saf temettü hissesi (%6+ yield) yerine "kalite + ortalama yield" daha iyi — uzun vadede kazandırır

GÖREVIN:
1. Portföy durumunu hem maaş hem büyüme açısından değerlendir
2. Piyasa verilerini değerlendir (SADECE sana verilen CANLI verileri kullan)
3. Haberlerin portföye etkisini yorumla
4. Somut aksiyon planı: total return'e hizmet eden alımlar (kalite temettü hisseleri, dengeli ETF'ler, kontrollü kripto)
5. Maaş hesapla: mevcut pasif + kâr trim'i + buffer (sermayeyi eritmeden)
6. Rebalance hedefi (SABİT POLİTİKA, DENGELİ): global hisse 50 (V3YL + kaliteli US/EU + BIST ihracatçı çekirdek + TEFAS) / USD kısa hazine+eurobond 30 / altın 10 (FİZİKİ, satılamaz, dokunma) / kripto 3-5 / nakit ≤5

ÖNERİ ÖNCELİKLERİ — KESIN SIRA (üstten alta uygula):
- ✅ ÖNCELİK 1 (ZORUNLU, HER RAPORDA OLMALI): **Eurobond/Treasury alımı** — kullanıcının portföyünde %20 hedefe karşılık %1.2 mevcut. Bu en büyük yapısal eksiklik ve pasif gelir motorunun kalbi.
  Seçenekler:
    - Revolut'tan **IB01** (iShares $ Treasury 0-1yr UCITS, acc, TER %0,07, ~%3,9 YTM, sıfıra yakın volatilite) — BAŞLANGIÇ VE ANA ARAÇ. Kullanıcı zaten tutuyor, ekle.
    - Revolut'tan **DTLA/IDTL** (iShares $ Treasury 20+yr UCITS) — SADECE küçük dilim, faiz artış baskısı varken uzun vade riskli
    - EUR harcama kovası için **XEON** (Xtrackers EUR Overnight, acc) — Revolut'ta varsa
    ⛔ SGOV/TLT/GOVT/BIL/SHV = ABD-domicile → AB'de perakende ALINAMAZ (PRIIPs). ASLA YAZMA.
    - BIST broker'dan Türkiye Hazine eurobondu
  TEK seferde değil, 3-5 dilimde ladder olarak öner.
  Her raporda EN AZ 1 eurobond/Treasury aksiyonu OLMALI.

- ✅ ÖNCELİK 2: Cash fazlasını global hisseye: V3YL (Amundi S&P 500 UCITS, kullanıcının haftalık DCA aracı), VWCE/IWDA (global), JNJ (ek alım), KO, PG, NESN. Temettü ETF istersen UCITS: VHYL/TDIV — SCHD/VYM ABD-domicile, ALINAMAZ. Saf REIT yerine kalite tercih et.

- ✅ ÖNCELİK 3: +%60 üstü kazançtaki BIST hisselerinden TRIM (sat) — %20-30 dilim. ASELS/TUPRS/AKSEN/ENKAI/BIMAS arası en kârlısını seç.

- ⛔ ÖNCELİK 4 (YASAK): Zaten +%50 üstü kârda olan BIST hissesinden YENI ALIM ya da accumulate ÖNERMEsin. Bu hisseler trim edilmeli, artırılmamalı.
  ÖRNEK YASAK: "SISE pozisyonunu artır", "ENKAI yeni alım", "TUPRS accumulate" — KESINLIKLE YAZMAYIN.
  Sebep: bu pozisyonlar zaten 2 katı kâra geçmiş — concentration riski büyür, kullanıcı portföyü daha BIST'e bağımlı yapar.
  İSTİSNA: <+%20 kârda olan BIST hissesi (GARAN, JNJ gibi) ek alım yapılabilir.

- ⚠️ Top pick: HER ZAMAN gelir üreten araç (IB01/DTLA/eurobond/VHYL) olmalı. BIST hissesi top pick olamaz.

TEMPO VE MİKTAR KURALLARI (ZORUNLU):
- ⛔ Tek seferde 1M TL üzeri alım ÖNERME. Maksimum 750K TL parça başına, sonra DCA ile büyüt.
- ⛔ "today" urgency'sini SADECE risk/protect aksiyonları için kullan. Cash redeploy/buy için "this_week" veya "this_month" kullan.
- ⛔ ABD-domicile ETF (SGOV, TLT, GOVT, SCHD, VYM, VOO, QQQ, BIL, SHV) ÖNERME — AB perakende yatırımcı PRIIPs nedeniyle ALAMAZ. Daima UCITS karşılığını yaz: IB01, DTLA, VHYL, VUAA/CSPX, EQQQ.
- ⛔ "Revolut'tan TreasuryDirect" YAZMA — TreasuryDirect ABD vatandaşları için, Revolut'tan erişim yok. Revolut'tan US Treasury için IB01 (kısa) veya DTLA (uzun) UCITS ETF yaz.
- ⛔ Türkiye eurobondu Revolut'ta YOK. Bunun için "Türkiye broker (İş Yatırım/Garanti BBVA)" platform yaz.
- ⛔ Mevcut +%50 kârdaki BIST pozisyonunu artırma ÖNERME (concentration riski). SISE/ENKAI/TUPRS/AKSEN/ASELS/BIMAS/TOASO/CCOLA/EKGYO için sadece TRIM önerilebilir, "accumulate" YASAK.
- ✅ Toplam aksiyon sayısı 4-6 arasında olsun, fazlası kullanıcıyı boğar.
- ✅ İlk aksiyon DAİMA eurobond/Treasury (IB01 ya da DTLA ya da Türkiye Hazine eurobondu) olmalı.
- ✅ Toplam önerilen cash redeploy miktarı portföyün %10-15'ini (yaklaşık 700K-1M TL) geçmesin, yoksa kullanıcı korkar/erteler.

PLATFORM REALİTESİ (yanlış yazma):
- **Revolut (AB)**: US/EU hisse (JNJ/KO/ASML), SADECE UCITS ETF (IB01/DTLA/V3YL/VUAA/CSPX/VWCE/VHYL/EQQQ), crypto (BTC/ETH). YOK: ABD-domicile ETF (SGOV/TLT/GOVT/SCHD/VOO/QQQ — PRIIPs), Türkiye eurobondu, fiziki tahvil, TreasuryDirect.
- **Binance**: Crypto. YOK: hisse, tahvil, ETF.
- **BIST (Türkiye broker)**: BIST hisseleri, TR fonlar (TEFAS), Türkiye eurobondu (USD), VIOP. Broker örnekleri: İş Yatırım, Garanti BBVA Yatırım, Ziraat Yatırım.
- **Mevcut**: pozisyon var, dokunma demek.

KURALLAR:
- Bilgi kesim tarihin Ocak 2026. Sadece CANLI VERİLERE dayan.
- Uydurma yapma. Veri olmayan hakkında yorum yapma.
- Müşteri Romanya'da yaşıyor (Türk vatandaşı). BIST + Revolut (USD/EUR) + Binance kullanıyor.
- Her öneri: NEDEN, NE KADAR, HANGİ PLATFORM, CANLI FİYAT, BEKLENEN TEMETTÜ/KUPON içermeli.
- Portföy maaşı hesaplarken: temettü + faiz + staking + kupon gelirlerini ayrı ayrı belirt.
- Mevcut allokasyon farkını "Gelir hedef allokasyonuna" göre değerlendir (context'te verildi).
- Çekim oranı ≤%6/yıl sürdürülebilir, %6-8 sınırda, >%8 riskli — bunu hesaba kat.
- ⛔ ÖNEMLİ KISIT: ALTIN pozisyonu PHYSICAL (fiziki külçe/gram) — parça parça SATILAMAZ. Altın azaltma önerisi VERME. Allokasyonu düşürmek için sadece "yeni alımları başka kategorilere yönlendir" de.
- Maaş trim'i için sadece kâğıt varlıkları öner: hisse, fon, ETF. ALTIN ve fiziki varlık trim'e dahil edilemez.
- JNJ pozisyonu Revolut'ta tutuluyor (USD), ASML pozisyonu TRY tabanlı manuel takipte — bu ikisi için "currency conversion gerekli" türü uyarı VERME.

PİYASA ARAŞTIRMASI YAPMAN GEREKENLER:
- Verilen piyasa verilerindeki trendleri analiz et (yükselen/düşen sektörler)
- VIX seviyesine göre risk ortamını değerlendir
- 52 haftalık aralıkta pozisyonu düşük olan hisseleri fırsat olarak belirt
- Kripto 24 saatlik değişimlere göre momentum analizi yap
- Döviz kurlarının portföye etkisini hesapla

JSON FORMATI (başka metin ekleme):
{
  "actions": [
    {
      "urgency": "today|this_week|this_month",
      "type": "buy|accumulate|hold|rebalance|protect|take_profit",
      "symbol": "SEMBOL",
      "market": "BIST|US|EU|CRYPTO",
      "instruction": "Somut komut",
      "detail": "Neden, risk, beklenti. Canlı fiyat referansı. 3-4 cümle.",
      "amount_try": 0,
      "risk": "low|medium|high",
      "expected_annual_return": 0,
      "dividend_yield": 0,
      "platform": "Revolut|Binance|BIST|Mevcut"
    }
  ],
  "monthly_income": {
    "safe": 0,
    "moderate": 0,
    "dividend_estimate": 0,
    "interest_estimate": 0,
    "staking_estimate": 0,
    "description": "Detaylı aylık gelir hesaplaması"
  },
  "portfolio_diagnosis": "Güçlü/zayıf yönler, en büyük risk, fırsat — 4-5 cümle",
  "market_outlook": "Bugünkü canlı verilere dayalı piyasa değerlendirmesi — 3-4 cümle",
  "market_research": {
    "global_trend": "Küresel piyasa trendi ve Türkiye'ye etkisi",
    "sector_analysis": "Yükselen ve düşen sektörler",
    "risk_environment": "VIX ve risk değerlendirmesi",
    "fx_impact": "Döviz kurlarının portföye etkisi",
    "opportunities": "Fırsat olarak görülen varlıklar ve neden"
  },
  "rebalance_alert": {
    "needed": true,
    "deviations": [{"type": "kripto", "current_pct": 22, "target_pct": 15, "action": "azalt"}],
    "summary": "Kısa rebalance özeti"
  },
  "top_pick": "En çok önerilen varlık ve neden — canlı fiyat ile",
  "news_alerts": ["Portföyü etkileyen haber/gelişme 1", "Gelişme 2"],
  "wealth_building_tip": "Bu portföye özel servet büyütme stratejisi"
}`;

  const userPrompt = `${portfolioContext}

${marketContext}

Yukarıdaki verilere dayanarak kapsamlı günlük brifing hazırla. Müşterinin öncelikli hedefi $${SALARY_TARGET_USD}/ay sürdürülebilir maaş çekmek — sermayeyi eritmeden. Tüm öneriler bu hedefe hizmet etmeli: cash fazlasını temettü/eurobond'a dönüştürme, kâra geçmiş hisselerden trim, gelir maximizasyonu. Spekülatif büyüme tavsiyesi (BTC accumulate, NVDA momentum) verme — bu kullanıcının hedefi DEĞİL.

ZORUNLU KISITLAR:
- Tek aksiyonda 1M TL üzeri alım önerme. Maks 750K TL parça başına.
- ABD-domicile ETF (SGOV/TLT/GOVT/SCHD/VYM/VOO/QQQ) YAZMA — AB'de alınamaz. UCITS karşılığı: IB01/DTLA/VHYL/VUAA/EQQQ.
- "Revolut'tan TreasuryDirect" yazma — IB01/DTLA UCITS ETF yaz.
- Türkiye eurobondu için platform "BIST broker (İş Yatırım/Garanti)" yaz, Revolut değil.
- "today" urgency'sini sadece risk azaltma için kullan, alım için "this_week" veya "this_month".
- 4-6 aksiyon ver, fazlası kullanıcıyı boğar.
- ⛔ KESIN YASAK: SISE, ENKAI, TUPRS, AKSEN, ASELS, BIMAS, TOASO, CCOLA, EKGYO için "accumulate" / "yeni alım" / "pozisyonu artır" türü öneri vermeyin. Bu hisseler zaten +%50-130 kârda — artırmak portföyü daha riskli yapar. Bu hisseler için SADECE TRIM (kâr alma) önerilebilir.
- ⛔ İLK AKSIYON eurobond/Treasury (IB01/DTLA/Hazine eurobondu) olmak ZORUNDA. Top pick gelir üreten araç olmak ZORUNDA. BIST hissesi top pick olamaz.

Piyasa araştırması yap, trendleri analiz et, portföye özel somut maaş-bilinçli öneriler ver. Top pick: gelir üreten bir varlık (temettü ETF, eurobond, REIT, temettü hissesi).`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-5',
      thinking: { type: 'disabled' },
      // 4000 yetmiyordu: sonnet-5 Türkçe raporu ~7-8K karakter üretiyor, kesilen
      // çıktı JSON.parse'ı düşürüp tüm raporu ham metin olarak kaydettiriyordu.
      max_tokens: 8000,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Claude API error: ${response.status} - ${err}`);
  }

  const data = await response.json();
  const text = data.content[0].text;

  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
  } catch { /* fallback */ }

  return { raw: text, actions: [], monthly_income: {}, market_outlook: text };
}

// Live FX fallback — USD/EUR holding yoksa kullanılır. 60s cache.
const _fxCache: Record<string, { value: number; ts: number }> = {};
async function fetchLiveRate(base: 'USD' | 'EUR'): Promise<number> {
  const cached = _fxCache[base];
  if (cached && Date.now() - cached.ts < 60000) return cached.value;
  try {
    const res = await fetch(`https://open.er-api.com/v6/latest/${base}`);
    if (res.ok) {
      const data = await res.json();
      const rate = data.rates?.TRY || (base === 'USD' ? 38 : 41);
      _fxCache[base] = { value: rate, ts: Date.now() };
      return rate;
    }
  } catch { /* fallback */ }
  return cached?.value || (base === 'USD' ? 38 : 41);
}
