import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { buildAiContext } from './lib/aiContext.js';
import { dayInTZ } from '../src/lib/eurPnl.js';

// "BUGÜNKÜ PLANINIZ" — 2026-09-22: AI ÇAĞRISI YOK. Eski sürüm her açılışta Claude'a "ne alayım" diye soruyordu
// (USD mantığı, $2.000 maaş, IB01/altın-trim önerileri) ve tek planla çelişiyordu. Plan sabittir ve deterministik
// üretilir (api/lib/aiContext = uygulama RebalancePlan = panel rubLane ile aynı formül). AI yalnız sohbette açıklar.

function getSupabase() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Supabase credentials missing');
  return createClient(url, key);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const todayStr = dayInTZ(new Date());   // Bükreş takvimi (uygulama ile aynı ay sınırı)
    const ctx = await buildAiContext(getSupabase(), todayStr);
    const { eur, weekPlan, anomalies, trancheEUR } = ctx;

    const actions = weekPlan.map(p => ({
      urgency: 'this_week',
      type: 'buy',
      symbol: p.symbol,
      market: 'EU',
      instruction: `${p.instruction} — ≈ €${p.amountEUR.toLocaleString('de-DE')}`,
      detail: `Tek plan (sabit): haftalık ~€${trancheEUR.toLocaleString('de-DE')} dilim, hisse/tahvil açıklarına oranlı bölünür. ${p.label}. Kaynak sırası: EURO nakit → ruble → USD nakit.`,
      amount_eur: p.amountEUR,
      amount_try: 0,
      risk: p.symbol === 'XEON' ? 'low' : 'medium',
      timeframe: 'long',
      platform: 'Revolut',
    }));

    const salary = eur.entitlementEUR;
    const mtd = eur.mtd;
    const plan = {
      actions,
      market_outlook: `Servet €${Math.round(eur.wealthEUR).toLocaleString('de-DE')} · son gün ${eur.dayGainEUR >= 0 ? '+' : '−'}€${Math.abs(Math.round(eur.dayGainEUR)).toLocaleString('de-DE')} · bu ay reel ${(mtd?.realGainEUR || 0) >= 0 ? '+' : '−'}€${Math.abs(Math.round(mtd?.realGainEUR || 0)).toLocaleString('de-DE')} · çekilebilir maaş €${Math.round(salary).toLocaleString('de-DE')}. Kâr = euro servet artışı, para giriş/çıkışı ve kur hariç.`,
      top_pick: '',                       // 'Günün Tercihi' yok — işlem çağrışımlı alan boş
      notice: anomalies.length ? anomalies[0] : 'Plan sabit: her hafta dilim, işlem önerisi yok. Ay sonu maaş hakkı Kâr Cüzdanı\'nda.',
      portfolio_diagnosis: '',
      news_alerts: anomalies,
      wealth_building_tip: '',            // sabit rakamlı ipucu kaldırıldı (motordan gelmeyen sayı yok); hedef hesabı FIRE sayfasında
      monthly_income: { safe: salary, moderate: salary, description: 'Kâr havuzu × 0,85 (motor). AI hesaplamaz.' },
      generated_at: new Date().toISOString(),
      source: 'single-plan',
    };
    return res.status(200).json({ success: true, plan });
  } catch (error: any) {
    console.error('daily-plan:', error?.message);
    return res.status(200).json({ success: false, fallback: true, error: error?.message });
  }
}
