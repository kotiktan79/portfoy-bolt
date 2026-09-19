// EURO BAZLI KÂR — TEK CETVEL (2026-09-19, standart araştırması + kullanıcı kararı)
//
// Dayanak: GIPS 2020 (dönem kârı = servet farkı − dış akış; tek raporlama para birimi),
// IAS 21 para 9 (fonksiyonel para = harcamaların yapıldığı para → kullanıcı EUR harcıyor),
// IAS 29 (TL hiperenflasyonist, nominal TL kâr geçersiz), Conceptual Framework 8.7
// (enflasyonu aşan kısım kârdır). Kullanıcı kararı 2026-09-19: tek EUR cetveli; kasa
// (cash_balances) portföy DIŞINDA; enflasyon sabit %2/yıl.
//
//   g_t (EUR) = V_t/e_t − V_{t−1}/e_{t−1} − F_t/e_t
//   V = snapshot total_value (TL), e = o günün EUR/TRY kuru
//   F_t = o gün portföye giren/çıkan para (TL) = Δmaliyet − kurDrift − realize
//     · Δmaliyet: total_investment farkı (alım maliyeti girer, satışta lot maliyeti çıkar)
//     · kurDrift: döviz cinsi pozisyonların maliyeti her gün o günkü kurla TL'ye çevrildiği
//       için kur oynayınca sıfır para girişinde sahte Δmaliyet doğar → çıkarılır
//       (5 bağımsız denetçinin ortak bulgusu, 2026-09-19)
//     · realize: satışta hasılat = lot maliyeti + realize kâr; hasılat portföyde kalır,
//       yani gerçek çıkış = Δmaliyet + realize değil → realize geri eklenir
//   Aylık nominal kâr G = Σ g_t ; enflasyon payı M = W_baş × ((1+π)^(1/12) − 1)
//   Reel kâr G^r = G − M ; zarar devri: C_m = min(0, C_{m−1} + G^r) ;
//   çekilebilir D_m = max(0, C_{m−1} + G^r) ; maaş = 0,85 × D_m

export const RELIABLE_FROM = '2026-04-06';   // EUR/USD 'api' kur serisinin başladığı gün — uygulama ve cron TEK kaynak
export const INFLATION_EUR = 0.02;           // Euro Bölgesi HICP, yıllık, sabit (kullanıcı kararı 2026-09-19)
export const ROW_CAP = 1000;                  // PostgREST max_rows — bir sorgu bu kadar satır dönerse kesilmiş demektir

export interface SnapPoint { date: string; totalValue: number; totalInvestment: number }
export interface RateSeries { rateAt(date: string): number }

export function makeRateSeries(points: Array<{ date: string; rate: number }>, fallback: number): RateSeries {
  const sorted = [...points].filter(p => p.rate > 1).sort((a, b) => a.date.localeCompare(b.date));
  return {
    rateAt(date: string): number {
      let best = 0;
      for (const p of sorted) { if (p.date <= date) best = p.rate; else break; }
      if (best > 1) return best;
      return sorted.length ? sorted[0].rate : fallback;
    },
  };
}

/** Döviz cinsi maliyetlerin kur-drift'i (TL): Σ maliyet_native × (k_t − k_{t−1}) */
export interface ForeignCost { currency: 'USD' | 'EUR'; costNative: number }
export function fxDriftTRY(costs: ForeignCost[], prevDate: string, date: string, usd: RateSeries, eur: RateSeries): number {
  let d = 0;
  for (const c of costs) {
    const s = c.currency === 'USD' ? usd : eur;
    d += c.costNative * (s.rateAt(date) - s.rateAt(prevDate));
  }
  return d;
}

export function eurGainBetween(
  a: SnapPoint, b: SnapPoint, eur: RateSeries,
  opts: { realizedTRY?: number; fxDriftTRY?: number } = {},
): number {
  const ea = eur.rateAt(a.date), eb = eur.rateAt(b.date);
  const wealth = b.totalValue / eb - a.totalValue / ea;
  const flowTRY = (b.totalInvestment - a.totalInvestment) - (opts.fxDriftTRY || 0) - (opts.realizedTRY || 0);
  return wealth - flowTRY / eb;
}

export interface DailyGain { date: string; gainEUR: number; wealthEUR: number }

export function dailyEurGains(
  snaps: SnapPoint[], eur: RateSeries,
  realizedByDay: Map<string, number>, driftByDay: Map<string, number>,
): DailyGain[] {
  const s = [...snaps].sort((x, y) => x.date.localeCompare(y.date));
  const out: DailyGain[] = [];
  for (let i = 0; i < s.length; i++) {
    const wealthEUR = s[i].totalValue / eur.rateAt(s[i].date);
    if (i === 0) { out.push({ date: s[i].date, gainEUR: 0, wealthEUR }); continue; }
    out.push({
      date: s[i].date, wealthEUR,
      gainEUR: eurGainBetween(s[i - 1], s[i], eur, { realizedTRY: realizedByDay.get(s[i].date) || 0, fxDriftTRY: driftByDay.get(s[i].date) || 0 }),
    });
  }
  return out;
}

export interface MonthRow {
  month: string; firstDate: string; lastDate: string;
  startWealthEUR: number; endWealthEUR: number;
  gainEUR: number;            // nominal
  inflationEUR: number;       // sermaye koruma payı
  realGainEUR: number;        // gain − inflation
  carryInEUR: number;         // ay başı devreden açık (≤0)
  withdrawableEUR: number;    // max(0, carryIn + realGain)
  carryOutEUR: number;        // min(0, carryIn + realGain)
  salaryEUR: number;          // 0,85 × withdrawable
}

export const SALARY_SAFETY = 0.85;

export function monthlyRows(daily: DailyGain[], annualInflation: number, safety = SALARY_SAFETY): MonthRow[] {
  const m = new Map<string, MonthRow>();
  let prevWealth = daily.length ? daily[0].wealthEUR : 0;
  const mRate = Math.pow(1 + annualInflation, 1 / 12) - 1;
  for (let i = 0; i < daily.length; i++) {
    const d = daily[i]; const k = d.date.slice(0, 7);
    if (!m.has(k)) m.set(k, { month: k, firstDate: d.date, lastDate: d.date, startWealthEUR: prevWealth, endWealthEUR: d.wealthEUR, gainEUR: 0, inflationEUR: 0, realGainEUR: 0, carryInEUR: 0, withdrawableEUR: 0, carryOutEUR: 0, salaryEUR: 0 });
    const r = m.get(k)!;
    if (i > 0) r.gainEUR += d.gainEUR;
    r.endWealthEUR = d.wealthEUR; r.lastDate = d.date; prevWealth = d.wealthEUR;
  }
  const rows = Array.from(m.values()).sort((a, b) => a.month.localeCompare(b.month));
  let carry = 0;
  for (const r of rows) {
    r.inflationEUR = r.startWealthEUR * mRate;
    r.realGainEUR = r.gainEUR - r.inflationEUR;
    r.carryInEUR = carry;
    const bal = carry + r.realGainEUR;
    r.withdrawableEUR = Math.max(0, bal); r.carryOutEUR = Math.min(0, bal);
    r.salaryEUR = safety * r.withdrawableEUR;
    carry = r.carryOutEUR;
  }
  return rows;
}

// ------------------------------------------------------------------------------------
// HAM SATIRLARDAN MODEL — uygulama (eurPnlService) ve sunucu cron'ları (api/lib/eurEngine)
// AYNI fonksiyonu çağırır; iki tarafın farklı rakam üretmesi imkânsız olsun (2026-09-19).
// ------------------------------------------------------------------------------------
export interface EurDaily extends DailyGain { totalValueTRY: number; eurRate: number; usdRate: number }
export interface EurHealth { ok: boolean; lastEurRateDay: string; lastSnapDay: string }
export interface EurModel { daily: EurDaily[]; months: MonthRow[]; health: EurHealth }

export interface EurModelInput {
  /** snapshot_date ASC, created_at DESC sıralı (gün içi son kayıt önce) — sadece reliableFrom ve sonrası */
  snapshots: Array<{ snapshot_date: string; total_value: number | string | null; total_investment: number | string | null }>;
  eurRates: Array<{ recorded_at: string; rate: number | string }>;   // source='api'
  usdRates: Array<{ recorded_at: string; rate: number | string }>;   // source='api'
  transactions: Array<{ transaction_date: string; transaction_type: string; quantity: number | string | null; total_amount: number | string | null; realized_profit?: number | string | null; holding_id: string | number | null }>;
  cashSells: Array<{ created_at: string; currency: string | null; notes: string | null }>;
  holdings: Array<{ id: string | number; currency: string | null; quantity: number | string | null; purchase_price: number | string | null; created_at: string | null }>;
  usdNow: number;            // seri boşsa yedek
  reliableFrom: string;
  annualInflation: number;
}

export function buildEurModel(inp: EurModelInput): EurModel {
  const { reliableFrom } = inp;
  // gün → en son snapshot
  const byDay = new Map<string, SnapPoint>();
  for (const s of inp.snapshots) if (!byDay.has(s.snapshot_date) && Number(s.total_value) > 0)
    byDay.set(s.snapshot_date, { date: s.snapshot_date, totalValue: Number(s.total_value), totalInvestment: Number(s.total_investment) || 0 });
  const snaps = Array.from(byDay.values()).sort((a, b) => a.date.localeCompare(b.date));
  const snapDays = snaps.map(s => s.date);

  // kur serileri (gün → son kayıt)
  const toSeries = (rows: Array<{ recorded_at: string; rate: number | string }>, fb: number) => {
    const m = new Map<string, number>(); for (const r of rows) m.set(String(r.recorded_at).slice(0, 10), Number(r.rate));
    return { series: makeRateSeries(Array.from(m, ([date, rate]) => ({ date, rate })), fb), lastDay: Array.from(m.keys()).sort().pop() || '' };
  };
  const E = toSeries(inp.eurRates, inp.usdNow * 1.15), U = toSeries(inp.usdRates, inp.usdNow);
  const eur = E.series, usd = U.series;

  // realize (TL, holding para birimine göre çevrilmiş), mükerrer elenir, snapshot gününe hizalanır
  const holds = inp.holdings;
  const ccyById = new Map<string, string>(holds.map(h => [String(h.id), String(h.currency || 'TRY').toUpperCase()]));
  const toTRY = (amt: number, ccy: string, d: string) => amt * (ccy === 'TRY' ? 1 : ccy === 'USD' ? usd.rateAt(d) : ccy === 'EUR' ? eur.rateAt(d) : 0);
  const align = (d: string) => snapDays.find(x => x >= d) || snapDays[snapDays.length - 1];
  const realizedByDay = new Map<string, number>(); const seen = new Set<string>();
  for (const c of inp.cashSells) {
    // iki not formatı: "(Kar/Zarar: 11161.92 ₺)" ve "(K/Z +272.95)"
    const m = String(c.notes || '').match(/Zarar[:\s]*\+?(-?[\d.]+)/) || String(c.notes || '').match(/K\/Z\s*\+?(-?[\d.]+)/); if (!m) continue;
    const d = String(c.created_at).slice(0, 10); const tl = toTRY(Number(m[1]), String(c.currency || 'TRY').toUpperCase(), d);
    if (!Number.isFinite(tl) || tl === 0 || d < reliableFrom) continue;
    const k = align(d); realizedByDay.set(k, (realizedByDay.get(k) || 0) + tl); seen.add(`${d}|${Math.round(tl)}`);
  }
  for (const t of inp.transactions) {
    const rp = Number(t.realized_profit) || 0; if (!rp) continue;
    const d = String(t.transaction_date).slice(0, 10); const tl = toTRY(rp, ccyById.get(String(t.holding_id)) || 'TRY', d);
    if (!Number.isFinite(tl) || tl === 0 || d < reliableFrom || seen.has(`${d}|${Math.round(tl)}`)) continue;
    const k = align(d); realizedByDay.set(k, (realizedByDay.get(k) || 0) + tl);
  }

  // DÖVİZ MALİYET TAKVİMİ: her snapshot günü için USD/EUR cinsi pozisyonların native maliyeti.
  // Drift tabanı = quantity × purchase_price (snapshot total_investment bu tabanla kurulur; cost_basis bayat olabilir).
  const foreign = holds.filter(h => ['USD', 'EUR'].includes(String(h.currency || '').toUpperCase()));
  const txByHolding = new Map<string, Array<{ d: string; dCost: number }>>();
  for (const t of inp.transactions) {
    const h = foreign.find(x => String(x.id) === String(t.holding_id)); if (!h) continue;
    const d = String(t.transaction_date).slice(0, 10);
    const q = Number(t.quantity) || 0, amt = Number(t.total_amount) || 0;
    const dCost = t.transaction_type === 'buy' ? amt : -(q * (Number(h.purchase_price) || 0));
    if (!txByHolding.has(String(h.id))) txByHolding.set(String(h.id), []);
    txByHolding.get(String(h.id))!.push({ d, dCost });
  }
  const costsOn = (date: string): ForeignCost[] => foreign.map(h => {
    let c = (Number(h.quantity) || 0) * (Number(h.purchase_price) || 0);
    for (const t of txByHolding.get(String(h.id)) || []) if (t.d > date) c -= t.dCost;
    if (String(h.created_at || '').slice(0, 10) > date) c = 0;
    return { currency: String(h.currency).toUpperCase() as 'USD' | 'EUR', costNative: Math.max(0, c) };
  });
  const driftByDay = new Map<string, number>();
  for (let i = 1; i < snaps.length; i++) {
    const prev = snaps[i - 1].date, cur = snaps[i].date;
    driftByDay.set(cur, fxDriftTRY(costsOn(prev), prev, cur, usd, eur));
  }

  const dailyRaw = dailyEurGains(snaps, eur, realizedByDay, driftByDay);
  const daily: EurDaily[] = dailyRaw.map((d, i) => ({ ...d, totalValueTRY: snaps[i].totalValue, eurRate: eur.rateAt(d.date), usdRate: usd.rateAt(d.date) }));
  const months = monthlyRows(daily, inp.annualInflation);
  const lastSnapDay = snapDays[snapDays.length - 1] || '';
  const health: EurHealth = { ok: E.lastDay >= lastSnapDay && U.lastDay >= lastSnapDay, lastEurRateDay: E.lastDay, lastSnapDay };
  return { daily, months, health };
}

/** Rapor/cron özeti: son gün, son 7 gün, bu ay (MTD), geçen tam ay (= bu ayın maaşı). Saf; tarih dışarıdan verilir. */
export interface EurSummary {
  asOf: string;                       // son snapshot günü
  prevWealthEUR: number;              // önceki snapshot günü serveti (günlük % tabanı — uygulama ve cron aynı tabanı kullanır)
  wealthEUR: number; wealthTRY: number; eurRate: number; usdRate: number;
  dayGainEUR: number; dayGainPct: number;          // son snapshot günü, önceki servete göre
  weekGainEUR: number; weekGainPct: number;        // son 7 takvim günü (akış düzeltilmiş)
  mtd: MonthRow | null;                            // içinde bulunulan ay
  lastFull: MonthRow | null;                       // bir önceki ay → salaryEUR = bu ayın maaşı
  health: EurHealth;
}
export function summarizeEur(model: EurModel, todayYM: string): EurSummary {
  const d = model.daily; const n = d.length;
  const last = n ? d[n - 1] : null; const prev = n > 1 ? d[n - 2] : null;
  const dayGainEUR = last ? last.gainEUR : 0;
  const dayGainPct = prev && prev.wealthEUR > 0 ? (dayGainEUR / prev.wealthEUR) * 100 : 0;
  let weekGainEUR = 0, weekBase = 0;
  if (last) {
    const from = new Date(last.date + 'T00:00:00Z'); from.setUTCDate(from.getUTCDate() - 7);
    const fromStr = from.toISOString().slice(0, 10);
    const idx = d.findIndex(x => x.date > fromStr);
    // seri 7 günden kısaysa (idx=0) ilk gün taban olur; ilk günün kârı tanım gereği 0
    if (idx >= 0) { const start = Math.max(idx, 1); weekBase = d[start - 1].wealthEUR; for (let i = start; i < n; i++) weekGainEUR += d[i].gainEUR; }
  }
  const prevYM = (() => { const y = Number(todayYM.slice(0, 4)), m = Number(todayYM.slice(5, 7)); const p = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`; return p; })();
  return {
    asOf: last?.date || '', prevWealthEUR: prev?.wealthEUR || 0, wealthEUR: last?.wealthEUR || 0, wealthTRY: last?.totalValueTRY || 0, eurRate: last?.eurRate || 0, usdRate: last?.usdRate || 0,
    dayGainEUR, dayGainPct, weekGainEUR, weekGainPct: weekBase > 0 ? (weekGainEUR / weekBase) * 100 : 0,
    mtd: model.months.find(m => m.month === todayYM) || null,
    lastFull: model.months.find(m => m.month === prevYM) || null,
    health: model.health,
  };
}
