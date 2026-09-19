import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { requireCronAuth } from '../lib/auth.js';
import { sendPushToAll } from '../lib/push.js';
import { loadEurModel, fmtEUR, fmtSignedEUR, fmtSignedPct } from '../lib/eurEngine.js';

// RİSK MONİTÖRÜ — eşikler EUR (2026-09-19): portföy düşüşü = motorun akış düzeltilmiş EUR kârı (TL nominal değil;
// TL'de kur artışı 'yükseliş', düşüşü 'çöküş' gibi görünüyordu). Pozisyon tutarları bugünkü kurla EUR.

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

  if (requireCronAuth(req, res)) return;

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
    const eurH = holdings.find((h: any) => (h.symbol === 'EURO' || h.symbol === 'EUR') && h.asset_type === 'currency');
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

    // 2. Portföy düşüşü — EUR motoru (son snapshot günü ve son 7 gün, akış düzeltilmiş)
    const today = new Date().toISOString().split('T')[0];
    let eurRateNow = eurRate;
    try {
      const model = await loadEurModel(supabase);
      const d = model.daily; const n = d.length;
      if (n >= 2) {
        const last = d[n - 1], prev = d[n - 2];
        eurRateNow = last.eurRate || eurRate;
        const dailyChangePct = prev.wealthEUR > 0 ? (last.gainEUR / prev.wealthEUR) * 100 : 0;
        if (dailyChangePct <= -5) {
          alerts.push({
            type: 'critical',
            title: 'PORTFÖY KRİTİK DÜŞÜŞ',
            detail: `${last.date}: ${fmtSignedEUR(last.gainEUR)} (${fmtSignedPct(dailyChangePct)}). Servet ${fmtEUR(prev.wealthEUR)} → ${fmtEUR(last.wealthEUR)}`,
            action: 'Acil değerlendirme yap. Panik satışı yapma ama stop-loss seviyelerini kontrol et.',
          });
        } else if (dailyChangePct <= -3) {
          alerts.push({
            type: 'warning',
            title: 'Portföy önemli düşüş',
            detail: `${last.date}: ${fmtSignedEUR(last.gainEUR)} (${fmtSignedPct(dailyChangePct)})`,
            action: 'Düşüşün sebebini araştır. Temel değişiklik yoksa pozisyonları koru.',
          });
        }
        // Haftalık drawdown (son 7 takvim günü)
        const from = new Date(last.date + 'T00:00:00Z'); from.setUTCDate(from.getUTCDate() - 7);
        const fromStr = from.toISOString().slice(0, 10);
        const idx = d.findIndex(x => x.date > fromStr);
        if (idx >= 0) {
          const start = Math.max(idx, 1);
          const base = d[start - 1].wealthEUR;
          let wk = 0; for (let i = start; i < n; i++) wk += d[i].gainEUR;
          const weeklyPct = base > 0 ? (wk / base) * 100 : 0;
          if (weeklyPct <= -10) {
            alerts.push({
              type: 'critical',
              title: 'HAFTALIK DRAWDOWN KRİTİK',
              detail: `Son 7 günde ${fmtSignedEUR(wk)} (${fmtSignedPct(weeklyPct)})`,
              action: 'Savunma moduna geç. Riskli pozisyonları azalt.',
            });
          }
        }
      }
      if (!model.health.ok) {
        alerts.push({ type: 'warning', title: 'Kur serisi güncel değil', detail: `EUR/USD kur serisi ${model.health.lastEurRateDay}'de bitiyor, snapshot ${model.health.lastSnapDay}. EUR kâr/maaş rakamları güvenilmez.`, action: 'daily-snapshot cron\'unun exchange_rates yazdığını kontrol et.' });
      }
    } catch (e: any) {
      alerts.push({ type: 'warning', title: 'EUR motoru çalışmadı', detail: String(e?.message || e), action: 'Cron loglarına bak.' });
    }
    const toEUR = (tl: number) => (eurRateNow > 0 ? tl / eurRateNow : 0);

    // 3. Tek pozisyon %20+ kayıp
    for (const h of holdings) {
      const value = valTRY(h);
      const cost = valTRY(h, 'purchase_price');
      const pnlPct = cost > 0 ? ((value - cost) / cost) * 100 : 0;

      // % yerel para nominal (TL pozisyonda kur/enflasyon düşülmemiş — EUR bazlı pozisyon K/Z ayrı iş); tutarlar bugünkü kurla EUR
      if (pnlPct <= -20 && toEUR(value) > 200) {
        alerts.push({
          type: 'warning',
          title: `${h.symbol} ağır kayıpta`,
          detail: `${fmtSignedPct(pnlPct)} nominal (${fmtSignedEUR(toEUR(value - cost))}). Maliyet ${fmtEUR(toEUR(cost))} → Değer ${fmtEUR(toEUR(value))}`,
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
          detail: `Portföyün %${weight.toFixed(1)}'i tek varlıkta (${fmtEUR(toEUR(value))})`,
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

      // Web Push: uygulama kapalıyken de uyarı düşsün (abone yoksa no-op)
      const critical = alerts.filter(a => a.type === 'critical');
      const top = critical[0] || alerts[0];
      await sendPushToAll({
        title: critical.length > 0
          ? `🚨 ${critical.length} kritik risk uyarısı`
          : `⚠️ ${alerts.length} risk uyarısı`,
        body: `${top.title}: ${top.detail}`.slice(0, 180),
        url: '/daily-report',
        tag: 'risk-monitor',
      }).catch((e) => console.error('[push] gönderim hatası:', e));
    }

    return res.status(200).json({
      success: true,
      portfolio_value_eur: toEUR(totalValue),
      portfolio_value_try: totalValue,
      total_alerts: alerts.length,
      critical: alerts.filter(a => a.type === 'critical').length,
      warnings: alerts.filter(a => a.type === 'warning').length,
      alerts,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
}
