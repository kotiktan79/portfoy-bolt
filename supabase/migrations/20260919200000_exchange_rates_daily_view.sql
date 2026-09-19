-- 2026-09-19: PostgREST max_rows=1000 tavanı .range(0,4999)'u eziyor → exchange_rates (EUR 2.863 satır)
-- 3 Haziran'da kesiliyor, kur donuyordu (uygulama + cron). Çözüm: gün başına SON kur görünümü
-- (~170 satır/para birimi) — EUR kâr motoru ve kuruluş kârı yalnız buradan okur.
create or replace view public.exchange_rates_daily
with (security_invoker = true) as
select
  from_currency,
  to_currency,
  source,
  (recorded_at at time zone 'UTC')::date                 as day,
  (array_agg(rate order by recorded_at desc))[1]          as rate,
  max(recorded_at)                                        as recorded_at
from public.exchange_rates
group by from_currency, to_currency, source, (recorded_at at time zone 'UTC')::date;

grant select on public.exchange_rates_daily to authenticated, service_role;
revoke all on public.exchange_rates_daily from anon;
