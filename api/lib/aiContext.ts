// AI KATMANI — TEK BAĞLAM, TEK KURAL (2026-09-22, kullanıcı kararı: "küçült, işlem önerisi yok")
// Sohbet (api/chat.ts), günlük rapor (api/cron/daily-report.ts), plan (api/daily-plan.ts) ve araştırma
// (api/cron/ai-research.ts) buradan beslenir. Rakamlar EUR motorundan (api/lib/eurEngine = uygulamayla aynı
// fonksiyon); AI rakam ÜRETMEZ, açıklar. Prompt'ta elle yazılmış rakam YOK — hepsi motordan/politikadan türetilir.
import type { SupabaseClient } from '@supabase/supabase-js';
import { loadEurModel, fetchAll, fmtEUR, fmtSignedEUR, monthLabelTR, type EurSummary } from './eurEngine.js';
import { TARGET_ALLOCATION, PHYSICAL_FIXED_TYPES } from '../../src/config/portfolioPolicy.js';
import { POOL_CAP_EUR, MONTHLY_CAP_EUR, SALARY_SAFETY, summarizeEur } from '../../src/lib/eurPnl.js';

export const AI_RULES = `ROLÜN: portföy AÇIKLAYICISI ve bilgi kaynağısın — portföy YÖNETİCİSİ değilsin.
YAPACAKLARIN: rakamları açıkla (neden bu ay eksi/artı, hangi varlık ne yaptı), piyasa/haber özetini Türkçe ver,
aşağıdaki ANOMALİLER listesini aynen bildir (kendin anomali üretme), kullanıcının sorusunu somut rakamla yanıtla.
YAPMAYACAKLARIN (KESİN):
- Alım/satım/trim/rebalans/"şunu artır, bunu azalt" ÖNERME. Tek plan sabittir ve aşağıda yazar; sen onu tekrar edersin, değiştirmezsin.
  Kullanıcı "ne alayım?" derse cevap: tek planın bu haftaki dilimi (aşağıda). Başka araç/sembol önerme (IB01 dahil).
- Maaş/kâr HESAPLAMA. Rakamlar motorun; sen aynen kullanırsın. "Güvenli/dengeli maaş", "$ hedef", "SWR ile" gibi kendi formülün YOK.
  "€1.000/ay için ne gerekir?" gibi hedef hesabı sorulursa: uygulamadaki "Hedefe Ulaşma Planı" (FIRE) sayfasına yönlendir, kendi tahminini verme.
- TL/USD nominal kârı kâr gibi sunma; kur artışı kâr DEĞİL. Tek ölçü EUR.
- Fiziki altın satılmaz; BIST/TEFAS'a taze para konmaz; geçmiş işlemlere "hata" deme.
- Uydurma; verisi olmayan konuda "elimde veri yok" de. Türkçe, kısa, somut.`;

export interface WeekPlanRow { symbol: string; label: string; sharePct: number; amountEUR: number; instruction: string }
export interface AiContext { text: string; eur: EurSummary; weekPlan: WeekPlanRow[]; anomalies: string[]; trancheEUR: number }

type H = { id: string | number; symbol: string; asset_type: string; currency: string | null; quantity: number; current_price: number; purchase_price: number };

// Haftalık dilim: kullanıcının fiili pratiği ruble → ~$2.000 → Revolut (panel RUB_WEEKLY_USD ile aynı sabit)
export const WEEKLY_TRANCHE_USD = 2000;
// USD üzerinden çapraz kurlar (src/lib/fx.ts USD_CROSS ile aynı) — RUB/RON/CHF'nin TRY kur satırı yok
const USD_CROSS: Record<string, number> = { RUB: 86, RON: 4.52, CHF: 0.81, GBP: 1 / 1.27 };
// Günlük snapshot cron'u 18:00 UTC'de UTC tarihiyle yazar → o saatten önce "bugünün snapshot'ı" beklenemez
export const SNAPSHOT_CRON_UTC_HOUR = 18;
export function expectedSnapshotDay(now: Date): string {
  const d = new Date(now.getTime());
  if (d.getUTCHours() < SNAPSHOT_CRON_UTC_HOUR || (d.getUTCHours() === SNAPSHOT_CRON_UTC_HOUR && d.getUTCMinutes() < 15)) d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

const STALE_DAYS = 10;          // fiyat bu kadar gündür değişmemişse bayat
const PRICE_WINDOW_DAYS = 45;   // price_history tarama penceresi
const NO_BUY_DAYS = 28;         // panel 'Son 28 günde kayıtlı ALIM yok' ile aynı eşik

export interface PriceRow { symbol: string; price: number | string; recorded_at: string }
/** Bayat fiyat = fiyatın GERÇEKTEN değişmediği gün sayısı (price_history; cron her gün her sembole satır yazar).
 *  Pencere boyunca hiç değişmemiş fiyat da bayattır (atLeast=true: gerçek süre pencereden uzun olabilir);
 *  yalnız pencereye son STALE_DAYS içinde giren (yeni) sembol atlanır. Saf; test edilir. */
export function stalePrices(rows: PriceRow[], now: Date, staleDays = STALE_DAYS): Map<string, { days: number; atLeast: boolean }> {
  const lastChange = new Map<string, string>(); const lastPrice = new Map<string, number>(); const firstSeen = new Map<string, string>();
  for (const r of rows) {
    const d = String(r.recorded_at).slice(0, 10); const pr = Number(r.price);
    if (!firstSeen.has(r.symbol)) { firstSeen.set(r.symbol, d); lastChange.set(r.symbol, d); lastPrice.set(r.symbol, pr); continue; }
    if (Math.abs(pr - (lastPrice.get(r.symbol) ?? pr)) > 1e-9) { lastChange.set(r.symbol, d); lastPrice.set(r.symbol, pr); }
  }
  const daysAgo = (day: string) => Math.round((now.getTime() - new Date(day + 'T00:00:00Z').getTime()) / 86400000);
  const out = new Map<string, { days: number; atLeast: boolean }>();
  for (const [sym, lc] of lastChange) {
    const fs = firstSeen.get(sym)!;
    const days = daysAgo(lc);
    if (days <= staleDays) continue;
    const neverChanged = fs === lc;
    if (neverChanged && daysAgo(fs) <= staleDays) continue;   // pencereye yeni girmiş sembol
    out.set(sym, { days, atLeast: neverChanged });
  }
  return out;
}

export async function buildAiContext(supabase: SupabaseClient, todayStr: string, now: Date = new Date()): Promise<AiContext> {
  const since = new Date(now.getTime() - PRICE_WINDOW_DAYS * 86400000).toISOString();
  const buySince = new Date(now.getTime() - NO_BUY_DAYS * 86400000).toISOString().slice(0, 10);
  const [model, holdRes, cashRes, phRows, buyRes] = await Promise.all([
    loadEurModel(supabase),
    supabase.from('holdings').select('id,symbol,asset_type,currency,quantity,current_price,purchase_price').gt('quantity', 0),
    supabase.from('cash_balances').select('currency,balance').gt('balance', 0),
    // fetchAll: PostgREST max_rows=1000 tavanı (45 gün × 26 sembol > 1000 satır) — tek .range() kesiyordu
    fetchAll<{ symbol: string; price: number; recorded_at: string }>('price_history', () => supabase.from('price_history').select('symbol,price,recorded_at').gte('recorded_at', since).order('recorded_at', { ascending: true }).order('id', { ascending: true })),
    supabase.from('transactions').select('id', { count: 'exact', head: true }).eq('transaction_type', 'buy').gte('transaction_date', buySince),
  ]);
  if (holdRes.error) throw new Error(`aiContext holdings: ${holdRes.error.message}`);
  const eur = summarizeEur(model, todayStr.slice(0, 7));
  const holdings = (holdRes.data || []) as H[];
  const E = eur.eurRate || 1, U = eur.usdRate || E / 1.15;
  const fx = (c: string | null) => { const cur = String(c || 'TRY').toUpperCase(); return cur === 'USD' ? U : cur === 'EUR' ? E : USD_CROSS[cur] ? U / USD_CROSS[cur] : 1; };
  const valEUR = (h: H) => (Number(h.quantity) || 0) * (Number(h.current_price) || 0) * fx(h.currency) / E;
  // 'cash' tipi portföy dışı (uygulama RebalancePlan ile aynı) — dağılım ve dilim bölünmesi buna göre
  const inv = holdings.filter(h => h.asset_type !== 'cash');
  const total = inv.reduce((s, h) => s + valEUR(h), 0);
  const byType: Record<string, number> = {};
  for (const h of inv) byType[h.asset_type] = (byType[h.asset_type] || 0) + valEUR(h);

  // TEK PLAN: açıklar → dilim bölünmesi (uygulama RebalancePlan ve panel rubLane ile aynı formül)
  const gap = (t: string) => Math.max(0, total * (TARGET_ALLOCATION[t]?.target ?? 0) / 100 - (byType[t] || 0));
  const stGap = gap('stock'), ebGap = gap('eurobond');
  const v3 = stGap + ebGap > 0 ? Math.round(100 * stGap / (stGap + ebGap)) : 50;
  const trancheEUR = Math.round(WEEKLY_TRANCHE_USD * U / E);   // ~$2.000'in bugünkü euro karşılığı (sabit 1650 değil)
  const v3EUR = Math.round(trancheEUR * v3 / 100);
  const weekPlan: WeekPlanRow[] = [
    { symbol: 'V3YL', label: 'Kuzey Amerika hisse ETF', sharePct: v3, amountEUR: v3EUR, instruction: `Bu haftaki dilimin %${v3}'i → V3YL (Revolut)` },
    { symbol: 'XEON', label: 'Euro kısa vade (güvenli bacak)', sharePct: 100 - v3, amountEUR: trancheEUR - v3EUR, instruction: `Bu haftaki dilimin %${100 - v3}'i → XEON (Revolut)` },
  ];
  const cashEUR = byType['currency'] || 0;
  const kasa = (cashRes.data || []).map((c: { currency: string; balance: number }) => `${c.currency} ${Math.round(Number(c.balance)).toLocaleString('tr-TR')}`).join(', ');

  // Anomaliler (AI'nın bildireceği, kendi üretmeyeceği) — hepsi deterministik
  const anomalies: string[] = [];
  if (!eur.health.ok) anomalies.push(`Kur serisi ${eur.health.lastEurRateDay}'de bitiyor, snapshot ${eur.health.lastSnapDay} — EUR rakamları güvenilmez olabilir.`);
  const expected = expectedSnapshotDay(now);
  if (eur.asOf < expected) anomalies.push(`Snapshot eksik: son ${eur.asOf}, beklenen ${expected} — rakamlar ${eur.asOf} kapanışına ait.`);
  const stale = stalePrices(phRows, now);
  for (const h of inv) {
    if (h.asset_type === 'currency' || valEUR(h) < 500) continue;
    const st = stale.get(h.symbol); if (!st) continue;
    anomalies.push(`${h.symbol} fiyatı ${st.atLeast ? 'en az ' : ''}${st.days} gündür değişmemiş (€${Math.round(valEUR(h)).toLocaleString('de-DE')}) — elle güncelle.`);
  }
  if (inv.some(h => h.symbol === 'US900123CJ75')) anomalies.push('US900123CJ75 (Türkiye %4,25 kupon, 14 Nis 2026 vadeli) itfa olmuş görünüyor ama pozisyon açık — ekstre kontrolü.');
  if (!buyRes.error && (buyRes.count ?? 0) === 0) anomalies.push(`Son ${NO_BUY_DAYS} günde kayıtlı ALIM yok — haftalık dilim (V3YL + XEON) ya atlandı ya da işlenmedi.`);

  const alloc = Object.keys(TARGET_ALLOCATION).map(t => `${t}: %${(100 * (byType[t] || 0) / total).toFixed(0)} → hedef %${TARGET_ALLOCATION[t].target}${PHYSICAL_FIXED_TYPES.has(t) ? ' (fiziki, satılmaz)' : ''}`).join(' · ');
  const top = [...inv].sort((a, b) => valEUR(b) - valEUR(a)).slice(0, 15)
    .map(h => `${h.symbol} (${h.asset_type}): €${Math.round(valEUR(h)).toLocaleString('de-DE')}, ağırlık %${(100 * valEUR(h) / total).toFixed(1)}`).join('\n');
  const m = eur.mtd, lf = eur.lastFull;
  // Güvenilir seriden (RELIABLE_FROM, Nisan 2026) bu yana toplam — motorun kapanmış+açık ay satırlarından
  const sinceStart = model.months.length ? model.months[0].month : '';
  const sinceNominal = model.months.reduce((s, r) => s + r.gainEUR, 0);
  const sinceReal = model.months.reduce((s, r) => s + r.realGainEUR, 0);
  const nextYM = (() => { const y = Number(todayStr.slice(0, 4)), mo = Number(todayStr.slice(5, 7)); return mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, '0')}`; })();
  // Havuz/maaş cümleleri Telegram (api/lib/telegram.ts) ve Kâr Cüzdanı ile AYNI mantık: devreden, sıfırlama, ön izleme
  const carryIn = m?.carryInEUR ?? eur.poolEUR;
  const poolLines = [
    `KÂR HAVUZU (kapanmış aylardan): ${fmtSignedEUR(eur.poolEUR)} · ŞU AN ÇEKİLEBİLİR MAAŞ: ${fmtEUR(eur.entitlementEUR)} (havuz × ${String(SALARY_SAFETY).replace('.', ',')}, aylık tavan ${fmtEUR(MONTHLY_CAP_EUR)}, havuz tavanı ${fmtEUR(POOL_CAP_EUR)})`,
    m?.carryResetApplied
      ? `Bu ay (${monthLabelTR(m.month)}) devreden açık SIFIRLANDI (Nisan 2026 öncesi kâr yastığı kuralı, kullanıcı kararı 2026-09-20): eski açık devretmez, maaş bu aydan itibaren yeni kârdan.`
      : carryIn < 0
        ? `Bu aya devreden açık: ${fmtSignedEUR(carryIn)} — önce bu kapanır, sonra maaş oluşur. Zarar devreder.`
        : `Bu aya devreden havuz: ${fmtSignedEUR(carryIn)}. Zarar devreder, havuz tavana (${fmtEUR(POOL_CAP_EUR)}) kadar devreder.`,
    `${monthLabelTR(nextYM)} maaş ÖN İZLEME (bu ayın birikimi ay kapanınca hak olur, ay sonuna kadar değişir): ${fmtEUR(m?.salaryEUR || 0)}${m?.withdrawnEUR ? ` · bu ay çekilen ${fmtEUR(m.withdrawnEUR)}` : ''}`,
  ].join('\n');

  const text = `PORTFÖY (${todayStr}, tek ölçü EUR, kasa hariç):
Servet: ${fmtEUR(eur.wealthEUR)} (≈ ₺${Math.round(eur.wealthTRY).toLocaleString('tr-TR')}, EUR/TRY ${E.toFixed(2)}) · son snapshot ${eur.asOf}
Kâr: son gün ${fmtSignedEUR(eur.dayGainEUR)} (%${eur.dayGainPct.toFixed(2)}) · son 7 gün ${fmtSignedEUR(eur.weekGainEUR)} · bu ay (${m ? monthLabelTR(m.month) : '—'}) nominal ${fmtSignedEUR(m?.gainEUR || 0)}, enflasyon payı −${fmtEUR(m?.inflationEUR || 0)}, reel ${fmtSignedEUR(m?.realGainEUR || 0)}
Geçen ay (${lf ? monthLabelTR(lf.month) : '—'}): nominal ${fmtSignedEUR(lf?.gainEUR || 0)}, reel ${fmtSignedEUR(lf?.realGainEUR || 0)}
Güvenilir seri başından (${sinceStart ? monthLabelTR(sinceStart) : '—'}) bu yana: nominal ${fmtSignedEUR(sinceNominal)}, reel ${fmtSignedEUR(sinceReal)} (öncesi için günlük veri yok — rakam verme)
${poolLines}
Kâr tanımı: euro servet artışı − para giriş/çıkışı; kur hareketi kâr değil. Enflasyon payı %2/yıl servetten düşülür.

DAĞILIM vs HEDEF: ${alloc}
Getirisiz nakit: ${fmtEUR(cashEUR)} (%${(100 * cashEUR / total).toFixed(0)}) — asıl "ölü sermaye" budur.
KASA (portföy DIŞI, yastık): ${kasa || 'yok'}

TEK PLAN (SABİT — kullanıcı onayı 2026-09-20): her dilim %${v3} V3YL + %${100 - v3} XEON (hisse/tahvil açıklarına oranlı; bu hafta ≈ ${fmtEUR(weekPlan[0].amountEUR)} V3YL + ${fmtEUR(weekPlan[1].amountEUR)} XEON, dilim ≈ $${WEEKLY_TRANCHE_USD.toLocaleString('tr-TR')} ≈ ${fmtEUR(trancheEUR)}). Kaynak sırası: EURO nakit → ruble (haftalık ~$${WEEKLY_TRANCHE_USD.toLocaleString('tr-TR')} → Revolut) → USD nakit. Dokunulmaz: altın, mevcut IB01/eurobondlar, BTC, mevcut TEFAS fonları. IB01 yeni ALINMAZ (dolar; euro ölçüsünde XEON ile aynı beklenen getiri, çok daha yüksek kur oynaklığı). Satış rotasyonu durduruldu (21.08).

POZİSYONLAR (EUR, ilk 15):
${top}

ANOMALİLER: ${anomalies.length ? anomalies.join(' | ') : 'yok'}`;

  return { text, eur, weekPlan, anomalies, trancheEUR };
}
