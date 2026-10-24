import { describe, expect, it } from 'vitest';
import {
  DEFAULT_EXTERNAL_INCOMES,
  annualAmountEUR,
  annualExternalEUR,
  parseExternalSettings,
  requiredRealCapital,
  scenarioProgressPct,
} from './externalIncome';

const swr = 3.5;
const goal = 1000;

describe('dış gelir ve hedef sermaye', () => {
  it('varsayılan çiftlik €5.000 aktif, kira €3.600 beklenen; birincil senaryo yalnız aktif', () => {
    expect(annualExternalEUR(DEFAULT_EXTERNAL_INCOMES, 'aktif')).toBe(5_000);
    expect(annualExternalEUR(DEFAULT_EXTERNAL_INCOMES, 'tumu')).toBe(8_600);
    expect(parseExternalSettings(null).scenario).toBe('aktif');
    const rentOn = DEFAULT_EXTERNAL_INCOMES.map(s => s.id === 'kira' ? { ...s, status: 'aktif' as const } : s);
    expect(annualExternalEUR(rentOn, 'aktif')).toBe(8_600);
  });

  it('aylık tutar 12 ile çarpılır, eksi ve sıfır sayılmaz', () => {
    expect(annualAmountEUR({ amountEUR: 300, frequency: 'monthly' })).toBe(3_600);
    expect(annualAmountEUR({ amountEUR: 0, frequency: 'yearly' })).toBe(0);
    expect(annualAmountEUR({ amountEUR: -10, frequency: 'yearly' })).toBe(0);
  });

  it('sermaye (12 × hedef − dış gelir) / SWR', () => {
    expect(requiredRealCapital(goal, 0, swr)).toBeCloseTo(12_000 / 0.035, 6);
    expect(requiredRealCapital(goal, 8_600, swr)).toBeCloseTo(3_400 / 0.035, 6);
    expect(requiredRealCapital(goal, 5_000, swr)).toBeCloseTo(200_000, 6);
    expect(requiredRealCapital(goal, 12_000, swr)).toBe(0);
    expect(requiredRealCapital(goal, 20_000, swr)).toBe(0);
    expect(requiredRealCapital(goal, 5_000, 0)).toBe(0);
    expect(requiredRealCapital(goal, 5_000, 4)).toBeCloseTo(175_000, 6);
    expect(requiredRealCapital(goal, 8_600, 4)).toBeCloseTo(85_000, 6);
    expect(requiredRealCapital(goal, 0, 4)).toBeCloseTo(300_000, 6);
  });

  it('ilerleme kaynak / senaryo sermayesi; dış gelir hedefi kapatırsa %100', () => {
    const portfolio = 148_249;
    expect(scenarioProgressPct(portfolio, goal, 0, swr)).toBeCloseTo(portfolio / (12_000 / 0.035) * 100, 4);
    expect(scenarioProgressPct(portfolio, goal, 8_600, swr)).toBeCloseTo(portfolio / (3_400 / 0.035) * 100, 4);
    expect(scenarioProgressPct(portfolio, goal, 5_000, swr)).toBeCloseTo(portfolio / 200_000 * 100, 4);
    const withKasa = portfolio + 10_000;
    expect(scenarioProgressPct(withKasa, goal, 8_600, swr)).toBeCloseTo(withKasa / (3_400 / 0.035) * 100, 4);
    expect(scenarioProgressPct(0, goal, 12_000, swr)).toBe(100);
    expect(scenarioProgressPct(100_000, goal, 0, 0)).toBe(0);
  });

  it('kayıt bozulursa varsayılanlara döner, boş liste boş kalır', () => {
    expect(parseExternalSettings(null).sources).toHaveLength(2);
    expect(parseExternalSettings(null).scenario).toBe('aktif');
    expect(parseExternalSettings('nope').scenario).toBe('aktif');
    const empty = parseExternalSettings(JSON.stringify({ sources: [], scenario: 'aktif' }));
    expect(empty.sources).toEqual([]);
    expect(empty.scenario).toBe('aktif');
    const kept = parseExternalSettings(JSON.stringify({
      scenario: 'tumu',
      sources: [
        { id: 'a', label: 'X', amountEUR: 100, frequency: 'monthly', status: 'aktif' },
        { id: '', label: 'yok', amountEUR: 1, frequency: 'yearly', status: 'aktif' },
      ],
    }));
    expect(kept.sources).toEqual([{ id: 'a', label: 'X', amountEUR: 100, frequency: 'monthly', status: 'aktif' }]);
    expect(kept.scenario).toBe('tumu');
  });
});
