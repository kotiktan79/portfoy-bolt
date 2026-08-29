import { useEffect, useMemo, useState } from 'react';
import { TrendingUp, TrendingDown, ArrowDownToLine, Calendar } from 'lucide-react';
import { supabase, Holding } from '../lib/supabase';
import { fxToTRY, getFxRatesFromHoldings } from '../lib/fx';
import { formatCurrency } from '../services/priceService';

interface PricePoint {
  holding_id: string;
  symbol: string;
  price: number;
  recorded_at: string;
}

interface CashTx {
  id: string;
  created_at: string;
  transaction_type?: string;
  type?: string;
  amount: number;
  currency: string;
  notes?: string;
}

interface AttribRow {
  symbol: string;
  type: string;
  currency: string;
  qty: number;
  startPrice: number;
  endPrice: number;
  pricePct: number;
  gainTRY: number;
  splitAdjusted?: number; // tespit edilen split oranı (varsa)
}

// Stock split tespiti: startPrice / endPrice oranı [2,3,4,5,10]'a ±5% yakınsa
// split varsayıp startPrice'ı /ratio'la düzeltir.
const SPLIT_RATIOS = [2, 3, 4, 5, 10];
function detectSplitRatio(start: number, end: number): number | null {
  if (!start || !end || end >= start * 0.95) return null;
  const ratio = start / end;
  for (const r of SPLIT_RATIOS) {
    if (Math.abs(ratio - r) / r < 0.05) return r;
  }
  return null;
}

const MONTH_NAMES = ['Oca','Şub','Mar','Nis','May','Haz','Tem','Ağu','Eyl','Eki','Kas','Ara'];

function ymToLabel(ym: string): string {
  const [y, m] = ym.split('-');
  return `${MONTH_NAMES[parseInt(m) - 1]} ${y}`;
}

function lastDayOf(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m, 0).getDate();
  return `${ym}-${String(d).padStart(2, '0')}`;
}

function prevMonth(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  const dt = new Date(y, m - 2, 1);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
}

export function MonthlyAttribution({ holdings }: { holdings: Holding[] }) {
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [prices, setPrices] = useState<PricePoint[]>([]);
  const [cashTx, setCashTx] = useState<CashTx[]>([]);
  const [snapshotPnLDelta, setSnapshotPnLDelta] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const fxRates = useMemo(() => getFxRatesFromHoldings(holdings), [holdings]);
  // Ortak helper: RUB/RON/CHF de doğru çevrilir (eskiden 1:1 TRY sayılıyordu).
  const fxFor = (c?: string | null) => fxToTRY(1, c, fxRates);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const prev = prevMonth(selectedMonth);
    const periodStart = `${prev}-25`;        // önceki ayın son haftası
    const periodEnd = `${lastDayOf(selectedMonth)}T23:59:59`;

    (async () => {
      // Tüm sayfalanmış fiyat geçmişi
      let all: PricePoint[] = [];
      let from = 0;
      while (true) {
        const { data, error } = await supabase
          .from('price_history')
          .select('holding_id, symbol, price, recorded_at')
          .gte('recorded_at', periodStart)
          .lte('recorded_at', periodEnd)
          .order('recorded_at', { ascending: true })
          .range(from, from + 999);
        if (error || !data || data.length === 0) break;
        all = all.concat(data as PricePoint[]);
        if (data.length < 1000) break;
        from += 1000;
      }

      // Cash transactions (deposit/withdraw) bu ay içinde
      const monthStart = `${selectedMonth}-01`;
      const { data: tx } = await supabase
        .from('cash_transactions')
        .select('id, created_at, transaction_type, type, amount, currency, notes')
        .gte('created_at', monthStart)
        .lte('created_at', periodEnd)
        .order('created_at', { ascending: true });

      // Snapshot pnl delta (referans)
      const { data: snaps } = await supabase
        .from('portfolio_snapshots')
        .select('snapshot_date, total_pnl, total_value, total_investment, created_at')
        .gte('snapshot_date', prev + '-25')
        .lte('snapshot_date', lastDayOf(selectedMonth))
        .order('snapshot_date', { ascending: true })
        .order('created_at', { ascending: false });
      interface SnapRow { snapshot_date: string; total_pnl: number | null; total_value: number; total_investment: number; created_at: string }
      const seen = new Set<string>();
      const uniq: SnapRow[] = [];
      for (const s of snaps || []) {
        if (seen.has(s.snapshot_date)) continue;
        seen.add(s.snapshot_date);
        uniq.push(s);
      }
      uniq.sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date));
      const prevSnap = uniq.filter(s => s.snapshot_date < monthStart).pop();
      const lastSnap = uniq.filter(s => s.snapshot_date >= monthStart).pop();
      const pnlOf = (s: SnapRow) => s.total_pnl != null ? Number(s.total_pnl) : (Number(s.total_value) - Number(s.total_investment));
      const delta = prevSnap && lastSnap ? pnlOf(lastSnap) - pnlOf(prevSnap) : null;

      if (!cancelled) {
        setPrices(all);
        setCashTx(tx || []);
        setSnapshotPnLDelta(delta);
        setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [selectedMonth]);

  const attribution = useMemo<AttribRow[]>(() => {
    if (prices.length === 0) return [];
    const monthStart = `${selectedMonth}-01`;

    // Her holding_id için: önceki ay son fiyatı ve bu ay son fiyatı
    const startPrice: Record<string, number> = {};
    const endPrice: Record<string, number> = {};
    for (const p of prices) {
      const d = p.recorded_at.slice(0, 10);
      if (d < monthStart) startPrice[p.holding_id] = Number(p.price);
      else endPrice[p.holding_id] = Number(p.price);
    }

    const rows: AttribRow[] = [];
    for (const h of holdings) {
      if (h.asset_type === 'cash') continue;
      const rawStart = startPrice[h.id];
      const e = endPrice[h.id];
      if (!rawStart || !e || rawStart <= 0 || e <= 0) continue;
      // Split tespiti: start çok yüksek + end ona göre 2x/3x/5x/10x küçükse
      // start'ı split sonrası eşdeğerine indir, böylece sahte −%50 görünmesin.
      const splitRatio = detectSplitRatio(rawStart, e);
      const s = splitRatio ? rawStart / splitRatio : rawStart;
      const fx = fxFor(h.currency);
      const pricePct = ((e - s) / s) * 100;
      const gainTRY = (e - s) * h.quantity * fx;
      rows.push({
        symbol: h.symbol, type: h.asset_type, currency: h.currency || 'TRY',
        qty: h.quantity, startPrice: s, endPrice: e, pricePct, gainTRY,
        splitAdjusted: splitRatio || undefined,
      });
    }
    return rows.sort((a, b) => b.gainTRY - a.gainTRY);
  }, [prices, holdings, selectedMonth]);

  // Aynı zaman damgasında hem çıkış hem giriş varsa bu bir İÇ TRANSFERdir
  // (ör. kasadaki ruble → EUR pozisyonu): para portföyden çıkmadı, yer değiştirdi.
  // Eskiden bunlar "çekilen" olarak sayılıp toplamı kat kat şişiriyordu.
  const isInternalTransfer = (c: CashTx) => {
    const kind = (c.transaction_type || c.type) || '';
    const isDep = kind === 'deposit';
    return cashTx.some(o => o !== c && o.created_at === c.created_at && (isDep
      ? String((o.transaction_type || o.type) || '').startsWith('withdraw')
      : ((o.transaction_type || o.type) === 'deposit')));
  };
  const deposits = useMemo(() => {
    return cashTx
      .filter(c => (c.transaction_type || c.type) === 'deposit' && !isInternalTransfer(c))
      .map(c => ({
        ...c,
        tryEquiv: Number(c.amount) * fxFor(c.currency),
      }));
  }, [cashTx, fxRates]);
  const withdrawals = useMemo(() => {
    return cashTx
      .filter(c => ((c.transaction_type || c.type) === 'withdraw' || (c.transaction_type || c.type) === 'withdrawal') && !isInternalTransfer(c))
      .map(c => ({ ...c, tryEquiv: Number(c.amount) * fxFor(c.currency) }));
  }, [cashTx, fxRates]);

  const totalDeposit = deposits.reduce((s, d) => s + d.tryEquiv, 0);
  const totalWithdraw = withdrawals.reduce((s, w) => s + w.tryEquiv, 0);

  // Month seçici için son 12 ay
  const monthOptions = useMemo(() => {
    const now = new Date();
    const out: string[] = [];
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }
    return out;
  }, []);

  const winners = attribution.filter(r => r.gainTRY > 0);
  const losers = attribution.filter(r => r.gainTRY < 0);
  const totalWin = winners.reduce((s, r) => s + r.gainTRY, 0);
  const totalLoss = losers.reduce((s, r) => s + r.gainTRY, 0);
  const netAttribution = totalWin + totalLoss;

  // Tip bazında
  const byType: Record<string, number> = {};
  for (const r of attribution) byType[r.type] = (byType[r.type] || 0) + r.gainTRY;
  const typeLabels: Record<string, string> = {
    stock: 'Hisse', crypto: 'Kripto', currency: 'Döviz/Nakit',
    fund: 'Fon', eurobond: 'Eurobond', commodity: 'Emtia',
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-slate-200 dark:border-gray-700 overflow-hidden">
      <div className="p-5 border-b border-slate-200 dark:border-gray-700">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="text-brand-600 dark:text-brand-400" size={22} />
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">Bu Ay — Kâr Nereden? Para Nereden?</h3>
          </div>
          <div className="flex items-center gap-2">
            <Calendar size={16} className="text-slate-400" />
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="bg-slate-50 dark:bg-gray-700 text-slate-700 dark:text-gray-200 rounded-lg px-3 py-1.5 text-sm font-semibold border border-slate-200 dark:border-gray-600"
            >
              {monthOptions.map(ym => <option key={ym} value={ym}>{ymToLabel(ym)}</option>)}
            </select>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="p-6 space-y-3">
          {[1,2,3,4].map(i => <div key={i} className="h-12 bg-slate-100 dark:bg-gray-700 rounded-lg animate-pulse" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-slate-200 dark:divide-gray-700">
          {/* SOL: Kâr nereden */}
          <div className="p-5 space-y-4">
            <div className="flex items-baseline justify-between">
              <h4 className="text-sm font-bold text-slate-700 dark:text-gray-200 uppercase tracking-wider">Pozisyon Hareketi</h4>
              <span className={`text-lg font-extrabold ${netAttribution >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {netAttribution >= 0 ? '+' : ''}{formatCurrency(netAttribution)} ₺
              </span>
            </div>

            {/* Tip özeti */}
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(byType).sort((a, b) => b[1] - a[1]).map(([t, g]) => (
                <div key={t} className={`px-3 py-2 rounded-lg border ${g >= 0 ? 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-900' : 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900'}`}>
                  <p className="text-xs text-slate-600 dark:text-gray-400">{typeLabels[t] || t}</p>
                  <p className={`text-sm font-bold ${g >= 0 ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}`}>
                    {g >= 0 ? '+' : ''}{formatCurrency(g)} ₺
                  </p>
                </div>
              ))}
            </div>

            {/* Kazananlar */}
            {winners.length > 0 && (
              <div>
                <p className="text-xs font-bold text-green-700 dark:text-green-400 mb-2 flex items-center gap-1">
                  <TrendingUp size={12} /> EN ÇOK KAZANDIRAN
                </p>
                <div className="space-y-1">
                  {winners.slice(0, 5).map(r => (
                    <div key={r.symbol + r.type} className="flex items-center justify-between text-sm">
                      <span className="font-semibold text-slate-700 dark:text-gray-200 flex items-center gap-1">
                        {r.symbol}
                        {r.splitAdjusted && <span className="text-[10px] bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300 px-1.5 py-0.5 rounded">1:{r.splitAdjusted} split</span>}
                      </span>
                      <div className="text-right">
                        <span className="font-bold text-green-600">+{formatCurrency(r.gainTRY)} ₺</span>
                        <span className="text-xs text-slate-500 dark:text-gray-400 ml-2">({r.pricePct >= 0 ? '+' : ''}{r.pricePct.toFixed(1)}%)</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Kaybedenler */}
            {losers.length > 0 && (
              <div>
                <p className="text-xs font-bold text-red-700 dark:text-red-400 mb-2 flex items-center gap-1">
                  <TrendingDown size={12} /> EN ÇOK KAYBETTİREN
                </p>
                <div className="space-y-1">
                  {[...losers].reverse().slice(0, 5).map(r => (
                    <div key={r.symbol + r.type} className="flex items-center justify-between text-sm">
                      <span className="font-semibold text-slate-700 dark:text-gray-200 flex items-center gap-1">
                        {r.symbol}
                        {r.splitAdjusted && <span className="text-[10px] bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300 px-1.5 py-0.5 rounded">1:{r.splitAdjusted} split</span>}
                      </span>
                      <div className="text-right">
                        <span className="font-bold text-red-600">{formatCurrency(r.gainTRY)} ₺</span>
                        <span className="text-xs text-slate-500 dark:text-gray-400 ml-2">({r.pricePct.toFixed(1)}%)</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {snapshotPnLDelta !== null && (
              <div className="text-xs text-slate-500 dark:text-gray-400 pt-2 border-t border-slate-200 dark:border-gray-700">
                Resmi snapshot kâr delta: <span className={`font-bold ${snapshotPnLDelta >= 0 ? 'text-green-600' : 'text-red-600'}`}>{snapshotPnLDelta >= 0 ? '+' : ''}{formatCurrency(snapshotPnLDelta)} ₺</span>
                {Math.abs(snapshotPnLDelta - netAttribution) > 1000 && (
                  <span className="ml-1 text-amber-600 dark:text-amber-400">(fark: split/yeni alım/satış etkisi)</span>
                )}
              </div>
            )}
          </div>

          {/* SAĞ: Eklenen para */}
          <div className="p-5 space-y-4">
            <div className="flex items-baseline justify-between">
              <h4 className="text-sm font-bold text-slate-700 dark:text-gray-200 uppercase tracking-wider">Portföye Eklenen Para</h4>
              <span className="text-lg font-extrabold text-emerald-600 dark:text-emerald-400">
                +{formatCurrency(totalDeposit)} ₺
              </span>
            </div>

            {deposits.length === 0 ? (
              <p className="text-sm text-slate-400 dark:text-gray-500 italic">Bu ay deposit yok</p>
            ) : (
              <div className="space-y-2">
                {deposits.map(d => (
                  <div key={d.id} className="flex items-start justify-between p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900">
                    <div className="flex items-start gap-2">
                      <ArrowDownToLine size={16} className="text-emerald-600 dark:text-emerald-400 mt-0.5" />
                      <div>
                        <p className="text-sm font-bold text-slate-800 dark:text-gray-100">
                          {d.currency} {Number(d.amount).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-gray-400">
                          {new Date(d.created_at).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' })}
                          {d.notes ? ` · ${d.notes}` : ''}
                        </p>
                      </div>
                    </div>
                    <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                      ≈ {formatCurrency(d.tryEquiv)} ₺
                    </span>
                  </div>
                ))}
              </div>
            )}

            {withdrawals.length > 0 && (
              <div>
                <p className="text-xs font-bold text-slate-600 dark:text-gray-400 mt-3 mb-2 uppercase tracking-wider">Çekilen</p>
                <div className="space-y-2">
                  {withdrawals.map(w => (
                    <div key={w.id} className="flex items-center justify-between p-2 rounded-lg bg-rose-50 dark:bg-rose-950/20">
                      <span className="text-sm font-semibold text-slate-700 dark:text-gray-200">
                        {w.currency} {Number(w.amount).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                      </span>
                      <span className="text-sm font-semibold text-rose-600">−{formatCurrency(w.tryEquiv)} ₺</span>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-slate-500 dark:text-gray-400 mt-2">Toplam çekilen: <span className="font-bold text-rose-600">−{formatCurrency(totalWithdraw)} ₺</span></p>
              </div>
            )}

            <div className="text-xs text-slate-500 dark:text-gray-400 pt-2 border-t border-slate-200 dark:border-gray-700">
              💡 Bu rakam <strong>kâr değil</strong> — portföy dışından getirdiğin sermaye. Kâr-bazlı PnL hesabı bu deposit'leri otomatik dışlar.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
