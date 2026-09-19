import { useEffect, useMemo, useState } from 'react';
import { TrendingUp, TrendingDown, ArrowDownToLine, Calendar } from 'lucide-react';
import { supabase, Holding } from '../lib/supabase';
import { getEurMonths, RELIABLE_FROM } from '../services/eurPnlService';
import { fmtEUR0, fmtSignedEUR0 } from '../lib/chartTheme';
// 2026-09-19 gece: EURO cetveli. Pozisyon katkısı = ay sonu € değeri − ay başı € değeri (o günlerin kurlarıyla)
// → EURO/USD kasası kur şişmesiyle 'kazanan' görünmez. Resmi ay kârı = motor (eurPnlService). Aylar ≥ Nisan 2026.

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
  gainEUR: number;
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
  const [motorGainEUR, setMotorGainEUR] = useState<number | null>(null);
  const [fxStart, setFxStart] = useState<{ eur: number; usd: number } | null>(null);
  const [fxEnd, setFxEnd] = useState<{ eur: number; usd: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);


  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErr(null);
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

      // Resmi ay kârı = euro motoru; ay başı/sonu kurları = exchange_rates (api)
      const months = await getEurMonths();
      const mrow = months.find(m => m.month === selectedMonth) || null;
      const fxAt = async (dateMax: string) => {
        const [e, u] = await Promise.all([
          supabase.from('exchange_rates').select('rate').eq('from_currency', 'EUR').eq('to_currency', 'TRY').eq('source', 'api').lte('recorded_at', dateMax + 'T23:59:59').order('recorded_at', { ascending: false }).limit(1).maybeSingle(),
          supabase.from('exchange_rates').select('rate').eq('from_currency', 'USD').eq('to_currency', 'TRY').eq('source', 'api').lte('recorded_at', dateMax + 'T23:59:59').order('recorded_at', { ascending: false }).limit(1).maybeSingle(),
        ]);
        return { eur: Number(e.data?.rate) || 0, usd: Number(u.data?.rate) || 0 };
      };
      const prevEnd = lastDayOf(prev);
      const [fs, fe] = await Promise.all([fxAt(prevEnd), fxAt(lastDayOf(selectedMonth))]);

      if (!cancelled) {
        setPrices(all);
        setCashTx(tx || []);
        setMotorGainEUR(mrow ? mrow.gainEUR : null);
        setFxStart(fs); setFxEnd(fe);
        setLoading(false);
      }
    })().catch((e) => {
      // Hata: eski ayın verisi YENİ ay etiketiyle görünmesin (hakem 2026-09-19)
      if (!cancelled) { setPrices([]); setCashTx([]); setFxStart(null); setFxEnd(null); setMotorGainEUR(null); setErr(e?.message || 'veri yüklenemedi'); setLoading(false); }
    });

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
      if (!fxStart || !fxEnd || !fxStart.eur || !fxEnd.eur) continue;
      const c = (h.currency || 'TRY').toUpperCase();
      // pozisyonun € değeri, o günün kuruyla: TL fiyat ÷ EUR/TL; USD fiyat × USD/TL ÷ EUR/TL; EUR fiyat aynen
      const toEur = (price: number, f: { eur: number; usd: number }) => c === 'TRY' ? price / f.eur : c === 'USD' ? (price * f.usd) / f.eur : price;
      const vs = toEur(s, fxStart) * h.quantity, ve = toEur(e, fxEnd) * h.quantity;
      const pricePct = ((e - s) / s) * 100;
      rows.push({
        symbol: h.symbol, type: h.asset_type, currency: c,
        qty: h.quantity, startPrice: s, endPrice: e, pricePct, gainEUR: ve - vs,
        splitAdjusted: splitRatio || undefined,
      });
    }
    return rows.sort((a, b) => b.gainEUR - a.gainEUR);
  }, [prices, holdings, selectedMonth, fxStart, fxEnd]);

  // Nakit akışı € karşılığı (ay sonu kuru; RUB/RON yaklaşık)
  const toEurAmt = (amt: number, ccy: string) => {
    const c = (ccy || 'TRY').toUpperCase(); if (!fxEnd || !fxEnd.eur) return 0;
    if (c === 'EUR') return amt; if (c === 'TRY') return amt / fxEnd.eur; if (c === 'USD') return (amt * fxEnd.usd) / fxEnd.eur;
    if (c === 'RUB') return (amt * 0.555) / fxEnd.eur; if (c === 'RON') return amt / 4.97; return 0;
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
  const deposits = useMemo(() => {
    return cashTx
      .filter(c => (c.transaction_type || c.type) === 'deposit' && !isInternalTransfer(c))
      .map(c => ({ ...c, eurEquiv: toEurAmt(Number(c.amount), c.currency) }));
  }, [cashTx, fxEnd]);
  const withdrawals = useMemo(() => {
    return cashTx
      .filter(c => ((c.transaction_type || c.type) === 'withdraw' || (c.transaction_type || c.type) === 'withdrawal') && !isInternalTransfer(c))
      .map(c => ({ ...c, eurEquiv: toEurAmt(Number(c.amount), c.currency) }));
  }, [cashTx, fxEnd]);

  const totalDeposit = deposits.reduce((s, d) => s + d.eurEquiv, 0);
  const totalWithdraw = withdrawals.reduce((s, w) => s + w.eurEquiv, 0);

  // Month seçici için son 12 ay
  const monthOptions = useMemo(() => {
    const now = new Date();
    const out: string[] = [];
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (ym >= RELIABLE_FROM.slice(0, 7)) out.push(ym);   // kur serisi öncesi aylar yok
    }
    return out;
  }, []);

  const winners = attribution.filter(r => r.gainEUR > 0);
  const losers = attribution.filter(r => r.gainEUR < 0);
  const totalWin = winners.reduce((s, r) => s + r.gainEUR, 0);
  const totalLoss = losers.reduce((s, r) => s + r.gainEUR, 0);
  const netAttribution = totalWin + totalLoss;

  // Tip bazında
  const byType: Record<string, number> = {};
  for (const r of attribution) byType[r.type] = (byType[r.type] || 0) + r.gainEUR;
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
                  {winners.slice(0, 5).map(r => (
                    <div key={r.symbol + r.type} className="flex items-center justify-between text-sm">
                      <span className="font-semibold text-slate-700 dark:text-gray-200 flex items-center gap-1">
                        {r.symbol}
                        {r.splitAdjusted && <span className="text-[10px] bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300 px-1.5 py-0.5 rounded">1:{r.splitAdjusted} split</span>}
                      </span>
                      <div className="text-right">
                        <span className="font-bold text-green-600">{fmtSignedEUR0(r.gainEUR)}</span>
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
                        <span className="font-bold text-red-600">{fmtSignedEUR0(r.gainEUR)}</span>
                        <span className="text-xs text-slate-500 dark:text-gray-400 ml-2">({r.pricePct.toFixed(1)}%)</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {motorGainEUR !== null && (
              <div className="text-xs text-slate-500 dark:text-gray-400 pt-2 border-t border-slate-200 dark:border-gray-700">
                Resmi ay kârı (euro motoru): <span className={`font-bold ${motorGainEUR >= 0 ? 'text-green-600' : 'text-red-600'}`}>{fmtSignedEUR0(motorGainEUR)}</span>
                {Math.abs(motorGainEUR - netAttribution) > 150 && (
                  <span className="ml-1 text-amber-600 dark:text-amber-400">(pozisyon kırılımı yaklaşıktır: bugünkü adet, ay içi alım/satış, fiyat geçmişi)</span>
                )}
              </div>
            )}
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
