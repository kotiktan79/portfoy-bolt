import type { SalaryRuleConfig, SalaryRuleMode, SpendDownPlan, ExpectedPathRow } from '../lib/spendDownSalary';
import { explainSpendDown } from '../lib/spendDownSalary';

// HARCA-BİTİR MAAŞ KARTI (2026-11-02). Hesap: lib/spendDownSalary.ts. Bu kart yalnız gösterir;
// yazma işi (mod değişimi, yılın maaşını sabitleme) üst bileşende ve yalnız Tan'ın tıklamasıyla.

const e = (n: number) => `€${Math.round(n).toLocaleString('de-DE')}`;

interface Props {
  mode: SalaryRuleMode;
  config: SalaryRuleConfig;
  plan: SpendDownPlan | null;
  path: ExpectedPathRow[];
  preview: boolean;
  startLabel: string;
  canFix: boolean;
  busy: boolean;
  message: string | null;
  onSwitchMode: (m: SalaryRuleMode) => void;
  onFixYear: () => void;
}

export default function HarcaBitirMaasKarti(p: Props) {
  const btn = (m: SalaryRuleMode, label: string) => (
    <button
      type="button"
      disabled={p.busy || p.mode === m}
      onClick={() => p.onSwitchMode(m)}
      aria-pressed={p.mode === m}
      className={`px-3 py-1 rounded-lg text-xs font-semibold border ${p.mode === m ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white dark:bg-gray-900 text-slate-700 dark:text-gray-200 border-slate-300 dark:border-gray-600'}`}
    >{label}</button>
  );
  return (
    <div data-testid="harca-bitir" className="mx-5 mt-4 rounded-xl border border-emerald-200 dark:border-emerald-900 bg-white/80 dark:bg-gray-900/40 p-4 text-sm text-slate-700 dark:text-gray-200">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-xs font-bold uppercase tracking-wide text-slate-600 dark:text-gray-300 mr-auto">Maaş kuralı</p>
        {btn('profit', 'Kâr kuralı')}
        {btn('spend_down', 'Harca-bitir kuralı')}
      </div>

      {p.mode === 'profit' && (
        <p className="mt-2 text-xs text-slate-500 dark:text-gray-400">
          Şu an kâr kuralı açık: maaş geçen ayın reel kârından gelir.
          {p.plan && <> Harca-bitir kuralına geçersen {p.plan.year} maaşın <strong>{e(p.plan.monthlyEUR)}/ay</strong> olurdu.</>}
        </p>
      )}

      {p.mode === 'spend_down' && p.plan && (
        <>
          {p.preview && (
            <p className="mt-2 text-xs font-semibold text-amber-700 dark:text-amber-300">Ön izleme: maaş {p.startLabel} tarihinde başlar. Rakam bugünkü portföye göre; Ocak'ta sabitlenir.</p>
          )}
          <p className="mt-2 text-3xl font-bold text-emerald-700 dark:text-emerald-300">{e(p.plan.monthlyEUR)}<span className="text-sm font-normal text-slate-500 dark:text-gray-400">/ay · {p.plan.year} maaşı</span></p>
          <p className="text-xs text-slate-500 dark:text-gray-400">
            {p.plan.fixed ? 'Bu yılın maaşı sabitlendi; yıl içinde piyasa oynasa da değişmez.' : 'Henüz sabitlenmedi: rakam piyasayla oynar.'}
            {p.plan.fromKasaEUR > 0 && <> Bunun {e(p.plan.fromKasaEUR)}'su kasadan, {e(p.plan.fromPortfolioEUR)}'su portföyden.</>}
          </p>
          <ul className="mt-2 space-y-0.5 text-xs" data-testid="harca-bitir-aciklama">
            {explainSpendDown(p.plan, p.config).map((l, i) => <li key={i}>{l}</li>)}
            <li className="text-slate-500 dark:text-gray-400">Taban {e(p.config.floorEUR)}/ay. {p.config.capEUR ? `Tavan ${e(p.config.capEUR)}.` : 'Tavan yok.'} Kasa yalnız kötü yılda tabana tamamlar; otomatik geri doldurulmaz.</li>
            <li className="text-slate-500 dark:text-gray-400">Enflasyon artışı yalnız yıl sonu enflasyon onayınla eklenir; kendiliğinden düşülmez.</li>
          </ul>
          {p.canFix && (
            <button type="button" disabled={p.busy} onClick={p.onFixYear} className="mt-3 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold">Bu yılın maaşını {e(p.plan.monthlyEUR)} olarak sabitle</button>
          )}
          {p.path.length > 0 && (
            <div className="mt-3">
              <p className="text-xs font-semibold">Beklenen yol (her yıl %{(p.config.realRate * 100).toLocaleString('tr-TR')} reel getiri olursa, bugünkü euro ile)</p>
              <table className="mt-1 w-full text-xs" data-testid="harca-bitir-yol">
                <thead><tr className="text-left text-slate-500 dark:text-gray-400"><th className="py-0.5">Yıl</th><th>Yaş</th><th className="text-right">Yıl başı para</th><th className="text-right">Maaş/ay</th></tr></thead>
                <tbody>
                  {p.path.map(r => (
                    <tr key={r.year} className="border-t border-slate-100 dark:border-gray-800">
                      <td className="py-0.5">{r.year}</td><td>{r.age}</td>
                      <td className="text-right">{e(r.startEUR)}</td>
                      <td className="text-right font-semibold">{r.monthlyEUR > 0 ? e(r.monthlyEUR) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-1 text-[11px] text-slate-500 dark:text-gray-400">Bu tablo sabit reel getiri varsayımıyla hesaplanır. Gerçek getiri değişir; maaş ve kalan para garanti değildir.</p>
            </div>
          )}
        </>
      )}
      {p.message && <p className="mt-2 text-xs text-slate-500 dark:text-gray-400">{p.message}</p>}
    </div>
  );
}
