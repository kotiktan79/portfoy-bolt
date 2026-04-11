import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Supabase credentials missing');
  return createClient(url, key);
}

interface DividendInfo {
  symbol: string;
  market: string;
  dividend_yield: number;
  annual_dividend: number;
  ex_date: string | null;
  pay_date: string | null;
  in_portfolio: boolean;
  estimated_income_try: number;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers.authorization !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const supabase = getSupabase();
    const dividends: DividendInfo[] = [];

    // Portföydeki holding'ler
    const { data: holdings } = await supabase.from('holdings').select('symbol, asset_type, quantity, current_price');
    const holdingMap = new Map(holdings?.map(h => [h.symbol.toUpperCase(), h]) || []);

    // USD/TRY kuru
    let usdTry = 38;
    try {
      const fxRes = await fetch('https://open.er-api.com/v6/latest/USD', { signal: AbortSignal.timeout(5000) });
      if (fxRes.ok) { const d = await fxRes.json(); usdTry = d.rates?.TRY || 38; }
    } catch { /* skip */ }

    // ============================================
    // 1. ABD Temettü Hisseleri
    // ============================================
    const usDividendStocks = [
      ...Array.from(holdingMap.keys()).filter(s => !['BTC', 'ETH', 'SOL', 'BNB', 'LINK', 'XRP', 'ADA', 'AVAX', 'DOT', 'DOGE', 'SUI'].includes(s)),
      'KO', 'JNJ', 'PG', 'O', 'SCHD', 'VZ', 'T', 'ABBV', 'MCD', 'JPM',
    ];
    const uniqueUS = [...new Set(usDividendStocks)].filter(s => /^[A-Z]{2,5}$/.test(s));

    try {
      const symbols = uniqueUS.slice(0, 20).join(',');
      const yahooRes = await fetch(
        `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${symbols}&fields=regularMarketPrice,trailingAnnualDividendRate,trailingAnnualDividendYield,dividendDate,exDividendDate`,
        { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(8000) }
      );
      if (yahooRes.ok) {
        const data = await yahooRes.json();
        for (const q of data?.quoteResponse?.result || []) {
          const divRate = q.trailingAnnualDividendRate || 0;
          const divYield = (q.trailingAnnualDividendYield || 0) * 100;
          if (divYield <= 0) continue;

          const holding = holdingMap.get(q.symbol.replace('.IS', ''));
          const qty = holding?.quantity || 0;
          const estimatedIncome = qty * divRate * usdTry;

          dividends.push({
            symbol: q.symbol.replace('.IS', ''),
            market: q.symbol.includes('.IS') ? 'BIST' : 'US',
            dividend_yield: divYield,
            annual_dividend: divRate,
            ex_date: q.exDividendDate ? new Date(q.exDividendDate * 1000).toISOString().split('T')[0] : null,
            pay_date: q.dividendDate ? new Date(q.dividendDate * 1000).toISOString().split('T')[0] : null,
            in_portfolio: !!holding,
            estimated_income_try: estimatedIncome,
          });
        }
      }
    } catch { /* skip */ }

    // ============================================
    // 2. BIST Temettü Hisseleri
    // ============================================
    const bistHoldings = holdings?.filter(h => h.asset_type === 'stock') || [];
    const bistSymbols = bistHoldings.map(h => h.symbol + '.IS');

    if (bistSymbols.length > 0) {
      try {
        const bistRes = await fetch(
          `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${bistSymbols.join(',')}&fields=regularMarketPrice,trailingAnnualDividendRate,trailingAnnualDividendYield`,
          { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(8000) }
        );
        if (bistRes.ok) {
          const data = await bistRes.json();
          for (const q of data?.quoteResponse?.result || []) {
            const divRate = q.trailingAnnualDividendRate || 0;
            const divYield = (q.trailingAnnualDividendYield || 0) * 100;
            if (divYield <= 0) continue;

            const sym = q.symbol.replace('.IS', '');
            const holding = holdingMap.get(sym);
            const qty = holding?.quantity || 0;

            // Mevcut temettü kaydı yoksa ekle
            if (!dividends.find(d => d.symbol === sym)) {
              dividends.push({
                symbol: sym,
                market: 'BIST',
                dividend_yield: divYield,
                annual_dividend: divRate,
                ex_date: null,
                pay_date: null,
                in_portfolio: true,
                estimated_income_try: qty * divRate,
              });
            }
          }
        }
      } catch { /* skip */ }
    }

    // ============================================
    // 3. Kripto Staking Gelirleri (tahmini)
    // ============================================
    const stakingRates: Record<string, number> = {
      ETH: 3.5, SOL: 6.5, BNB: 2.0, ADA: 3.5, DOT: 10.0, AVAX: 8.0, ATOM: 15.0,
    };

    for (const [sym, rate] of Object.entries(stakingRates)) {
      const holding = holdingMap.get(sym);
      if (holding) {
        const annualIncome = (holding.current_price || 0) * (holding.quantity || 0) * (rate / 100);
        dividends.push({
          symbol: sym,
          market: 'CRYPTO',
          dividend_yield: rate,
          annual_dividend: 0,
          ex_date: null,
          pay_date: null,
          in_portfolio: true,
          estimated_income_try: annualIncome,
        });
      }
    }

    // Toplam tahmini yıllık gelir
    const totalAnnualIncome = dividends
      .filter(d => d.in_portfolio)
      .reduce((s, d) => s + d.estimated_income_try, 0);

    // Sonuçları sırala: portföydekiler ve yüksek verimli önce
    dividends.sort((a, b) => {
      if (a.in_portfolio !== b.in_portfolio) return a.in_portfolio ? -1 : 1;
      return b.dividend_yield - a.dividend_yield;
    });

    // Upcoming dividends (önümüzdeki 30 gün)
    const now = new Date();
    const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const upcoming = dividends.filter(d => {
      if (!d.ex_date) return false;
      const exDate = new Date(d.ex_date);
      return exDate >= now && exDate <= in30Days;
    });

    // Tahmini gelir kayıtlarını income_records'a ekle (projected)
    for (const d of dividends.filter(dd => dd.in_portfolio && dd.estimated_income_try > 100)) {
      const monthlyIncome = d.estimated_income_try / 12;
      const nextMonth = new Date();
      nextMonth.setMonth(nextMonth.getMonth() + 1);
      const projectedDate = nextMonth.toISOString().split('T')[0];

      await supabase.from('income_records').upsert([{
        income_date: projectedDate,
        income_type: d.market === 'CRYPTO' ? 'staking' : 'dividend',
        source_symbol: d.symbol,
        source_asset_type: d.market === 'CRYPTO' ? 'crypto' : 'stock',
        amount: monthlyIncome,
        currency: 'TRY',
        amount_try: monthlyIncome,
        notes: `Tahmini aylık ${d.market === 'CRYPTO' ? 'staking' : 'temettü'} geliri (%${d.dividend_yield.toFixed(1)})`,
        is_projected: true,
      }], { onConflict: 'id' });
    }

    return res.status(200).json({
      success: true,
      total_dividend_stocks: dividends.length,
      portfolio_dividend_stocks: dividends.filter(d => d.in_portfolio).length,
      estimated_annual_income_try: totalAnnualIncome,
      estimated_monthly_income_try: totalAnnualIncome / 12,
      upcoming_30_days: upcoming,
      dividends,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
}
