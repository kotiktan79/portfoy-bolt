/*
  # Yalnız sahip okusun / yazsın

  Uygulama tek kişilik. holdings ve çoğu tabloda user_id yok.
  cash_balances.user_id ise giriş hesabı değil, sabit sahte id
  (00000000-0000-0000-0000-000000000001). Bu yüzden
  `auth.uid() = user_id` mevcut satırları gizler ve uygulamayı kırar.

  Bunun yerine public.app_owners: gerçek auth.users id listesi.
  authenticated rolü yalnız listedeki hesaplara açılır.
  service_role (cron, /api) RLS'i aşmaya devam eder; satırlara dokunulmaz.

  auth.users içinde tam 1 kişi varsa o kişi otomatik yazılır.
  0 veya 1'den fazla kişiyse liste boş kalır — kimse veri göremez
  (kapalı başarısız). Sahip kendi id'sini elle ekler.
  Kayıt (sign up) kapatma işi SQL ile olmaz; panelden kapatılır.

  supabase db push KULLANMA. Bu dosyayı SQL editöründe bir kez çalıştır
  (önceki migration'larla aynı yöntem).
*/

create table if not exists public.app_owners (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

comment on table public.app_owners is
  'Portföyü görebilecek auth.users id listesi. Satır verisi burada değil; liste boşsa authenticated kimse veri göremez.';

alter table public.app_owners enable row level security;

revoke all on table public.app_owners from public, anon;
grant select on table public.app_owners to authenticated;
grant all on table public.app_owners to service_role;

drop policy if exists app_owners_select_self on public.app_owners;
create policy app_owners_select_self
  on public.app_owners
  for select
  to authenticated
  using (user_id = auth.uid());

create or replace function public.is_portfolio_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.app_owners
    where user_id = auth.uid()
  );
$$;

revoke all on function public.is_portfolio_owner() from public;
grant execute on function public.is_portfolio_owner() to authenticated, service_role;

insert into public.app_owners (user_id)
select u.id
from auth.users u
where (select count(*) from auth.users) = 1
on conflict (user_id) do nothing;

do $$
declare
  n int;
  r record;
  pol record;
begin
  select count(*) into n from auth.users;
  if n = 1 then
    raise notice 'app_owners: tek kullanıcı otomatik eklendi';
  elsif n = 0 then
    raise warning 'app_owners boş: auth.users boş. Giriş hesabının id''sini elle ekle.';
  else
    raise warning 'app_owners boş: auth.users içinde % kişi var. Yalnız kendi id''ni ekle.', n;
  end if;

  for r in
    select c.relname as table_name
    from pg_class c
    join pg_namespace nsp on nsp.oid = c.relnamespace
    where nsp.nspname = 'public'
      and c.relkind = 'r'
      and c.relname <> 'app_owners'
      and c.relname not in ('spatial_ref_sys', 'geography_columns', 'geometry_columns')
  loop
    execute format('alter table public.%I enable row level security', r.table_name);

    for pol in
      select policyname
      from pg_policies
      where schemaname = 'public'
        and tablename = r.table_name
    loop
      execute format('drop policy if exists %I on public.%I', pol.policyname, r.table_name);
    end loop;

    execute format(
      'create policy owner_all on public.%I for all to authenticated using (public.is_portfolio_owner()) with check (public.is_portfolio_owner())',
      r.table_name
    );

    raise notice 'RLS sahip politikası: %', r.table_name;
  end loop;
end $$;

notify pgrst, 'reload schema';
