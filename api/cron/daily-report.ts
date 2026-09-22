import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { sendEmail, buildDailyEmail } from '../lib/email.js';
import { sendTelegram, buildDailyTelegram } from '../lib/telegram.js';
import { requireCronAuth } from '../lib/auth.js';
import { sendPushToAll } from '../lib/push.js';
import { monthLabelTR, fmtEUR, fmtSignedEUR, type EurSummary } from '../lib/eurEngine.js';
import { buildAiContext, AI_RULES } from '../lib/aiContext.js';
import { dayInTZ } from '../../src/lib/eurPnl.js';


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
    // (dividends / income_records / cash_balances / snapshots sorguları 2026-09-22'de kaldırıldı — AI bağlamı aiContext'ten,
    //  TL rakamları yalnız daily_reports'un eski TL sütunları için; EUR tek ölçü)
    const { data: holdingsData } = await supabase.from('holdings').select('*');
    const holdings = holdingsData || [];

    log.push(`Veri: ${holdings.length} holding`);
    const todayStr = dayInTZ(new Date());   // Bükreş takvimi (chat/daily-plan ile aynı); buildAiContext'in saat mantığı UTC

    // EUR kâr motoru — uygulamayla AYNI fonksiyon (buildEurModel). Servet, gün/hafta/ay kârı, bu ayın maaşı.
    let eur: EurSummary | null = null;
    let aiCtx: Awaited<ReturnType<typeof buildAiContext>> | null = null;
    try {
      aiCtx = await buildAiContext(supabase, todayStr);
      eur = aiCtx.eur;
      log.push(`EUR motoru: servet ${fmtEUR(eur.wealthEUR)} (dün ${fmtEUR(eur.prevWealthEUR)}), gün ${fmtSignedEUR(eur.dayGainEUR)} = %${eur.dayGainPct.toFixed(2)}, ay ${fmtSignedEUR(eur.mtd?.gainEUR || 0)}, maaş ${fmtEUR(eur.entitlementEUR)} (havuz ${fmtSignedEUR(eur.poolEUR)}), kur ${eur.health.ok ? 'güncel' : 'ESKİ (' + eur.health.lastEurRateDay + ')'}`);
    } catch (e: any) {
      log.push(`EUR motoru HATA: ${e.message}`);
    }
    const salaryEUR = eur?.entitlementEUR || 0;      // TEK TABAN: kapanmış havuz × 0,85 (aylık tavanla) — cüzdanla aynı
    const projectedSalaryEUR = eur?.mtd?.salaryEUR || 0;

    // FX kurları — holdings'teki USD/EUR pozisyonlarından; yoksa live API.
    // Eski hardcode || 45 / || 51, USD holding silindiğinde snapshot poisoning'e yol açıyordu.
    const usdHolding = holdings.find((h: any) => h.symbol === 'USD' && h.asset_type === 'currency');
    const eurHolding = holdings.find((h: any) => (h.symbol === 'EURO' || h.symbol === 'EUR') && h.asset_type === 'currency');
    const usdFromHolding = Number(usdHolding?.current_price) || 0;
    const eurFromHolding = Number(eurHolding?.current_price) || 0;
    const usdRate = usdFromHolding > 1 ? usdFromHolding : await fetchLiveRate('USD');
    const eurRate = eurFromHolding > 1 ? eurFromHolding : await fetchLiveRate('EUR');
    // Yardımcı kurlar (RUB/RON/GBP/CHF için yaklaşık) — yalnız daily_reports'un eski TL sütunları için
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
    const totalValue = holdings.reduce((sum: number, h: any) => sum + tryValue(h, 'current_price'), 0);
    const totalInvestment = holdings.reduce((sum: number, h: any) => sum + tryValue(h, 'purchase_price'), 0);
    const totalPnl = totalValue - totalInvestment;
    const totalPnlPct = totalInvestment > 0 ? (totalPnl / totalInvestment) * 100 : 0;

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

    // AI bağlamı = sohbet ve planla AYNI metin (api/lib/aiContext); işlem önerisi yok, rakamlar motorun
    const portfolioContext = aiCtx ? aiCtx.text : `PORTFÖY VERİSİ ALINAMADI — rakam verme, yalnız piyasa özeti yap.\nPozisyon sayısı: ${holdings.length}`;
    const marketContext = buildMarketContext(marketData, newsData);

    const aiResponse = await callClaudeForDailyReport(anthropicKey, portfolioContext, marketContext);
    log.push('AI analizi tamamlandı');
    const weekPlanActions = (aiCtx?.weekPlan || []).map(p => ({
      urgency: 'this_week', type: 'buy', symbol: p.symbol, market: 'EU', platform: 'Revolut',
      instruction: `${p.instruction} — ≈ €${p.amountEUR.toLocaleString('de-DE')}`,
      detail: `Tek plan (sabit): haftalık ~€${(aiCtx?.trancheEUR || 0).toLocaleString('de-DE')} dilim, hisse/tahvil açıklarına oranlı. ${p.label}.`,
      amount_eur: p.amountEUR, risk: p.symbol === 'XEON' ? 'low' : 'medium',
    }));
    // Anomaliler yalnız KODDAN (aiCtx.anomalies) — AI kopyası/tespiti yok (AI_RULES: kendin anomali üretme); haber listesinden tekilleştirilir
    const allAnomalies = aiCtx?.anomalies || [];
    const anomalySet = new Set(allAnomalies.map(a => a.trim()));
    aiResponse.news_alerts = [
      ...(Array.isArray(aiResponse.news_alerts) ? aiResponse.news_alerts : []).filter((n: any) => typeof n === 'string' && !n.startsWith('⚠️') && !anomalySet.has(n.trim())),
      ...allAnomalies.map(a => `⚠️ ${a}`),
    ];
    aiResponse.top_pick = '';   // 'Günün Seçimi' yok — model doldursa da yayınlanmaz

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
      actions: weekPlanActions,   // 2026-09-22: AI aksiyonu yok; tek planın bu haftaki dilimi
      market_outlook: aiResponse.market_outlook || '',
      portfolio_diagnosis: aiResponse.portfolio_diagnosis || '',
      top_pick: '',
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
      if (!eur) {
        // Motor yoksa sahte '€0' yayınlamak yerine yalnız kısa uyarı (rakam yok)
        const warn = `⚠️ <b>Günlük · ${todayStr}</b>\nEUR kâr motoru çalışmadı — rapor e-postası/Telegram özeti atlandı. Log: ${log.filter(l => l.startsWith('EUR motoru')).join(' | ') || 'bilinmiyor'}`;
        const tgRes = await sendTelegram(warn);
        log.push(tgRes.sent ? 'Telegram: yalnız motor uyarısı gönderildi' : `Telegram atlandı: ${tgRes.reason}`);
        throw new Error('EUR motoru yok — e-posta atlandı');
      }
      const nextYM = (() => { const y = Number(todayStr.slice(0, 4)), m = Number(todayStr.slice(5, 7)); return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`; })();
      const snapshot = {
        date: todayStr,
        asOf: eur.asOf,                       // rakamların ait olduğu snapshot günü (≠ date ise snapshot cron'u aksamıştır)
        wealthEUR: eur.wealthEUR,
        wealthTRY: eur.wealthTRY,
        eurRate: eur.eurRate,
        dayGainEUR: eur.dayGainEUR, dayGainPct: eur.dayGainPct,
        weekGainEUR: eur.weekGainEUR, weekGainPct: eur.weekGainPct,
        mtdGainEUR: eur.mtd?.gainEUR || 0, mtdInflationEUR: eur.mtd?.inflationEUR || 0, mtdRealEUR: eur.mtd?.realGainEUR || 0,
        carryInEUR: eur.mtd?.carryInEUR || 0,
        carryResetApplied: !!eur.mtd?.carryResetApplied,
        salaryEUR, salaryMonthLabel: monthLabelTR(todayStr.slice(0, 7)), salaryBasisLabel: eur.lastFull ? monthLabelTR(eur.lastFull.month) : '—',
        projectedSalaryEUR, nextMonthLabel: monthLabelTR(nextYM),
        healthOk: eur.health.ok,
        anomalies: allAnomalies.filter(a => !a.startsWith('Snapshot eksik')),   // asOf≠date uyarısı e-posta/Telegram'da zaten var
        topPick: '',
        portfolioDiagnosis: aiResponse.portfolio_diagnosis || '',
        marketOutlook: aiResponse.market_outlook || '',
        actions: weekPlanActions,
      };
      const { subject, html } = buildDailyEmail(snapshot);
      const emailRes = await sendEmail(subject, html);
      log.push(emailRes.sent ? `Email gönderildi: ${emailRes.id}` : `Email atlandı: ${emailRes.reason}`);

      const tgRes = await sendTelegram(buildDailyTelegram(snapshot));
      log.push(tgRes.sent ? `Telegram gönderildi` : `Telegram atlandı: ${tgRes.reason}`);
    } catch (emailErr: any) {
      log.push(`Email/Telegram: ${emailErr.message}`);
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
  // 2026-09-22: AI KÜÇÜLTÜLDÜ — açıklar, bilgilendirir, anomali bildirir; İŞLEM ÖNERMEZ, MAAŞ HESAPLAMAZ.
  // Kurallar ve bağlam api/lib/aiContext.ts'ten (sohbet ve plan ile aynı kaynak).
  const systemPrompt = `${AI_RULES}

GÖREVİN (her sabah, Türkçe, kısa):
1. portfolio_diagnosis: bugünkü rakamları AÇIKLA — son gün ve bu ay neden artı/eksi, hangi varlık sınıfı sürükledi (3-4 cümle, rakamlı).
2. market_outlook: verilen CANLI piyasa verilerine dayalı kısa değerlendirme (3-4 cümle). Canlı veri olmayan şey hakkında yorum yapma.
3. news_alerts: portföyü etkileyen gerçek haber/gelişmeler (verilen haberlerden), en fazla 4. ANOMALİLER listesini buraya KOPYALAMA — kod ekler.
4. wealth_building_tip: tek plana bağlı, işlem ve RAKAM içermeyen tek cümle.

JSON FORMATI (başka metin ekleme; actions HER ZAMAN boş dizi, monthly_income YOK):
{
  "actions": [],
  "portfolio_diagnosis": "…",
  "market_outlook": "…",
  "news_alerts": ["…"],
  "wealth_building_tip": "…"
}`;

  const userPrompt = `${portfolioContext}

${marketContext}

Yukarıdaki verilerle bugünkü brifingi hazırla. İşlem önerme, maaş hesaplama; rakamları açıkla, piyasayı özetle.`;

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
      max_tokens: 3000,   // 2026-09-22: AI küçültüldü (açıklama+özet), aksiyon/JSON şişmesi yok
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
