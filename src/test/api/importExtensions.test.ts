// api/ KLASÖRÜNDE GÖRECELİ IMPORT'LAR '.js' İLE BİTMEK ZORUNDA — 2026-10-10
//
// Tetikleyen olay: api/cron/daily-snapshot.ts'e `from '../lib/quoteConvert'` (uzantısız) eklendi.
// tsc TEMİZ geçti, çünkü moduleResolution:'bundler' uzantısız import'a izin verir. Ama Vercel'de
// fonksiyon Node ESM ile çalışıyor; orada uzantısız göreceli import ERR_MODULE_NOT_FOUND verir ve
// modül seviyesinde çöker → fonksiyonun TEK SATIRI bile çalışmaz.
// Sonuç: daily-snapshot cron'u 2 gün hiç çalışmadı, 9 Ekim kapanışı KALICI olarak kayboldu.
// Test tsc'nin göremediği şeyi görür: dosya listesini okuyup her göreceli import'u denetler.
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

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
});
