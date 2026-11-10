import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { salaryHoldings, salaryTables, salaryRule, fakeReadClient } from '../test/helpers/salaryFixture';
import { readActiveSalary } from '../services/activeSalaryService';
import { getDynamicSalary } from '../services/salaryService';
import { assembleMonthSalaryInputs } from '../services/monthSalaryCardService';
import { buildMonthSalaryCard } from '../lib/monthSalaryCard';
import { buildAiContext } from '../../api/lib/aiContext';
import { BuAyMaasCard } from './BuAyMaasCard';
import KarCuzdani from './KarCuzdani';
import IncomeWidget from './IncomeWidget';
import FireProjection from './FireProjection';

vi.mock('../lib/supabase', async () => {
  const { fakeReadClient, salaryTables } = await import('../test/helpers/salaryFixture');
  return { supabase: fakeReadClient(salaryTables()) };
});
vi.mock('../services/eurPnlService', () => ({
  getEurMonths: vi.fn(async () => []), getEurDaily: vi.fn(async () => []),
  invalidateEurPnlCache: vi.fn(), RELIABLE_FROM: '2026-04-01', INFLATION_EUR: .03,
  monthLabel: (month: string) => month,
}));
vi.mock('../services/kasaFxService', () => ({ getKasaFx: vi.fn(async () => ({
  asOf: '2028-01-10', totalEurNow: 16000, rows: [{ currency: 'EUR', balance: 16000, eurNow: 16000, fxDeltaEUR: 0 }],
  missingCcy: [], longWindow: { sinceDay: '2026-04-01', fxDeltaEUR: 0 }, shortWindow: { fxDeltaEUR: 0 },
})) }));

beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2028-01-10T12:00:00Z')); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('aynı maaşın bütün girişleri', () => {
  it.each([100000, 200000])('Home/Canlı/Gelir, ay kartı, cüzdan ve API aynı hesap: %s sermaye', async capital => {
    const tables = salaryTables();
    const holdings = salaryHoldings.map(h => h.symbol === 'VWCE' ? { ...h, current_price: h.current_price + capital - 100000 } : h);
    tables.holdings = holdings;
    const client = fakeReadClient(tables);
    const active = await readActiveSalary(client as never, '2028-01', holdings);
    const dynamic = await getDynamicSalary(holdings);
    const month = assembleMonthSalaryInputs({ asOfMonth: '2028-01', poolEUR: 1000, realGainEUR: 1000,
      kasaEUR: 16000, policy: { inflation_decisions: { salary_rule: salaryRule } }, moves: [], withdrawals: [],
      eurRates: [], usdRates: [], investableEUR: capital });
    const card = buildMonthSalaryCard(month);
    const api = await buildAiContext(client as never, '2028-01-10', new Date());
    if (capital === 100000) { expect(active.plan?.monthlyEUR).toBe(400); expect(active.plan?.fromKasaEUR).toBeGreaterThan(0); }
    else { expect(active.plan!.monthlyEUR).toBeGreaterThan(400); expect(active.plan?.fromKasaEUR).toBe(0); }
    for (const p of [dynamic?.spendDown, month.spendDown, api.salary.plan]) {
      expect(p?.monthlyEUR).toBe(active.plan?.monthlyEUR);
      expect(p?.fromKasaEUR).toBe(active.plan?.fromKasaEUR);
    }
    expect(dynamic?.entitlementEUR).toBe(card.plannedTotalEUR);
    expect(card.plannedFromKasaEUR).toBe(active.plan?.fromKasaEUR);
    expect(api.text).not.toMatch(/ŞU AN ÇEKİLEBİLİR MAAŞ|havuz × 0,85|aylık tavan €1.000/);
    expect(api.weekPlan[0]).toMatchObject({ symbol: 'XEON', amountEUR: 500 });
    expect(api.weekPlan[0].detail).toContain('XEON, fiyat €110,00');
  });

  it('gerçek cüzdan, ay kartı, Gelir ve hedef ekranında aynı tutar; eski uyarı ve maaş yok', async () => {
    render(<MemoryRouter><div data-testid="wallet"><KarCuzdani holdings={salaryHoldings} /></div>
      <div data-testid="month"><BuAyMaasCard holdings={salaryHoldings} /></div>
      <div data-testid="income"><IncomeWidget /></div><div data-testid="goal"><FireProjection /></div></MemoryRouter>);
    await waitFor(() => expect(screen.getByTestId('goal').textContent).toContain('Dinamik maaş planı'));
    await waitFor(() => expect(screen.getByTestId('month').textContent).toContain('€400'));
    await waitFor(() => expect(screen.getByTestId('income').textContent).toContain('€400'));
    const wallet = screen.getByTestId('wallet');
    await waitFor(() => expect(within(wallet).getByTestId('harca-bitir').textContent).toContain('€400'));
    for (const id of ['wallet', 'month', 'income', 'goal']) {
      expect(screen.getByTestId(id).textContent).not.toMatch(/× 0,85|Taban €700|tavan €1.000|defter uyuşmuyor|bakiye farkı|yatırma farkı|Kasa defteri ile kayıtlı bakiye/);
    }
    expect(wallet.textContent).toContain('€16.000');
    const active = await readActiveSalary(fakeReadClient(salaryTables()) as never, '2028-01', salaryHoldings);
    const kasa = `€${Math.round(active.plan!.fromKasaEUR)}`;
    expect(within(wallet).getByTestId('harca-bitir').textContent).toContain(kasa);
    expect(screen.getByTestId('month').textContent).toContain(kasa);
  });
});
