import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { sendEmail, buildDailyEmail } from '../lib/email.js';
import { sendTelegram, buildDailyTelegram } from '../lib/telegram.js';
import { requireCronAuth } from '../lib/auth.js';
import { sendPushToAll } from '../lib/push.js';
import { loadEurSummary, monthLabelTR, fmtEUR, fmtSignedEUR, type EurSummary } from '../lib/eurEngine.js';

// TEK ÖLÇÜ EUR (2026-09-19): maaş = geçen ayın reel EUR kârı × 0,85 (api/lib/eurEngine → src/lib/eurPnl.ts).
// AI maaş HESAPLAMAZ; sabit USD hedefi yok. Geçim planı bilgi amaçlı üst sınır: €1.000/ay.
const LIVING_CAP_EUR = Number(process.env.LIVING_CAP_EUR || 1000);
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
    const todayStr = new Date().toISOString().split('T')[0];

    // EUR kâr motoru — uygulamayla AYNI fonksiyon (buildEurModel). Servet, gün/hafta/ay kârı, bu ayın maaşı.
    let eur: EurSummary | null = null;
    try {
      eur = await loadEurSummary(supabase, todayStr);
      log.push(`EUR motoru: servet ${fmtEUR(eur.wealthEUR)}, gün ${fmtSignedEUR(eur.dayGainEUR)}, ay ${fmtSignedEUR(eur.mtd?.gainEUR || 0)}, maaş ${fmtEUR(eur.lastFull?.salaryEUR || 0)}, kur ${eur.health.ok ? 'güncel' : 'ESKİ (' + eur.health.lastEurRateDay + ')'}`);
    } catch (e: any) {
      log.push(`EUR motoru HATA: ${e.message}`);
    }
    const salaryEUR = eur?.lastFull?.salaryEUR || 0;
    const projectedSalaryEUR = eur?.mtd?.salaryEUR || 0;

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

    // Dünkü snapshot ile karşılaştır (TL, yalnız AI bağlamı için ikincil bilgi)
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

    const portfolioContext = buildPortfolioContext(holdings, totalValue, totalInvestment, totalPnlPct, totalCash, snapshots, dividends, incomeRecords, dailyChange, dailyChangePct, fxRate, eur, eurRate);
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
      market_outlook: aiResponse.market_outlook || '',
      portfolio_diagnosis: aiResponse.portfolio_diagnosis || '',
      top_pick: aiResponse.top_pick || '',
      news_alerts: aiResponse.news_alerts || [],
      wealth_building_tip: aiResponse.wealth_building_tip || '',
      // EUR — tek ölçü (uygulama kartlarıyla aynı motor)
      wealth_eur: eur ? Math.round(eur.wealthEUR * 100) / 100 : null,
      pnl_eur_day: eur ? Math.round(eur.dayGainEUR * 100) / 100 : null,
      pnl_eur_mtd: eur?.mtd ? Math.round(eur.mtd.gainEUR * 100) / 100 : null,
      salary_eur: eur ? Math.round(salaryEUR * 100) / 100 : null,
      projected_salary_eur: eur?.mtd ? Math.round(projectedSalaryEUR * 100) / 100 : null,
      eur_rate: eur?.eurRate || null,
      eur_health_ok: eur ? eur.health.ok : null,
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
      await sendPushToAll({
        title: '📊 Günlük rapor hazır',
        body: eur
          ? `Servet ${fmtEUR(eur.wealthEUR)} · Gün ${fmtSignedEUR(eur.dayGainEUR)} · Bu ay ${fmtSignedEUR(eur.mtd?.gainEUR || 0)} · Maaş ${fmtEUR(salaryEUR)}`
          : `Portföy ₺${Math.round(totalValue).toLocaleString('tr-TR')} (EUR motoru yok)`,
        url: '/daily-report',
        tag: 'daily-report',
      }).catch((e) => console.error('[push] gönderim hatası:', e));
    }

    // (6. 'monthly_salary' güvenli/dengeli upsert KALDIRILDI 2026-09-19 — tek ölçü EUR dinamik maaş, motor hesaplar)

    // ========================================
    // 7. Email gönder (RESEND_API_KEY varsa)
    // ========================================
    try {
      const nextYM = (() => { const y = Number(todayStr.slice(0, 4)), m = Number(todayStr.slice(5, 7)); return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`; })();
      const snapshot = {
        date: todayStr,
        wealthEUR: eur?.wealthEUR || 0,
        wealthTRY: eur?.wealthTRY || totalValue,
        eurRate: eur?.eurRate || eurRate,
        dayGainEUR: eur?.dayGainEUR || 0, dayGainPct: eur?.dayGainPct || 0,
        weekGainEUR: eur?.weekGainEUR || 0, weekGainPct: eur?.weekGainPct || 0,
        mtdGainEUR: eur?.mtd?.gainEUR || 0, mtdInflationEUR: eur?.mtd?.inflationEUR || 0, mtdRealEUR: eur?.mtd?.realGainEUR || 0,
        carryInEUR: eur?.mtd?.carryInEUR || 0,
        salaryEUR, salaryMonthLabel: monthLabelTR(todayStr.slice(0, 7)), salaryBasisLabel: eur?.lastFull ? monthLabelTR(eur.lastFull.month) : '—',
        projectedSalaryEUR, nextMonthLabel: monthLabelTR(nextYM),
        healthOk: eur ? eur.health.ok : false,
        topPick: aiResponse.top_pick || '',
        portfolioDiagnosis: aiResponse.portfolio_diagnosis || '',
        marketOutlook: aiResponse.market_outlook || '',
        actions: aiResponse.actions || [],
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
        eur: eur ? {
          wealth: eur.wealthEUR, day: eur.dayGainEUR, week: eur.weekGainEUR, mtd: eur.mtd?.gainEUR ?? null,
          salary: salaryEUR, projected_salary: projectedSalaryEUR, carry_in: eur.mtd?.carryInEUR ?? null, health_ok: eur.health.ok,
        } : null,
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
  eur: EurSummary | null, eurRateNow: number,
): string {
  const typeNames: Record<string, string> = {
    stock: 'Hisse', crypto: 'Kripto', currency: 'Döviz',
    fund: 'Fon', eurobond: 'Eurobond', commodity: 'Emtia',
  };
  const eurNow = eur?.eurRate || eurRateNow;
  const E = (tl: number) => tl / eurNow;           // bugünkü kurla TL → EUR
  const e0 = (n: number) => `${n < 0 ? '−' : ''}€${Math.abs(n).toFixed(0)}`;
  // FX-aware TRY value (holdings can be USD/EUR/GBP/RON/RUB)
  const tryV = (h: any, field: 'current_price' | 'purchase_price' = 'current_price') => {
    const p = Number(h[field]) || (field === 'current_price' ? Number(h.purchase_price) : 0) || 0;
    const q = Number(h.quantity) || 0;
    return p * q * fxRate(h.currency || 'TRY'); // fx-ok: tryV helper kapsüllüyor
  };

  // Tip dağılımı (değer EUR; K/Z yerel para nominal — TL pozisyonlarda kur/enflasyon DÜŞÜLMEMİŞ)
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
    .map(([type, d]) => `${typeNames[type] || type}: %${(d.value / totalValue * 100).toFixed(1)} (${d.count} adet, ${e0(E(d.value))})`)
    .join('\n');

  // Top 20 pozisyon (EUR değerle sıralı)
  const topHoldings = [...holdings]
    .sort((a, b) => tryV(b) - tryV(a))
    .slice(0, 20)
    .map(h => {
      const value = tryV(h, 'current_price');
      const cost = tryV(h, 'purchase_price');
      const pnlPct = cost > 0 ? ((value - cost) / cost * 100) : 0;
      const weight = totalValue > 0 ? (value / totalValue * 100) : 0;
      const ccy = String(h.currency || 'TRY').toUpperCase();
      return `${h.symbol} (${typeNames[h.asset_type] || h.asset_type}, ${ccy}): ${e0(E(value))}, ağırlık %${weight.toFixed(1)}, nominal K/Z %${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(1)}${ccy === 'TRY' ? ' (TL nominal — kur/enflasyon düşülmemiş, EUR bazında çok daha düşük)' : ''}`;
    })
    .join('\n');

  // EUR servet trendi (motor, son 7 snapshot günü)
  const perfTrend = eur
    ? `motor son 7 gün: ${fmtSignedEUR(eur.weekGainEUR)} (${eur.weekGainPct >= 0 ? '+' : ''}${eur.weekGainPct.toFixed(2)}%)`
    : snapshots.slice(0, 7).map(s => `${s.snapshot_date}: ${e0(E(Number(s.total_value)))}`).join(', ');

  // Temettü / gelir özeti (EUR, bugünkü kurla)
  const totalDividends = dividends.reduce((sum, d) => sum + (d.amount || 0), 0);
  const recentDivs = dividends.slice(0, 5).map(d => `${d.payment_date}: ${e0(E(Number(d.amount) || 0))}`).join(', ');
  const monthlyIncomeTotal = incomeRecords.filter(r => !r.is_projected).reduce((sum, r) => sum + (r.amount_try || 0), 0);

  // Allokasyon sapması (SABİT POLİTİKA)
  const allocationGap = Object.entries(TARGET_ALLOCATION).map(([type, target]) => {
    const current = byType[type] ? (byType[type].value / totalValue * 100) : 0;
    const diff = current - target;
    const status = Math.abs(diff) < 3 ? 'OK' : diff > 0 ? 'FAZLA' : 'EKSİK';
    return `${typeNames[type] || type}: %${current.toFixed(1)} → hedef %${target} (${diff >= 0 ? '+' : ''}${diff.toFixed(1)}, ${status})`;
  }).join('\n');

  // Pasif gelir tahmini (yieldlere göre, EUR/ay)
  const yieldByType: Record<string, number> = { stock: 0.03, fund: 0.02, eurobond: 0.05, crypto: 0.02, commodity: 0, currency: 0.01 };
  const passiveYearlyTRY = Object.entries(byType).reduce((sum, [type, d]) => sum + d.value * (yieldByType[type] || 0), 0);
  const passiveMonthlyEUR = E(passiveYearlyTRY) / 12;

  const salaryEUR = eur?.lastFull?.salaryEUR || 0;
  const withdrawalRatePctYearly = eur && eur.wealthEUR > 0 ? (salaryEUR * 12 / eur.wealthEUR) * 100 : 0;
  const eurBlock = eur ? `
EUR KÂR MOTORU (tek ölçü; servet farkı − dış akış; kur farkı kâr DEĞİL):
Servet: ${fmtEUR(eur.wealthEUR)} (≈ ₺${Math.round(eur.wealthTRY).toLocaleString('tr-TR')}, EUR/TRY ${eur.eurRate.toFixed(2)})${eur.health.ok ? '' : ' — DİKKAT: kur serisi eski (' + eur.health.lastEurRateDay + ')'}
Son gün: ${fmtSignedEUR(eur.dayGainEUR)} (${eur.dayGainPct >= 0 ? '+' : ''}${eur.dayGainPct.toFixed(2)}%)
Son 7 gün: ${fmtSignedEUR(eur.weekGainEUR)} (${eur.weekGainPct >= 0 ? '+' : ''}${eur.weekGainPct.toFixed(2)}%)
Bu ay (MTD): nominal ${fmtSignedEUR(eur.mtd?.gainEUR || 0)}, enflasyon payı −${fmtEUR(eur.mtd?.inflationEUR || 0)}, reel ${fmtSignedEUR(eur.mtd?.realGainEUR || 0)}, devreden açık ${fmtSignedEUR(eur.mtd?.carryInEUR || 0)} → gelecek ay maaş ön izleme ${fmtEUR(eur.mtd?.salaryEUR || 0)}
Geçen ay (${eur.lastFull ? monthLabelTR(eur.lastFull.month) : '—'}): nominal ${fmtSignedEUR(eur.lastFull?.gainEUR || 0)}, reel ${fmtSignedEUR(eur.lastFull?.realGainEUR || 0)}, çekilebilir ${fmtEUR(eur.lastFull?.withdrawableEUR || 0)} → BU AYIN MAAŞI ${fmtEUR(salaryEUR)} (= çekilebilir × 0,85)
Yıllık çekim oranı (maaş×12 / servet): %${withdrawalRatePctYearly.toFixed(1)} (sürdürülebilir ≤%6)` : `
EUR KÂR MOTORU: veri alınamadı — kâr/maaş yorumu YAPMA.`;

  return `PORTFÖY DURUMU (${new Date().toISOString().split('T')[0]}) — PARA BİRİMİ: EUR (kullanıcı EUR harcıyor; TL/USD nominal rakamlar yanıltıcıdır):
${eurBlock}

İKİNCİL (nominal, yalnız bağlam): toplam ₺${totalValue.toFixed(0)}, maliyet ₺${totalInvestment.toFixed(0)}, nominal TL K/Z %${totalPnlPct.toFixed(1)}, günlük TL değişim ${dailyChange >= 0 ? '+' : ''}₺${dailyChange.toFixed(0)} (%${dailyChangePct.toFixed(1)}), likit nakit ${e0(E(totalCash))}
Pozisyon Sayısı: ${holdings.length}

KULLANICININ HEDEFİ — TOTAL RETURN (Maaş + Büyüme):
Maaş kuralı: geçen ayın reel EUR kârı × 0,85; zarar aylarında maaş 0, açık devreder (ana paraya dokunulmaz). Geçim üst sınırı ~€${LIVING_CAP_EUR}/ay.
Strateji: Total Return — gelir + sermaye büyümesi + denge (saf gelir DEĞİL)
Tahmini pasif gelir: ~${e0(passiveMonthlyEUR)}/ay — temettü+kupon+staking (yield varsayımıyla)
Beklenen yıllık toplam getiri (EUR): global hisse %6-9, kısa USD hazine %3,5-4, altın %3-5, kripto oynak

DAĞILIM (EUR):
${dist}

HEDEF VS MEVCUT ALLOKASYON (SABİT POLİTİKA):
${allocationGap}

POZİSYONLAR (Top 20, EUR):
${topHoldings}

PERFORMANS:
${perfTrend}

TEMETTÜ GEÇMİŞİ:
Toplam: ${e0(E(totalDividends))}
Son: ${recentDivs || 'Henüz temettü yok'}

GELİR ÖZETİ:
Son kaydedilen gelir toplamı: ${e0(E(monthlyIncomeTotal))}`;
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

PARA BİRİMİ — TEK ÖLÇÜ EUR (ZORUNLU):
Müşteri Romanya'da yaşıyor ve EUR harcıyor. Tüm tutarları EUR yaz. TL nominal kâr/kur farkını KÂR OLARAK YORUMLAMA
(TL hiperenflasyonist; kur artışı EUR bazında kâr değildir). Kâr/maaş rakamlarını yalnız sana verilen "EUR KÂR MOTORU" bloğundan al,
kendin hesaplama, başka rakam üretme. Maaş kuralı deterministiktir: geçen ayın reel EUR kârı × 0,85; zarar aylarında 0.

KULLANICININ ÖNCELİKLİ HEDEFİ — TOTAL RETURN (Maaş + Büyüme + Denge):
Müşteri portföyden ayda ~€${LIVING_CAP_EUR}'ya kadar maaş çekmek istiyor — AMA aynı zamanda sermayenin uzun vadede büyümesini istiyor.
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
5. Maaş HESAPLAMA — motor verdi; sadece bu ayın maaşını ve gelecek ay ön izlemesini tekrar et, istikrarlı reel EUR kârı için ne gerektiğini söyle
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
- ⛔ Tek seferde €18.000 üzeri alım ÖNERME. Maksimum €13.000 parça başına, sonra DCA ile büyüt.
- ⛔ "today" urgency'sini SADECE risk/protect aksiyonları için kullan. Cash redeploy/buy için "this_week" veya "this_month" kullan.
- ⛔ ABD-domicile ETF (SGOV, TLT, GOVT, SCHD, VYM, VOO, QQQ, BIL, SHV) ÖNERME — AB perakende yatırımcı PRIIPs nedeniyle ALAMAZ. Daima UCITS karşılığını yaz: IB01, DTLA, VHYL, VUAA/CSPX, EQQQ.
- ⛔ "Revolut'tan TreasuryDirect" YAZMA — TreasuryDirect ABD vatandaşları için, Revolut'tan erişim yok. Revolut'tan US Treasury için IB01 (kısa) veya DTLA (uzun) UCITS ETF yaz.
- ⛔ Türkiye eurobondu Revolut'ta YOK. Bunun için "Türkiye broker (İş Yatırım/Garanti BBVA)" platform yaz.
- ⛔ Mevcut +%50 kârdaki BIST pozisyonunu artırma ÖNERME (concentration riski). SISE/ENKAI/TUPRS/AKSEN/ASELS/BIMAS/TOASO/CCOLA/EKGYO için sadece TRIM önerilebilir, "accumulate" YASAK.
- ✅ Toplam aksiyon sayısı 4-6 arasında olsun, fazlası kullanıcıyı boğar.
- ✅ İlk aksiyon DAİMA eurobond/Treasury (IB01 ya da DTLA ya da Türkiye Hazine eurobondu) olmalı.
- ✅ Toplam önerilen cash redeploy miktarı portföyün %10-15'ini (servetin EUR değerinden hesapla) geçmesin, yoksa kullanıcı korkar/erteler.

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
- Pasif gelir kaynaklarını (temettü + faiz + staking + kupon) ayrı ayrı belirt; ama maaş rakamı motorunkidir.
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
      "amount_eur": 0,
      "risk": "low|medium|high",
      "expected_annual_return": 0,
      "dividend_yield": 0,
      "platform": "Revolut|Binance|BIST|Mevcut"
    }
  ],
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

Yukarıdaki verilere dayanarak kapsamlı günlük brifing hazırla. Müşterinin öncelikli hedefi ayda ~€${LIVING_CAP_EUR}'ya kadar sürdürülebilir EUR maaş — sermayeyi eritmeden; maaş = geçen ayın reel EUR kârı × 0,85 (motor hesapladı, sen tekrar et). Tüm öneriler bu hedefe hizmet etmeli: cash fazlasını temettü/eurobond'a dönüştürme, kâra geçmiş hisselerden trim, gelir maximizasyonu. Spekülatif büyüme tavsiyesi (BTC accumulate, NVDA momentum) verme — bu kullanıcının hedefi DEĞİL.

ZORUNLU KISITLAR:
- Tüm tutarlar EUR (amount_eur). Tek aksiyonda €18.000 üzeri alım önerme. Maks €13.000 parça başına.
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

  return { raw: text, actions: [], market_outlook: text };
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
