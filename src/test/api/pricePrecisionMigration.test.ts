import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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
    const alters = sql.match(/alter table\s+public\.\w+/gi) || [];
    expect(alters.every(s => /public\.(holdings|price_history)\b/i.test(s))).toBe(true);
    const updates = sql.match(/update\s+public\.\w+/gi) || [];
    expect(updates).toEqual(['update public.holdings', 'update public.holdings']);
  });
});
