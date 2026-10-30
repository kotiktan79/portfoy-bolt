-- Yıl sonu enflasyon payı kararı (Onayla ve düş / Bu yıl düşme).
-- UYGULANMADI. Tan'ın onayı olmadan çalıştırma. `supabase db push` KULLANMA.
-- Onaydan sonra Supabase SQL editöründe bir kez çalıştırılır.
--
-- Yalnız public.portfoy_bolt_salary_policy tablosuna bir sütun ekler.
-- Tandor tablolarına, RLS politikalarına, auth'a dokunmaz. Mevcut satır değişmez.
-- Biçim: { "2026": { "year": 2026, "decision": "approved" | "declined",
--                    "rate": 0.03, "amountEUR": 4321.55, "decidedAt": "2026-12-31T10:00:00Z" } }
-- Sütun yokken uygulama hiçbir şey düşmez ve karar kaydedilemez (güvenli taraf).

alter table public.portfoy_bolt_salary_policy
  add column if not exists inflation_decisions jsonb not null default '{}'::jsonb;

comment on column public.portfoy_bolt_salary_policy.inflation_decisions is
  'Yıl sonu enflasyon payı kararları, yıl anahtarıyla. Karar yoksa pay düşülmez.';

notify pgrst, 'reload schema';
