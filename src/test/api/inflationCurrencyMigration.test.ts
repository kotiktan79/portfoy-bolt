import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20261013140000_inflation_and_tx_currency.sql'),
  'utf8',
);

describe('enflasyon ve işlem para birimi migrasyonu', () => {
  it('yalnız iki portföy nesnesine sütun ekler', () => {
    expect(sql).toContain('alter table public.portfoy_bolt_salary_policy');
    expect(sql).toContain('add column if not exists inflation_annual numeric not null default 0.03');
    expect(sql).toContain('alter table public.transactions');
    expect(sql).toContain('add column if not exists currency text');
    expect(sql).not.toMatch(/\bcreate table\b/i);
    expect(sql).not.toMatch(/\bdrop table\b/i);
    expect(sql).not.toMatch(/\bdelete from\b/i);
    expect(sql).not.toMatch(/using\s*\(\s*true\s*\)/i);
    expect(sql).not.toMatch(/auth\.users/i);
    expect(sql).not.toMatch(/for\s+\w+\s+in\s+select/i);
  });

  it('başka şema döngüsü veya Tandor tablosu yok', () => {
    const tables = [...sql.matchAll(/alter table public\.([a-z0-9_]+)/gi)].map(m => m[1]);
    expect(tables.sort()).toEqual(['portfoy_bolt_salary_policy', 'transactions']);
  });
});
