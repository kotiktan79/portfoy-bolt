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

// HEDEFE ULAŞMA PLANI — EUR. Dış katkı varsayılan 0 (2026-09-20).
// Kira ve çiftlik, SWR sermayesinden düşülür. Kasa maaş tamponudur: ilerlemeye girer, getiri çizgisinde büyümez.
// Gelir sekmesi kupon/temettüdür; bu liste oradan okunmaz.
import { MONTHLY_CAP_EUR, INFLATION_EUR, SALARY_SAFETY, dayInTZ, normalizeInflation } from '../lib/eurPnl';
import { SALARY_START_MONTH, SALARY_FLOOR_EUR, KASA_MIN_EUR } from '../lib/salaryPlan';
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
  targetMonthlyIncome: number;
  safeWithdrawalRatePct: number;
  annualInflationPct: number;
}

const DEFAULTS: StoredInputs = {
  monthlyContribution: 0,                     // dış katkı yok (kullanıcı beyanı 2026-09-18)
  annualReturnPct: 4,                         // politika dağılımı ~%4-5 nominal EUR; bugünkü (%40 nakit) ~%3
  targetMonthlyIncome: MONTHLY_CAP_EUR,       // €1.000/ay (geçim planı)
  safeWithdrawalRatePct: 3.5,                 // Morningstar 2025 %3,9 / ERN %3,25-3,4 bandının ortası
  annualInflationPct: INFLATION_EUR * 100,    // motorla aynı (varsayılan %3)
};

function loadStored(): StoredInputs | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    // Enflasyon uygulama ayarından gelir (Kâr Cüzdanı). Eski yerel kayıt hedefi nominal bırakmasın.
    return { ...DEFAULTS, ...p, annualInflationPct: DEFAULTS.annualInflationPct };
  } catch {
    return null;
  }
}

export default function FireProjection() {
  const { isDark } = useDarkMode();
  const chrome = chartChrome(isDark);

  const [inputs, setInputs] = useState<StoredInputs>(() => loadStored() || DEFAULTS);
  const [income, setIncome] = useState<ExternalIncomeSettings>(() => parseExternalSettings(localStorage.getItem(INCOME_KEY)));
  const [policyInflationPct, setPolicyInflationPct] = useState(INFLATION_EUR * 100);
  const inflationTouched = useRef(false);
  // Portföy serveti kasa HARİÇ (kâr cetveli). Kasa ayrıca, maaş tamponu olarak ilerlemeye eklenir.
  const [wealthEUR, setWealthEUR] = useState<number | null>(null);
  const [kasaEUR, setKasaEUR] = useState<number | null>(null);
  const [kasaNote, setKasaNote] = useState('kasa yükleniyor');
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
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...next, annualInflationPct: undefined }));
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
  const scenarioLabel = income.scenario === 'aktif' ? 'yalnız aktif' : 'tüm dış gelir';
  const compareName = income.scenario === 'aktif' ? 'Tüm gelir (karşılaştırma, bugünkü €)' : 'Yalnız aktif (karşılaştırma, bugünkü €)';
  const selectedName = income.scenario === 'aktif' ? 'Reel hedef, yalnız aktif' : 'Reel hedef, tüm gelir';

  const inputFields: { key: keyof StoredInputs; label: string; suffix: string; step: string }[] = [
    { key: 'monthlyContribution', label: 'Aylık dış katkı', suffix: '€', step: '100' },
    { key: 'annualReturnPct', label: 'Yıllık getiri', suffix: '%', step: '0.5' },
    { key: 'targetMonthlyIncome', label: 'Hedef aylık gelir', suffix: '€', step: '100' },
    { key: 'safeWithdrawalRatePct', label: 'Güvenli çekim (SWR)', suffix: '%', step: '0.5' },
    { key: 'annualInflationPct', label: 'Enflasyon (uygulama ayarı)', suffix: '%', step: '0.5' },
  ];

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-slate-200 dark:border-gray-700 overflow-hidden">
      <div className="p-5 border-b border-slate-200 dark:border-gray-700 flex items-center gap-2">
        <Target className="text-brand-600 dark:text-brand-400" size={22} />
        <div>
          <h3 className="text-lg font-bold text-gray-900 dark:text-white">Hedefe Ulaşma Planı (€)</h3>
          <p className="text-xs text-slate-500 dark:text-gray-400">
            {wealthMissing
              ? 'Euro servet henüz yok. Son gerçek kur da yoksa usd ile çarpılarak euro uydurulmaz.'
              : `Portföy €${Math.round(currentValueEUR).toLocaleString('de-DE')} + ${kasaNote} €${Math.round(kasaCounted).toLocaleString('de-DE')}. Hedef ${goalLabel}'den itibaren €${inputs.targetMonthlyIncome.toLocaleString('de-DE')}/ay reel. Çizgiler bugünkü €; nominal ayrı.`}
          </p>
        </div>
      </div>

      {/* Varsayımlar */}
      <div className="p-5 grid grid-cols-2 md:grid-cols-5 gap-3 border-b border-slate-200 dark:border-gray-700">
        {inputFields.map((f) => (
          <label key={f.key} className="block">
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
          </label>
        ))}
      </div>

      <div className="px-5 py-4 border-b border-slate-200 dark:border-gray-700 space-y-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-gray-400">Dış gelir (hedeften düşülür)</p>
          <p className="text-[11px] text-slate-500 dark:text-gray-400 mt-0.5">
            Gelir sekmesi kupon ve temettü kaydıdır; kira ve çiftlik orada yok. Bu liste portföy getirisine ikinci kez eklenmez. Ayar bu tarayıcıda durur.
          </p>
        </div>
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
            detail={`(12 × €${inputs.targetMonthlyIncome.toLocaleString('de-DE')} − ${fmtEUR0(annualActive)}) / %${inputs.safeWithdrawalRatePct} · birincil · beklenen hariç`}
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
          Birincil senaryo yalnız aktif gelirdir. Kira beklenen kaldıkça hedefe girmez; durumu aktif yapılınca birincil senaryo onu da sayar.
          Dış gelir yokken aynı SWR ile {fmtEUR0(grossCapital)} gerekirdi. İlerleme çubuğu ve grafik hedefi seçilen senaryodur ({scenarioLabel}).
        </p>
      </div>

      {/* Özet kartlar */}
      <div className="p-5 grid grid-cols-2 lg:grid-cols-4 gap-3">
        <SummaryTile
          icon={<Flag size={14} />}
          label={`Reel hedef (${scenarioLabel}, bugünkü €)`}
          value={fmtEUR0(projection.targetPortfolio)}
          sub={`kalan yıllık açık ${fmtEUR0(Math.max(0, inputs.targetMonthlyIncome * 12 - annualChosen))} ÷ %${inputs.safeWithdrawalRatePct} SWR`}
        />
        <SummaryTile
          icon={<Wallet size={14} />}
          label="Reel ilerleme"
          value={`%${Math.max(0, projection.realProgressPct).toFixed(0)}`}
          sub={`portföy ${fmtEUR0(currentValueEUR)} + kasa ${fmtEUR0(kasaCounted)} · ${scenarioLabel}`}
        />
        <SummaryTile
          icon={<TrendingUp size={14} />}
          label="Reel hedefe kalan"
          value={yearsLabel}
          sub={targetReached ? `Açık: ${fmtEUR0(projection.currentGap)} bugünkü €` : 'Bu varsayımlarla ulaşılamıyor'}
          warn={!targetReached}
        />
        <SummaryTile
          icon={<Target size={14} />}
          label={`${goalLabel} nominal hedef`}
          value={fmtEUR0(nominalAtGoal)}
          sub={`aynı reel gelirin o tarihteki euro karşılığı · enflasyon %${inputs.annualInflationPct}`}
        />
      </div>
      <div className="px-5 pb-2">
        <div className="h-2 rounded-full bg-slate-100 dark:bg-gray-700 overflow-hidden">
          <div
            className="h-full bg-brand-600"
            style={{ width: `${Math.min(100, Math.max(0, projection.realProgressPct))}%` }}
          />
        </div>
        <p className="text-[11px] text-slate-500 dark:text-gray-400 mt-1">
          İlerleme bugünkü alım gücündedir: portföy + kasa tamponu ÷ seçilen senaryonun reel sermayesi ({scenarioLabel}).
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
                      Reel hedef: {fmtEUR0(d.realTarget)} · Öteki senaryo: {fmtEUR0(d.compareTarget)} · Nominal portföy: {fmtEUR0(d.nominalValue)}
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
            {Math.abs(capitalAll - capitalActive) >= 1 && (
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
          Dürüst not: grafik bugünkü alım gücündedir. Seçilen düz çizgi, dış gelir düşüldükten sonra kalan reel sermayedir ({scenarioLabel}, {goalLabel}'den itibaren €{inputs.targetMonthlyIncome.toLocaleString('de-DE')}/ay).
          Karşılaştırma çizgisi öteki senaryodur. Nominal çizgiler enflasyonla şişmiş gelecek eurodur; onlara ulaşmak reel hedefe ulaşmak değildir.
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
              <th className="py-2 pr-3 text-right">Reel hedef</th>
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
