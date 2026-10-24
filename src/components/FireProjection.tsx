import { useEffect, useMemo, useRef, useState } from 'react';
import { Target, TrendingUp, Flag, Wallet } from 'lucide-react';
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from 'recharts';
import { projectFire, poolRuleCapitalFor, poolRuleMonthlyFrom, nominalCapitalOn, FireInputs } from '../services/fireProjectionService';
import { useDarkMode } from '../hooks/useDarkMode';
import { chartChrome } from '../lib/chartTheme';

// AYLIK MAAŞ HEDEFİ — EUR. Birincil ölçü taban maaş (€700), tavan iyi yıl (€1.000).
// Sermaye grafiği bu maaşın gerektirdiği tutardır. Dış katkı varsayılan 0 (2026-09-20).
// Kira ve çiftlik beklenendir: maaş kartına girmez; aktif olursa yalnız grafikten düşülür.
// Kasa maaş tamponudur: ilerlemeye girer, getiri çizgisinde büyümez.
// Gelir sekmesi kupon/temettüdür; bu liste oradan okunmaz.
import { MONTHLY_CAP_EUR, INFLATION_EUR, SALARY_SAFETY, dayInTZ, normalizeInflation } from '../lib/eurPnl';
import { SALARY_START_MONTH, SALARY_FLOOR_EUR, KASA_MIN_EUR } from '../lib/salaryPlan';
import {
  CONSERVATIVE_WITHDRAWAL_PCT,
  PLANNED_NOMINAL_RETURN_PCT,
  PLANNED_WITHDRAWAL_PCT,
  SALARY_SHORTFALL_BAND,
  fixedRealWithdrawalYears,
  roughYearsPhrase,
  salaryCoverage,
  salaryProgressPct,
  type SalaryCoverage,
} from '../lib/salaryGoal';
import { getEurDaily } from '../services/eurPnlService';
import { getKasaFx } from '../services/kasaFxService';
import { fmtEUR0, fmtAxisEUR } from '../lib/chartTheme';
import { supabase } from '../lib/supabase';
import {
  annualAmountEUR,
  annualExternalEUR,
  parseExternalSettings,
  requiredRealCapital,
  scenarioProgressPct,
  sustainableMonthlyEUR,
  type ExternalIncome,
  type ExternalIncomeSettings,
  type ExternalScenario,
  type IncomeFrequency,
  type IncomeStatus,
} from '../lib/externalIncome';

const STORAGE_KEY = 'tandor_fire_inputs_eur';   // eski USD kayıtları ('tandor_fire_inputs') bilerek okunmaz
const INCOME_KEY = 'tandor_fire_external_income_eur';

interface StoredInputs {
  monthlyContribution: number;
  annualReturnPct: number;
  /** Birincil hedef: aylık maaş tabanı, bugünkü euro. */
  targetMonthlyIncome: number;
  /** İyi yıl tavanı. 0 ise satır ve süre notu gizlenir. */
  goodYearMonthlyEUR: number;
  safeWithdrawalRatePct: number;
  annualInflationPct: number;
}

const INPUTS_VERSION = 3;
/** Maaş tabanı ve çekim oranı bu sürümde yerleşti. Sonraki sürüm onları yeniden göçürmez. */
const SALARY_INPUTS_VERSION = 2;
/** PR #13 varsayılanı. Kayıtta sürüm yoksa ve oran hâlâ buysa planlanan %5'e alınır. */
const OLD_DEFAULT_WITHDRAWAL_PCT = CONSERVATIVE_WITHDRAWAL_PCT;
/** Eski tek hedef, iyi yıl tavanıydı. Sürüm yoksa tabana (€700) çekilir. */
const OLD_DEFAULT_TARGET_EUR = MONTHLY_CAP_EUR;
/** Eski sayfa varsayılanı. Sürüm 3'ten önce kayıtlı %4 planlanan %6,5'e alınır. */
const OLD_DEFAULT_RETURN_PCT = 4;

const DEFAULTS: StoredInputs = {
  monthlyContribution: 0,                     // dış katkı yok (kullanıcı beyanı 2026-09-18)
  annualReturnPct: PLANNED_NOMINAL_RETURN_PCT, // nominal plan ~%6-8; süre notu bundan enflasyonu düşer
  targetMonthlyIncome: SALARY_FLOOR_EUR,      // €700/ay birincil maaş hedefi
  goodYearMonthlyEUR: MONTHLY_CAP_EUR,        // €1.000 iyi yıl; isteğe bağlı
  safeWithdrawalRatePct: PLANNED_WITHDRAWAL_PCT,
  annualInflationPct: INFLATION_EUR * 100,    // motorla aynı (varsayılan %3)
};

function numOr(v: unknown, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function loadStored(): { inputs: StoredInputs; migrated: boolean } | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Record<string, unknown>;
    if (!p || typeof p !== 'object') return null;
    const version = Number(p.inputsVersion);
    const salarySettled = version >= SALARY_INPUTS_VERSION;
    const returnSettled = version >= INPUTS_VERSION;
    const storedTarget = numOr(p.targetMonthlyIncome, salarySettled ? DEFAULTS.targetMonthlyIncome : OLD_DEFAULT_TARGET_EUR);
    const storedRate = numOr(p.safeWithdrawalRatePct, salarySettled ? DEFAULTS.safeWithdrawalRatePct : OLD_DEFAULT_WITHDRAWAL_PCT);
    const storedReturn = numOr(p.annualReturnPct, returnSettled ? DEFAULTS.annualReturnPct : OLD_DEFAULT_RETURN_PCT);
    // Eski kayıtta €1.000 "hedef gelir"di; artık tavan. Özel bir tutar (1000 değilse) durur.
    const targetMonthlyIncome = salarySettled || storedTarget !== OLD_DEFAULT_TARGET_EUR ? storedTarget : DEFAULTS.targetMonthlyIncome;
    // Eski varsayılan çekim %4 ise planlanan %5 olur; kullanıcı başka oran yazdıysa o kalır.
    const safeWithdrawalRatePct = salarySettled || storedRate !== OLD_DEFAULT_WITHDRAWAL_PCT ? storedRate : DEFAULTS.safeWithdrawalRatePct;
    // Eski varsayılan getiri %4 ise planlanan %6,5 olur. Başka bir kayıtlı getiri durur.
    // Sürüm 3'te %4 bilinçli seçimdir, yeniden göçmez.
    const annualReturnPct = returnSettled || storedReturn !== OLD_DEFAULT_RETURN_PCT ? storedReturn : DEFAULTS.annualReturnPct;
    return {
      migrated: targetMonthlyIncome !== storedTarget || safeWithdrawalRatePct !== storedRate || annualReturnPct !== storedReturn,
      inputs: {
        monthlyContribution: numOr(p.monthlyContribution, DEFAULTS.monthlyContribution),
        annualReturnPct,
        targetMonthlyIncome,
        goodYearMonthlyEUR: numOr(p.goodYearMonthlyEUR, DEFAULTS.goodYearMonthlyEUR),
        safeWithdrawalRatePct,
        annualInflationPct: DEFAULTS.annualInflationPct,
      },
    };
  } catch {
    return null;
  }
}

function persistInputs(next: StoredInputs) {
  const payload: Record<string, unknown> = { ...next, inputsVersion: INPUTS_VERSION };
  delete payload.annualInflationPct;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

function fmtPctTr(n: number): string {
  return (Math.round(n * 10) / 10).toLocaleString('de-DE', { maximumFractionDigits: 1 });
}

function depletionNote(
  years: number | null,
  monthlyEUR: number,
  realPct: number,
  returnPct: number,
  inflationPct: number,
): string {
  const money = fmtEUR0(monthlyEUR);
  const assumption = `Varsayım: yıllık getiri %${fmtPctTr(returnPct)} − enflasyon %${fmtPctTr(inflationPct)} = reel %${fmtPctTr(realPct)}. Ay sonu çekim, reel getiri aylık bileşik.`;
  if (years == null) return `Sabit ${money}/ay için süre hesaplanamadı. ${assumption}`;
  if (!Number.isFinite(years)) return `Sabit ${money}/ay bu reel getiriyle sermayeyi eritmez. ${assumption}`;
  if (years <= 0) return `Bugünkü sermaye sabit ${money}/ay taşımaz. ${assumption}`;
  return `Sabit ${money}/ay, bugünkü sermayeden (portföy + kasa) ${roughYearsPhrase(years)} sürer. ${assumption}`;
}

function coverageTone(coverage: SalaryCoverage): string {
  if (coverage === 'sürdürülebilir') return 'text-emerald-700 dark:text-emerald-300';
  if (coverage === 'sınırda') return 'text-amber-700 dark:text-amber-300';
  return 'text-rose-700 dark:text-rose-300';
}

function coverageBox(coverage: SalaryCoverage): string {
  if (coverage === 'sürdürülebilir') return 'bg-emerald-50/80 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900';
  if (coverage === 'sınırda') return 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900';
  return 'bg-rose-50/80 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900';
}

export default function FireProjection() {
  const { isDark } = useDarkMode();
  const chrome = chartChrome(isDark);

  const [inputs, setInputs] = useState<StoredInputs>(() => loadStored()?.inputs ?? { ...DEFAULTS });
  const [income, setIncome] = useState<ExternalIncomeSettings>(() => parseExternalSettings(localStorage.getItem(INCOME_KEY)));
  const [policyInflationPct, setPolicyInflationPct] = useState(INFLATION_EUR * 100);
  const inflationTouched = useRef(false);
  // Portföy serveti kasa HARİÇ (kâr cetveli). Kasa ayrıca, maaş tamponu olarak ilerlemeye eklenir.
  const [wealthEUR, setWealthEUR] = useState<number | null>(null);
  const [kasaEUR, setKasaEUR] = useState<number | null>(null);
  const [kasaNote, setKasaNote] = useState('kasa yükleniyor');
  useEffect(() => {
    const loaded = loadStored();
    if (!loaded?.migrated) return;
    persistInputs(loaded.inputs);
  }, []);

  useEffect(() => {
    let cancelled = false;
    getEurDaily().then(d => { if (!cancelled && d.length) setWealthEUR(d[d.length - 1].wealthEUR); }).catch(() => {});
    getKasaFx().then(k => {
      if (cancelled) return;
      if (k && k.totalEurNow > 0) {
        setKasaEUR(k.totalEurNow);
        setKasaNote('kasa tamponu');
      } else {
        setKasaEUR(0);
        setKasaNote('kasa €0 veya kur yok');
      }
    }).catch(() => {
      if (cancelled) return;
      setKasaEUR(0);
      setKasaNote('kasa okunamadı');
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { data, error } = await supabase.from('portfoy_bolt_salary_policy').select('inflation_annual').eq('id', 1).maybeSingle();
        if (cancelled || error || !data) return;
        const pct = Math.round(normalizeInflation(data.inflation_annual) * 1000) / 10;
        setPolicyInflationPct(pct);
        if (!inflationTouched.current) setInputs(prev => ({ ...prev, annualInflationPct: pct }));
      } catch {
        /* ayar okunamazsa varsayılan %3 kalır */
      }
    })();
    return () => { cancelled = true; };
  }, []);

  function update(field: keyof StoredInputs, raw: string) {
    const v = parseFloat(raw);
    if (field === 'annualInflationPct') inflationTouched.current = true;
    const next = { ...inputs, [field]: Number.isFinite(v) ? v : 0 };
    setInputs(next);
    persistInputs(next);
  }

  function saveIncome(next: ExternalIncomeSettings) {
    setIncome(next);
    localStorage.setItem(INCOME_KEY, JSON.stringify(next));
  }

  function patchSource(id: string, patch: Partial<ExternalIncome>) {
    saveIncome({ ...income, sources: income.sources.map(s => s.id === id ? { ...s, ...patch } : s) });
  }

  // Motor gelene kadar uydurma EUR/USD yok. Servet 0 görünür ve uyarı yazılır.
  const wealthMissing = wealthEUR == null;
  const currentValueEUR = wealthEUR ?? 0;

  // Havuz kuralının (Kâr Cüzdanı) aynı hedef için istediği sermaye ve bugünkü portföyün beklentisi —
  // sayfanın kendi getiri/enflasyon girdilerinden türetilir, sabit rakam yok.
  const realRatePct = inputs.annualReturnPct - inputs.annualInflationPct;
  const poolRuleCapital = poolRuleCapitalFor(inputs.targetMonthlyIncome, realRatePct, SALARY_SAFETY);
  const poolRuleMonthlyNow = poolRuleMonthlyFrom(currentValueEUR, realRatePct, SALARY_SAFETY, MONTHLY_CAP_EUR);

  const annualAll = annualExternalEUR(income.sources, 'tumu');
  const annualActive = annualExternalEUR(income.sources, 'aktif');
  const annualChosen = income.scenario === 'aktif' ? annualActive : annualAll;
  const capitalAll = requiredRealCapital(inputs.targetMonthlyIncome, annualAll, inputs.safeWithdrawalRatePct);
  const capitalActive = requiredRealCapital(inputs.targetMonthlyIncome, annualActive, inputs.safeWithdrawalRatePct);
  const grossCapital = requiredRealCapital(inputs.targetMonthlyIncome, 0, inputs.safeWithdrawalRatePct);
  const kasaCounted = kasaEUR ?? 0;
  const resourcesEUR = currentValueEUR + kasaCounted;
  const progressAll = scenarioProgressPct(resourcesEUR, inputs.targetMonthlyIncome, annualAll, inputs.safeWithdrawalRatePct);
  const progressActive = scenarioProgressPct(resourcesEUR, inputs.targetMonthlyIncome, annualActive, inputs.safeWithdrawalRatePct);
  const sustainableMonthly = sustainableMonthlyEUR(resourcesEUR, inputs.safeWithdrawalRatePct);
  const salaryGoal = inputs.targetMonthlyIncome;
  const goodYear = inputs.goodYearMonthlyEUR;
  const showGoodYear = goodYear > 0;
  const capitalForGoal = requiredRealCapital(salaryGoal, 0, inputs.safeWithdrawalRatePct);
  const capitalForGoodYear = showGoodYear ? requiredRealCapital(goodYear, 0, inputs.safeWithdrawalRatePct) : 0;
  const salaryProgress = salaryProgressPct(sustainableMonthly, salaryGoal);
  const coverage = salaryCoverage(sustainableMonthly, salaryGoal);
  const depletionYears = showGoodYear ? fixedRealWithdrawalYears(resourcesEUR, goodYear, realRatePct) : null;
  const portfolioOnly = annualChosen <= 0;

  const projection = useMemo(() => {
    const fi: FireInputs = {
      currentValue: currentValueEUR,
      ...inputs,
      annualExternalIncome: annualChosen,
      progressValue: resourcesEUR,
    };
    return projectFire(fi);
  }, [currentValueEUR, inputs, annualChosen, resourcesEUR]);

  const baseYear = new Date().getFullYear();
  const asOf = dayInTZ(new Date());
  const goalDate = `${SALARY_START_MONTH}-01`;
  const nominalAtGoal = nominalCapitalOn(projection.targetPortfolio, inputs.annualInflationPct, asOf, goalDate);
  const goalLabel = (() => {
    const [y, m] = SALARY_START_MONTH.split('-');
    const months = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
    return `${months[Number(m) - 1] || m} ${y}`;
  })();
  const chartData = useMemo(
    () =>
      projection.yearByYear.map((y) => ({
        yearLabel: String(baseYear + y.year),
        nominalValue: y.endOfYearValue,
        realValue: y.realEndOfYearValue,
        principal: currentValueEUR + y.contributionsYTD,
        monthlyAtSWR: y.monthlyIncomeAtSWR,
        growthYTD: y.growthYTD,
        realTarget: y.realTarget,
        compareTarget: income.scenario === 'aktif' ? capitalAll : capitalActive,
        nominalTarget: y.inflationTarget,
      })),
    [projection, baseYear, currentValueEUR, income.scenario, capitalAll, capitalActive]
  );

  const seriesColor = isDark ? '#3987e5' : '#2a78d6';
  const principalColor = isDark ? '#9085e9' : '#4a3aa7';
  const targetReached = projection.yearsToTarget !== null;
  const yearsLabel = projection.yearsToTarget === 0
    ? 'Bugün'
    : targetReached
      ? `${projection.yearsToTarget} yıl (${baseYear + (projection.yearsToTarget || 0)})`
      : '40+ yıl';
  const scenarioLabel = portfolioOnly ? 'portföy' : income.scenario === 'aktif' ? 'yalnız aktif' : 'tüm dış gelir';
  const compareName = income.scenario === 'aktif' ? 'Tüm gelir (karşılaştırma, bugünkü €)' : 'Yalnız aktif (karşılaştırma, bugünkü €)';
  const selectedName = portfolioOnly ? 'Sermaye hedefi (portföy, bugünkü €)' : income.scenario === 'aktif' ? 'Sermaye hedefi, yalnız aktif' : 'Sermaye hedefi, tüm gelir';
  const showCompare = !portfolioOnly && Math.abs(capitalAll - capitalActive) >= 1;

  const inputFields: { key: keyof StoredInputs; label: string; suffix: string; step: string; hint?: string }[] = [
    { key: 'targetMonthlyIncome', label: 'Aylık maaş hedefi', suffix: '€', step: '50', hint: `Birincil hedef. ${goalLabel}'den itibaren taban. Varsayılan €${SALARY_FLOOR_EUR.toLocaleString('de-DE')}.` },
    { key: 'goodYearMonthlyEUR', label: 'İyi yıl tavanı', suffix: '€', step: '50', hint: `İsteğe bağlı. İyi yılda üst seviye; 0 ise gizlenir. Varsayılan €${MONTHLY_CAP_EUR.toLocaleString('de-DE')}.` },
    { key: 'safeWithdrawalRatePct', label: 'Güvenli çekim (SWR)', suffix: '%', step: '0.1', hint: 'Planlanan seviye %5, muhafazakâr %4. Bu tarayıcıda durur.' },
    { key: 'annualReturnPct', label: 'Yıllık getiri', suffix: '%', step: '0.5', hint: `Varsayılan %${PLANNED_NOMINAL_RETURN_PCT.toLocaleString('de-DE')} nominal (yaklaşık %6–8). Süre notunda enflasyon düşülür.` },
    { key: 'annualInflationPct', label: 'Enflasyon (uygulama ayarı)', suffix: '%', step: '0.5' },
    { key: 'monthlyContribution', label: 'Aylık dış katkı', suffix: '€', step: '100' },
  ];

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-slate-200 dark:border-gray-700 overflow-hidden">
      <div className="p-5 border-b border-slate-200 dark:border-gray-700 flex items-center gap-2">
        <Target className="text-brand-600 dark:text-brand-400" size={22} />
        <div>
          <h3 className="text-lg font-bold text-gray-900 dark:text-white">Aylık maaş hedefi</h3>
          <p className="text-xs text-slate-500 dark:text-gray-400">
            {wealthMissing
              ? 'Euro servet henüz yok. Son gerçek kur da yoksa usd ile çarpılarak euro uydurulmaz.'
              : `Portföy €${Math.round(currentValueEUR).toLocaleString('de-DE')} + ${kasaNote} €${Math.round(kasaCounted).toLocaleString('de-DE')}. ${goalLabel}'den itibaren taban ${fmtEUR0(salaryGoal)}/ay${showGoodYear ? `, iyi yıl ${fmtEUR0(goodYear)}/ay` : ''}. Grafik bu maaşın gerektirdiği sermayedir.`}
          </p>
        </div>
      </div>

      {/* Varsayımlar */}
      <div className="p-5 grid grid-cols-2 md:grid-cols-3 gap-3 border-b border-slate-200 dark:border-gray-700">
        {inputFields.map((f) => (
          <div key={f.key}>
            <label className="block">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-gray-400">
                {f.label}
              </span>
              <div className="mt-1 flex items-center gap-1 bg-slate-50 dark:bg-gray-900/60 border border-slate-200 dark:border-gray-600 rounded-lg px-2 py-1.5">
                <input
                  type="number"
                  step={f.step}
                  value={inputs[f.key]}
                  onChange={(e) => update(f.key, e.target.value)}
                  className="w-full bg-transparent text-sm font-bold text-gray-900 dark:text-white outline-none"
                />
                <span className="text-xs text-slate-400">{f.suffix}</span>
              </div>
              {f.hint && <span className="mt-1 block text-[10px] normal-case tracking-normal font-normal text-slate-500 dark:text-gray-400">{f.hint}</span>}
            </label>
            {f.key === 'safeWithdrawalRatePct' && (
              <div className="mt-1 flex flex-wrap gap-1">
                <button
                  type="button"
                  aria-pressed={inputs.safeWithdrawalRatePct === PLANNED_WITHDRAWAL_PCT}
                  onClick={() => update('safeWithdrawalRatePct', String(PLANNED_WITHDRAWAL_PCT))}
                  className={`text-[10px] font-semibold rounded-md px-1.5 py-0.5 border ${
                    inputs.safeWithdrawalRatePct === PLANNED_WITHDRAWAL_PCT
                      ? 'border-brand-600 text-brand-700 dark:text-brand-300 bg-brand-50/70 dark:bg-brand-950/30'
                      : 'border-slate-200 dark:border-gray-600 text-slate-500 dark:text-gray-400'
                  }`}
                >
                  Planlanan %{PLANNED_WITHDRAWAL_PCT}
                </button>
                <button
                  type="button"
                  aria-pressed={inputs.safeWithdrawalRatePct === CONSERVATIVE_WITHDRAWAL_PCT}
                  onClick={() => update('safeWithdrawalRatePct', String(CONSERVATIVE_WITHDRAWAL_PCT))}
                  className={`text-[10px] font-semibold rounded-md px-1.5 py-0.5 border ${
                    inputs.safeWithdrawalRatePct === CONSERVATIVE_WITHDRAWAL_PCT
                      ? 'border-brand-600 text-brand-700 dark:text-brand-300 bg-brand-50/70 dark:bg-brand-950/30'
                      : 'border-slate-200 dark:border-gray-600 text-slate-500 dark:text-gray-400'
                  }`}
                >
                  Muhafazakâr %{CONSERVATIVE_WITHDRAWAL_PCT}
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      <details className="px-5 py-4 border-b border-slate-200 dark:border-gray-700">
        <summary className="cursor-pointer text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-gray-400">
          Dış gelir (beklenen, hedefe dahil değil)
        </summary>
        <div className="mt-3 space-y-3">
        <p className="text-[11px] text-slate-500 dark:text-gray-400">
          Çiftlik ve kira belirsiz olduğu için beklenen başlar; maaş kartı onları saymaz. Durumu aktif yapılınca grafik o geliri sermayeden düşer.
          Gelir sekmesi kupon ve temettü kaydıdır. Ayar bu tarayıcıda durur.
        </p>
        <div className="space-y-2">
          {income.sources.map(source => (
            <div key={source.id} className="grid grid-cols-2 md:grid-cols-12 gap-2 items-end">
              <label className="col-span-2 md:col-span-4 block">
                <span className="text-[10px] uppercase tracking-wide text-slate-400">Ad</span>
                <input
                  value={source.label}
                  onChange={e => patchSource(source.id, { label: e.target.value.slice(0, 80) })}
                  className="mt-1 w-full bg-slate-50 dark:bg-gray-900/60 border border-slate-200 dark:border-gray-600 rounded-lg px-2 py-1.5 text-sm font-semibold text-gray-900 dark:text-white outline-none"
                />
              </label>
              <label className="block md:col-span-2">
                <span className="text-[10px] uppercase tracking-wide text-slate-400">Tutar €</span>
                <input
                  type="number"
                  min="0"
                  step="100"
                  value={source.amountEUR}
                  onChange={e => patchSource(source.id, { amountEUR: Math.max(0, parseFloat(e.target.value) || 0) })}
                  className="mt-1 w-full bg-slate-50 dark:bg-gray-900/60 border border-slate-200 dark:border-gray-600 rounded-lg px-2 py-1.5 text-sm font-bold text-gray-900 dark:text-white outline-none"
                />
              </label>
              <label className="block md:col-span-2">
                <span className="text-[10px] uppercase tracking-wide text-slate-400">Sıklık</span>
                <select
                  value={source.frequency}
                  onChange={e => patchSource(source.id, { frequency: e.target.value as IncomeFrequency })}
                  className="mt-1 w-full bg-slate-50 dark:bg-gray-900/60 border border-slate-200 dark:border-gray-600 rounded-lg px-2 py-1.5 text-sm text-gray-900 dark:text-white outline-none"
                >
                  <option value="yearly">Yıllık</option>
                  <option value="monthly">Aylık</option>
                </select>
              </label>
              <label className="block md:col-span-2">
                <span className="text-[10px] uppercase tracking-wide text-slate-400">Durum</span>
                <select
                  value={source.status}
                  onChange={e => patchSource(source.id, { status: e.target.value as IncomeStatus })}
                  className="mt-1 w-full bg-slate-50 dark:bg-gray-900/60 border border-slate-200 dark:border-gray-600 rounded-lg px-2 py-1.5 text-sm text-gray-900 dark:text-white outline-none"
                >
                  <option value="aktif">Aktif</option>
                  <option value="beklenen">Beklenen</option>
                </select>
              </label>
              <div className="md:col-span-2 flex items-center justify-between gap-2">
                <span className="text-[11px] text-slate-500 dark:text-gray-400">{fmtEUR0(annualAmountEUR(source))}/yıl</span>
                <button
                  type="button"
                  onClick={() => saveIncome({ ...income, sources: income.sources.filter(s => s.id !== source.id) })}
                  className="text-[11px] font-semibold text-slate-500 hover:text-red-600"
                >
                  Sil
                </button>
              </div>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => saveIncome({
            ...income,
            sources: [...income.sources, { id: crypto.randomUUID(), label: 'Yeni gelir', amountEUR: 0, frequency: 'yearly', status: 'beklenen' }],
          })}
          className="text-xs font-semibold text-brand-700 dark:text-brand-300"
        >
          Gelir ekle
        </button>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <ScenarioCard
            selected={income.scenario === 'aktif'}
            title="Yalnız aktif gelirle"
            capital={capitalActive}
            progress={progressActive}
            detail={`(12 × €${inputs.targetMonthlyIncome.toLocaleString('de-DE')} − ${fmtEUR0(annualActive)}) / %${inputs.safeWithdrawalRatePct} · grafik · beklenen hariç`}
            onPick={() => saveIncome({ ...income, scenario: 'aktif' })}
          />
          <ScenarioCard
            selected={income.scenario === 'tumu'}
            title="Tüm dış gelirle"
            capital={capitalAll}
            progress={progressAll}
            detail={`(12 × €${inputs.targetMonthlyIncome.toLocaleString('de-DE')} − ${fmtEUR0(annualAll)}) / %${inputs.safeWithdrawalRatePct} · karşılaştırma · aktif + beklenen`}
            onPick={() => saveIncome({ ...income, scenario: 'tumu' satisfies ExternalScenario })}
          />
        </div>
        <p className="text-[11px] text-slate-500 dark:text-gray-400">
          Portföy tek başına {fmtEUR0(grossCapital)} ister. Grafik hedefi seçilen senaryodur ({scenarioLabel}). Birincil maaş kartı dış geliri saymaz.
        </p>
        </div>
      </details>

      <div className="p-5 border-b border-slate-200 dark:border-gray-700 space-y-3">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          <div className={`lg:col-span-2 rounded-xl p-4 border ${coverageBox(coverage)}`}>
            <p className="text-sm font-semibold text-gray-900 dark:text-white">
              Bugünkü sermaye ile sürdürülebilir maaş: {fmtEUR0(sustainableMonthly)}/ay
            </p>
            <p className={`text-base font-bold mt-1 ${coverageTone(coverage)}`}>
              {fmtEUR0(salaryGoal)} maaş {coverage}
            </p>
            <div className="h-2 rounded-full bg-white/70 dark:bg-gray-700 overflow-hidden mt-3">
              <div
                className="h-full bg-brand-600"
                style={{ width: `${Math.min(100, Math.max(0, salaryProgress))}%` }}
              />
            </div>
            <p className="text-[11px] text-slate-600 dark:text-gray-300 mt-1">
              {fmtEUR0(salaryGoal)} hedefine ilerleme %{Math.max(0, salaryProgress).toFixed(0)}
            </p>
            <p className="text-[11px] text-slate-500 dark:text-gray-400 mt-1">
              Portföy {fmtEUR0(currentValueEUR)} + kasa {fmtEUR0(kasaCounted)} × %{inputs.safeWithdrawalRatePct} SWR ÷ 12. Dış gelir eklenmez.
              Karşılıyorsa sürdürülebilir. Görünen tutar hedefin %{Math.round(SALARY_SHORTFALL_BAND * 100)} yakınında ama altındaysa sınırda; daha altta kısa geliyor.
            </p>
          </div>
          <div className="rounded-xl p-4 border border-slate-200 dark:border-gray-700 bg-slate-50 dark:bg-gray-900/60 space-y-3">
            <div>
              <p className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-gray-400">
                {fmtEUR0(salaryGoal)} için gerekli sermaye
              </p>
              <p className="text-lg font-bold text-gray-900 dark:text-white">{fmtEUR0(capitalForGoal)}</p>
              <p className="text-[11px] text-slate-500 dark:text-gray-400 mt-0.5">
                12 × {fmtEUR0(salaryGoal)} ÷ %{inputs.safeWithdrawalRatePct}. Dış gelir hariç.
              </p>
            </div>
            {showGoodYear && (
              <div>
                <p className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-gray-400">
                  {fmtEUR0(goodYear)} iyi yıl için gerekli sermaye
                </p>
                <p className="text-lg font-bold text-gray-900 dark:text-white">{fmtEUR0(capitalForGoodYear)}</p>
                <p className="text-[11px] text-slate-500 dark:text-gray-400 mt-0.5">
                  12 × {fmtEUR0(goodYear)} ÷ %{inputs.safeWithdrawalRatePct}. İyi yıl; taban kasadan tamamlanır.
                </p>
              </div>
            )}
            <p className="text-[11px] text-slate-500 dark:text-gray-400">
              %{PLANNED_WITHDRAWAL_PCT} planlanan, %{CONSERVATIVE_WITHDRAWAL_PCT} muhafazakâr çekim oranı.
            </p>
          </div>
        </div>
        {showGoodYear && (
          <p className="text-xs text-slate-600 dark:text-gray-300">
            {depletionNote(depletionYears, goodYear, realRatePct, inputs.annualReturnPct, inputs.annualInflationPct)}
          </p>
        )}
      </div>

      {/* İkincil: maaşın gerektirdiği sermaye */}
      <div className="p-5 space-y-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-gray-400">
            İkincil görünüm · maaş için sermaye
          </p>
          <p className="text-[11px] text-slate-500 dark:text-gray-400 mt-0.5">
            Grafik, {fmtEUR0(salaryGoal)}/ay hedefin seçilen senaryodaki sermayesine bakar. Birincil kart dış geliri saymaz.
          </p>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <SummaryTile
          icon={<Flag size={14} />}
          label={`Sermaye hedefi (${scenarioLabel}, bugünkü €)`}
          value={fmtEUR0(projection.targetPortfolio)}
          sub={`kalan yıllık açık ${fmtEUR0(Math.max(0, salaryGoal * 12 - annualChosen))} ÷ %${inputs.safeWithdrawalRatePct} SWR`}
        />
        <SummaryTile
          icon={<Wallet size={14} />}
          label="Sermaye ilerlemesi"
          value={`%${Math.max(0, projection.realProgressPct).toFixed(0)}`}
          sub={`portföy ${fmtEUR0(currentValueEUR)} + kasa ${fmtEUR0(kasaCounted)} · ${scenarioLabel}`}
        />
        <SummaryTile
          icon={<TrendingUp size={14} />}
          label="Sermayeye kalan"
          value={yearsLabel}
          sub={
            !targetReached
              ? 'Bu varsayımlarla ulaşılamıyor'
              : currentValueEUR + 0.5 < projection.targetPortfolio
                ? 'Portföy + kasa yetiyor. Grafik yalnız portföyü büyütür.'
                : 'Portföy hedefi karşılıyor'
          }
          warn={!targetReached}
        />
        <SummaryTile
          icon={<Target size={14} />}
          label={`${goalLabel} nominal hedef`}
          value={fmtEUR0(nominalAtGoal)}
          sub={`aynı reel maaşın o tarihteki euro karşılığı · enflasyon %${inputs.annualInflationPct}`}
        />
        </div>
      </div>
      <div className="px-5 pb-2">
        <div className="h-2 rounded-full bg-slate-100 dark:bg-gray-700 overflow-hidden">
          <div
            className="h-full bg-brand-600"
            style={{ width: `${Math.min(100, Math.max(0, projection.realProgressPct))}%` }}
          />
        </div>
        <p className="text-[11px] text-slate-500 dark:text-gray-400 mt-1">
          Sermaye ilerlemesi: portföy + kasa ÷ seçilen senaryo ({scenarioLabel}). Maaş kartındaki yüzde dış geliri saymaz.
          {Math.abs(inputs.annualInflationPct - policyInflationPct) > 0.05
            ? ` Bu kutu senaryodur (uygulama ayarı %${policyInflationPct}); maaş hesabını değiştirmez.`
            : ' Enflasyon, Kâr Cüzdanı\'ndaki uygulama ayarıdır.'}
        </p>
      </div>

      {/* Grafik */}
      <div className="px-5 pb-5">
        <ResponsiveContainer width="100%" height={320}>
          <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
            <defs>
              <linearGradient id="fireGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={seriesColor} stopOpacity={0.2} />
                <stop offset="95%" stopColor={seriesColor} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke={chrome.grid} />
            <XAxis dataKey="yearLabel" tick={{ fontSize: 12, fill: chrome.axis }} axisLine={false} tickLine={false} />
            <YAxis
              tick={{ fontSize: 12, fill: chrome.axis }}
              axisLine={false}
              tickLine={false}
              tickFormatter={fmtAxisEUR}
              width={64}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload || payload.length === 0) return null;
                const d = payload[0].payload;
                return (
                  <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-3 space-y-1">
                    <p className="text-xs text-gray-500 dark:text-gray-400">{d.yearLabel} sonu</p>
                    <p className="text-sm font-bold text-gray-900 dark:text-white">
                      Reel portföy: {fmtEUR0(d.realValue)}
                    </p>
                    <p className="text-xs text-gray-600 dark:text-gray-300">
                      Maaş sermayesi: {fmtEUR0(d.realTarget)} · Öteki senaryo: {fmtEUR0(d.compareTarget)} · Nominal portföy: {fmtEUR0(d.nominalValue)}
                    </p>
                    <p className="text-xs text-gray-600 dark:text-gray-300">
                      Nominal hedef: {fmtEUR0(d.nominalTarget)} · Anapara+katkı: {fmtEUR0(d.principal)}
                    </p>
                    <p className="text-xs text-gray-600 dark:text-gray-300">
                      O yıl büyüme (nominal): {fmtEUR0(d.growthYTD)} · SWR ile aylık: {fmtEUR0(d.monthlyAtSWR)}
                    </p>
                  </div>
                );
              }}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {projection.targetPortfolio > 0 && (
              <Line
                type="monotone"
                dataKey="realTarget"
                name={selectedName}
                stroke={chrome.neutralLine}
                strokeWidth={2}
                strokeDasharray="6 4"
                dot={false}
              />
            )}
            <Area
              type="monotone"
              dataKey="realValue"
              name="Reel projeksiyon (bugünkü €)"
              stroke={seriesColor}
              strokeWidth={2}
              fill="url(#fireGradient)"
              dot={false}
              activeDot={{ r: 5, strokeWidth: 2 }}
            />
            <Line
              type="monotone"
              dataKey="nominalValue"
              name="Nominal projeksiyon"
              stroke={principalColor}
              strokeWidth={1.5}
              strokeDasharray="4 3"
              dot={false}
              activeDot={{ r: 4 }}
            />
            {showCompare && (
              <Line
                type="monotone"
                dataKey="compareTarget"
                name={compareName}
                stroke={isDark ? '#f59e0b' : '#b45309'}
                strokeWidth={1.25}
                strokeDasharray="2 3"
                dot={false}
              />
            )}
            {projection.targetPortfolio > 0 && (
              <Line
                type="monotone"
                dataKey="nominalTarget"
                name="Nominal hedef"
                stroke={isDark ? '#c4b5fd' : '#7c3aed'}
                strokeWidth={1.25}
                strokeDasharray="2 4"
                dot={false}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
        <p className="text-[11px] text-slate-500 dark:text-gray-400 mt-2">
          {/* 2026-09-23: rakamlar sayfanın KENDİ girdilerinden türetilir (eski sabit '~€343k / ~€460k+' metni girdiler
              değişince yanlış kalıyordu ve panelle çelişiyordu). İki ölçüt ayrı ayrı yazılır ki çelişki gibi görünmesin. */}
          Dürüst not: grafik bugünkü alım gücündedir ve birincil maaş hedefinin gerektirdiği sermayeyi gösterir.
          {portfolioOnly
            ? ` Düz çizgi ${fmtEUR0(salaryGoal)}/ay için portföy sermayesidir (${fmtEUR0(grossCapital)}). Çiftlik ve kira beklenendir, bu çizgiye girmez.`
            : ` Seçilen düz çizgi, aktif dış gelir düşüldükten sonra kalan reel sermayedir (${scenarioLabel}).`}
          {showCompare ? ' Karşılaştırma çizgisi öteki senaryodur.' : ''} Hedef {goalLabel}'den itibaren {fmtEUR0(salaryGoal)}/ay reeldir.
          Nominal çizgiler enflasyonla şişmiş gelecek eurodur; onlara ulaşmak reel hedefe ulaşmak değildir.
          <strong>SWR (%{inputs.safeWithdrawalRatePct})</strong> ile kalan açık için {projection.targetPortfolio > 0 ? fmtEUR0(projection.targetPortfolio) : '€0'} gerekir; dış gelir yokken {fmtEUR0(grossCapital)}.
          <strong> Kâr Cüzdanı'nın havuz kuralı</strong> kira ve çiftliği bilmez (reel kârın %{Math.round(SALARY_SAFETY * 100)}'i; çekim her hâlükârda aylık €{MONTHLY_CAP_EUR.toLocaleString('de-DE')} ile sınırlı).
          Bu sayfadaki varsayımlarla (%{inputs.annualReturnPct} getiri − %{inputs.annualInflationPct} enflasyon = reel %{realRatePct.toFixed(1)})
          tam €{inputs.targetMonthlyIncome.toLocaleString('de-DE')}/ay için {poolRuleCapital > 0 ? fmtEUR0(poolRuleCapital) : '—'} ister; bugünkü portföyün bu kuralla beklenen maaşı {fmtEUR0(poolRuleMonthlyNow)}/ay ve ayların çoğu €0.
          Kasa, maaş tabanını (€{SALARY_FLOOR_EUR.toLocaleString('de-DE')}) €{KASA_MIN_EUR.toLocaleString('de-DE')} altına indirmeden tamamlayan yastıktır: ilerlemeye eklenir, getiri çizgisinde büyümez, kâr cetveline girmez.
          Yerel panel aynı soruyu politika dağılımının beklenen reel getirisiyle hesapladığı için orada farklı bir sermaye rakamı görebilirsin.
        </p>
      </div>

      {/* Yıl yıl tablo */}
      <div className="px-5 pb-5 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500 dark:text-gray-400 border-b border-slate-200 dark:border-gray-700">
              <th className="py-2 pr-3">Yıl</th>
              <th className="py-2 pr-3 text-right">Reel değer</th>
              <th className="py-2 pr-3 text-right">Nominal değer</th>
              <th className="py-2 pr-3 text-right">Maaş sermayesi</th>
              <th className="py-2 text-right">Nominal hedef</th>
            </tr>
          </thead>
          <tbody>
            {projection.yearByYear.map((y) => (
              <tr
                key={y.year}
                className={`border-b border-slate-100 dark:border-gray-700/50 ${
                  y.reachedTarget ? 'bg-emerald-50/60 dark:bg-emerald-950/20' : ''
                }`}
              >
                <td className="py-1.5 pr-3 font-semibold text-gray-900 dark:text-white whitespace-nowrap">
                  {baseYear + y.year}
                  {projection.yearsToTarget === y.year && (
                    <span className="ml-1.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">🎯</span>
                  )}
                </td>
                <td className="py-1.5 pr-3 text-right font-semibold text-gray-900 dark:text-white">{fmtEUR0(y.realEndOfYearValue)}</td>
                <td className="py-1.5 pr-3 text-right text-slate-600 dark:text-gray-300">{fmtEUR0(y.endOfYearValue)}</td>
                <td className="py-1.5 pr-3 text-right text-slate-600 dark:text-gray-300">{fmtEUR0(y.realTarget)}</td>
                <td className="py-1.5 text-right text-slate-600 dark:text-gray-300">{fmtEUR0(y.inflationTarget)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ScenarioCard({
  selected,
  title,
  capital,
  progress,
  detail,
  onPick,
}: {
  selected: boolean;
  title: string;
  capital: number;
  progress: number;
  detail: string;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      aria-pressed={selected}
      className={`text-left rounded-xl p-3 border ${
        selected
          ? 'border-brand-600 bg-brand-50/70 dark:bg-brand-950/30 dark:border-brand-400'
          : 'border-slate-200 dark:border-gray-700 bg-slate-50 dark:bg-gray-900/60'
      }`}
    >
      <p className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-gray-400">
        {selected ? 'Seçili senaryo · ' : ''}{title}
      </p>
      <p className="text-lg font-bold text-gray-900 dark:text-white">{fmtEUR0(capital)}</p>
      <p className="text-[11px] text-slate-600 dark:text-gray-300 mt-0.5">ilerleme %{Math.max(0, progress).toFixed(0)} · {detail}</p>
    </button>
  );
}

function SummaryTile({
  icon,
  label,
  value,
  sub,
  warn,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  warn?: boolean;
}) {
  return (
    <div
      className={`rounded-xl p-3 border ${
        warn
          ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900'
          : 'bg-slate-50 dark:bg-gray-900/60 border-slate-200 dark:border-gray-700'
      }`}
    >
      <p className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-gray-400 flex items-center gap-1 mb-1">
        {icon} {label}
      </p>
      <p className={`text-lg font-bold ${warn ? 'text-amber-700 dark:text-amber-300' : 'text-gray-900 dark:text-white'}`}>
        {value}
      </p>
      {sub && <p className="text-[11px] text-slate-500 dark:text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}
