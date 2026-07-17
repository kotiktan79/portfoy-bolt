// Yıllık kazanç raporu — yıl bazında realize kâr (FIFO), pasif gelir,
// maaş çekimleri ve dış para akışı tek tabloda. Toplamlar TRY bazındadır
// (maaş çekimleri kayıt para birimi olan USD ile ayrıca raporlanır).

import { supabase, Holding } from '../lib/supabase';
import { getFxRatesFromHoldings, fxToTRY } from '../lib/fx';
import { computeRealizedPnL } from './taxLotService';

export interface AnnualYearRow {
  year: number;
  realizedPnlTRY: number;
  realizedLongTermTRY: number;
  realizedShortTermTRY: number;
  closedLotCount: number;
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

  // Realize kâr: kapalı lotlar sembolün kendi para biriminde → TRY'ye çevir
  for (const sym of realized.symbols) {
    const rate = fxToTRY(1, sym.currency, fxRates);
    for (const lot of sym.closedLots) {
      const row = rowFor(lot.sellDate);
      if (!row) continue;
      const pnlTRY = lot.realizedPnl * rate;
      row.realizedPnlTRY += pnlTRY;
      if (lot.isLongTerm) row.realizedLongTermTRY += pnlTRY;
      else row.realizedShortTermTRY += pnlTRY;
      row.closedLotCount += 1;
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
    const amtTRY = fxToTRY(Number(c.amount) || 0, c.currency, fxRates);
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
