// Hedef sermayesinden düşülen dış gelir (kira, çiftlik).
// Gelir sekmesi (income_records) kupon ve temettüdür; kira/çiftlik orada yoktur.
// Bu liste localStorage'da durur. Şema, maaş motoru ve kâr cetveli değişmez.

export type IncomeFrequency = 'monthly' | 'yearly';
export type IncomeStatus = 'aktif' | 'beklenen';
export type ExternalScenario = 'tumu' | 'aktif';

export interface ExternalIncome {
  id: string;
  label: string;
  /** Tutar, frequency biriminde, bugünkü euro. */
  amountEUR: number;
  frequency: IncomeFrequency;
  status: IncomeStatus;
}

export interface ExternalIncomeSettings {
  sources: ExternalIncome[];
  /** Grafik ve ilerleme çubuğunun kullandığı senaryo. */
  scenario: ExternalScenario;
}

/** Çiftlik sürmekte. Ev kirası ~€300/ay, henüz başlamadı → beklenen. */
export const DEFAULT_EXTERNAL_INCOMES: ExternalIncome[] = [
  { id: 'ciftlik', label: 'Çiftlik (bal, aronya, alıç, APIA)', amountEUR: 5_000, frequency: 'yearly', status: 'aktif' },
  { id: 'kira', label: 'Ev kirası', amountEUR: 3_600, frequency: 'yearly', status: 'beklenen' },
];

export const DEFAULT_EXTERNAL_SETTINGS: ExternalIncomeSettings = {
  sources: DEFAULT_EXTERNAL_INCOMES,
  // Kira henüz yok. Birincil senaryo yalnız aktif gelir; beklenen kira karşılaştırmada kalır.
  scenario: 'aktif',
};

export function annualAmountEUR(item: Pick<ExternalIncome, 'amountEUR' | 'frequency'>): number {
  const n = Number(item.amountEUR);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return item.frequency === 'monthly' ? n * 12 : n;
}

/** 'tumu' aktif + beklenen. 'aktif' yalnız sürmekte olanlar. */
export function annualExternalEUR(items: readonly ExternalIncome[], scenario: ExternalScenario): number {
  let sum = 0;
  for (const item of items) {
    if (scenario === 'aktif' && item.status !== 'aktif') continue;
    sum += annualAmountEUR(item);
  }
  return sum;
}

/**
 * Reel sermaye, bugünkü euro.
 * (12 × aylık hedef − yıllık dış gelir) / SWR.
 * Dış gelir hedefi karşılıyorsa 0. SWR veya hedef yoksa 0.
 */
export function requiredRealCapital(monthlyGoalEUR: number, annualExternal: number, swrPct: number): number {
  const swr = swrPct / 100;
  const goal = Number(monthlyGoalEUR);
  if (!(swr > 0) || !Number.isFinite(goal) || goal <= 0) return 0;
  const external = Math.max(0, Number(annualExternal) || 0);
  return Math.max(0, goal * 12 - external) / swr;
}

/**
 * İlerleme: eldeki reel kaynak (portföy + kasa tamponu) ÷ senaryonun reel sermayesi.
 * Dış gelir hedefi tek başına karşılıyorsa %100. SWR 0 ise %0 (bölme yok).
 */
export function scenarioProgressPct(
  resourcesEUR: number,
  monthlyGoalEUR: number,
  annualExternal: number,
  swrPct: number,
): number {
  const swr = swrPct / 100;
  const capital = requiredRealCapital(monthlyGoalEUR, annualExternal, swrPct);
  const goal = Number(monthlyGoalEUR);
  if (goal > 0 && swr > 0 && capital === 0) return 100;
  if (!(capital > 0)) return 0;
  const resources = Math.max(0, Number(resourcesEUR) || 0);
  return (resources / capital) * 100;
}

export function parseExternalSettings(raw: string | null): ExternalIncomeSettings {
  if (!raw) return cloneSettings(DEFAULT_EXTERNAL_SETTINGS);
  try {
    const parsed = JSON.parse(raw) as { sources?: unknown; scenario?: unknown };
    const scenario: ExternalScenario = parsed?.scenario === 'tumu' ? 'tumu' : 'aktif';
    if (!Array.isArray(parsed?.sources)) return { sources: cloneSettings(DEFAULT_EXTERNAL_SETTINGS).sources, scenario };
    const sources: ExternalIncome[] = [];
    for (const row of parsed.sources) {
      const item = normalizeIncome(row);
      if (item) sources.push(item);
    }
    return { sources, scenario };
  } catch {
    return cloneSettings(DEFAULT_EXTERNAL_SETTINGS);
  }
}

function cloneSettings(s: ExternalIncomeSettings): ExternalIncomeSettings {
  return { scenario: s.scenario, sources: s.sources.map(item => ({ ...item })) };
}

function normalizeIncome(row: unknown): ExternalIncome | null {
  if (!row || typeof row !== 'object') return null;
  const r = row as Record<string, unknown>;
  const frequency: IncomeFrequency | null = r.frequency === 'monthly' ? 'monthly' : r.frequency === 'yearly' ? 'yearly' : null;
  const status: IncomeStatus | null = r.status === 'beklenen' ? 'beklenen' : r.status === 'aktif' ? 'aktif' : null;
  const amount = Number(r.amountEUR);
  const id = String(r.id ?? '').trim().slice(0, 40);
  const label = String(r.label ?? '').trim().slice(0, 80);
  if (!frequency || !status || !id || !Number.isFinite(amount) || amount < 0) return null;
  return { id, label: label || 'Gelir', amountEUR: amount, frequency, status };
}
