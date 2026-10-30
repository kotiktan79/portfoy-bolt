import { useEffect, useMemo, useState } from 'react';
import { Wallet, Gauge, AlertCircle } from 'lucide-react';
import { supabase, Holding } from '../lib/supabase';
import { getFxRatesFromHoldings, holdingValueTRY } from '../lib/fx';
import { getDynamicSalary, getSalaryAccrual, getMonthToDate, DynamicSalary, SalaryAccrual, MonthToDate } from '../services/salaryService';
import { dayInTZ, POOL_CAP_EUR, MONTHLY_CAP_EUR, withdrawalEUR, remainingEntitlementEUR, makeRateSeries, normalizeInflation, INFLATION_EUR, RELIABLE_FROM, type RateSeries } from '../lib/eurPnl';
import { currentYM } from '../services/salaryService';
import { fetchAll, invalidateEurPnlCache } from '../services/eurPnlService';
import { getKasaFx, type KasaFx } from '../services/kasaFxService';
import { planSalary, kasaOutstandingEUR, type SalaryPlanInput } from '../lib/salaryPlan';
import { ledgerFromTransactions, balanceGap, type LedgerRow } from '../lib/cashLedger';

// KÂR CÜZDANI — TEK CETVEL: EURO (2026-09-19 gece)
//   bu ayın maaşı = geçen ayın çekilebilir reel EUR kârı × 0,85 (salaryService → eurPnl)
//   çekilebilir   = devreden açık + (euro servet artışı − dış akış − enflasyon payı), ≥0. Kur hareketi kârdır.
// Çekim: EURO pozisyonundan düşülür. Yeni kayıt amount_eur yazar (USD kolonları yalnız eski satırlar için).
// Taban €700: havuzdan gelen (%85, tavan €1.000) yetmezse fark kasadan önerilir; kasa €15.000 altına inecekse önerilmez.

interface SalaryWithdrawal { id: string; withdrawn_at: string; amount_usd: number; amount_eur?: number | null; note: string | null; source_symbol: string | null; source_quantity_deducted: number | null }
interface KasaMove { kind: string; amount_eur: number | null }
interface Props { holdings: Holding[] }
const fmt = (n: number) => Math.round(Math.abs(n)).toLocaleString('de-DE');
const sgn = (n: number) => (n >= 0 ? '+' : '−');
const TR_MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const trMonth = (ym: string) => {
  const i = Number(ym.slice(5, 7)) - 1;
  return TR_MONTHS[i] ? `${TR_MONTHS[i]} ${ym.slice(0, 4)}` : ym;
};

export default function KarCuzdani({ holdings }: Props) {
  const [salary, setSalary] = useState<DynamicSalary | null>(null);
  const [accrual, setAccrual] = useState<SalaryAccrual | null>(null);
  const [mtd, setMtd] = useState<MonthToDate | null>(null);
  const [withdrawals, setWithdrawals] = useState<SalaryWithdrawal[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [confirmWithdraw, setConfirmWithdraw] = useState(false);
  const [sourceSymbol, setSourceSymbol] = useState<string>('EURO');
  const [amountInput, setAmountInput] = useState<string>('');
  const [inflationAnnual, setInflationAnnual] = useState(INFLATION_EUR);
  const [inflationInput, setInflationInput] = useState('3');
  const [inflationMsg, setInflationMsg] = useState<string | null>(null);
  const [histFx, setHistFx] = useState<{ eur: RateSeries; usd: RateSeries } | null>(null);
  const [cashGaps, setCashGaps] = useState<Array<{ currency: string; stored: number; derived: number; gap: number | null; depGap: number | null }>>([]);

  // KASA (ölçüm dışı) — kur etkisi görünür olsun; maaş/havuz rakamlarına DOKUNMAZ (2026-09-27)
  useEffect(() => {
    let c = false;
    getKasaFx()
      .then(k => { if (!c) { setKasa(k); setKasaErr(k ? null : 'veri yok'); } })
      .catch(e => { if (!c) setKasaErr(e?.message || 'okunamadı'); });   // sessizce kaybolmasın: panelde satır duruyor
    return () => { c = true; };
  }, []);

  useEffect(() => {
    let c = false;
    (async () => {
      const [txs, bals] = await Promise.all([
        fetchAll<any>('cashGapTx', () => supabase.from('cash_transactions').select('currency,transaction_type,type,amount')),
        fetchAll<any>('cashGapBal', () => supabase.from('cash_balances').select('currency,balance,total_deposits')),
      ]);
      if (c) return;
      const ledger: LedgerRow[] = ledgerFromTransactions(txs);
      const seen = new Set<string>();
      const gaps: Array<{ currency: string; stored: number; derived: number; gap: number | null; depGap: number | null }> = [];
      for (const b of bals) {
        const ccy = String(b.currency || 'TRY').toUpperCase();
        seen.add(ccy);
        const d = ledger.find(l => l.currency === ccy);
        const derived = d?.balance ?? 0;
        const deposits = d?.deposits ?? 0;
        gaps.push({
          currency: ccy,
          stored: Number(b.balance) || 0,
          derived,
          gap: balanceGap(Number(b.balance) || 0, derived),
          depGap: balanceGap(Number(b.total_deposits) || 0, deposits),
        });
      }
      for (const l of ledger) {
        if (seen.has(l.currency)) continue;
        gaps.push({ currency: l.currency, stored: 0, derived: l.balance, gap: balanceGap(0, l.balance), depGap: balanceGap(0, l.deposits) });
      }
      setCashGaps(gaps.filter(g => g.gap != null || g.depGap != null));
    })().catch(() => { if (!c) setCashGaps([]); });
    return () => { c = true; };
  }, []);

  useEffect(() => { loadAll(); loadPolicy(); }, []);
  async function loadPolicy() {
    const [pol, mov] = await Promise.all([
      supabase.from('portfoy_bolt_salary_policy').select('*').eq('id', 1).maybeSingle(),
      supabase.from('portfoy_bolt_kasa_salary_moves').select('kind,amount_eur'),
    ]);
    if (!pol.error && pol.data) {
      const n = (v: unknown) => (v == null || v === '' || !Number.isFinite(Number(v)) ? undefined : Number(v));
      const inf = normalizeInflation(pol.data.inflation_annual);
      setInflationAnnual(inf);
      setInflationInput(String(Math.round(inf * 1000) / 10));
      setPolicy({
        floorEUR: n(pol.data.floor_eur),
        capEUR: n(pol.data.cap_eur),
        kasaMinEUR: n(pol.data.kasa_floor_eur),
        refillRatio: n(pol.data.kasa_refill_ratio),
        kasaStartEUR: n(pol.data.kasa_start_eur),
        salaryStartMonth: pol.data.salary_start_month || undefined,
      });
    }
    if (!mov.error) setKasaMoves(mov.data || []);
  }
  async function loadAll() {
    setLoading(true);
    setLoadError(null);
    try {
      const [s, a, w, m] = await Promise.all([
        getDynamicSalary(), getSalaryAccrual(),
        supabase.from('salary_withdrawals').select('*').order('withdrawn_at', { ascending: false }).limit(200),
        getMonthToDate(),
      ]);
      if (w.error) throw new Error(`salary_withdrawals: ${w.error.message}`);   // 'çekilen €0' sahte olgusu yasak
      const [er, ur] = await Promise.all([
        supabase.from('exchange_rates_daily').select('day,rate').eq('from_currency', 'EUR').eq('to_currency', 'TRY').eq('source', 'api').gte('day', RELIABLE_FROM),
        supabase.from('exchange_rates_daily').select('day,rate').eq('from_currency', 'USD').eq('to_currency', 'TRY').eq('source', 'api').gte('day', RELIABLE_FROM),
      ]);
      const pts = (rows: Array<{ day: string; rate: number }> | null) => (rows || []).map(r => ({ date: String(r.day), rate: Number(r.rate) }));
      setHistFx({ eur: makeRateSeries(pts(er.data), Number.NaN), usd: makeRateSeries(pts(ur.data), Number.NaN) });
      setSalary(s); setAccrual(a); setMtd(m); setWithdrawals(w.data || []);
    } catch (e: unknown) {
      setLoadError(e instanceof Error ? e.message : 'veri yüklenemedi');   // motor hatası: rakam gösterme
    } finally {
      setLoading(false);
    }
  }

  const fx = useMemo(() => getFxRatesFromHoldings(holdings), [holdings]);
  const eurRate = fx.eur > 0 ? fx.eur : 0;
  const portfolioEur = useMemo(() => holdings.length && eurRate > 0 ? holdings.reduce((s, h) => s + holdingValueTRY(h, fx), 0) / eurRate : 0, [holdings, fx, eurRate]);

  // Ay sınırı kullanıcının saat diliminde (salaryService ile aynı kural)
  const monthKey = currentYM();
  const withdrawnThisMonthEur = withdrawals.filter(w => dayInTZ(String(w.withdrawn_at)).slice(0, 7) === monthKey).reduce((s, w) => {
    const direct = Number(w.amount_eur);
    if (Number.isFinite(direct) && direct > 0) return s + direct;
    if (!histFx) return s;
    const d = dayInTZ(String(w.withdrawn_at));
    return s + withdrawalEUR(w, histFx.eur.rateAt(d), histFx.usd.rateAt(d));
  }, 0);
  // TEK TABAN: çekim hakkı KAPANMIŞ son ayın havuzundan (motor hesaplıyor; bitmemiş ayın kârı geri dönebilir).
  // Havuz zaten çekilenler düşülmüş bakiyedir → burada SADECE bu ay çekilenler düşülür (çift sayım yok).
  const poolEur = salary?.poolOutEUR ?? 0;
  const [kasa, setKasa] = useState<KasaFx | null>(null);
  const [kasaErr, setKasaErr] = useState<string | null>(null);
  const [policy, setPolicy] = useState<Partial<SalaryPlanInput>>({});
  const [kasaMoves, setKasaMoves] = useState<KasaMove[]>([]);
  const [moveMsg, setMoveMsg] = useState<string | null>(null);
  const entitlementEur = salary?.entitlementEUR ?? 0;
  const mtdPoolEur = mtd?.poolOutEUR ?? 0;               // bu ay şimdiye kadar biriken (ay kapanınca hak olur)
  const remainingEur = remainingEntitlementEUR(poolEur, withdrawnThisMonthEur);
  const amountEur = Math.min(remainingEur, Math.max(0, parseFloat(amountInput) || remainingEur));
  const salaryView = kasa ? planSalary({
    poolEUR: poolEur,
    realGainEUR: salary?.realGainEUR ?? 0,
    kasaEUR: kasa.totalEurNow,
    kasaDrawnOutstandingEUR: kasaOutstandingEUR(kasaMoves),
    asOfMonth: monthKey,
    ...policy,
  }) : null;

  async function saveInflation() {
    const annual = Number(String(inflationInput).replace(',', '.')) / 100;
    if (!Number.isFinite(annual) || annual < 0 || annual > 0.25) {
      setInflationMsg('Enflasyon 0 ile %25 arasında olmalı.');
      return;
    }
    const { error } = await supabase.from('portfoy_bolt_salary_policy').update({
      inflation_annual: annual, updated_at: new Date().toISOString(),
    }).eq('id', 1);
    if (error) {
      setInflationMsg('Kaydedilemedi. Enflasyon sütunu için SQL dosyasını çalıştırdıktan sonra tekrar dene.');
      return;
    }
    setInflationAnnual(annual);
    setInflationMsg('Kaydedildi. Sayfa yenilenince kâr ve maaş bu oranı kullanır.');
    invalidateEurPnlCache();
  }

  async function recordKasaMove(kind: 'topup' | 'refill', amount: number) {
    if (!(amount > 0)) return;
    const { error } = await supabase.from('portfoy_bolt_kasa_salary_moves').insert({
      kind, amount_eur: Math.round(amount * 100) / 100,
      note: kind === 'topup' ? 'Kasadan maaş tamamlama' : 'Kasaya geri koyma',
    });
    if (error) { setMoveMsg('Kayıt yazılamadı. SQL dosyasını çalıştırdıysan tekrar dene: ' + error.message); return; }
    setMoveMsg(kind === 'topup' ? 'Kasadan tamamlama kayda geçti. Kasadaki parayı da kendin güncelle.' : 'Kasa doldurma kayda geçti.');
    await loadPolicy();
  }

  const cashSources = useMemo(() => holdings
    .filter(h => h.asset_type === 'currency' && h.quantity > 0 && h.current_price > 0)
    .map(h => ({ symbol: h.symbol, quantity: h.quantity, valueEur: eurRate > 0 ? holdingValueTRY(h, fx) / eurRate : 0, ccyDisplay: h.symbol === 'EURO' ? 'EUR' : h.symbol, unitsPerEur: h.current_price > 0 ? eurRate / h.current_price : 0 }))
    .filter(s => s.valueEur >= 100).sort((a, b) => b.valueEur - a.valueEur), [holdings, fx, eurRate]);
  const selectedSource = cashSources.find(s => s.symbol === sourceSymbol) || cashSources[0];
  const sourceQty = selectedSource ? amountEur * selectedSource.unitsPerEur : 0;
  const sourceSufficient = selectedSource ? selectedSource.valueEur >= amountEur : false;
  const canWithdraw = remainingEur > 0 && amountEur > 0;

  const [busy, setBusy] = useState(false);
  async function handleWithdraw() {
    if (busy || !canWithdraw || !selectedSource || !sourceSufficient) return;
    const h = holdings.find(x => x.symbol === selectedSource.symbol && x.asset_type === 'currency'); if (!h) return;
    setBusy(true);
    try {
    const amountUsd = fx.usd > 0 ? amountEur * eurRate / fx.usd : 0;
    const reservoirAfterEur = Math.max(0, remainingEur - amountEur);
    // Çekilen adedin gerçekleşmiş K/Z'si (TL): motor bunu akış düzeltmesi olarak okur, yoksa çekim SAHTE ZARAR görünür
    const realizedTry = sourceQty * ((Number(h.current_price) || 0) - (Number(h.purchase_price) || 0)) * (String(h.currency || 'TRY').toUpperCase() === 'TRY' ? 1 : (fx[String(h.currency).toLowerCase() as 'usd' | 'eur'] ?? 1));
    // EUR esas. Fonksiyon yoksa (migration öncesi) eski USD fonksiyonuna düşülür.
    const eurRpc = await supabase.rpc('withdraw_salary_eur', {
      p_holding_id: h.id, p_source_quantity_deducted: sourceQty,
      p_amount_eur: amountEur, p_reservoir_after_eur: reservoirAfterEur, p_portfolio_value_eur: portfolioEur,
      p_source_symbol: selectedSource.symbol, p_realized_try: realizedTry, p_note: `€${fmt(amountEur)} maaş`,
      p_amount_usd: amountUsd, p_reservoir_after_usd: reservoirAfterEur * (fx.usd > 0 ? eurRate / fx.usd : 0),
      p_portfolio_value_usd: portfolioEur * (fx.usd > 0 ? eurRate / fx.usd : 0), p_from_pool_eur: amountEur,
    });
    const rpcErr = eurRpc.error && eurRpc.error.code === 'PGRST202'
      ? (await supabase.rpc('withdraw_salary', {
          p_holding_id: h.id, p_source_quantity_deducted: sourceQty, p_amount_usd: amountUsd, p_reservoir_after_usd: reservoirAfterEur * (fx.usd > 0 ? eurRate / fx.usd : 0),
          p_portfolio_value_usd: portfolioEur * (fx.usd > 0 ? eurRate / fx.usd : 0), p_source_symbol: selectedSource.symbol,
          p_realized_try: realizedTry, p_note: `€${fmt(amountEur)} maaş`,
        })).error
      : eurRpc.error;
    if (rpcErr && rpcErr.code !== 'PGRST202') { alert('Çekim başarısız: ' + rpcErr.message); return; }
    if (rpcErr) {
      // RPC yoksa yedek yol (v3 canlıda kurulu; bu dal yalnız şema geri alınırsa çalışır)
      const newQty = Math.max(0, h.quantity - sourceQty);
      const { error: u } = await supabase.from('holdings').update({ quantity: newQty }).eq('id', h.id); if (u) { alert('Kaynak güncellenemedi: ' + u.message); return; }
      const { error } = await supabase.from('salary_withdrawals').insert({ amount_usd: amountUsd, reservoir_after_usd: (remainingEur - amountEur) * eurRate / fx.usd, portfolio_value_usd: portfolioEur * eurRate / fx.usd, source_symbol: selectedSource.symbol, source_quantity_deducted: sourceQty, note: `€${fmt(amountEur)} maaş` });
      if (error) { await supabase.from('holdings').update({ quantity: h.quantity }).eq('id', h.id); alert('Çekim kaydedilemedi: ' + error.message); return; }
      // RPC yoksa realize satırını istemci yazar (kâr motoru çekimi zarar sanmasın)
      await supabase.from('cash_transactions').insert({ transaction_type: 'sell', type: 'sell', amount: sourceQty, currency: 'TRY', related_holding_id: h.id, notes: `€${fmt(amountEur)} maaş (Kar/Zarar: ${realizedTry.toFixed(2)} ₺)` });
    }
    setConfirmWithdraw(false); await loadAll(); window.location.reload();
    } finally { setBusy(false); }
  }

  if (loadError) return <div id="kar-cuzdani" className="scroll-mt-4 bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-red-200 dark:border-red-900 p-6"><p className="text-sm font-semibold text-red-600">Maaş verisi yüklenemedi</p><p className="text-xs text-red-500 mt-1">{loadError}</p><button onClick={loadAll} className="mt-3 text-xs underline text-red-600">Tekrar dene</button></div>;
  if (loading) return <div id="kar-cuzdani" className="scroll-mt-4 bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-slate-200 dark:border-gray-700 p-6"><p className="text-slate-400 text-sm">Cüzdan yükleniyor...</p></div>;

  return (
    <div id="kar-cuzdani" className="scroll-mt-4 bg-gradient-to-br from-emerald-50 to-white dark:from-emerald-950/40 dark:to-gray-800 rounded-2xl shadow-sm border-2 border-emerald-200 dark:border-emerald-900 overflow-hidden">
      <div className="px-5 py-4 border-b border-emerald-200 dark:border-emerald-900 flex items-center justify-between">
        <div className="flex items-center gap-2"><Wallet className="text-emerald-600 dark:text-emerald-400" size={22} /><h3 className="text-lg font-bold text-gray-900 dark:text-white">Kâr Cüzdanı</h3></div>
        <span className="text-[11px] text-slate-500 dark:text-gray-400">euro cetveli</span>
      </div>

      <div className={`mx-5 mt-4 rounded-xl p-4 border ${entitlementEur > 0 ? 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-900' : 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900'}`}>
        <div className="flex items-center gap-2 mb-1"><Gauge size={16} className={entitlementEur > 0 ? 'text-blue-600' : 'text-amber-600'} /><p className="text-xs font-bold uppercase tracking-wide text-slate-600 dark:text-gray-300">Şu An Çekebileceğin Maaş</p></div>
        {salary ? (
          <>
            <p className={`text-3xl font-bold ${entitlementEur > 0 ? 'text-blue-600 dark:text-blue-400' : 'text-amber-700 dark:text-amber-300'}`}>€{fmt(entitlementEur)}<span className="text-sm font-normal text-slate-500 dark:text-gray-400">/ay</span></p>
            <div className="text-xs text-slate-600 dark:text-gray-300 mt-2 space-y-0.5">
              <p>{salary.monthLabel}: servet €{fmt(salary.startWealthEUR)} → €{fmt(salary.endWealthEUR)}, dış para hariç kâr <strong>{sgn(salary.profitEUR)}€{fmt(salary.profitEUR)}</strong></p>
              {salary.inflationEUR > 0
                ? <p>− yıl sonu enflasyon payı (%{(inflationAnnual * 100).toLocaleString('tr-TR', { maximumFractionDigits: 1 })}/yıl) €{fmt(salary.inflationEUR)} = <strong>{sgn(salary.realGainEUR)}€{fmt(salary.realGainEUR)}</strong>{salary.carryInEUR < 0 && <> · devreden açık <strong>−€{fmt(salary.carryInEUR)}</strong></>}</p>
                : <p>Enflasyon payı (%{(inflationAnnual * 100).toLocaleString('tr-TR', { maximumFractionDigits: 1 })}/yıl) yıl sonunda düşülecek{salary.carryInEUR < 0 && <> · devreden açık <strong>−€{fmt(salary.carryInEUR)}</strong></>}</p>}
              {poolEur < 0
                ? <p>→ havuz <strong>−€{fmt(poolEur)} açık</strong> → maaş €0 — bu ay maaş yok, fark yastıktan</p>
                : <p>→ havuz €{fmt(poolEur)} × 0,85{0.85 * poolEur > MONTHLY_CAP_EUR ? `, aylık tavan €${fmt(MONTHLY_CAP_EUR)}` : ''} = <strong>€{fmt(entitlementEur)}</strong>{entitlementEur === 0 && ' — bu ay maaş yok'}</p>}
              {mtd && <p className="text-slate-500 dark:text-gray-400">Bu ay ({mtd.monthLabel}) kâr {sgn(mtd.realGainEUR)}€{fmt(mtd.realGainEUR)} → ay sonu havuzu {mtdPoolEur < 0 ? `−€${fmt(mtdPoolEur)} açık` : `€${fmt(mtdPoolEur)}`}{mtdPoolEur > 0 && ` → ay kapanınca × 0,85 = €${fmt(mtd.projectedSalaryEUR)} hak`}</p>}
              {salary.carryResetApplied && <p className="text-emerald-700 dark:text-emerald-300">Bu ayda eski açık, Nisan öncesi kazanılan kâr yastığıyla sıfırlandı.</p>}
            </div>
          </>
        ) : <p className="text-sm text-amber-700 dark:text-amber-300">Geçen aya ait kayıt bulunamadı.</p>}
      </div>

      {salaryView && (
        <div className="mx-5 mt-3 rounded-xl border border-emerald-200 dark:border-emerald-900 bg-white/70 dark:bg-gray-900/40 p-3 text-xs text-slate-700 dark:text-gray-200">
          {salaryView.preview && (
            <p className="mb-2 font-semibold text-amber-700 dark:text-amber-300">Ön izleme — maaş {trMonth(policy.salaryStartMonth || '2027-04')} tarihinde başlar. Aşağıdaki tutarlar bugünkü kuralın ön gösterimi.</p>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            <div><p className="text-slate-500 dark:text-gray-400">Bu ay havuzdan</p><p className="font-bold text-base">€{fmt(salaryView.fromPoolEUR)}</p></div>
            <div><p className="text-slate-500 dark:text-gray-400">Bu ay kasadan</p><p className="font-bold text-base">€{fmt(salaryView.fromKasaEUR)}</p></div>
            <div><p className="text-slate-500 dark:text-gray-400">Toplam maaş</p><p className="font-bold text-base text-emerald-700 dark:text-emerald-300">€{fmt(salaryView.totalEUR)}</p></div>
            <div><p className="text-slate-500 dark:text-gray-400">Kasa bakiyesi</p><p className="font-bold text-base">€{fmt(salaryView.kasaEUR)}</p></div>
            <div><p className="text-slate-500 dark:text-gray-400">Alt sınıra uzaklık</p><p className={`font-bold text-base ${salaryView.distanceToFloorEUR < 0 ? 'text-red-600' : ''}`}>{salaryView.distanceToFloorEUR < 0 ? '−' : ''}€{fmt(salaryView.distanceToFloorEUR)}</p></div>
          </div>
          <p className="mt-2 text-[11px] text-slate-500 dark:text-gray-400">
            Taban €{fmt(salaryView.floorEUR)} · tavan €{fmt(salaryView.capEUR)} · kasa alt sınır €{fmt(salaryView.kasaMinEUR)} · havuz × 0,85, havuz tavanı €{fmt(POOL_CAP_EUR)}.
          </p>
          {salaryView.fromKasaEUR > 0 && (
            <p className="mt-1 font-semibold text-emerald-700 dark:text-emerald-300">Kasadan tamamla: €{fmt(salaryView.fromKasaEUR)}</p>
          )}
          {salaryView.topUpBlocked && (
            <p className="mt-1 text-amber-700 dark:text-amber-300">Kasa €{fmt(salaryView.kasaMinEUR)} altına ineceği için kasadan tamamlama yok. Yalnız havuzdan €{fmt(salaryView.fromPoolEUR)}.</p>
          )}
          {salaryView.refillEUR > 0 && (
            <p className="mt-1 text-sky-700 dark:text-sky-300">İyi ay: kalan reel kârın %{Math.round(salaryView.refillRatio * 100)}'i ile kasaya €{fmt(salaryView.refillEUR)} geri koy (başlangıç €{fmt(salaryView.kasaStartEUR)}).</p>
          )}
          <div className="mt-2 flex flex-wrap gap-2">
            {salaryView.fromKasaEUR > 0 && (
              <button type="button" onClick={() => recordKasaMove('topup', salaryView.fromKasaEUR)} className="px-2 py-1 rounded bg-emerald-600 text-white text-[11px] font-semibold">Kasadan €{fmt(salaryView.fromKasaEUR)} aldım</button>
            )}
            {salaryView.refillEUR > 0 && (
              <button type="button" onClick={() => recordKasaMove('refill', salaryView.refillEUR)} className="px-2 py-1 rounded bg-sky-700 text-white text-[11px] font-semibold">Kasaya €{fmt(salaryView.refillEUR)} koydum</button>
            )}
          </div>
          {moveMsg && <p className="mt-1 text-[11px] text-slate-500 dark:text-gray-400">{moveMsg}</p>}
        </div>
      )}

      <div className="p-5 grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-2">
          <div className="grid grid-cols-3 gap-3 text-xs">
            <div><p className="text-slate-500 dark:text-gray-400">Bu ay çekilen</p><p className="font-bold text-gray-900 dark:text-white">€{fmt(withdrawnThisMonthEur)}</p></div>
            <div><p className="text-slate-500 dark:text-gray-400">Kalan hak</p><p className="font-bold text-emerald-600 dark:text-emerald-400">€{fmt(remainingEur)}</p></div>
            <div><p className="text-slate-500 dark:text-gray-400">Portföy</p><p className="font-bold text-gray-900 dark:text-white">€{fmt(portfolioEur)}</p></div>
            <div className="col-span-3 mt-1 p-2 rounded-lg bg-white/70 dark:bg-gray-900/40 border border-emerald-200 dark:border-emerald-900">
              <p className="text-slate-500 dark:text-gray-400">Kâr havuzu <span className="text-[10px]">(kapanmış aylardan birikmiş · tavan €{fmt(POOL_CAP_EUR)} · aylık çekim tavanı €{fmt(MONTHLY_CAP_EUR)})</span></p>
              <p className={`font-bold text-base ${poolEur > 0 ? 'text-emerald-600 dark:text-emerald-400' : poolEur < 0 ? 'text-red-600' : 'text-gray-900 dark:text-white'}`}>
                {poolEur < 0 ? `−€${fmt(poolEur)} açık` : `€${fmt(poolEur)}`}
                {(mtd?.poolSpilloverEUR ?? 0) > 0 && <span className="text-[11px] font-normal text-slate-500 dark:text-gray-400"> · tavanı aşan €{fmt(mtd!.poolSpilloverEUR!)} portföyde kaldı</span>}
              </p>
            </div>
          </div>
          {kasaErr && !kasa && (
            <p className="mt-3 text-xs text-amber-700 dark:text-amber-300">Kasa kur etkisi okunamadı ({kasaErr}) — panelde görünüyor olabilir, rakamlar ayrışmasın diye burada gizlenmedi.</p>
          )}
          {kasa && (
            <div className="mt-3 p-2 rounded-lg bg-slate-50 dark:bg-gray-900/40 border border-slate-200 dark:border-gray-700 text-xs">
              <p className="text-slate-500 dark:text-gray-400">
                Kasa <span className="text-[10px]">(portföy DIŞI · kâr havuzuna girmez · taban maaş için tampon)</span>
              </p>
              <p className="font-bold text-base text-gray-900 dark:text-white">
                €{fmt(kasa.totalEurNow)}
                <span className={`ml-2 text-[11px] font-semibold ${kasa.longWindow.fxDeltaEUR < 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                  {kasa.longWindow.sinceDay.slice(5).replace('-', '/')}'den beri kur {sgn(kasa.longWindow.fxDeltaEUR)}€{fmt(kasa.longWindow.fxDeltaEUR)}
                </span>
                <span className={`ml-2 text-[11px] ${kasa.shortWindow.fxDeltaEUR < 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                  · son 30 gün {sgn(kasa.shortWindow.fxDeltaEUR)}€{fmt(kasa.shortWindow.fxDeltaEUR)}
                </span>
              </p>
              <p className="text-[11px] text-slate-500 dark:text-gray-400 mt-0.5">
                {kasa.rows.map(r => `${r.currency} €${fmt(r.eurNow)} (${sgn(r.fxDeltaEUR)}€${fmt(r.fxDeltaEUR)})`).join(' · ')}
                {kasa.missingCcy.length > 0 && ` · kuru yok: ${kasa.missingCcy.join(', ')}`}
              </p>
              <p className="text-[11px] text-slate-500 dark:text-gray-400 mt-1">
                Aynı bakiyenin geçmiş kurlarla karşılaştırması — para yatırma/çekme karışmaz. Atıl döviz beklerken euro değeri oynar.
              </p>
              {cashGaps.length > 0 && (
                <div className="mt-2 text-[11px] text-amber-800 dark:text-amber-200">
                  <p className="font-semibold">Kasa defteri ile kayıtlı bakiye aynı değil. Fark gizlenmedi; kayıtlı bakiye değiştirilmedi.</p>
                  {cashGaps.map(g => (
                    <p key={g.currency}>
                      {g.currency}: kayıt {g.stored.toLocaleString('tr-TR', { maximumFractionDigits: 2 })}, hareketlerden {g.derived.toLocaleString('tr-TR', { maximumFractionDigits: 2 })}
                      {g.gap != null && <> · bakiye farkı {g.gap.toLocaleString('tr-TR', { maximumFractionDigits: 2 })}</>}
                      {g.depGap != null && <> · yatırma farkı {g.depGap.toLocaleString('tr-TR', { maximumFractionDigits: 2 })}</>}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}
          {mtd && (
            <div className="mt-3 p-2 rounded-lg bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900 text-xs text-slate-700 dark:text-gray-300">
              <span className="font-semibold">{mtd.monthLabel} şimdiye kadar ({mtd.asOf.slice(8)}. gün):</span> kâr {sgn(mtd.gainEUR)}€{fmt(mtd.gainEUR)}{mtd.inflationEUR > 0 ? <> · yıl sonu enflasyon payı −€{fmt(mtd.inflationEUR)} = {sgn(mtd.realGainEUR)}€{fmt(mtd.realGainEUR)}</> : <> · enflasyon payı yıl sonunda düşülecek{(mtd.inflationYearEndEstimateEUR ?? 0) > 0 && <> (tahmini €{fmt(mtd.inflationYearEndEstimateEUR ?? 0)})</>}</>}
              {mtd.carryResetApplied && <> · <span className="text-emerald-700 dark:text-emerald-300 font-semibold">Nisan öncesi kazanılan kâr yastığıyla eski açık sıfırlandı</span></>}
              {mtd.carryInEUR < 0 && <> · devreden açık −€{fmt(mtd.carryInEUR)} → kalan açık €{fmt(Math.min(0, mtd.carryInEUR + mtd.realGainEUR))}</>}
              <br />→ <span className="font-semibold">gelecek ay maaş ön izlemesi: €{fmt(mtd.projectedSalaryEUR)}</span> (ay sonuna kadar değişir)
            </div>
          )}
          {accrual && (
            <p className="text-xs text-slate-500 dark:text-gray-400 mt-3">
              {accrual.fromLabel}'dan beri {accrual.months} ay: kâr {sgn(accrual.nominalEUR)}€{fmt(accrual.nominalEUR)}{accrual.inflationEUR > 0 && <> − yıl sonu enflasyon €{fmt(accrual.inflationEUR)} = {sgn(accrual.realEUR)}€{fmt(accrual.realEUR)}</>}
              {accrual.deficitEUR > 0 && <> · <span className="text-amber-700 dark:text-amber-300">açık −€{fmt(accrual.deficitEUR)}, yeni kâr önce bunu kapatır</span></>}
            </p>
          )}
          <div className="mt-3 p-2 rounded-lg bg-slate-50 dark:bg-gray-900/40 border border-slate-200 dark:border-gray-700 flex items-start gap-2">
            <AlertCircle size={14} className="text-slate-500 mt-0.5 shrink-0" />
            <p className="text-[11px] text-slate-600 dark:text-gray-300">Kâr = euro servetin artışı (koyduğun/çektiğin para hariç). Euro baz: kur hareketi kârdır. Zarar ay birikmişten düşer, ana paraya dokunulmaz. Enflasyon payı her ay değil, yıl sonunda (Aralık) bir kez düşülür. Sıfır ayda yastıktan geçin.</p>
          </div>
          <div className="mt-2 flex items-center gap-2 text-[11px]">
            <label className="text-slate-500 dark:text-gray-400">Enflasyon %/yıl</label>
            <input value={inflationInput} onChange={(e) => setInflationInput(e.target.value)} className="w-16 px-1 py-0.5 bg-slate-50 dark:bg-gray-800 border border-slate-300 dark:border-gray-600 rounded" />
            <button type="button" onClick={saveInflation} className="px-2 py-0.5 rounded bg-slate-200 dark:bg-gray-700 font-semibold">Kaydet</button>
            {inflationMsg && <span className="text-slate-500 dark:text-gray-400">{inflationMsg}</span>}
          </div>
          {!(eurRate > 0) && (
            <p className="mt-2 text-[11px] text-amber-700 dark:text-amber-300">Euro kuru yok. Son gerçek kur da yoksa usd ile çarpılarak euro uydurulmaz.</p>
          )}
        </div>

        <div className="bg-white dark:bg-gray-900/50 rounded-xl p-4 border border-emerald-200 dark:border-emerald-900 flex flex-col">
          <p className="text-xs text-slate-500 dark:text-gray-400 uppercase tracking-wide mb-2">💸 Maaş Çek</p>
          <div className="flex items-center gap-1 mb-2"><span className="text-lg font-bold">€</span>
            <input type="number" value={amountInput} placeholder={fmt(remainingEur)} onChange={(e) => setAmountInput(e.target.value)} className="w-full px-2 py-1 text-xl font-bold bg-slate-50 dark:bg-gray-800 border border-slate-300 dark:border-gray-600 rounded" /></div>
          <p className="text-[10px] text-slate-500 dark:text-gray-400 mb-2">Boş bırakırsan kalan hakkın tamamı (€{fmt(remainingEur)}).</p>
          {canWithdraw && cashSources.length > 0 && (
            <div className="mb-2">
              <label className="text-[10px] text-slate-500 dark:text-gray-400 uppercase tracking-wide">Kaynak</label>
              <select value={sourceSymbol} onChange={(e) => setSourceSymbol(e.target.value)} className="w-full mt-0.5 px-2 py-1.5 text-xs font-semibold bg-slate-50 dark:bg-gray-800 border border-slate-300 dark:border-gray-600 rounded">
                {cashSources.map((s) => <option key={s.symbol} value={s.symbol}>{s.ccyDisplay} — {s.quantity.toLocaleString('tr-TR', { maximumFractionDigits: 0 })} (€{fmt(s.valueEur)})</option>)}
              </select>
              {selectedSource && <p className="text-[10px] text-slate-500 dark:text-gray-400 mt-0.5">Düşülecek: <strong>{sourceQty.toFixed(0)} {selectedSource.ccyDisplay}</strong></p>}
            </div>
          )}
          {confirmWithdraw ? (
            <div className="space-y-2">
              <p className="text-xs text-slate-700 dark:text-gray-300"><strong>€{fmt(amountEur)}</strong> çekilecek → {selectedSource?.ccyDisplay} pozisyonundan <strong>{sourceQty.toFixed(0)}</strong> düşer.</p>
              <div className="flex gap-2">
                <button onClick={handleWithdraw} disabled={busy} className="flex-1 py-2 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white text-sm font-bold rounded-lg">{busy ? 'İşleniyor…' : '✓ Onayla'}</button>
                <button onClick={() => setConfirmWithdraw(false)} className="flex-1 py-2 bg-slate-200 dark:bg-gray-700 text-sm font-semibold rounded-lg">İptal</button>
              </div>
            </div>
          ) : (
            <button onClick={() => setConfirmWithdraw(true)} disabled={!canWithdraw || !sourceSufficient}
              className={`mt-auto py-3 rounded-lg font-bold text-sm ${canWithdraw && sourceSufficient ? 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-md' : 'bg-slate-200 dark:bg-gray-700 text-slate-400 cursor-not-allowed'}`}>
              {!canWithdraw ? 'Bu ay hak yok' : !sourceSufficient ? `Kaynak yetersiz (${selectedSource?.ccyDisplay})` : `💸 €${fmt(amountEur)} Çek`}
            </button>
          )}
        </div>
      </div>

      {withdrawals.length > 0 && (
        <div className="px-5 pb-5">
          <p className="text-xs text-slate-500 dark:text-gray-400 uppercase tracking-wide mb-2">Son Çekimler</p>
          <div className="max-h-32 overflow-y-auto space-y-1">
            {withdrawals.slice(0, 5).map((w) => (
              <div key={w.id} className="flex items-center justify-between text-xs py-1.5 px-2 rounded bg-white/60 dark:bg-gray-900/30 border border-slate-200 dark:border-gray-700">
                <span className="text-slate-600 dark:text-gray-400 w-20">{new Date(w.withdrawn_at).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' })}</span>
                <span className="font-bold text-emerald-600 dark:text-emerald-400">{w.note || `-$${Number(w.amount_usd).toFixed(0)}`}</span>
                {w.source_symbol && <span className="text-[10px] text-slate-500 px-1.5 py-0.5 rounded bg-slate-100 dark:bg-gray-800">{Number(w.source_quantity_deducted).toFixed(0)} {w.source_symbol === 'EURO' ? 'EUR' : w.source_symbol}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
