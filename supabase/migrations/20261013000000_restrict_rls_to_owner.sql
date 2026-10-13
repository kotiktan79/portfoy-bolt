/*
  # Portföy tabloları yalnız sahibe

  Aynı Supabase projesi başka uygulamalarla ortak (pazarlama paneli, pazar yeri).
  Bu dosya public şemasındaki HER tabloya dokunmaz. Yalnız bu deponun
  src/ ve api/ kodunun okuyup yazdığı tablolar değişir. Başka tablonun
  politikası yerinde kalır.

  Liste koddan çıkarıldı (.from çağrıları). exchange_rates_daily bir
  görünümdür (security_invoker); ayrıca politikası yoktur, alttaki
  exchange_rates kuralını kullanır. Kodun okumadığı eski tablolar
  (portfolios, salary_settings, monthly_withdrawals, ai_recommendations,
  rebalancing_*) bu dosyada yok.

  holdings ve çoğunda user_id yok. cash_*.user_id giriş hesabı değil,
  sabit sahte id (00000000-0000-0000-0000-000000000001). Bu yüzden
  auth.uid() = user_id mevcut satırları gizlerdi.

  Sahip listesi: public.portfoy_bolt_owners
  Kontrol: public.portfoy_bolt_is_owner()
  İsimler bu uygulamaya özeldir; genel sahip-listesi adları kullanılmaz.

  auth.users içinde tam 1 kişi varsa o kişi listeye yazılır.
  0 veya daha fazla kişiyse liste boş kalır. Sahip kendi id'sini elle ekler.
  Kayıt kapatma panelden yapılır.

  Yeniden çalıştırılabilir: eksik tablo atlanır, politikalar düşülüp
  aynı adla yeniden kurulur, sahip satırı çakışmada tekrar eklenmez.
  supabase db push KULLANMA. SQL editöründe bir kez (gerekirse yine) çalıştır.
*/

create table if not exists public.portfoy_bolt_owners (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

comment on table public.portfoy_bolt_owners is
  'Yalnız portfoy-bolt. Giriş hesabı burada yoksa bu uygulamanın tablolarını göremez. Başka uygulamaların tablolarına karışmaz.';

alter table public.portfoy_bolt_owners enable row level security;

revoke all on table public.portfoy_bolt_owners from public, anon;
grant select on table public.portfoy_bolt_owners to authenticated;
grant all on table public.portfoy_bolt_owners to service_role;

drop policy if exists portfoy_bolt_owners_select_self on public.portfoy_bolt_owners;
create policy portfoy_bolt_owners_select_self
  on public.portfoy_bolt_owners
  for select
  to authenticated
  using (user_id = auth.uid());

create or replace function public.portfoy_bolt_is_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.portfoy_bolt_owners
    where user_id = auth.uid()
  );
$$;

revoke all on function public.portfoy_bolt_is_owner() from public;
grant execute on function public.portfoy_bolt_is_owner() to authenticated, service_role;

insert into public.portfoy_bolt_owners (user_id)
select u.id
from auth.users u
where (select count(*) from auth.users) = 1
on conflict (user_id) do nothing;

do $$
declare
  -- src/ ve api/ içindeki .from('...') tabloları. Görünüm ve kullanılmayan tablolar yok.
  portfoy_tables text[] := array[
    'achievements',
    'ai_research_reports',
    'automation_settings',
    'cash_balances',
    'cash_transactions',
    'daily_reports',
    'dividends',
    'exchange_rates',
    'holdings',
    'income_records',
    'monthly_salary',
    'portfolio_snapshots',
    'price_alerts',
    'price_history',
    'push_subscriptions',
    'salary_withdrawals',
    'scenario_analyses',
    'transactions'
  ];
  t text;
  pol record;
  kind "char";
begin
  if (select count(*) from auth.users) = 1 then
    raise notice 'portfoy_bolt_owners: tek kullanıcı otomatik eklendi';
  elsif (select count(*) from auth.users) = 0 then
    raise warning 'portfoy_bolt_owners boş: auth.users boş. Giriş hesabının id''sini elle ekle.';
  elsif not exists (select 1 from public.portfoy_bolt_owners) then
    raise warning 'portfoy_bolt_owners boş: auth.users içinde birden fazla kişi var. Yalnız kendi id''ni ekle.';
  end if;

  foreach t in array portfoy_tables loop
    select c.relkind into kind
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = t;

    if kind is null then
      raise notice 'portfoy tablo yok, atlandı: %', t;
      continue;
    end if;
    if kind <> 'r' then
      raise notice 'portfoy sıradan tablo değil, atlandı: %', t;
      continue;
    end if;

    execute format('alter table public.%I enable row level security', t);

    for pol in
      select policyname
      from pg_policies
      where schemaname = 'public'
        and tablename = t
    loop
      execute format('drop policy if exists %I on public.%I', pol.policyname, t);
    end loop;

    execute format(
      'create policy portfoy_bolt_owner_all on public.%I for all to authenticated using (public.portfoy_bolt_is_owner()) with check (public.portfoy_bolt_is_owner())',
      t
    );

    raise notice 'portfoy RLS yalnız bu tablo: %', t;
  end loop;
end $$;

notify pgrst, 'reload schema';
