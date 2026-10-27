import { useEffect, useMemo, useState } from 'react';
import { TrendingUp, TrendingDown, ArrowDownToLine, Calendar } from 'lucide-react';
import { supabase, Holding } from '../lib/supabase';
import { dayInTZ, ymInTZ, prevYMOf } from '../lib/eurPnl';
import { getEurMonths, RELIABLE_FROM } from '../services/eurPnlService';
import { fmtEUR0, fmtSignedEUR0 } from '../lib/chartTheme';
import {
  APPROX_NOTE,
  bookFromRows,
  buildPositionLines,
  emptyFxBook,
  rateOn,
  sumPositionGains,
  type BreakdownTx,
  type FxBook,
  type PositionLine,
} from '../lib/monthlyPositionBreakdown';
// 2026-09-19 gece: EURO cetveli. Resmi ay kârı = motor (eurPnlService). Aylar ≥ Nisan 2026.
// Pozisyon dökümü ekrandadır: kapanış adedi × kapanış fiyatı, satış hasılatı ve alış maliyeti (lib/monthlyPositionBreakdown).

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

const TX_COLUMNS = [
  'holding_id,transaction_date,transaction_type,quantity,price,total_amount,fee,currency',
  'holding_id,transaction_date,transaction_type,quantity,price,total_amount,currency',
  'holding_id,transaction_date,transaction_type,quantity,price,total_amount',
  'holding_id,transaction_date,transaction_type,quantity',
];

async function loadTrades(): Promise<BreakdownTx[]> {
  for (const cols of TX_COLUMNS) {
    const { data, error } = await supabase.from('transactions').select(cols);
    if (!error) return (data || []) as unknown as BreakdownTx[];
    if (!/column|schema cache/i.test(error.message)) throw error;
  }
  return [];
}

export function MonthlyAttribution({ holdings }: { holdings: Holding[] }) {
  // Ay sınırı tek kural: kullanıcının saat dilimi (lib/eurPnl ymInTZ) — tarayıcı TZ'siyle ekranlar ayrışmasın
  const [selectedMonth, setSelectedMonth] = useState<string>(() => ymInTZ());
  const [prices, setPrices] = useState<PricePoint[]>([]);
  const [cashTx, setCashTx] = useState<CashTx[]>([]);
  const [trades, setTrades] = useState<BreakdownTx[]>([]);
  const [motorGainEUR, setMotorGainEUR] = useState<number | null>(null);
  const [fxBook, setFxBook] = useState<FxBook>(() => emptyFxBook());
  const [snapAt, setSnapAt] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);


  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErr(null);
    const prev = prevMonth(selectedMonth);
    const periodStart = `${prev}-25`;        // önceki ayın son haftası
    const periodEndDay = lastDayOf(selectedMonth);
    const periodEnd = `${periodEndDay}T23:59:59`;
    const startDay = lastDayOf(prev);

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
      const lots = await loadTrades();

      // Resmi ay kârı = euro motoru. İşlem günü kuru = exchange_rates_daily.
      const months = await getEurMonths();
      const mrow = months.find(m => m.month === selectedMonth) || null;
      const today = dayInTZ(new Date());
      const endDay = selectedMonth === today.slice(0, 7) ? today : periodEndDay;
      const { data: fxRows, error: fxErr } = await supabase
        .from('exchange_rates_daily')
        .select('day, rate, from_currency')
        .eq('to_currency', 'TRY')
        .eq('source', 'api')
        .in('from_currency', ['EUR', 'USD', 'RUB', 'RON'])
        .gte('day', periodStart)
        .lte('day', endDay);
      let book = !fxErr && fxRows ? bookFromRows(fxRows) : emptyFxBook();
      if (fxErr || book.eur.length === 0) {
        const fxAt = async (dateMax: string) => {
          const one = (ccy: string) => supabase.from('exchange_rates').select('rate').eq('from_currency', ccy).eq('to_currency', 'TRY').eq('source', 'api').lte('recorded_at', dateMax + 'T23:59:59').order('recorded_at', { ascending: false }).limit(1).maybeSingle();
          const [e, u, rub, ron] = await Promise.all([one('EUR'), one('USD'), one('RUB'), one('RON')]);
          return [
            { day: dateMax, rate: Number(e.data?.rate) || 0, from_currency: 'EUR' },
            { day: dateMax, rate: Number(u.data?.rate) || 0, from_currency: 'USD' },
            { day: dateMax, rate: Number(rub.data?.rate) || 0, from_currency: 'RUB' },
            { day: dateMax, rate: Number(ron.data?.rate) || 0, from_currency: 'RON' },
          ];
        };
        const [fs, fe] = await Promise.all([fxAt(startDay), fxAt(endDay)]);
        book = bookFromRows([...fs, ...fe]);
      }
      const { data: snapRows } = await supabase
        .from('portfolio_snapshots')
        .select('snapshot_date, created_at')
        .in('snapshot_date', [startDay, endDay]);
      const snaps: Record<string, string> = {};
      for (const s of snapRows || []) {
        const day = String(s.snapshot_date).slice(0, 10);
        const at = String(s.created_at || '');
        if (day && at && (!snaps[day] || at > snaps[day])) snaps[day] = at;
      }

      if (!cancelled) {
        setPrices(all);
        setCashTx(tx || []);
        setTrades(lots);
        setMotorGainEUR(mrow ? mrow.gainEUR : null);
        setFxBook(book);
        setSnapAt(snaps);
        setLoading(false);
      }
    })().catch((e) => {
      // Hata: eski ayın verisi YENİ ay etiketiyle görünmesin (hakem 2026-09-19)
      if (!cancelled) {
        setPrices([]); setCashTx([]); setTrades([]); setFxBook(emptyFxBook()); setSnapAt({}); setMotorGainEUR(null);
        setErr(e?.message || 'veri yüklenemedi'); setLoading(false);
      }
    });

    return () => { cancelled = true; };
  }, [selectedMonth]);

  const period = useMemo(() => {
    const startDay = lastDayOf(prevMonth(selectedMonth));
    const today = dayInTZ(new Date());
    const open = selectedMonth === today.slice(0, 7);
    const endDay = open ? today : lastDayOf(selectedMonth);
    const startAt = snapAt[startDay] || `${startDay}T18:00:00.000Z`;
    const endAt = open ? `${endDay}T23:59:59.999Z` : (snapAt[endDay] || `${endDay}T18:00:00.000Z`);
    return { startDay, endDay, startAt, endAt, endMode: open ? 'latest' as const : 'close' as const };
  }, [selectedMonth, snapAt]);

  const attribution = useMemo(() => buildPositionLines({
    holdings,
    prices,
    transactions: trades,
    startDay: period.startDay,
    startAt: period.startAt,
    endDay: period.endDay,
    endAt: period.endAt,
    endMode: period.endMode,
    snapshotAtByDay: snapAt,
    fx: fxBook,
  }), [holdings, prices, trades, period, snapAt, fxBook]);

  const fxEnd = useMemo(() => ({
    eur: rateOn(fxBook.eur, period.endDay),
    usd: rateOn(fxBook.usd, period.endDay),
    rub: rateOn(fxBook.rub, period.endDay),
    ron: rateOn(fxBook.ron, period.endDay),
  }), [fxBook, period.endDay]);

  const { deposits, withdrawals } = useMemo(() => {
    // Nakit akışı € karşılığı (ay sonu kuru). RUB/RON için sabit çapraz yok; kur yoksa 0.
    const toEurAmt = (amt: number, ccy: string) => {
      const c = (ccy || 'TRY').toUpperCase(); if (!fxEnd.eur) return 0;
      if (c === 'EUR') return amt;
      if (c === 'TRY') return amt / fxEnd.eur;
      if (c === 'USD') return fxEnd.usd > 0 ? (amt * fxEnd.usd) / fxEnd.eur : 0;
      if (c === 'RUB') return fxEnd.rub > 0 ? (amt * fxEnd.rub) / fxEnd.eur : 0;
      if (c === 'RON') return fxEnd.ron > 0 ? (amt * fxEnd.ron) / fxEnd.eur : 0;
      return 0;
    };
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
    const withEur = (rows: CashTx[]) => rows.map(c => ({ ...c, eurEquiv: toEurAmt(Number(c.amount), c.currency) }));
    return {
      deposits: withEur(cashTx.filter(c => (c.transaction_type || c.type) === 'deposit' && !isInternalTransfer(c))),
      withdrawals: withEur(cashTx.filter(c => ((c.transaction_type || c.type) === 'withdraw' || (c.transaction_type || c.type) === 'withdrawal') && !isInternalTransfer(c))),
    };
  }, [cashTx, fxEnd]);

  const totalDeposit = deposits.reduce((s, d) => s + d.eurEquiv, 0);
  const totalWithdraw = withdrawals.reduce((s, w) => s + w.eurEquiv, 0);

  // Month seçici için son 12 ay
  const monthOptions = useMemo(() => {
    const out: string[] = [];
    let ym = ymInTZ();
    for (let i = 0; i < 12; i++) {
      if (ym >= RELIABLE_FROM.slice(0, 7)) out.push(ym);   // kur serisi öncesi aylar yok
      ym = prevYMOf(ym);
    }
    return out;
  }, []);

  const winners = attribution.filter(r => r.gainEUR > 0);
  const losers = attribution.filter(r => r.gainEUR < 0);
  const netAttribution = sumPositionGains(attribution);

  // Tip bazında
  const byType: Record<string, number> = {};
  for (const r of attribution) byType[r.type] = (byType[r.type] || 0) + r.gainEUR;
  const typeLabels: Record<string, string> = {
    stock: 'Hisse', crypto: 'Kripto', currency: 'Döviz/Nakit',
    fund: 'Fon', eurobond: 'Eurobond', commodity: 'Emtia',
    treasury_etf: 'Hazine Bonosu ETF', money_market: 'Para Piyasası',
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

      {err ? (
        <div className="p-6">
          <p className="text-sm font-semibold text-red-600">Ay detayı yüklenemedi</p>
          <p className="text-xs text-red-500 mt-1">{err}</p>
        </div>
      ) : loading ? (
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
                {fmtSignedEUR0(netAttribution)}
              </span>
            </div>

            {/* Tip özeti */}
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(byType).sort((a, b) => b[1] - a[1]).map(([t, g]) => (
                <div key={t} className={`px-3 py-2 rounded-lg border ${g >= 0 ? 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-900' : 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900'}`}>
                  <p className="text-xs text-slate-600 dark:text-gray-400">{typeLabels[t] || t}</p>
                  <p className={`text-sm font-bold ${g >= 0 ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}`}>
                    {fmtSignedEUR0(g)}
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
                  {winners.slice(0, 5).map(r => <PositionMoveRow key={r.id} row={r} />)}
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
                  {[...losers].reverse().slice(0, 5).map(r => <PositionMoveRow key={r.id} row={r} />)}
                </div>
              </div>
            )}

            <PositionContributionList rows={attribution} totalEUR={netAttribution} officialEUR={motorGainEUR} />
          </div>

          {/* SAĞ: Eklenen para */}
          <div className="p-5 space-y-4">
            <div className="flex items-baseline justify-between">
              <h4 className="text-sm font-bold text-slate-700 dark:text-gray-200 uppercase tracking-wider">Portföye Eklenen Para</h4>
              <span className="text-lg font-extrabold text-emerald-600 dark:text-emerald-400">
                +{fmtEUR0(totalDeposit)}
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
                      ≈ {fmtEUR0(d.eurEquiv)}
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
                      <span className="text-sm font-semibold text-rose-600">−{fmtEUR0(w.eurEquiv)}</span>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-slate-500 dark:text-gray-400 mt-2">Toplam çekilen: <span className="font-bold text-rose-600">−{fmtEUR0(totalWithdraw)}</span></p>
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

function PositionMoveRow({ row }: { row: PositionLine }) {
  const pos = row.gainEUR >= 0;
  const pct = `${row.pct >= 0 ? '+' : ''}${row.pct.toFixed(1)}%`;
  return (
    <div className="flex items-center justify-between text-sm gap-2">
      <span className="font-semibold text-slate-700 dark:text-gray-200 flex items-center gap-1 min-w-0">
        <span className="truncate">{row.symbol}</span>
        {row.sold && <span className="text-[10px] bg-slate-100 dark:bg-gray-700 text-slate-600 dark:text-gray-300 px-1.5 py-0.5 rounded shrink-0">satıldı</span>}
        {row.splitAdjusted && <span className="text-[10px] bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300 px-1.5 py-0.5 rounded shrink-0">1:{row.splitAdjusted} split</span>}
      </span>
      <div className="text-right shrink-0">
        <span className={`font-bold ${pos ? 'text-green-600' : 'text-red-600'}`}>{fmtSignedEUR0(row.gainEUR)}</span>
        <span className="text-xs text-slate-500 dark:text-gray-400 ml-2">({pct})</span>
      </div>
    </div>
  );
}

export function PositionContributionList({
  rows,
  totalEUR,
  officialEUR,
}: {
  rows: PositionLine[];
  totalEUR: number;
  officialEUR: number | null;
}) {
  const [open, setOpen] = useState(true);
  const totalPos = totalEUR >= 0;
  return (
    <div className="pt-2 border-t border-slate-200 dark:border-gray-700 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-bold text-slate-700 dark:text-gray-200 uppercase tracking-wider">Tüm pozisyonlar</p>
        <button
          type="button"
          onClick={() => setOpen(v => !v)}
          className="text-xs font-semibold text-brand-700 dark:text-brand-300 underline underline-offset-2"
        >
          {open ? 'Listeyi gizle' : `Tümünü göster (${rows.length})`}
        </button>
      </div>
      {open && (
        rows.length === 0 ? (
          <p className="text-sm text-slate-400 dark:text-gray-500 italic">Bu ay için hesaplanan pozisyon yok</p>
        ) : (
          <div>
            <div className="max-h-80 overflow-y-auto space-y-1 pr-1">
              {rows.map(r => <PositionMoveRow key={r.id} row={r} />)}
            </div>
            <div className={`mt-2 flex items-center justify-between border-t border-slate-200 dark:border-gray-700 pt-2 text-sm font-extrabold ${totalPos ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}`}>
              <span>Toplam</span>
              <span>{fmtSignedEUR0(totalEUR)}</span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-gray-400">Bu toplam, yukarıdaki Pozisyon Hareketi rakamıdır.</p>
          </div>
        )
      )}
      <p className="text-xs text-slate-500 dark:text-gray-400">
        {APPROX_NOTE}
        {officialEUR !== null && (
          <> Resmi ay kârı: <span className={`font-bold ${officialEUR >= 0 ? 'text-green-600' : 'text-red-600'}`}>{fmtSignedEUR0(officialEUR)}</span>.</>
        )}
      </p>
    </div>
  );
}
