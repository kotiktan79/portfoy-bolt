// ÖLÇÜ KARŞILAŞTIRMA — 2026-10-07
//
// Kullanıcı itirazı: "euro güçlendiyse nasıl euro düşüyor, kabul etmiyorum bu hesabı."
// İtiraz haklı bir yere temas ediyor: euro cetveli, varlıkların kendi performansını kur hareketiyle
// gölgeliyor. 6 ayda performans +€7.227 iken euro cetveli +€1.482 gösterdi; fark €5.744 kur.
// Hesap YANLIŞ DEĞİL (üç ayrı yöntemle doğrulandı), ama tek ölçü tek soruyu cevaplıyor.
//
// Bu servis AYNI dönemi DÖRT ölçüyle yan yana koyar. Hiçbirini "doğru" ilan etmez; karar kullanıcının.
// Ana ekrandaki kurala DOKUNMAZ — maaş hâlâ eurPnl.ts'teki kilitli kuralla hesaplanır.
import { MONTHLY_CAP_EUR, type MonthRow } from './eurPnl';

/** Düzleştirilmiş çekim oranı önerisi: hedef dağılımın beklenen REEL getirisi %3,2 → altında kalmak sermayeyi korur. */
export const SMOOTHED_RATE = 0.03;
/** Düzleştirme penceresi (ay). Kur ve piyasa gürültüsü bu pencerede birbirini götürür. */
export const SMOOTH_WINDOW = 12;

export interface MeasureRow {
  month: string;
  /** 1) ESKİ ÖLÇÜ: uygulamanın maliyet-bazlı kârı (değer − maliyet), TL. Ayın farkı. */
  tlPnlDelta: number | null;
  /** 2) EURO CETVELİ (bugünkü kural): nominal euro kazanç. */
  eurGain: number;
  /** 2b) aynı kuralın reel hâli ve o ay doğan maaş. */
  eurReal: number;
  eurSalary: number;
  /** 3) KUR-NÖTR: kurlar ay başındaki seviyede kalsaydı oluşacak euro kazanç (YAKLAŞIK, bkz. note). */
  fxNeutral: number | null;
  /** kur-nötr ile euro cetveli arasındaki fark = o ayın kur payı. */
  fxShare: number | null;
  /** 4) DÜZLEŞTİRİLMİŞ ÇEKİM: o ay bu kural ne verirdi. */
  smoothedSalary: number;
  /** ay sonu euro serveti (düzleştirmenin tabanı). */
  endWealthEUR: number;
}

export interface MeasureCompare {
  rows: MeasureRow[];
  totals: {
    tlPnlDelta: number; eurGain: number; eurSalaryPaid: number;
    fxNeutral: number; fxShare: number; smoothedPaid: number;
  };
  /** Bugünkü servetle düzleştirilmiş kuralın vereceği aylık tutar. */
  smoothedNow: number;
  /** €1.000/ay için gereken servet (düzleştirilmiş kural). */
  wealthForCap: number;
  /** Ölçülerin hangi varsayımla yaklaşık olduğunu ekranda yazmak için. */
  notes: string[];
}

export interface SnapRow { snapshot_date: string; total_value: number; total_investment: number }
export interface RateRow { day: string; rate: number }

/** Ay sonu (o ay için son) snapshot ve kur. */
function monthEnds(snaps: SnapRow[], rates: RateRow[]) {
  const lastSnap = new Map<string, SnapRow>();
  for (const s of snaps) lastSnap.set(s.snapshot_date.slice(0, 7), s);          // sıralı geldiği için son kazanır
  const rateAt = (day: string): number | null => {
    let r: number | null = null;
    for (const x of rates) { if (x.day <= day) r = Number(x.rate); else break; }
    return r && r > 0 ? r : null;
  };
  return { lastSnap, rateAt };
}

/** SAF ÇEKİRDEK: motorun ayları + ham snapshot/kur → dört ölçü yan yana. IO yok. */
export function computeMeasureCompare(months: MonthRow[], snaps: SnapRow[], rates: RateRow[]): MeasureCompare {
  const { lastSnap, rateAt } = monthEnds(snaps, rates);
  const rows: MeasureRow[] = [];
  const wealthHistory: number[] = [];
  let salesMonth = false;

  for (const m of months) {
    const prevMonth = prevYm(m.month);
    const sNow = lastSnap.get(m.month), sPrev = lastSnap.get(prevMonth);

    // 1) ESKİ ÖLÇÜ — maliyet-bazlı kâr farkı (TL)
    const pnlNow = sNow ? Number(sNow.total_value) - Number(sNow.total_investment) : null;
    const pnlPrev = sPrev ? Number(sPrev.total_value) - Number(sPrev.total_investment) : null;
    const tlPnlDelta = pnlNow != null && pnlPrev != null ? pnlNow - pnlPrev : null;

    // 3) KUR-NÖTR — kurlar ay başında sabitlenirse
    //    F_TL (motorun arındırdığı akış) = e_end × ((W_end − W_start) − gainEUR)
    //    fxNeutral = (V_end − V_start − F_TL) / e_start
    let fxNeutral: number | null = null;
    const eEnd = sNow ? rateAt(sNow.snapshot_date) : null;
    const eStart = sPrev ? rateAt(sPrev.snapshot_date) : null;
    if (sNow && sPrev && eEnd && eStart) {
      const flowTL = eEnd * ((m.endWealthEUR - m.startWealthEUR) - m.gainEUR);
      fxNeutral = (Number(sNow.total_value) - Number(sPrev.total_value) - flowTL) / eStart;
    }

    // 4) DÜZLEŞTİRİLMİŞ ÇEKİM — o aya KADARKİ servet ortalaması (ileriye bakmaz)
    const win = wealthHistory.slice(-SMOOTH_WINDOW);
    const base = win.length ? win.reduce((a, b) => a + b, 0) / win.length : m.startWealthEUR;
    const smoothedSalary = Math.min(MONTHLY_CAP_EUR, (base * SMOOTHED_RATE) / 12);

    rows.push({
      month: m.month, tlPnlDelta,
      eurGain: m.gainEUR, eurReal: m.realGainEUR, eurSalary: m.salaryEUR,
      fxNeutral, fxShare: fxNeutral == null ? null : m.gainEUR - fxNeutral,
      smoothedSalary, endWealthEUR: m.endWealthEUR,
    });
    wealthHistory.push(m.endWealthEUR);
    if (tlPnlDelta != null && pnlNow != null && pnlPrev != null && tlPnlDelta < 0 && m.gainEUR > 0) salesMonth = true;
  }

  const sum = (f: (r: MeasureRow) => number | null) => rows.reduce((t, r) => t + (f(r) ?? 0), 0);
  const lastWin = wealthHistory.slice(-SMOOTH_WINDOW);
  const baseNow = lastWin.length ? lastWin.reduce((a, b) => a + b, 0) / lastWin.length : 0;

  const notes = [
    'Kur-nötr sütunu YAKLAŞIKTIR: euro dışı her varlığı TL sayar, dolar pozisyonlarının kendi çapraz hareketini performansa yazar (≈%3-5 hata payı).',
    'Eski ölçü (TL maliyet-bazlı) satış yapılan ayda eksik görünür: unrealize kâr kaybolur, realize kâr bu sütuna girmez.',
    `Düzleştirilmiş çekim = %${(SMOOTHED_RATE * 100).toFixed(1)} × son ${SMOOTH_WINDOW} ayın ortalama euro serveti ÷ 12, aylık tavan €${MONTHLY_CAP_EUR}.`,
    'Maaş hâlâ EURO CETVELİ sütunundan ödenir. Bu sayfa karşılaştırma içindir, kural değiştirmez.',
  ];
  if (salesMonth) notes.push('Bu dönemde satış içeren ay var — eski ölçü sütununu o aylarda dikkatli oku.');

  return {
    rows,
    totals: {
      tlPnlDelta: sum(r => r.tlPnlDelta), eurGain: sum(r => r.eurGain),
      eurSalaryPaid: sum(r => r.eurSalary), fxNeutral: sum(r => r.fxNeutral),
      fxShare: sum(r => r.fxShare), smoothedPaid: sum(r => r.smoothedSalary),
    },
    smoothedNow: Math.min(MONTHLY_CAP_EUR, (baseNow * SMOOTHED_RATE) / 12),
    wealthForCap: (MONTHLY_CAP_EUR * 12) / SMOOTHED_RATE,
    notes,
  };
}

function prevYm(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}
