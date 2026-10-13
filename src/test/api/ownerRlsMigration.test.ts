import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20261013000000_restrict_rls_to_owner.sql'),
  'utf8',
);

const USED_TABLES = [
  'achievements',
  'ai_research_reports',
  'automation_settings',
  'cash_balances',
  'cash_transactions',
  'daily_reports',
  'dividends',
  'exchange_rates',
  'holdings',
  'income_records',
  'monthly_salary',
  'portfolio_snapshots',
  'price_alerts',
  'price_history',
  'push_subscriptions',
  'salary_withdrawals',
  'scenario_analyses',
  'transactions',
];

describe('portföy RLS migration', () => {
  it('yalnız bu uygulamanın okuduğu tabloları sayar', () => {
    const block = sql.slice(sql.indexOf('portfoy_tables text[]'), sql.indexOf('];'));
    for (const table of USED_TABLES) {
      expect(block).toContain(`'${table}'`);
    }
    expect(block).not.toContain('portfoy_bolt_owners');
    expect(block).not.toContain('exchange_rates_daily');
    expect(block).not.toContain('portfolios');
    expect(block).not.toContain('salary_settings');
  });

  it('public şemadaki bütün tabloları dolaşmaz', () => {
    expect(sql).not.toContain("c.relkind = 'r'");
    expect(sql).toContain('and c.relname = t');
    expect(sql).toContain('foreach t in array portfoy_tables');
  });

  it('genel app_owners adını kullanmaz', () => {
    expect(sql).not.toContain('app_owners');
    expect(sql).not.toContain('is_portfolio_owner');
    expect(sql).toContain('portfoy_bolt_owners');
    expect(sql).toContain('portfoy_bolt_is_owner');
  });

  it('yeniden çalışınca politika çakışmasın diye önce düşürür', () => {
    expect(sql).toContain('drop policy if exists portfoy_bolt_owners_select_self');
    expect(sql).toContain('drop policy if exists %I on public.%I');
    expect(sql).toContain('on conflict (user_id) do nothing');
  });
});
