#!/usr/bin/env node
// FX-blind aritmetik avcısı.
// `h.current_price * h.quantity` gibi pattern'leri raw kullanan tüm dosyaları yakalar.
// Sadece whitelist'tekiler raw math yapabilir (fx.ts, portfolioMetrics.ts, vs.).
//
// Kullanım: node scripts/check-formulas.mjs   (exit 1 = ihlal var)
// pretest / prebuild hook'una bağlı.
//
// Kural: bu pattern'leri kullanmak istiyorsan ya whitelist'e ekle ya da
// satıra `// fx-ok: <reason>` yorumu koy.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;

// Bu dosyalarda raw arithmetic serbest (FX merkez modülleri).
const WHITELIST = new Set([
  'src/lib/fx.ts',
  'src/lib/portfolioMetrics.ts',
  'src/lib/portfolioMetrics.test.ts',
  'src/services/analyticsService.test.ts',
  // Cron: FX'i kendi içinde tryValueOf ile çevirip kullanıyor, raw değil.
  // Yine de yeni cron'lar guard'a takılsın diye whitelist'e EKLEMEDİK.
]);

// Yasak pattern'ler. Her satır için tek tek aranır.
const PATTERNS = [
  {
    re: /\.current_price\s*\*\s*\w+\.?(quantity|qty)/,
    msg: 'FX-blind: current_price * quantity → holdingValueTRY(h, fxRates) kullan',
  },
  {
    re: /\.purchase_price\s*\*\s*\w+\.?(quantity|qty)/,
    msg: 'FX-blind: purchase_price * quantity → holdingCostTRY(h, fxRates) kullan',
  },
  {
    re: /\(\s*\w+\.total_value\s*-\s*\w+\.total_investment\s*\)/,
    msg: 'PnL recompute: snapshot.total_pnl varken value − investment recompute etme',
  },
];

const EXTS = ['.ts', '.tsx'];
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', '.next', 'build', 'coverage']);

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      yield* walk(full);
    } else if (EXTS.some(e => full.endsWith(e))) {
      yield full;
    }
  }
}

const violations = [];
for (const file of walk(ROOT)) {
  const rel = relative(ROOT, file);
  if (WHITELIST.has(rel)) continue;
  // src/ ve api/ dışındaki test/script dosyalarını es geç
  if (!rel.startsWith('src/') && !rel.startsWith('api/')) continue;

  const lines = readFileSync(file, 'utf8').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes('fx-ok:')) continue; // explicit override
    for (const p of PATTERNS) {
      if (p.re.test(line)) {
        violations.push({ file: rel, line: i + 1, code: line.trim(), msg: p.msg });
      }
    }
  }
}

if (violations.length === 0) {
  console.log('✓ FX/PnL formula guard: temiz');
  process.exit(0);
}

console.error(`✗ FX/PnL formula guard: ${violations.length} ihlal\n`);
for (const v of violations) {
  console.error(`  ${v.file}:${v.line}`);
  console.error(`    ${v.code}`);
  console.error(`    → ${v.msg}\n`);
}
console.error('Düzeltme: ya `// fx-ok: <sebep>` ekle ya da FX-aware helper kullan.');
process.exit(1);
