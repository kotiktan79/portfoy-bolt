import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Supabase credentials missing');
  return createClient(url, key);
}

interface Alert {
  type: 'critical' | 'warning' | 'info';
  title: string;
  detail: string;
  action: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers.authorization !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const supabase = getSupabase();
    const alerts: Alert[] = [];

    // 1. Tüm holdings çek
    const { data: holdings } = await supabase.from('holdings').select('*');
    if (!holdings || holdings.length === 0) {
      return res.status(200).json({ success: true, alerts: [], message: 'No holdings' });
    }

    // FX-aware: USD/EUR pozisyonları TRY'ye çevir (EURO ₺2M, USD ₺1.5M, ASML/JNJ vb.)
    const usdH = holdings.find((h: any) => h.symbol === 'USD' && h.asset_type === 'currency');
    const eurH = holdings.find((h: any) => h.symbol === 'EURO' && h.asset_type === 'currency');
    const usdRate = Number(usdH?.current_price) > 1 ? Number(usdH.current_price) : 45;
    const eurRate = Number(eurH?.current_price) > 1 ? Number(eurH.current_price) : 51;
    const fxOf = (c: string) => {
      const cur = (c || 'TRY').toUpperCase();
      if (cur === 'USD') return usdRate;
      if (cur === 'EUR') return eurRate;
      if (cur === 'GBP') return usdRate * 1.27;
      return 1;
    };
    const valTRY = (h: any, field: 'current_price' | 'purchase_price' = 'current_price') =>
      (Number(h[field]) || 0) * (Number(h.quantity) || 0) * fxOf(h.currency); // fx-ok: valTRY helper

    const totalValue = holdings.reduce((s, h) => s + valTRY(h), 0);
    const totalInvestment = holdings.reduce((s, h) => s + valTRY(h, 'purchase_price'), 0);

    // 2. Dünkü snapshot ile karşılaştır → portföy düşüşü
    const today = new Date().toISOString().split('T')[0];
    const { data: snapshots } = await supabase
      .from('portfolio_snapshots')
      .select('*')
      .order('snapshot_date', { ascending: false })
      .limit(7);

    if (snapshots && snapshots.length >= 2) {
      const latest = snapshots[0];
      const previous = snapshots.find(s => s.snapshot_date !== today) || snapshots[1];
      const dailyChange = Number(latest.total_value) - Number(previous.total_value);
      const dailyChangePct = Number(previous.total_value) > 0
        ? (dailyChange / Number(previous.total_value)) * 100 : 0;

      if (dailyChangePct <= -5) {
        alerts.push({
          type: 'critical',
          title: 'PORTFÖY KRİTİK DÜŞÜŞ',
          detail: `Portföy %${dailyChangePct.toFixed(1)} düştü (${dailyChange.toFixed(0)} TL). Dün: ${Number(previous.total_value).toFixed(0)} TL → Bugün: ${Number(latest.total_value).toFixed(0)} TL`,
          action: 'Acil değerlendirme yap. Panik satışı yapma ama stop-loss seviyelerini kontrol et.',
        });
      } else if (dailyChangePct <= -3) {
        alerts.push({
          type: 'warning',
          title: 'Portföy önemli düşüş',
          detail: `Portföy %${dailyChangePct.toFixed(1)} düştü (${dailyChange.toFixed(0)} TL)`,
          action: 'Düşüşün sebebini araştır. Temel değişiklik yoksa pozisyonları koru.',
        });
      }

      // Haftalık drawdown
      if (snapshots.length >= 5) {
        const weekAgo = snapshots[snapshots.length - 1];
        const weeklyChange = Number(latest.total_value) - Number(weekAgo.total_value);
        const weeklyPct = Number(weekAgo.total_value) > 0
          ? (weeklyChange / Number(weekAgo.total_value)) * 100 : 0;

        if (weeklyPct <= -10) {
          alerts.push({
            type: 'critical',
            title: 'HAFTALIK DRAWDOWN KRİTİK',
            detail: `Son 7 günde %${weeklyPct.toFixed(1)} kayıp (${weeklyChange.toFixed(0)} TL)`,
            action: 'Savunma moduna geç. Riskli pozisyonları azalt.',
          });
        }
      }
    }

    // 3. Tek pozisyon %20+ kayıp
    for (const h of holdings) {
      const value = valTRY(h);
      const cost = valTRY(h, 'purchase_price');
      const pnlPct = cost > 0 ? ((value - cost) / cost) * 100 : 0;

      if (pnlPct <= -20 && value > 10000) {
        alerts.push({
          type: 'warning',
          title: `${h.symbol} ağır kayıpta`,
          detail: `%${pnlPct.toFixed(1)} kayıp (${(value - cost).toFixed(0)} TL). Maliyet: ${cost.toFixed(0)} TL → Değer: ${value.toFixed(0)} TL`,
          action: `${h.symbol} pozisyonunu değerlendir: zararı kes veya ortalama düşür.`,
        });
      }
    }

    // 4. Konsantrasyon riski — tek varlık %25+
    for (const h of holdings) {
      const value = valTRY(h);
      const weight = totalValue > 0 ? (value / totalValue) * 100 : 0;

      if (weight >= 25) {
        alerts.push({
          type: 'warning',
          title: `${h.symbol} aşırı konsantrasyon`,
          detail: `Portföyün %${weight.toFixed(1)}'i tek varlıkta (${value.toFixed(0)} TL)`,
          action: `Çeşitlendirme için ${h.symbol}'den kısmi satış düşün.`,
        });
      }
    }

    // 5. Tip bazlı dağılım riski
    const byType: Record<string, number> = {};
    for (const h of holdings) {
      const type = h.asset_type || 'other';
      byType[type] = (byType[type] || 0) + valTRY(h);
    }

    for (const [type, value] of Object.entries(byType)) {
      const pct = (value / totalValue) * 100;
      if (pct > 50) {
        const typeNames: Record<string, string> = { stock: 'Hisse', crypto: 'Kripto', currency: 'Döviz', fund: 'Fon', commodity: 'Emtia', eurobond: 'Eurobond' };
        alerts.push({
          type: 'warning',
          title: `${typeNames[type] || type} ağırlığı çok yüksek`,
          detail: `%${pct.toFixed(1)} — dağılım dengesiz`,
          action: `${typeNames[type] || type} pozisyonunu azaltıp diğer varlık sınıflarına yay.`,
        });
      }
    }

    // 6. VIX kontrolü (varsa)
    try {
      const vixRes = await fetch(
        'https://query1.finance.yahoo.com/v7/finance/quote?symbols=^VIX&fields=regularMarketPrice',
        { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(5000) }
      );
      if (vixRes.ok) {
        const vixData = await vixRes.json();
        const vix = vixData?.quoteResponse?.result?.[0]?.regularMarketPrice;
        if (vix && vix > 30) {
          alerts.push({
            type: 'warning',
            title: `VIX yüksek: ${vix.toFixed(1)}`,
            detail: 'Piyasa korku seviyesi yüksek. Volatilite artmış.',
            action: 'Yeni alım yapma. Mevcut pozisyonları koru. Nakit oranını artır.',
          });
        }
        if (vix && vix > 40) {
          alerts.push({
            type: 'critical',
            title: `VIX KRİTİK: ${vix.toFixed(1)}`,
            detail: 'Aşırı korku. Piyasa çöküşü riski.',
            action: 'Savunma modu. Riskli pozisyonları acil azalt.',
          });
        }
      }
    } catch { /* skip */ }

    // 7. Döviz kuru riski — USD/TRY ani hareket
    try {
      const { data: rates } = await supabase
        .from('exchange_rates')
        .select('*')
        .eq('from_currency', 'USD')
        .eq('to_currency', 'TRY')
        .order('recorded_at', { ascending: false })
        .limit(2);

      if (rates && rates.length >= 2) {
        const current = Number(rates[0].rate);
        const previous = Number(rates[1].rate);
        const fxChange = ((current - previous) / previous) * 100;

        if (Math.abs(fxChange) > 3) {
          alerts.push({
            type: 'warning',
            title: `USD/TRY sert hareket: %${fxChange.toFixed(1)}`,
            detail: `${previous.toFixed(2)} → ${current.toFixed(2)}`,
            action: fxChange > 0
              ? 'TL değer kaybediyor. Döviz pozisyonlarını koru.'
              : 'TL güçleniyor. Döviz alımı fırsatı olabilir.',
          });
        }
      }
    } catch { /* skip */ }

    // Sonuçları kaydet
    if (alerts.length > 0) {
      await supabase.from('daily_reports').upsert([{
        report_date: today,
        news_alerts: alerts.map(a => `[${a.type.toUpperCase()}] ${a.title}: ${a.detail}`),
      }], { onConflict: 'report_date' });
    }

    return res.status(200).json({
      success: true,
      portfolio_value: totalValue,
      total_alerts: alerts.length,
      critical: alerts.filter(a => a.type === 'critical').length,
      warnings: alerts.filter(a => a.type === 'warning').length,
      alerts,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
}
