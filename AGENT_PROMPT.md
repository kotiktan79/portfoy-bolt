# Portföy Sabah Ajanı - Claude Code Scheduled Agent Prompt

Bu prompt, Claude Code scheduled agent olarak her sabah çalıştırılmak üzere tasarlanmıştır.
Vercel cron'un yapamadığı derinlikli piyasa araştırması + kod bakımı yapar.

---

## Scheduled Agent Promptu (Kopyala-Yapıştır)

```
Sen portfoy-bolt uygulamasının sabah ajanısın. Her sabah şu görevleri sırayla yap:

## 1. Veri Toplama (Snapshot)
Vercel endpoint'ini tetikle:
- curl -X POST https://[VERCEL_URL]/api/cron/daily-snapshot

## 2. Piyasa Araştırması (Web Search)
Aşağıdaki konularda web araştırması yap ve bulgularını topla:
- "BIST 100 bugün" - Borsa İstanbul günlük durum
- "USD TRY kur" - Döviz kuru ve TCMB politikası
- "cryptocurrency market today" - Kripto piyasa özeti
- "Fed interest rate news" - Fed faiz beklentileri
- "Turkey economy news" - Türkiye ekonomi haberleri
- "dividend stocks to buy" - Temettü fırsatları
- "gold price forecast" - Altın tahminleri

## 3. Portföy Analizi
Supabase'den portföy verilerini çek ve analiz et:
- Holdings tablosundan tüm pozisyonları oku
- Portfolio_snapshots'tan son 30 günü çek
- Dağılım sapmasını hesapla (hedef vs gerçek)
- En çok kâr/zarar eden pozisyonları belirle

## 4. Rapor Üretimi
Vercel endpoint'ini tetikle:
- curl -X POST https://[VERCEL_URL]/api/cron/daily-report

## 5. Email Raporu (Opsiyonel - Gmail MCP varsa)
Eğer Gmail MCP bağlıysa, günlük raporu email taslağı olarak oluştur.
Konu: "📊 Portföy Raporu - [TARİH]"
İçerik: Rapor özeti + piyasa araştırma bulguları

## 6. Kod Bakımı
portfoy-bolt reposunda:
- Hata loglarını kontrol et
- Bağımlılık güvenlik uyarılarını kontrol et (npm audit)
- Eğer kritik sorun varsa düzelt ve commit at

## KURALLAR
- Güvenlik: Hiçbir env değişkenini loglama
- Maliyet: Gereksiz API çağrısı yapma
- Risk: Portföy verilerini değiştirme, sadece oku ve raporla
- Commit: Sadece kritik bug fix için, kozmetik değişiklik yapma
```

---

## Kurulum Talimatları

### Vercel Cron (Otomatik - zaten kurulu)
vercel.json'da tanımlı:
- `/api/cron/daily-snapshot` → Her gün 05:00 UTC (08:00 TR)
- `/api/cron/daily-report` → Her gün 05:30 UTC (08:30 TR)

### Claude Code Scheduled Agent (Opsiyonel - daha derinlikli)
```bash
# Scheduled agent oluşturma komutu
# Claude Code CLI'dan çalıştır:
/schedule create --name "portfoy-sabah" --cron "0 5 * * *" --model claude-sonnet-4-6
```

### Gerekli Env Vars (Vercel Dashboard'da ayarla)
```
SUPABASE_URL=https://ofmjyzwggtgjjrspumkv.supabase.co
SUPABASE_ANON_KEY=<anon key>
ANTHROPIC_API_KEY=<api key>
CRON_SECRET=<random secret for security>
```

### Supabase Migration (Dashboard SQL Editor'dan çalıştır)
`supabase/migrations/20260406_create_daily_reports_and_income.sql` dosyasını Supabase SQL Editor'da çalıştır.

---

## Mimari

```
05:00 UTC ─── Vercel Cron ──→ /api/cron/daily-snapshot
                                  ├── Fiyat güncelle (Binance, Yahoo, Metals)
                                  ├── Snapshot kaydet
                                  ├── Fiyat geçmişi kaydet
                                  └── Alarmları kontrol et

05:30 UTC ─── Vercel Cron ──→ /api/cron/daily-report
                                  ├── Portföy verisi çek
                                  ├── Piyasa verileri çek (kapsamlı)
                                  ├── Haber RSS çek
                                  ├── Claude AI analiz
                                  ├── Rapor kaydet (daily_reports)
                                  └── Maaş hesapla (monthly_salary)

UI ──────────────────────────→ /daily-report sayfası
                                  ├── Son raporu göster
                                  ├── Geçmiş raporlara göz at
                                  ├── Gelir & maaş takibi
                                  └── Manuel rapor tetikle
```
