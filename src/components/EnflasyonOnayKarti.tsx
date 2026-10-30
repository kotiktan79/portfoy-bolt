import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { getEurMonths, invalidateEurPnlCache } from '../services/eurPnlService';
import { normalizeInflation, INFLATION_EUR, type MonthRow } from '../lib/eurPnl';
import {
  addInflationDecision, inflationAmountForRate, parseInflationDecisions, parseRatePercent, pendingInflationYears,
  type InflationDecisionKind, type InflationDecisions, type PendingInflationYear,
} from '../lib/inflationDecision';

// YIL SONU ENFLASYON ONAYI (kullanıcı kuralı 2026-10-30): pay, sahip onaylamadan ASLA düşülmez.
// Kart yalnız yılın son ayına (Aralık) gelindiğinde ve o yıl için karar yokken görünür. Yılda tek karar.
const fmt = (n: number) => Math.round(Math.abs(n)).toLocaleString('de-DE');
const pct = (r: number) => (Math.round(r * 1000) / 10).toLocaleString('tr-TR', { maximumFractionDigits: 1 });

export function EnflasyonOnayView({
  pending, defaultRate, onDecide, busy, message,
}: {
  pending: PendingInflationYear;
  defaultRate: number;
  onDecide: (d: { year: number; decision: InflationDecisionKind; rate: number; amountEUR: number }) => void;
  busy?: boolean;
  message?: string | null;
}) {
  const [rateInput, setRateInput] = useState('');
  const custom = parseRatePercent(rateInput);
  const invalid = rateInput.trim() !== '' && custom == null;
  const rate = custom ?? defaultRate;
  const amount = inflationAmountForRate(pending.baseEUR, rate);
  return (
    <section aria-labelledby={`enf-onay-${pending.year}`} className="rounded-xl border-2 border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-4">
      <h3 id={`enf-onay-${pending.year}`} className="text-base font-bold text-gray-900 dark:text-white">{pending.year} enflasyon payı: onayın gerekiyor</h3>
      <p className="mt-1 text-sm text-slate-700 dark:text-gray-200">Bu pay sen onaylamadan düşülmez. Şu an maaş havuzundan hiçbir şey düşülmedi.</p>
      <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
        <div><p className="text-xs text-slate-500 dark:text-gray-400">Yıl</p><p className="font-semibold">{pending.year}</p></div>
        <div><p className="text-xs text-slate-500 dark:text-gray-400">Varsayılan oran</p><p className="font-semibold">%{pct(defaultRate)}/yıl</p></div>
        <div><p className="text-xs text-slate-500 dark:text-gray-400">Bu oranla biriken pay</p><p className="font-semibold">€{fmt(inflationAmountForRate(pending.baseEUR, defaultRate))}</p></div>
        <div>
          <label htmlFor={`enf-oran-${pending.year}`} className="text-xs text-slate-500 dark:text-gray-400">Gerçekleşen enflasyon (%), isteğe bağlı</label>
          <input id={`enf-oran-${pending.year}`} value={rateInput} onChange={e => setRateInput(e.target.value)} placeholder={pct(defaultRate)} inputMode="decimal"
            className="mt-0.5 w-24 px-2 py-1 bg-white dark:bg-gray-800 border border-slate-300 dark:border-gray-600 rounded" />
          {invalid && <p className="text-xs text-red-600 mt-0.5">0 ile 25 arasında bir oran yaz.</p>}
        </div>
      </div>
      <p className="mt-3 text-sm">Onaylarsan düşülecek: <strong data-testid="enf-tutar">€{fmt(amount)}</strong> (%{pct(rate)} ile)</p>
      <div className="mt-3 flex gap-2">
        <button type="button" disabled={busy || invalid} onClick={() => onDecide({ year: pending.year, decision: 'approved', rate, amountEUR: amount })}
          className="flex-1 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-bold">Onayla ve düş</button>
        <button type="button" disabled={busy} onClick={() => onDecide({ year: pending.year, decision: 'declined', rate, amountEUR: 0 })}
          className="flex-1 py-2 rounded-lg bg-slate-200 dark:bg-gray-700 disabled:opacity-50 text-sm font-semibold">Bu yıl düşme</button>
      </div>
      {message && <p className="mt-2 text-xs text-slate-700 dark:text-gray-200">{message}</p>}
    </section>
  );
}

export default function EnflasyonOnayKarti() {
  const [months, setMonths] = useState<MonthRow[] | null>(null);
  const [defaultRate, setDefaultRate] = useState(INFLATION_EUR);
  const [decisions, setDecisions] = useState<InflationDecisions>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let c = false;
    Promise.all([
      getEurMonths(),
      supabase.from('portfoy_bolt_salary_policy').select('*').eq('id', 1).maybeSingle(),
    ]).then(([m, pol]) => {
      if (c) return;
      setMonths(m);
      if (!pol.error && pol.data) {
        setDefaultRate(normalizeInflation(pol.data.inflation_annual));
        setDecisions(parseInflationDecisions((pol.data as Record<string, unknown>).inflation_decisions));
      }
    }).catch(() => { if (!c) setMonths([]); });
    return () => { c = true; };
  }, []);

  async function decide(d: { year: number; decision: InflationDecisionKind; rate: number; amountEUR: number }) {
    const ok = window.confirm(d.decision === 'approved'
      ? `${d.year} için €${fmt(d.amountEUR)} enflasyon payı maaş havuzundan düşülecek. Bu karar bu yıl için tek seferliktir. Onaylıyor musun?`
      : `${d.year} için enflasyon payı düşülmeyecek. Bu karar bu yıl için tek seferliktir. Emin misin?`);
    if (!ok) return;
    setBusy(true); setMessage(null);
    try {
      // En güncel kayıttan birleştir; o yıl karar varsa değiştirme
      const cur = await supabase.from('portfoy_bolt_salary_policy').select('*').eq('id', 1).maybeSingle();
      if (cur.error || !cur.data) { setMessage('Ayar satırı okunamadı. Hiçbir şey düşülmedi.'); return; }
      const raw = cur.data as Record<string, unknown>;
      if (!('inflation_decisions' in raw)) {
        setMessage('Karar kaydedilemedi: veritabanında karar sütunu henüz yok (kurulum onayını bekliyor). Hiçbir şey düşülmedi.');
        return;
      }
      const next = addInflationDecision(parseInflationDecisions(raw.inflation_decisions), d);
      if (!next) { setMessage(`${d.year} için karar zaten verilmiş. Değiştirilmedi.`); return; }
      const { error } = await supabase.from('portfoy_bolt_salary_policy')
        .update({ inflation_decisions: next, updated_at: new Date().toISOString() }).eq('id', 1);
      if (error) { setMessage('Karar kaydedilemedi. Hiçbir şey düşülmedi.'); return; }
      setDecisions(next);
      invalidateEurPnlCache();
      setMessage(d.decision === 'approved' ? 'Onaylandı. Sayfa yenileniyor.' : 'Bu yıl düşülmeyecek. Sayfa yenileniyor.');
      window.setTimeout(() => window.location.reload(), 800);
    } finally {
      setBusy(false);
    }
  }

  if (!months) return null;
  const pending = pendingInflationYears(months).filter(p => !decisions[String(p.year)]);
  if (!pending.length) return null;
  return (
    <div className="space-y-3">
      {pending.map(p => <EnflasyonOnayView key={p.year} pending={p} defaultRate={defaultRate} onDecide={decide} busy={busy} message={message} />)}
    </div>
  );
}
