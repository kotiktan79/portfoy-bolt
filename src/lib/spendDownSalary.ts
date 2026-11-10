// HARCA-BİTİR MAAŞ KURALI (2026-11-02, Tan onayı "tamam").
// Geçmiş veri testi: /workspace/analysis/backtest_2026-11-02/flex.py, flex_app.py (1971–2026, 165 başlangıç).
//
// Her Ocak:
//   hedef = yatırım portföyünü (kasa ve Ev Parası hariç) 90 yaşında €30.000 kalacak şekilde,
//           yılda %3,5 reel getiri varsayımıyla kalan yıllara bölen yıllık ödeme / 12 (yıl başı ödeme).
//   yeni maaş = geçen yılın maaşı + 0,5 × (hedef − geçen yılın maaşı)
//   taban €400/ay. Tavan yok (istersen config).
//   Geçen yılın maaşı yalnız ONAYLANMIŞ enflasyon kararıyla büyütülür (PR #23 kuralı). Karar yoksa büyütülmez.
//   Kasa: yalnız kural tutarı tabanın altına düştüğü kötü yıllarda farkı tamamlar. Otomatik geri doldurma YOK.
//
// Saf fonksiyonlar: ekran ve test aynı hesabı kullanır. Para hareketi yapmaz, DB yazmaz.

import { dayInTZ } from './eurPnl.js';
import { parseInflationDecisions, type InflationDecisions } from './inflationDecision.js';

export const SPEND_DOWN_DEFAULTS = {
  endYear: 2068,          // 90 yaş (Tan ~1978 doğumlu, 2026'da 48)
  realRate: 0.035,
  bufferEUR: 30_000,
  smoothing: 0.5,
  floorEUR: 400,
  capEUR: null as number | null,
  includeKasa: false,
  kasaRefill: false,
} as const;

export type SalaryRuleMode = 'profit' | 'spend_down';

export interface SpendDownYearRecord {
  monthlyEUR: number;
  targetEUR: number;
  portfolioEUR: number;
  yearsLeft: number;
  indexApplied: number;
  fixedAt: string;
  /** Sabitleme anındaki tabansız tutar; eski JSON kayıtlarında olmayabilir. */
  ruleEUR?: number;
  noRealRaise?: boolean;
}

export interface SalaryRuleConfig {
  mode: SalaryRuleMode;
  endYear: number;
  realRate: number;
  bufferEUR: number;
  smoothing: number;
  floorEUR: number;
  capEUR: number | null;
  includeKasa: boolean;
  kasaRefill: boolean;
  /** Yıl → o yılın sabitlenmiş aylık maaşı. */
  years: Record<string, SpendDownYearRecord>;
}

/** Kural ayarı portfoy_bolt_salary_policy.inflation_decisions içinde bu anahtarda durur (yeni sütun gerekmez). */
export const SALARY_RULE_KEY = 'salary_rule';

const finite = (v: unknown): number | null => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

export function parseSalaryRule(rawDecisions: unknown): SalaryRuleConfig {
  let obj: unknown = rawDecisions;
  if (typeof obj === 'string') { try { obj = JSON.parse(obj); } catch { obj = null; } }
  const r = obj && typeof obj === 'object' && !Array.isArray(obj) ? (obj as Record<string, unknown>)[SALARY_RULE_KEY] : null;
  const d = (r && typeof r === 'object' ? r : {}) as Record<string, unknown>;
  const years: Record<string, SpendDownYearRecord> = {};
  if (d.years && typeof d.years === 'object') {
    for (const [k, v] of Object.entries(d.years as Record<string, unknown>)) {
      if (!/^\d{4}$/.test(k) || !v || typeof v !== 'object') continue;
      const y = v as Record<string, unknown>;
      const m = finite(y.monthlyEUR);
      if (m == null || m < 0) continue;
      years[k] = {
        monthlyEUR: m,
        targetEUR: finite(y.targetEUR) ?? m,
        portfolioEUR: finite(y.portfolioEUR) ?? 0,
        yearsLeft: finite(y.yearsLeft) ?? 0,
        indexApplied: finite(y.indexApplied) ?? 1,
        fixedAt: typeof y.fixedAt === 'string' ? y.fixedAt : '',
        ruleEUR: finite(y.ruleEUR) ?? undefined,
        noRealRaise: y.noRealRaise === true,
      };
    }
  }
  const rate = finite(d.realRate);
  const sm = finite(d.smoothing);
  return {
    mode: d.mode === 'spend_down' ? 'spend_down' : 'profit',
    endYear: Math.round(finite(d.endYear) ?? SPEND_DOWN_DEFAULTS.endYear),
    realRate: rate != null && rate > -0.05 && rate < 0.15 ? rate : SPEND_DOWN_DEFAULTS.realRate,
    bufferEUR: Math.max(0, finite(d.bufferEUR) ?? SPEND_DOWN_DEFAULTS.bufferEUR),
    smoothing: sm != null && sm > 0 && sm <= 1 ? sm : SPEND_DOWN_DEFAULTS.smoothing,
    floorEUR: Math.max(0, finite(d.floorEUR) ?? SPEND_DOWN_DEFAULTS.floorEUR),
    capEUR: finite(d.capEUR) != null && Number(d.capEUR) > 0 ? Number(d.capEUR) : null,
    includeKasa: d.includeKasa === true,
    kasaRefill: d.kasaRefill === true,
    years,
  };
}

/** Kural ayarını mevcut jsonb'ye yazar; yıl anahtarlı enflasyon kararlarına DOKUNMAZ. */
export function withSalaryRule(rawDecisions: unknown, cfg: SalaryRuleConfig): Record<string, unknown> {
  let obj: unknown = rawDecisions;
  if (typeof obj === 'string') { try { obj = JSON.parse(obj); } catch { obj = {}; } }
  const base = obj && typeof obj === 'object' && !Array.isArray(obj) ? { ...(obj as Record<string, unknown>) } : {};
  return { ...base, [SALARY_RULE_KEY]: cfg };
}

/** 90 yaşa kalan yıl (Ocak itibarıyla). 2027 → 41. */
export function yearsLeft(year: number, endYear: number): number {
  return Math.max(0, endYear - year);
}

/**
 * Yıl başı ödemeli anüite: P bugünkü para, n yıl, r reel getiri, sonda B kalsın.
 * Yıllık ödeme / 12 = aylık hedef. n=0 ise ödeme yok.
 */
export function annuityTargetMonthlyEUR(portfolioEUR: number, n: number, r: number, bufferEUR: number): number {
  const P = Math.max(0, Number(portfolioEUR) || 0);
  if (!(n > 0)) return 0;
  const pvBuffer = bufferEUR / Math.pow(1 + r, n);
  const spendable = P - pvBuffer;
  const annual = r === 0
    ? spendable / n
    : spendable * r / (1 - Math.pow(1 + r, -n)) / (1 + r);
  return Math.max(0, annual / 12);
}

/** Geçen yılın maaşını büyütme katsayısı: yalnız onaylanmış enflasyon kararı (ör. 1,022). Yoksa 1. */
export function approvedIndexFor(prevYear: number, decisions: InflationDecisions | null | undefined): number {
  const d = decisions?.[String(prevYear)];
  if (!d || d.decision !== 'approved' || !(d.rate >= 0)) return 1;
  return 1 + d.rate;
}

export interface SpendDownInput {
  year: number;
  /** Kasa ve Ev Parası hariç yatırım portföyü, EUR. */
  portfolioEUR: number;
  kasaEUR: number;
  config: SalaryRuleConfig;
  inflationDecisions?: InflationDecisions | null;
  /** Önceki sabitlemeden bu yılın başına kadar portföyden çekilen maaş. */
  withdrawnSinceLastFixEUR?: number;
}

export interface SpendDownPlan {
  year: number;
  /** Hesaba giren kalan para (varsayılan: kasa hariç portföy). */
  baseEUR: number;
  yearsLeft: number;
  endYear: number;
  targetEUR: number;
  /** Geçen yılın (sabitlenmiş) maaşı, onaylı enflasyonla büyütülmüş. İlk yılsa null. */
  prevEUR: number | null;
  prevYear: number | null;
  indexApplied: number;
  /** Yumuşatılmış, tabansız tutar. */
  ruleEUR: number;
  monthlyEUR: number;
  floorApplied: boolean;
  capApplied: boolean;
  /** Tabana tamamlamak için kasadan önerilen aylık tutar (kasa yetmezse kalanı portföyden). */
  fromKasaEUR: number;
  fromPortfolioEUR: number;
  /** Bu yıl zaten sabitlendi mi (Ocak kaydı). */
  fixed: boolean;
  firstYear: boolean;
  noRealRaise: boolean;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** En son sabitlenmiş yıl (< year). */
function lastRecord(cfg: SalaryRuleConfig, year: number): { year: number; rec: SpendDownYearRecord } | null {
  const ys = Object.keys(cfg.years).map(Number).filter(y => y < year).sort((a, b) => b - a);
  return ys.length ? { year: ys[0], rec: cfg.years[String(ys[0])] } : null;
}

export function planSpendDown(inp: SpendDownInput): SpendDownPlan {
  const cfg = inp.config;
  const kasa = Math.max(0, Number(inp.kasaEUR) || 0);
  const base = Math.max(0, Number(inp.portfolioEUR) || 0) + (cfg.includeKasa ? kasa : 0);
  const n = yearsLeft(inp.year, cfg.endYear);
  const fixedRec = cfg.years[String(inp.year)];
  const target = fixedRec?.targetEUR ?? r2(annuityTargetMonthlyEUR(base, n, cfg.realRate, cfg.bufferEUR));

  const last = lastRecord(cfg, inp.year);
  let index = 1;
  let prev: number | null = null;
  if (last) {
    // Aradaki her yılın onaylı enflasyonu (atlanan yıl varsa da)
    for (let y = last.year; y < inp.year; y++) index *= approvedIndexFor(y, inp.inflationDecisions);
    if (fixedRec) index = fixedRec.indexApplied;
    prev = last.rec.monthlyEUR * index;
  }
  // Çekim kadar azalan sermaye zarar değildir. Gerçek çekimler verilmezse yıllık maaş planı kullanılır.
  const withdrawn = Math.max(0, inp.withdrawnSinceLastFixEUR ?? (last ? last.rec.monthlyEUR * 12 * (inp.year - last.year) : 0));
  const comparisonBase = fixedRec?.portfolioEUR ?? base;
  const noRealRaise = fixedRec?.noRealRaise === true || !!(last && comparisonBase + withdrawn < last.rec.portfolioEUR - 0.005);
  const smoothed = prev == null ? target : prev + cfg.smoothing * (target - prev);
  const rule = fixedRec?.ruleEUR ?? (noRealRaise && prev != null ? Math.min(smoothed, prev) : smoothed);
  let monthly = Math.max(rule, cfg.floorEUR);
  const floorApplied = rule < cfg.floorEUR;
  let capApplied = false;
  if (cfg.capEUR != null && monthly > cfg.capEUR) { monthly = Math.max(cfg.floorEUR, cfg.capEUR); capApplied = true; }
  if (n <= 0) monthly = cfg.floorEUR; // 90 sonrası: taban

  let shown = monthly;
  if (fixedRec) shown = fixedRec.monthlyEUR;
  const ruleForKasa = Math.max(0, rule);
  const gap = Math.max(0, cfg.floorEUR - r2(Math.max(0, ruleForKasa)));
  const fromKasa = Math.min(gap, kasa, shown);

  return {
    year: inp.year,
    baseEUR: r2(fixedRec?.portfolioEUR ?? base),
    yearsLeft: n,
    endYear: cfg.endYear,
    targetEUR: r2(target),
    prevEUR: prev == null ? null : r2(prev),
    prevYear: last ? last.year : null,
    indexApplied: index,
    ruleEUR: r2(rule),
    monthlyEUR: r2(shown),
    floorApplied: !fixedRec && floorApplied,
    capApplied: !fixedRec && capApplied,
    fromKasaEUR: r2(fromKasa),
    fromPortfolioEUR: r2(shown - fromKasa),
    fixed: !!fixedRec,
    firstYear: prev == null,
    noRealRaise,
  };
}

/** Ocak kaydı: o yılın maaşını sabitler. Yıl zaten sabitse null (yılda tek karar). */
export function fixYear(cfg: SalaryRuleConfig, plan: SpendDownPlan, now: Date = new Date()): SalaryRuleConfig | null {
  if (cfg.years[String(plan.year)]) return null;
  return {
    ...cfg,
    years: {
      ...cfg.years,
      [String(plan.year)]: {
        monthlyEUR: plan.monthlyEUR,
        targetEUR: plan.targetEUR,
        portfolioEUR: plan.baseEUR,
        yearsLeft: plan.yearsLeft,
        indexApplied: plan.indexApplied,
        fixedAt: now.toISOString(),
        ruleEUR: plan.ruleEUR,
        noRealRaise: plan.noRealRaise,
      },
    },
  };
}

export interface ExpectedPathRow { year: number; age: number; startEUR: number; monthlyEUR: number }

/**
 * Beklenen yol: her yıl tam realRate reel getiri olursa (bugünkü euro ile).
 * Gerçek yıllar farklı olur; tablo kuralın nasıl çalıştığını gösterir.
 */
export function expectedPath(args: {
  startYear: number; portfolioEUR: number; config: SalaryRuleConfig; prevEUR?: number | null; birthYear?: number;
}): ExpectedPathRow[] {
  const cfg = args.config;
  const birth = args.birthYear ?? cfg.endYear - 90;
  let P = Math.max(0, args.portfolioEUR);
  let config = { ...cfg, years: { ...cfg.years } };
  if (args.prevEUR != null && !lastRecord(config, args.startYear)) {
    config.years[String(args.startYear - 1)] = { monthlyEUR: args.prevEUR, targetEUR: args.prevEUR,
      portfolioEUR: P, yearsLeft: yearsLeft(args.startYear - 1, cfg.endYear), indexApplied: 1, fixedAt: '' };
  }
  const rows: ExpectedPathRow[] = [];
  for (let y = args.startYear; y <= cfg.endYear; y++) {
    if (yearsLeft(y, cfg.endYear) <= 0) { rows.push({ year: y, age: y - birth, startEUR: r2(P), monthlyEUR: 0 }); break; }
    const plan = planSpendDown({ year: y, portfolioEUR: P, kasaEUR: 0, config });
    rows.push({ year: y, age: y - birth, startEUR: r2(P), monthlyEUR: plan.monthlyEUR });
    config = fixYear(config, plan) ?? config;
    P = Math.max(0, (P - 12 * plan.monthlyEUR) * (1 + cfg.realRate));
  }
  return rows;
}

/** Tablo için seçilmiş satırlar: ilk yıl, her 5 yaş, son yıl. */
export function pathMilestones(rows: ExpectedPathRow[]): ExpectedPathRow[] {
  return rows.filter((r, i) => i === 0 || i === rows.length - 1 || r.age % 5 === 0);
}

/** Ekran için sade Türkçe açıklama satırları. */
export function explainSpendDown(p: SpendDownPlan, cfg: SalaryRuleConfig): string[] {
  const e = (n: number) => `€${Math.round(n).toLocaleString('de-DE')}`;
  const pct = (cfg.realRate * 100).toLocaleString('tr-TR', { maximumFractionDigits: 1 });
  const lines = [
    `Kalan para: ${e(p.baseEUR)} (${cfg.includeKasa ? 'kasa dahil, ' : 'kasa ve '}Ev Parası hariç)`,
    `Kalan yıl: ${p.yearsLeft} (${p.endYear}'e kadar, 90 yaş)`,
    `Hedef: bu parayı yılda %${pct} reel getiriyle ${p.yearsLeft} yıla bölüp 90 yaşta ${e(cfg.bufferEUR)} bırakan maaş = ${e(p.targetEUR)}/ay`,
  ];
  if (p.prevEUR == null) lines.push(`İlk yıl: maaş = hedef = ${e(p.ruleEUR)}`);
  else lines.push(`Geçen yıl ${e(p.prevEUR)}${p.indexApplied !== 1 ? ' (onaylı enflasyonla)' : ''} → yarı yolu: ${e(p.prevEUR)} + ½ × (${e(p.targetEUR)} − ${e(p.prevEUR)}) = ${e(p.prevEUR + cfg.smoothing * (p.targetEUR - p.prevEUR))}`);
  if (p.noRealRaise) lines.push('Geçen yıl portföy düştü, bu yıl reel artış yok');
  if (p.floorApplied) lines.push(`Taban ${e(cfg.floorEUR)} devrede: maaş ${e(cfg.floorEUR)}${p.fromKasaEUR > 0 ? `, farkın ${e(p.fromKasaEUR)}'su kasadan` : ''}`);
  if (p.capApplied && cfg.capEUR != null) lines.push(`Tavan ${e(cfg.capEUR)} devrede`);
  return lines;
}

/** Ekran ve sunucu aynı yıl/başlangıç kuralını kullanır. Aktif modda sıfır sermaye de tabanla hesaplanır. */
export function salaryPlanForMonth(args: {
  month: string; salaryStartMonth?: string | null; portfolioEUR: number; kasaEUR: number;
  inflationDecisions: unknown; withdrawals?: Array<{ withdrawn_at: string; amount_eur?: number | string | null }>;
}): SpendDownPlan | null {
  const config = parseSalaryRule(args.inflationDecisions);
  if (config.mode !== 'spend_down') return null;
  const year = Math.max(Number(args.month.slice(0, 4)), Number((args.salaryStartMonth || '2027-04').slice(0, 4)));
  const last = lastRecord(config, year);
  const withdrawn = args.withdrawals && last ? args.withdrawals.filter(w => {
    const day = dayInTZ(String(w.withdrawn_at));
    return day >= `${last.year}-01-01` && day < `${year}-01-01`;
  }).reduce((sum, w) => sum + Math.max(0, Number(w.amount_eur) || 0), 0) : undefined;
  // Parse burada, böylece JSON içindeki salary_rule ve yıllık enflasyon kararları karışmaz.
  const decisions = parseInflationDecisions(args.inflationDecisions);
  return planSpendDown({ year, portfolioEUR: args.portfolioEUR, kasaEUR: args.kasaEUR, config,
    inflationDecisions: decisions as InflationDecisions, withdrawnSinceLastFixEUR: withdrawn });
}
