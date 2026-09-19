-- 2026-09-19: günlük rapor cron'u TEK ÖLÇÜ EUR'a geçti (api/lib/eurEngine = uygulamayla aynı motor).
-- TL nominal sütunlar (portfolio_value/pnl, safe/moderate_monthly_income) geriye dönük kalır, yeni EUR sütunları eklenir.
alter table public.daily_reports
  add column if not exists wealth_eur            numeric,
  add column if not exists pnl_eur_day           numeric,
  add column if not exists pnl_eur_mtd           numeric,
  add column if not exists salary_eur            numeric,   -- bu ayın dinamik maaşı (geçen ay çekilebilir × 0,85)
  add column if not exists projected_salary_eur  numeric,   -- MTD'ye göre gelecek ay ön izleme
  add column if not exists eur_rate              numeric,
  add column if not exists eur_health_ok         boolean;
