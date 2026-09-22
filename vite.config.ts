import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';

// Her build'de sw.js'e benzersiz BUILD_ID yazar → SW dosyası her deploy'da değişir → istemcideki
// otomatik yenileme (pwaService controllerchange) tetiklenir. 2026-09-20: sw.js değişmeyince PWA
// eski JS'i bellekte çalıştırmaya devam ediyordu ('güncellememişsin, aynı görünüyor').
function swBuildId(): Plugin {
  return {
    name: 'sw-build-id',
    apply: 'build',
    closeBundle() {
      const f = 'dist/sw.js';
      if (!existsSync(f)) return;
      let id = String(Date.now());
      try { id = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() + '-' + Date.now().toString(36); } catch { /* git yoksa zaman damgası */ }
      writeFileSync(f, readFileSync(f, 'utf8').replace(/__BUILD_ID__/g, id));
    },
  };
}

export default defineConfig({
  plugins: [react(), swBuildId()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],   // api/lib testleri de src/test/api altında (api/ = Vercel fonksiyonları)
  },
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  build: {
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        // Fonksiyon formu şart: obje formu, paylaşılan interop/yardımcı
        // modülleri vendor chunk'larının içine koyuyor ve entry o chunk'ları
        // statik import etmek zorunda kalıyordu → 763KB tremor + charts + pdf
        // ilk açılışta iniyordu (lazy sayfalar boşa çıkıyordu).
        manualChunks(id: string) {
          // Paylaşılan interop/yardımcı modüller eager chunk'ta durmalı;
          // yoksa Rollup bunları bir vendor chunk'ına gömüyor ve entry o
          // koca chunk'ı statik import etmek zorunda kalıyor.
          if (
            /\/(tslib|react-is|prop-types|use-sync-external-store|clsx)\//.test(id) ||
            id.includes('commonjsHelpers')
          ) {
            return 'vendor-react';
          }
          if (!id.includes('node_modules')) return;
          if (id.includes('/recharts/')) return 'vendor-charts';
          if (id.includes('/framer-motion/')) return 'vendor-motion';
          if (id.includes('/jspdf') || id.includes('html2canvas')) return 'vendor-pdf';
          if (id.includes('/date-fns/')) return 'vendor-utils';
          if (
            id.includes('/react/') ||
            id.includes('/react-dom/') ||
            id.includes('/react-router') ||
            id.includes('/scheduler/')
          ) {
            return 'vendor-react';
          }
        },
      },
    },
  },
});
