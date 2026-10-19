import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20261019120000_price_precision_and_house_money.sql'),
  'utf8',
);

describe('fiyat hassasiyeti ve Ev Parası migrasyonu', () => {
  it('yalnız holdings ve price_history kolonlarına dokunur', () => {
    expect(sql).toContain('numeric(20, 8)');
    expect(sql).toContain('alter table public.holdings');
    expect(sql).toContain('alter column current_price type numeric(20, 8)');
    expect(sql).toContain('alter table public.price_history');
    expect(sql).toContain('alter column price type numeric(20, 8)');
    expect(sql).toContain('house_money boolean not null default false');
    expect(sql).toContain('8762');
    expect(sql).toContain("upper(h.symbol) = 'REVOLUT-ROBO'");
    expect(sql).toContain("upper(coalesce(h.currency, 'TRY')) <> 'EUR'");
    expect(sql).toMatch(/price precision blocked by view/);
    expect(sql).not.toMatch(/\bcreate policy\b/i);
    expect(sql).not.toMatch(/\balter policy\b/i);
    expect(sql).not.toMatch(/\bdrop policy\b/i);
    expect(sql).not.toMatch(/\benable row level security\b/i);
    expect(sql).not.toMatch(/auth\.users/i);
    expect(sql).not.toMatch(/\bdrop view\b/i);
    expect(sql).not.toMatch(/purchase_currency\s*=/);
    expect(sql).toContain("upper(btrim(symbol)) = 'TRY'");
    expect(sql).toContain("lower(asset_type) = 'currency'");
    const alters = sql.match(/alter table\s+public\.\w+/gi) || [];
    expect(alters.every(s => /public\.(holdings|price_history)\b/i.test(s))).toBe(true);
    const updates = sql.match(/update\s+public\.\w+/gi) || [];
    expect(updates).toEqual(['update public.holdings', 'update public.holdings', 'update public.holdings']);
  });

  it('uygulama kodu holdings.purchase_currency kullanmaz', () => {
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) walk(full);
        else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) && readFileSync(full, 'utf8').includes('purchase_currency')) hits.push(full);
      }
    };
    walk(resolve(process.cwd(), 'src'));
    walk(resolve(process.cwd(), 'api'));
    expect(hits).toEqual([]);
  });
});
