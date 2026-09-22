// AI KATMANI — TEK BAĞLAM, TEK KURAL (2026-09-22, kullanıcı kararı: "küçült, işlem önerisi yok")
// Sohbet (api/chat.ts), günlük rapor (api/cron/daily-report.ts) ve plan (api/daily-plan.ts) buradan beslenir.
// Rakamlar EUR motorundan (api/lib/eurEngine = uygulamayla aynı fonksiyon); AI rakam ÜRETMEZ, açıklar.
import type { SupabaseClient } from '@supabase/supabase-js';
import { loadEurSummary, fetchAll, fmtEUR, fmtSignedEUR, monthLabelTR, type EurSummary } from './eurEngine.js';
import { TARGET_ALLOCATION, PHYSICAL_FIXED_TYPES } from '../../src/config/portfolioPolicy.js';
import { POOL_CAP_EUR, MONTHLY_CAP_EUR } from '../../src/lib/eurPnl.js';

export const AI_RULES = `ROLÜN: portföy AÇIKLAYICISI ve bilgi kaynağısın — portföy YÖNETİCİSİ değilsin.
YAPACAKLARIN: rakamları açıkla (neden bu ay eksi/artı, hangi varlık ne yaptı), piyasa/haber özetini Türkçe ver, anomali bildir
(bayat fiyat, atlanmış haftalık dilim, eski kur serisi, kayıtsız temettü/itfa), kullanıcının sorusunu somut rakamla yanıtla.
YAPMAYACAKLARIN (KESİN):
- Alım/satım/trim/rebalans/"şunu artır, bunu azalt" ÖNERME. Tek plan sabittir ve aşağıda yazar; sen onu tekrar edersin, değiştirmezsin.
  Kullanıcı "ne alayım?" derse cevap: tek planın bu haftaki dilimi (aşağıda). Başka araç/sembol önerme (IB01 dahil).
- Maaş/kâr HESAPLAMA. Rakamlar motorun; sen aynen kullanırsın. "Güvenli/dengeli maaş", "$ hedef", "SWR ile" gibi kendi formülün YOK.
- TL/USD nominal kârı kâr gibi sunma; kur artışı kâr DEĞİL. Tek ölçü EUR.
- Fiziki altın satılmaz; BIST/TEFAS'a taze para konmaz; geçmiş işlemlere "hata" deme.
- Uydurma; verisi olmayan konuda "elimde veri yok" de. Türkçe, kısa, somut.`;

export interface WeekPlanRow { symbol: string; label: string; sharePct: number; amountEUR: number; instruction: string }
export interface AiContext { text: string; eur: EurSummary; weekPlan: WeekPlanRow[]; anomalies: string[]; trancheEUR: number }

type H = { symbol: string; asset_type: string; currency: string | null; quantity: number; current_price: number; purchase_price: number };

export async function buildAiContext(supabase: SupabaseClient, todayStr: string): Promise<AiContext> {
  const [eur, holdRes, cashRes] = await Promise.all([
    loadEurSummary(supabase, todayStr),
    supabase.from('holdings').select('symbol,asset_type,currency,quantity,current_price,purchase_price'),
    supabase.from('cash_balances').select('currency,balance').gt('balance', 0),
  ]);
  if (holdRes.error) throw new Error(`aiContext holdings: ${holdRes.error.message}`);
  const holdings = (holdRes.data || []) as H[];
  const E = eur.eurRate || 1, U = eur.usdRate || E / 1.15;
  const fx = (c: string | null) => { const cur = String(c || 'TRY').toUpperCase(); return cur === 'USD' ? U : cur === 'EUR' ? E : 1; };
  const valEUR = (h: H) => (Number(h.quantity) || 0) * (Number(h.current_price) || 0) * fx(h.currency) / E;
  const total = holdings.reduce((s, h) => s + valEUR(h), 0);
  const byType: Record<string, number> = {};
  for (const h of holdings) byType[h.asset_type] = (byType[h.asset_type] || 0) + valEUR(h);

  // TEK PLAN: açıklar → dilim bölünmesi (uygulama RebalancePlan ve panel rubLane ile aynı formül)
  const gap = (t: string) => Math.max(0, total * (TARGET_ALLOCATION[t]?.target ?? 0) / 100 - (byType[t] || 0));
  const stGap = gap('stock'), ebGap = gap('eurobond');
  const v3 = stGap + ebGap > 0 ? Math.round(100 * stGap / (stGap + ebGap)) : 50;
  const trancheEUR = 1650;   // haftalık ~$2.000 ruble dilimi ≈ €1.650 (panel RUB_WEEKLY_USD)
  const weekPlan: WeekPlanRow[] = [
    { symbol: 'V3YL', label: 'Kuzey Amerika hisse ETF', sharePct: v3, amountEUR: Math.round(trancheEUR * v3 / 100), instruction: `Bu haftaki dilimin %${v3}'i → V3YL (Revolut)` },
    { symbol: 'XEON', label: 'Euro kısa vade (güvenli bacak)', sharePct: 100 - v3, amountEUR: Math.round(trancheEUR * (100 - v3) / 100), instruction: `Bu haftaki dilimin %${100 - v3}'i → XEON (Revolut)` },
  ];
  const cashEUR = byType['currency'] || 0;
  const kasa = (cashRes.data || []).map((c: { currency: string; balance: number }) => `${c.currency} ${Math.round(Number(c.balance)).toLocaleString('tr-TR')}`).join(', ');

  // Anomaliler (AI'nın bildireceği, kendi üretmeyeceği)
  const anomalies: string[] = [];
  if (!eur.health.ok) anomalies.push(`Kur serisi ${eur.health.lastEurRateDay}'de bitiyor, snapshot ${eur.health.lastSnapDay} — EUR rakamları güvenilmez olabilir.`);
  if (eur.asOf !== todayStr) anomalies.push(`Bugünün snapshot'ı yok; rakamlar ${eur.asOf} kapanışına ait.`);
  // Bayat fiyat = fiyatın GERÇEKTEN değişmediği gün sayısı (price_history), updated_at değil (cron o sütunu güncellemiyor)
  const since = new Date(Date.now() - 45 * 86400000).toISOString();
  // fetchAll: PostgREST max_rows=1000 tavanı (45 gün × 26 sembol > 1000 satır) — tek .range() kesiyordu
  const phRows = await fetchAll<{ symbol: string; price: number; recorded_at: string }>('price_history', () => supabase.from('price_history').select('symbol,price,recorded_at').gte('recorded_at', since).order('recorded_at', { ascending: true }).order('id', { ascending: true }));
  const lastChange = new Map<string, string>(); const lastPrice = new Map<string, number>(); const firstSeen = new Map<string, string>();
  for (const r of phRows) {
    const d = String(r.recorded_at).slice(0, 10); const pr = Number(r.price);
    if (!firstSeen.has(r.symbol)) { firstSeen.set(r.symbol, d); lastChange.set(r.symbol, d); lastPrice.set(r.symbol, pr); continue; }
    if (Math.abs(pr - (lastPrice.get(r.symbol) ?? pr)) > 1e-9) { lastChange.set(r.symbol, d); lastPrice.set(r.symbol, pr); }
  }
  const now = Date.now();
  for (const h of holdings) {
    if (h.asset_type === 'currency' || valEUR(h) < 500) continue;
    const lc = lastChange.get(h.symbol); if (!lc) continue;
    const days = Math.round((now - new Date(lc + 'T00:00:00Z').getTime()) / 86400000);
    if (days > 10 && firstSeen.get(h.symbol) !== lc) anomalies.push(`${h.symbol} fiyatı ${days} gündür değişmemiş (€${Math.round(valEUR(h)).toLocaleString('de-DE')}) — elle güncelle.`);
  }
  if (holdings.some(h => h.symbol === 'US900123CJ75')) anomalies.push('US900123CJ75 (Türkiye %4,25 kupon, 14 Nis 2026 vadeli) itfa olmuş görünüyor ama pozisyon açık — ekstre kontrolü.');

  const alloc = Object.keys(TARGET_ALLOCATION).map(t => `${t}: %${(100 * (byType[t] || 0) / total).toFixed(0)} → hedef %${TARGET_ALLOCATION[t].target}${PHYSICAL_FIXED_TYPES.has(t) ? ' (fiziki, satılmaz)' : ''}`).join(' · ');
  const top = [...holdings].sort((a, b) => valEUR(b) - valEUR(a)).slice(0, 15)
    .map(h => `${h.symbol} (${h.asset_type}): €${Math.round(valEUR(h)).toLocaleString('de-DE')}, ağırlık %${(100 * valEUR(h) / total).toFixed(1)}`).join('\n');
  const m = eur.mtd, lf = eur.lastFull;

  const text = `PORTFÖY (${todayStr}, tek ölçü EUR, kasa hariç):
Servet: ${fmtEUR(eur.wealthEUR)} (≈ ₺${Math.round(eur.wealthTRY).toLocaleString('tr-TR')}, EUR/TRY ${E.toFixed(2)})
Kâr: son gün ${fmtSignedEUR(eur.dayGainEUR)} (%${eur.dayGainPct.toFixed(2)}) · son 7 gün ${fmtSignedEUR(eur.weekGainEUR)} · bu ay (${m ? monthLabelTR(m.month) : '—'}) nominal ${fmtSignedEUR(m?.gainEUR || 0)}, enflasyon payı −${fmtEUR(m?.inflationEUR || 0)}, reel ${fmtSignedEUR(m?.realGainEUR || 0)}
Geçen ay (${lf ? monthLabelTR(lf.month) : '—'}): nominal ${fmtSignedEUR(lf?.gainEUR || 0)}, reel ${fmtSignedEUR(lf?.realGainEUR || 0)}
KÂR HAVUZU (kapanmış aylardan): ${fmtSignedEUR(eur.poolEUR)} · ŞU AN ÇEKİLEBİLİR MAAŞ: ${fmtEUR(eur.entitlementEUR)} (havuz × 0,85, aylık tavan €${MONTHLY_CAP_EUR}, havuz tavanı €${POOL_CAP_EUR}) · bu ay biriken → ay kapanınca hak
Kâr tanımı: euro servet artışı − para giriş/çıkışı; kur hareketi kâr değil. Enflasyon payı %2/yıl servetten düşülür. Zarar devreder.
Ömür boyu (kuruluştan) kâr ≈ +€18k, neredeyse tamamı Nisan 2026 ÖNCESİNDE; Nisan'dan beri portföy euro bazında yaklaşık yatay.

DAĞILIM vs HEDEF: ${alloc}
Getirisiz nakit: ${fmtEUR(cashEUR)} (%${(100 * cashEUR / total).toFixed(0)}) — asıl "ölü sermaye" budur.
KASA (portföy DIŞI, yastık): ${kasa || 'yok'}

TEK PLAN (SABİT — kullanıcı onayı 2026-09-20): her Pazartesi ruble → ~$2.000 → Revolut → euro → %${v3} V3YL + %${100 - v3} XEON (açıklara oranlı; bu hafta ≈ €${weekPlan[0].amountEUR} V3YL + €${weekPlan[1].amountEUR} XEON). Sıra: EURO nakit → ruble → USD nakit. Dokunulmaz: altın, mevcut IB01/eurobondlar, BTC, mevcut TEFAS fonları. IB01 yeni ALINMAZ (dolar; euro ölçüsünde XEON ile aynı beklenen getiri, 60× kur oynaklığı). Satış rotasyonu durduruldu (21.08).
Hedef gerçeği: €1.000/ay maaş için 40 yıl ufkunda €370-470k sermaye gerekir; bugünkü kural bu portföyden ~€150-250/ay verir. Bunu yumuşatma, olduğu gibi söyle.

POZİSYONLAR (EUR, ilk 15):
${top}

ANOMALİLER: ${anomalies.length ? anomalies.join(' | ') : 'yok'}`;

  return { text, eur, weekPlan, anomalies, trancheEUR };
}
