import { describe, expect, it } from 'vitest';
import { readActiveSalary } from './activeSalaryService';
import { salaryTables, fakeReadClient, salaryRule } from '../test/helpers/salaryFixture';
import { fixYear } from '../lib/spendDownSalary';

describe('ortak maaş okuyucusu', () => {
  it('yazmadan mevcut JSON ayarını okur; eski sütun tavanı aktif kuralı değiştirmez', async () => {
    const c = fakeReadClient(salaryTables());
    const s = await readActiveSalary(c as never, '2028-01');
    expect(s.config).toMatchObject({ realRate: .025, bufferEUR: 40000, floorEUR: 400, capEUR: null });
    expect(s.plan?.monthlyEUR).toBe(400);
    expect(s.plan?.fromKasaEUR).toBeGreaterThan(0);
    expect(c.calls.every(t => ['portfoy_bolt_salary_policy', 'holdings', 'cash_balances', 'exchange_rates_daily', 'salary_withdrawals'].includes(t))).toBe(true);
  });
  it('sabitleme sonrası okuyucunun maaşı ve kasa payı aynı kalır', async () => {
    const tables = salaryTables();
    const before = await readActiveSalary(fakeReadClient(tables) as never, '2028-01');
    tables.portfoy_bolt_salary_policy[0].inflation_decisions.salary_rule = fixYear(before.config, before.plan!);
    const after = await readActiveSalary(fakeReadClient(tables) as never, '2028-01');
    expect([after.plan?.monthlyEUR, after.plan?.fromKasaEUR]).toEqual([before.plan?.monthlyEUR, before.plan?.fromKasaEUR]);
  });
  it('maaş çekimlerini işlem gününün kuruyla ayırır; bugünkü kur geçmişe uygulanmaz', async () => {
    const tables = salaryTables();
    tables.portfoy_bolt_salary_policy[0].inflation_decisions.salary_rule = { ...salaryRule,
      years: { '2027': { ...salaryRule.years['2027'], portfolioEUR: 105000 } } };
    tables.salary_withdrawals = [{ withdrawn_at: '2027-12-05T12:00:00Z', amount_eur: null, amount_usd: 10000 }];
    const p = await readActiveSalary(fakeReadClient(tables) as never, '2028-01');
    // 10.000 USD = 9.000 EUR çekim. 100k+9k > önceki 105k; kayıplı yıl sayılmaz.
    expect(p.plan?.noRealRaise).toBe(false);
    tables.salary_withdrawals = [];
    expect((await readActiveSalary(fakeReadClient(tables) as never, '2028-01')).plan?.noRealRaise).toBe(true);
  });
  it('önceki sabitlemeden eski USD çekimin eksik kuru güncel maaşı bozmaz', async () => {
    const tables = salaryTables();
    tables.salary_withdrawals = [{ withdrawn_at: '2025-01-01T12:00:00Z', amount_eur: null, amount_usd: 1000 }];
    const result = await readActiveSalary(fakeReadClient(tables) as never, '2028-01');
    expect(result.plan?.monthlyEUR).toBe(400);
  });
  it('ayar okunamazsa sessizce eski kâr maaşına dönmez', async () => {
    const client = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ error: { message: 'read failed' } }) }) }) }) };
    await expect(readActiveSalary(client as never)).rejects.toThrow('Maaş ayarı okunamadı');
  });
});
