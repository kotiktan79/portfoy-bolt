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
