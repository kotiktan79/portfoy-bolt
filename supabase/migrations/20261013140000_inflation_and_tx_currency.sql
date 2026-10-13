-- Tandor Finans — yalnız portföy tabloları.
-- Supabase SQL Editor'da çalıştır. supabase db push KULLANMA.
-- Bu dosyayı çalıştırma: sahip onayından sonra SQL editöründe bir kez.
-- Eklemedir, tekrar çalıştırılınca bozulmaz. Satır silmez, tablo düşürmez.
-- Başka uygulamaların (panel / marketplace) tablolarına, auth ayarlarına dokunmaz.
-- Yeni politika yok: portfoy_bolt_salary_policy ve transactions zaten
-- public.portfoy_bolt_is_owner() ile kısıtlı.

alter table public.portfoy_bolt_salary_policy
  add column if not exists inflation_annual numeric not null default 0.03;

comment on column public.portfoy_bolt_salary_policy.inflation_annual is
  'Yıllık euro enflasyon. 0.03 = %3. Kâr motoru açık ayda gün oranında uygular.';

alter table public.transactions
  add column if not exists currency text;

comment on column public.transactions.currency is
  'İşlemin para birimi. Pozisyon adedi sıfır kalsa da realize çevrimi bunu kullanır.';

notify pgrst, 'reload schema';
