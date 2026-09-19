// DOLAR BAZLI KÂR — TEK CETVEL (2026-09-19, kullanıcı kararı: "tutarlı istiyorum")
//
// Kural: kâr = dolar servetin ne kadar arttı. Servet zaten dolar gösteriliyor;
// kâr da aynı cetvelle ölçülür. TL kârını bugünkü kurla dolara çevirmek YANLIŞ:
// portföyün ~%90'ı (EURO/USD/altın/BTC) TL fiyatıyla kayıtlı, TL düştükçe TL
// değerleri artar ve bu "kâr" gibi görünür; dolar cinsinden hiçbir şey değişmez.
//
// Dönem kârı ($) = V1/k1 − V0/k0 − (C1−C0−R)/k1 + R/k1
//   V = total_value (TL), C = total_investment (TL), k = o günkü USD/TRY, R = realize (TL)
//   (C1−C0−R) = o dönemde giren yeni para (alım maliyeti); satışta maliyet lot bazında
//   düşer, hasılat = maliyet + R olduğu için R geri eklenir.
// Saf fonksiyonlar, DB yok. Kaynak: portfolio_snapshots + exchange_rates(USD).

export interface SnapPoint { date: string; totalValue: number; totalInvestment: number }
export interface UsdRateSeries { rateAt(date: string): number }

export function makeRateSeries(points: Array<{ date: string; rate: number }>, fallback: number): UsdRateSeries {
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

/** İki snapshot arasındaki dolar kârı. realizedTRY = aralıkta satıştan gerçekleşen kâr (TL). */
export function usdGainBetween(a: SnapPoint, b: SnapPoint, rates: UsdRateSeries, realizedTRY = 0): number {
  const ka = rates.rateAt(a.date), kb = rates.rateAt(b.date);
  const wealth = b.totalValue / kb - a.totalValue / ka;
  const newMoney = (b.totalInvestment - a.totalInvestment - realizedTRY) / kb;
  return wealth - newMoney;
}

/** Günlük seri: her snapshot günü için o günün dolar kârı. */
export function dailyUsdGains(snaps: SnapPoint[], rates: UsdRateSeries, realizedByDay: Map<string, number> = new Map()) {
  const s = [...snaps].sort((x, y) => x.date.localeCompare(y.date));
  const out: Array<{ date: string; gainUSD: number; wealthUSD: number }> = [];
  for (let i = 0; i < s.length; i++) {
    const wealthUSD = s[i].totalValue / rates.rateAt(s[i].date);
    if (i === 0) { out.push({ date: s[i].date, gainUSD: 0, wealthUSD }); continue; }
    out.push({ date: s[i].date, gainUSD: usdGainBetween(s[i - 1], s[i], rates, realizedByDay.get(s[i].date) || 0), wealthUSD });
  }
  return out;
}

/** Periyot toplama: keyFn her tarihi bir periyot anahtarına eşler (ör. 'YYYY-MM'). Kâr = periyot içindeki günlük kârların toplamı. */
export function periodUsdGains(
  daily: Array<{ date: string; gainUSD: number; wealthUSD: number }>,
  keyFn: (date: string) => string,
) {
  const map = new Map<string, { key: string; gainUSD: number; startWealthUSD: number; endWealthUSD: number; firstDate: string; lastDate: string }>();
  let prevWealth = daily.length ? daily[0].wealthUSD : 0;
  let prevKey = '';
  for (const d of daily) {
    const k = keyFn(d.date);
    if (!map.has(k)) {
      map.set(k, { key: k, gainUSD: 0, startWealthUSD: prevWealth, endWealthUSD: d.wealthUSD, firstDate: d.date, lastDate: d.date });
      if (prevKey && k !== prevKey) map.get(k)!.startWealthUSD = map.get(prevKey)!.endWealthUSD;
    }
    const row = map.get(k)!;
    if (d.date !== daily[0].date || k !== keyFn(daily[0].date)) row.gainUSD += d.gainUSD;
    row.endWealthUSD = d.wealthUSD; row.lastDate = d.date;
    prevWealth = d.wealthUSD; prevKey = k;
  }
  return Array.from(map.values()).sort((a, b) => a.key.localeCompare(b.key));
}
