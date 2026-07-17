// Yıllık kazanç raporu — yıl bazında realize kâr (FIFO), pasif gelir,
// maaş çekimleri ve dış para akışı tek tabloda. Toplamlar TRY bazındadır
// (maaş çekimleri kayıt para birimi olan USD ile ayrıca raporlanır).
//
// TRY çevrimi TARİHSEL kurla yapılır: realize kâr satış günü, nakit hareketi
// işlem günü kuruyla (exchange_rates tablosu, 2026-04-06'dan beri günlük).
// Kapsam öncesi tarihler en eski mevcut kura, hiç kayıt yoksa güncel kura düşer.

import { supabase, Holding } from '../lib/supabase';
import { getFxRatesFromHoldings, fxToTRY, FxRates } from '../lib/fx';
import { computeRealizedPnL } from './taxLotService';

interface DailyRate { date: string; rate: number }

function normCcy(ccy: string | null | undefined): string {
  const c = (ccy || 'TRY').toUpperCase();
  return c === 'EURO' ? 'EUR' : c;
}

// İhtiyaç duyulan para birimleri için günlük son kur serisi (tek sorgu, sayfalı).
async function fetchDailyRatesTRY(
  currencies: string[],
  since: string
): Promise<Map<string, DailyRate[]>> {
  const out = new Map<string, DailyRate[]>();
  if (currencies.length === 0) return out;

  const byDay = new Map<string, Map<string, number>>(); // ccy → (gün → son kur)
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from('exchange_rates')
      .select('from_currency, rate, recorded_at')
      .eq('to_currency', 'TRY')
      .in('from_currency', currencies)
      .gte('recorded_at', since)
      .order('recorded_at', { ascending: true })
      .range(from, from + 999);
    if (error || !data || data.length === 0) break;
    for (const r of data) {
      const day = String(r.recorded_at).slice(0, 10);
      if (!byDay.has(r.from_currency)) byDay.set(r.from_currency, new Map());
      byDay.get(r.from_currency)!.set(day, Number(r.rate)); // aynı gün → sonuncusu kalır
    }
    if (data.length < 1000) break;
    from += 1000;
  }

  for (const [ccy, days] of byDay) {
    out.set(ccy, [...days.entries()].map(([date, rate]) => ({ date, rate })).sort((a, b) => a.date.localeCompare(b.date)));
  }
  return out;
}

// Tarihteki (veya öncesindeki en yakın) kur; kapsam öncesiyse en eski kur;
// seri hiç yoksa null → çağıran güncel kura düşer.
function rateOn(series: Map<string, DailyRate[]>, ccy: string, date: string): number | null {
  const s = series.get(ccy);
  if (!s || s.length === 0) return null;
  let found: number | null = null;
  for (const p of s) {
    if (p.date <= date) found = p.rate;
    else break;
  }
  return found ?? s[0].rate;
}

function toTRYHistorical(
  amount: number,
  ccy: string | null | undefined,
  date: string,
  series: Map<string, DailyRate[]>,
  currentRates: FxRates
): number {
  const c = normCcy(ccy);
  if (c === 'TRY') return amount;
  const hist = rateOn(series, c, date.slice(0, 10));
  if (hist != null) return amount * hist;
  return fxToTRY(amount, c, currentRates);
}

export interface AnnualYearRow {
  year: number;
  realizedPnlTRY: number;
  realizedLongTermTRY: number;
  realizedShortTermTRY: number;
  closedLotCount: number;
  approxLotCount: number; // maliyet bazı holdings ort. maliyetinden yaklaşık alınan lotlar
  incomeTRY: number;
  incomeByType: Record<string, number>;
  salaryWithdrawnUSD: number;
  depositsTRY: number;
  withdrawalsTRY: number;
}

export interface AnnualReport {
  years: AnnualYearRow[];
  totalRealizedTRY: number;
  totalIncomeTRY: number;
  totalSalaryUSD: number;
  totalDepositsTRY: number;
  totalWithdrawalsTRY: number;
}

function emptyRow(year: number): AnnualYearRow {
  return {
    year,
    realizedPnlTRY: 0,
    realizedLongTermTRY: 0,
    realizedShortTermTRY: 0,
    closedLotCount: 0,
    approxLotCount: 0,
    incomeTRY: 0,
    incomeByType: {},
    salaryWithdrawnUSD: 0,
    depositsTRY: 0,
    withdrawalsTRY: 0,
  };
}

export async function computeAnnualReport(): Promise<AnnualReport> {
  const [holdingsRes, realized, incomeRes, cashRes, salaryRes] = await Promise.all([
    supabase.from('holdings').select('*'),
    computeRealizedPnL(),
    supabase
      .from('income_records')
      .select('income_date, income_type, amount_try')
      .eq('is_projected', false),
    supabase
      .from('cash_transactions')
      .select('created_at, transaction_type, type, amount, currency'),
    supabase.from('salary_withdrawals').select('withdrawn_at, amount_usd'),
  ]);

  const holdings: Holding[] = holdingsRes.data || [];
  const fxRates = getFxRatesFromHoldings(holdings);
  const rows = new Map<number, AnnualYearRow>();
  const rowFor = (dateStr: string): AnnualYearRow | null => {
    const year = new Date(dateStr).getFullYear();
    if (!Number.isFinite(year) || year < 2000) return null;
    if (!rows.has(year)) rows.set(year, emptyRow(year));
    return rows.get(year)!;
  };

  // Tarihsel kur serisi: kapalı lot + nakit hareketlerinin ihtiyaç duyduğu
  // TRY-dışı para birimleri ve en erken tarih üzerinden tek seferde çekilir.
  const neededCcy = new Set<string>();
  let earliest = '9999-12-31';
  for (const sym of realized.symbols) {
    const c = normCcy(sym.currency);
    if (c === 'TRY' || sym.closedLots.length === 0) continue;
    neededCcy.add(c);
    for (const lot of sym.closedLots) {
      const d = lot.sellDate.slice(0, 10);
      if (d < earliest) earliest = d;
    }
  }
  for (const c of cashRes.data || []) {
    const cc = normCcy(c.currency);
    if (cc === 'TRY') continue;
    neededCcy.add(cc);
    const d = String(c.created_at).slice(0, 10);
    if (d < earliest) earliest = d;
  }
  const rateSeries = await fetchDailyRatesTRY([...neededCcy], earliest);

  // Realize kâr: kapalı lotlar sembolün kendi para biriminde → satış günü kuruyla TRY
  for (const sym of realized.symbols) {
    for (const lot of sym.closedLots) {
      const row = rowFor(lot.sellDate);
      if (!row) continue;
      const pnlTRY = toTRYHistorical(lot.realizedPnl, sym.currency, lot.sellDate, rateSeries, fxRates);
      row.realizedPnlTRY += pnlTRY;
      if (lot.isLongTerm) row.realizedLongTermTRY += pnlTRY;
      else row.realizedShortTermTRY += pnlTRY;
      row.closedLotCount += 1;
      if (lot.approxBasis) row.approxLotCount += 1;
    }
  }

  for (const r of incomeRes.data || []) {
    const row = rowFor(r.income_date);
    if (!row) continue;
    const amt = Number(r.amount_try) || 0;
    row.incomeTRY += amt;
    const t = r.income_type || 'other';
    row.incomeByType[t] = (row.incomeByType[t] || 0) + amt;
  }

  for (const c of cashRes.data || []) {
    const row = rowFor(c.created_at);
    if (!row) continue;
    const kind = c.transaction_type || c.type;
    const amtTRY = toTRYHistorical(Number(c.amount) || 0, c.currency, String(c.created_at), rateSeries, fxRates);
    if (kind === 'deposit') row.depositsTRY += amtTRY;
    else if (kind === 'withdraw' || kind === 'withdrawal') row.withdrawalsTRY += amtTRY;
  }

  for (const w of salaryRes.data || []) {
    const row = rowFor(w.withdrawn_at);
    if (!row) continue;
    row.salaryWithdrawnUSD += Number(w.amount_usd) || 0;
  }

  const years = [...rows.values()].sort((a, b) => a.year - b.year);
  return {
    years,
    totalRealizedTRY: years.reduce((s, y) => s + y.realizedPnlTRY, 0),
    totalIncomeTRY: years.reduce((s, y) => s + y.incomeTRY, 0),
    totalSalaryUSD: years.reduce((s, y) => s + y.salaryWithdrawnUSD, 0),
    totalDepositsTRY: years.reduce((s, y) => s + y.depositsTRY, 0),
    totalWithdrawalsTRY: years.reduce((s, y) => s + y.withdrawalsTRY, 0),
  };
}

export function exportAnnualReportCSV(report: AnnualReport): void {
  const headers = [
    'Yil',
    'Realize Kar (TRY)',
    'Uzun Vade (TRY)',
    'Kisa Vade (TRY)',
    'Kapanan Lot',
    'Yaklasik Bazli Lot',
    'Pasif Gelir (TRY)',
    'Maas Cekimi (USD)',
    'Yatirilan (TRY)',
    'Cekilen (TRY)',
  ];
  const rows = report.years.map((y) => [
    y.year,
    y.realizedPnlTRY.toFixed(2),
    y.realizedLongTermTRY.toFixed(2),
    y.realizedShortTermTRY.toFixed(2),
    y.closedLotCount,
    y.approxLotCount,
    y.incomeTRY.toFixed(2),
    y.salaryWithdrawnUSD.toFixed(2),
    y.depositsTRY.toFixed(2),
    y.withdrawalsTRY.toFixed(2),
  ]);
  const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');

  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `yillik-rapor-${new Date().toISOString().split('T')[0]}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
