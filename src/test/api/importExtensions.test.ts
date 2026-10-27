// api/ KLASÖRÜNDE GÖRECELİ IMPORT'LAR '.js' İLE BİTMEK ZORUNDA — 2026-10-10
//
// Tetikleyen olay: api/cron/daily-snapshot.ts'e `from '../lib/quoteConvert'` (uzantısız) eklendi.
// tsc TEMİZ geçti, çünkü moduleResolution:'bundler' uzantısız import'a izin verir. Ama Vercel'de
// fonksiyon Node ESM ile çalışıyor; orada uzantısız göreceli import ERR_MODULE_NOT_FOUND verir ve
// modül seviyesinde çöker → fonksiyonun TEK SATIRI bile çalışmaz.
// Sonuç: daily-snapshot cron'u 2 gün hiç çalışmadı, 9 Ekim kapanışı KALICI olarak kayboldu.
// Test tsc'nin göremediği şeyi görür: dosya listesini okuyup her göreceli import'u denetler.
import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (p.endsWith('.ts') && !p.endsWith('.d.ts')) out.push(p);
  }
  return out;
}

describe('api/ göreceli import uzantıları', () => {
  const files = walk('api');

  it('en az bir dosya taranıyor (test boşa dönmesin)', () => {
    expect(files.length).toBeGreaterThan(5);
  });

  it("her göreceli import '.js' ile bitiyor", () => {
    const hatalar: string[] = [];
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      // import ... from './x' | '../x'   ve   export ... from './x'
      for (const m of src.matchAll(/(?:^|\n)\s*(?:import|export)[^;\n]*?from\s+['"](\.[^'"]+)['"]/g)) {
        const spec = m[1];
        if (spec.endsWith('.js') || spec.endsWith('.json')) continue;
        hatalar.push(`${f} → '${spec}'`);
      }
      // yan etki import'ları: import './x'
      for (const m of src.matchAll(/(?:^|\n)\s*import\s+['"](\.[^'"]+)['"]/g)) {
        const spec = m[1];
        if (!spec.endsWith('.js') && !spec.endsWith('.json')) hatalar.push(`${f} → '${spec}' (yan etki)`);
      }
    }
    expect(hatalar, `Node ESM'de uzantısız göreceli import ÇÖKER:\n${hatalar.join('\n')}`).toEqual([]);
  });

  it('api zincirindeki src dosyaları da .js uzantılı (2026-10-24 snapshot kırılması)', () => {
    // daily-snapshot, src/lib/moneyWeightedReturn.ts'i yükledi. O dosyadaki
    // `from './eurPnl'` api/ taramasının dışında kaldı; Node ESM açılışta çöktü,
    // 24-26 Ekim snapshot'ı yazılmadı. Zincirdeki her değer import'u .js olmalı.
    // `import type` derlemede silinir, çalışma anında yoktur.
    const specsIn = (src: string): Array<{ spec: string; typeOnly: boolean }> => {
      const out: Array<{ spec: string; typeOnly: boolean }> = [];
      for (const m of src.matchAll(/(?:^|\n)\s*(?:import|export)\s+(type\s+)?[^;\n]*?\sfrom\s+['"](\.[^'"]+)['"]/g)) {
        out.push({ spec: m[2], typeOnly: Boolean(m[1]) });
      }
      for (const m of src.matchAll(/(?:^|\n)\s*import\s+['"](\.[^'"]+)['"]/g)) {
        out.push({ spec: m[1], typeOnly: false });
      }
      return out;
    };
    const resolveSpec = (fromFile: string, spec: string): string | null => {
      const base = normalize(join(dirname(fromFile), spec));
      const stems = spec.endsWith('.js')
        ? [base.slice(0, -3) + '.ts', base.slice(0, -3) + '.tsx', base]
        : [base + '.ts', base + '.tsx', base + '.js', join(base, 'index.ts')];
      return stems.find(p => existsSync(p)) ?? null;
    };
    const hatalar: string[] = [];
    const seen = new Set<string>();
    const queue = [...files];
    while (queue.length) {
      const f = queue.pop()!;
      if (seen.has(f)) continue;
      seen.add(f);
      const src = readFileSync(f, 'utf8');
      for (const { spec, typeOnly } of specsIn(src)) {
        if (!typeOnly && !spec.endsWith('.js') && !spec.endsWith('.json')) {
          hatalar.push(`${f} → '${spec}'`);
        }
        const next = resolveSpec(f, spec);
        if (next && (next.startsWith('api') || next.startsWith('src') || next.includes('/api/') || next.includes('/src/'))) queue.push(next);
      }
    }
    expect([...seen].some(f => f.endsWith('moneyWeightedReturn.ts'))).toBe(true);
    expect(hatalar, `Node ESM'de uzantısız göreceli import ÇÖKER:\n${hatalar.join('\n')}`).toEqual([]);
  });
});
