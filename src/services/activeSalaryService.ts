// Yalnız okur. Tarayıcı ve API aynı sermayeyi, kuru, ayı ve maaş kuralını kullanır.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Holding } from '../lib/supabase.js';
import { salaryCapitalEUR } from '../lib/salaryCapital.js';
import { dayInTZ } from '../lib/eurPnl.js';
import { parseSalaryRule, salaryPlanForMonth, type SalaryRuleConfig, type SpendDownPlan } from '../lib/spendDownSalary.js';

export interface ActiveSalary {
  config: SalaryRuleConfig;
  plan: SpendDownPlan | null;
  salaryStartMonth: string;
}

export async function readActiveSalary(client: SupabaseClient, month = dayInTZ(new Date()).slice(0, 7), holdings?: Holding[]): Promise<ActiveSalary> {
  const policyRes = await client.from('portfoy_bolt_salary_policy').select('*').eq('id', 1).maybeSingle();
  if (policyRes.error) throw new Error('Maaş ayarı okunamadı.');
  const policy = policyRes.data;
  const config = parseSalaryRule(policy?.inflation_decisions);
  const salaryStartMonth = policy?.salary_start_month || '2027-04';
  if (config.mode !== 'spend_down') return { config, plan: null, salaryStartMonth };
  const [holdRes, cashRes, ratesRes, wdRes] = await Promise.all([
    holdings ? Promise.resolve({ data: holdings, error: null }) : client.from('holdings').select('*'),
    client.from('cash_balances').select('currency,balance'),
    client.from('exchange_rates_daily').select('day,from_currency,rate').eq('to_currency', 'TRY').eq('source', 'api').order('day', { ascending: false }).limit(100),
    client.from('salary_withdrawals').select('withdrawn_at,amount_eur,amount_usd').order('withdrawn_at', { ascending: false }),
  ]);
  if (holdRes.error || cashRes.error || ratesRes.error || wdRes.error) throw new Error('Maaş verileri okunamadı.');
  const holdingsNow = (holdRes.data || []) as Holding[];
  const rates = new Map<string, number>();
  for (const r of ratesRes.data || []) {
    if (!rates.has(r.from_currency) && Number(r.rate) > 0) rates.set(r.from_currency, Number(r.rate));
  }
  const kasaEUR = (cashRes.data || []).reduce((sum, row) => {
    const balance = Number(row.balance) || 0;
    if (!balance) return sum;
    if (row.currency === 'EUR') return sum + balance;
    const rate = row.currency === 'TRY' ? 1 : rates.get(row.currency);
    const eurRate = rates.get('EUR');
    if (!rate || !eurRate) throw new Error('Kasa döviz kuru eksik.');
    return sum + balance * rate / eurRate;
  }, 0);
  const year = Math.max(Number(month.slice(0, 4)), Number(salaryStartMonth.slice(0, 4)));
  const lastYear = Object.keys(config.years).map(Number).filter(y => y < year).sort((a, b) => b - a)[0];
  // Önceki sabitlemeden önceki veya bu yıla ait çekim, geçen yılın getirisini değiştirmez.
  const relevantWithdrawals = (wdRes.data || []).filter(w => {
    if (lastYear == null) return false;
    const day = dayInTZ(String(w.withdrawn_at));
    return day >= `${lastYear}-01-01` && day < `${year}-01-01`;
  });
  const withdrawals = await Promise.all(relevantWithdrawals.map(async w => {
    if (Number(w.amount_eur) > 0) return w;
    // Eski USD çekimler için işlem gününün kurunu kullan; bugünkü kurla geçmiş üretilmez.
    if (Number(w.amount_usd) > 0) {
      const day = dayInTZ(String(w.withdrawn_at));
      const at = async (currency: string) => {
        const res = await client.from('exchange_rates_daily').select('rate').eq('from_currency', currency)
          .eq('to_currency', 'TRY').eq('source', 'api').lte('day', day).order('day', { ascending: false }).limit(1);
        if (res.error || !(Number(res.data?.[0]?.rate) > 0)) throw new Error('Eski maaş çekiminin kuru eksik.');
        return Number(res.data![0].rate);
      };
      const [usd, eur] = await Promise.all([at('USD'), at('EUR')]);
      return { ...w, amount_eur: Number(w.amount_usd) * usd / eur };
    }
    return { ...w, amount_eur: 0 };
  }));
  return { config, salaryStartMonth, plan: salaryPlanForMonth({ month, salaryStartMonth,
    portfolioEUR: salaryCapitalEUR(holdingsNow, rates), kasaEUR,
    inflationDecisions: policy?.inflation_decisions, withdrawals }) };
}
