// 2026-11-25: motor dünkü serveti snapshot TL / o günün EURO fiyatından yeniden hesaplıyor.
// daily_reports'ta düzeltilen (backfill) gün bu yüzden ertesi rapora geçmiyordu: 25 Kasım
// raporu 24 Kasım'ı düzeltilmiş €147.983 yerine eski kurla €147.661 aldı, ayı da eski −€1.936
// üstüne ekledi. Panel rakamları daily_reports'tan geldiği için gün ve ay önceki satırdan zincirlenir.

export interface PrevReportRow {
  report_date: string;
  wealth_eur: number | string | null;
  pnl_eur_mtd: number | string | null;
}

export interface EngineDay {
  asOf: string;
  wealthEUR: number;
  prevWealthEUR: number;
  dayGainEUR: number;
  mtdGainEUR: number | null;
}

export interface ChainedDay {
  dayGainEUR: number;
  dayGainPct: number;
  prevWealthEUR: number;
  mtdGainEUR: number | null;
  /** Motor sonucundan ayrıldıysa açıklama; değilse null. */
  note: string | null;
}

function num(v: unknown): number | null {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

/**
 * prev: motorun "dün" dediği snapshot gününün daily_reports satırı (yoksa null).
 * Akış (yatırma/çekme) motorunkiyle aynı kalır: akış = servet − dünkü servet − gün kârı.
 */
export function chainFromPrevReport(engine: EngineDay, prev: PrevReportRow | null): ChainedDay {
  const same: ChainedDay = {
    dayGainEUR: engine.dayGainEUR,
    dayGainPct: engine.prevWealthEUR > 0 ? (100 * engine.dayGainEUR) / engine.prevWealthEUR : 0,
    prevWealthEUR: engine.prevWealthEUR,
    mtdGainEUR: engine.mtdGainEUR,
    note: null,
  };
  const prevWealth = num(prev?.wealth_eur);
  if (!prev || prevWealth == null || !(prevWealth > 0) || !(engine.prevWealthEUR > 0) || prev.report_date >= engine.asOf) {
    return same;
  }
  const flowEUR = engine.wealthEUR - engine.prevWealthEUR - engine.dayGainEUR;
  const dayGainEUR = engine.wealthEUR - prevWealth - flowEUR;
  const prevMtd = num(prev.pnl_eur_mtd);
  const sameMonth = prev.report_date.slice(0, 7) === engine.asOf.slice(0, 7);
  const mtdGainEUR = engine.mtdGainEUR == null
    ? null
    : sameMonth
      ? (prevMtd == null ? engine.mtdGainEUR : prevMtd + dayGainEUR)
      : dayGainEUR;
  const changed = Math.abs(dayGainEUR - engine.dayGainEUR) > 0.005
    || (mtdGainEUR != null && engine.mtdGainEUR != null && Math.abs(mtdGainEUR - engine.mtdGainEUR) > 0.005);
  return {
    dayGainEUR,
    dayGainPct: (100 * dayGainEUR) / prevWealth,
    prevWealthEUR: prevWealth,
    mtdGainEUR,
    note: changed
      ? `Zincir: dün ${prev.report_date} raporu €${prevWealth.toFixed(2)} (motor €${engine.prevWealthEUR.toFixed(2)}) → gün ${dayGainEUR.toFixed(2)} (motor ${engine.dayGainEUR.toFixed(2)}), ay ${mtdGainEUR?.toFixed(2) ?? '—'} (motor ${engine.mtdGainEUR?.toFixed(2) ?? '—'})`
      : null,
  };
}
