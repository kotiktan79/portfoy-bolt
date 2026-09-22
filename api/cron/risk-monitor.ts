import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { requireCronAuth } from '../lib/auth.js';
import { sendPushToAll } from '../lib/push.js';
import { loadEurModel, fmtEUR, fmtSignedEUR, fmtSignedPct } from '../lib/eurEngine.js';
import { TARGET_ALLOCATION, PHYSICAL_FIXED_TYPES } from '../../src/config/portfolioPolicy.js';

const PLAN_NOTE = 'Plan sabit: satış yok, haftalık dilim V3YL + XEON devam. Bilgi amaçlı.';

// RİSK MONİTÖRÜ — eşikler EUR (2026-09-19): portföy düşüşü = motorun akış düzeltilmiş EUR kârı (TL nominal değil;
// TL'de kur artışı 'yükseliş', düşüşü 'çöküş' gibi görünüyordu). Pozisyon tutarları bugünkü kurla EUR.
// 2026-09-22: uyarılar BİLGİ verir, işlem ÖNERMEZ (tek plan sabit: her dilim V3YL + XEON; satış rotasyonu durduruldu 21.08).
// Eski 'stop-loss kontrol et / zararı kes / kısmi satış düşün / nakit artır' metinleri plan diline çevrildi;
// konsantrasyon uyarısı politikanın sınıf bantlarına bağlandı (tek varlık %25 eşiği V3YL büyüdükçe her sabah plana aykırı uyarı üretiyordu).

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
            action: `Sebebini öğren (haber/kur). ${PLAN_NOTE}`,
          });
        } else if (dailyChangePct <= -3) {
          alerts.push({
            type: 'warning',
            title: 'Portföy önemli düşüş',
            detail: `${last.date}: ${fmtSignedEUR(last.gainEUR)} (${fmtSignedPct(dailyChangePct)})`,
            action: `Sebebini öğren. ${PLAN_NOTE}`,
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
              action: `Ay sonu maaş ön izlemesi düşer (Kâr Cüzdanı). ${PLAN_NOTE}`,
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
          action: `Bilgi: yerel para nominal kayıp; EUR ölçüsü Kâr Cüzdanı'nda. ${PLAN_NOTE}`,
        });
      }
    }

    // 4. Konsantrasyon — tek varlık, sınıfının politika ÜST BANDINI (TARGET_ALLOCATION.max) aşıyorsa bilgi ver
    //    (tek plan zaten hisse bacağını tek ETF'te — V3YL — topluyor; sabit %25 eşiği plana aykırı uyarı üretiyordu)
    const invHoldings = holdings.filter((h: any) => h.asset_type !== 'cash');
    const invTotal = invHoldings.reduce((s: number, h: any) => s + valTRY(h), 0);
    for (const h of invHoldings) {
      const band = TARGET_ALLOCATION[h.asset_type]; if (!band) continue;
      const weight = invTotal > 0 ? (valTRY(h) / invTotal) * 100 : 0;
      if (weight > band.max) {
        alerts.push({
          type: 'info',
          title: `${h.symbol} tek başına ${h.asset_type} üst bandını aşıyor`,
          detail: `Portföyün %${weight.toFixed(1)}'i (${fmtEUR(toEUR(valTRY(h)))}); ${h.asset_type} bandı %${band.min}-${band.max}`,
          action: PHYSICAL_FIXED_TYPES.has(h.asset_type) ? 'Fiziki — satılmaz; diğer sınıflar büyüdükçe seyrelir.' : `Yeni dilimler açıklara oranlı gider, seyrelme kendiliğinden. ${PLAN_NOTE}`,
        });
      }
    }

    // 5. Sınıf dağılımı — politika bandı dışına çıkan sınıf (bilgi; dilim bölünmesi bunu zaten hedefler)
    const byType: Record<string, number> = {};
    for (const h of invHoldings) byType[h.asset_type || 'other'] = (byType[h.asset_type || 'other'] || 0) + valTRY(h);
    const typeNames: Record<string, string> = { stock: 'Hisse', crypto: 'Kripto', currency: 'Nakit', fund: 'Fon', commodity: 'Altın', eurobond: 'Tahvil' };
    for (const [type, value] of Object.entries(byType)) {
      const band = TARGET_ALLOCATION[type]; if (!band || !(invTotal > 0)) continue;
      const pct = (value / invTotal) * 100;
      if (pct > band.max + 10) {
        alerts.push({
          type: 'info',
          title: `${typeNames[type] || type} ağırlığı bandın çok üstünde`,
          detail: `%${pct.toFixed(1)} — hedef %${band.target} (bant %${band.min}-${band.max})`,
          action: PHYSICAL_FIXED_TYPES.has(type) ? 'Fiziki — satılmaz; seyrelme zamanla.' : type === 'currency' ? `Getirisiz nakit — haftalık dilimlerle V3YL + XEON'a gider. ${PLAN_NOTE}` : `Yeni dilim bu sınıfa gitmez, gerisi büyüdükçe seyrelir. ${PLAN_NOTE}`,
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
            action: `Bilgi: oynaklık yüksek; dilimler açıklara oranlı devam eder. ${PLAN_NOTE}`,
          });
        }
        if (vix && vix > 40) {
          alerts.push({
            type: 'critical',
            title: `VIX KRİTİK: ${vix.toFixed(1)}`,
            detail: 'Aşırı korku. Piyasa çöküşü riski.',
            action: `Bilgi: aşırı korku dönemi; plan değişmez, günlük EUR kârı Kâr Cüzdanı'nda. ${PLAN_NOTE}`,
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
              ? 'Bilgi: TL varlıkların euro değeri düşer (kur artışı kâr değil).'
              : 'Bilgi: TL varlıkların euro değeri artar; plan değişmez (BIST/TL\'ye taze para yok).',
          });
        }
      }
    } catch { /* skip */ }

    // Sonuçları kaydet — 'info' uyarıları push'a girmez (her sabah aynı bilgi bildirim olmasın)
    const notify = alerts.filter(a => a.type !== 'info');
    if (alerts.length > 0) {
      await supabase.from('daily_reports').upsert([{
        report_date: today,
        news_alerts: alerts.map(a => `[${a.type.toUpperCase()}] ${a.title}: ${a.detail}`),
      }], { onConflict: 'report_date' });

      // Web Push: uygulama kapalıyken de uyarı düşsün (abone yoksa no-op)
      const critical = notify.filter(a => a.type === 'critical');
      const top = critical[0] || notify[0];
      if (top) {
        await sendPushToAll({
          title: critical.length > 0
            ? `🚨 ${critical.length} kritik risk uyarısı`
            : `⚠️ ${notify.length} risk uyarısı`,
          body: `${top.title}: ${top.detail}`.slice(0, 180),
          url: '/daily-report',
          tag: 'risk-monitor',
        }).catch((e) => console.error('[push] gönderim hatası:', e));
      }
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
