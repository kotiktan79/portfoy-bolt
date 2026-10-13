import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20261013120000_salary_eur_and_categories.sql'),
  'utf8',
);

const NEW_TABLES = ['portfoy_bolt_salary_policy', 'portfoy_bolt_kasa_salary_moves'];

describe('maaş ve kategori migrasyonu', () => {
  it('yeni tablolar yalnız sahibe açık', () => {
    expect(sql).not.toMatch(/using\s*\(\s*true\s*\)/i);
    expect(sql).not.toMatch(/with check\s*\(\s*true\s*\)/i);
    for (const table of NEW_TABLES) {
      const block = sql.slice(sql.indexOf(`on public.${table}`));
      expect(block).toMatch(
        new RegExp(
          `create policy portfoy_bolt_owner_all[\\s\\S]*?on public\\.${table}[\\s\\S]*?using \\(public\\.portfoy_bolt_is_owner\\(\\)\\)[\\s\\S]*?with check \\(public\\.portfoy_bolt_is_owner\\(\\)\\)`,
          'i',
        ),
      );
    }
  });

  it('tekrar çalışınca açık politika ve çakışan satır bırakmaz', () => {
    expect(sql).toContain('add column if not exists');
    expect(sql).toContain('create table if not exists public.portfoy_bolt_salary_policy');
    expect(sql).toContain('create table if not exists public.portfoy_bolt_kasa_salary_moves');
    expect(sql).toContain('on conflict (id) do nothing');
    expect(sql).toContain('create or replace function public.withdraw_salary_eur');
    expect(sql).toContain("drop policy if exists \"portfoy_bolt_salary_policy all\"");
    expect(sql).toContain("drop policy if exists \"portfoy_bolt_kasa_salary_moves all\"");
    expect(sql).toContain('drop policy if exists portfoy_bolt_owner_all on public.portfoy_bolt_salary_policy');
    expect(sql).toContain('drop policy if exists portfoy_bolt_owner_all on public.portfoy_bolt_kasa_salary_moves');
    expect(sql).toContain("asset_type is distinct from 'money_market'");
    expect(sql).toContain("asset_type is distinct from 'treasury_etf'");
    expect(sql).not.toMatch(/\bdrop table\b/i);
    expect(sql).not.toMatch(/\bdelete from\b/i);
  });
});
