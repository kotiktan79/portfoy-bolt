-- Tandor Finans — yalnız bu uygulamanın tabloları.
-- Supabase SQL Editor'da çalıştır. supabase db push KULLANMA.
-- Eklemedir, tekrar çalıştırılınca bozulmaz. Mevcut satırları silmez.
-- Başka uygulamaların (panel / marketplace) tablolarına dokunmaz.
-- Yeni tablolar public.portfoy_bolt_is_owner() kullanır (güvenlik migrasyonu önce çalışmış olmalı).

-- 1) Maaş çekimi euro kolonları. Eski amount_usd kolonları durur (eski satırlar bozulmasın).
alter table public.salary_withdrawals
  add column if not exists amount_eur numeric,
  add column if not exists reservoir_after_eur numeric,
  add column if not exists portfolio_value_eur numeric,
  add column if not exists from_pool_eur numeric;

-- 2) Maaş ayarları (tek satır). Kodda da aynı varsayılanlar var; tablo yoksa uygulama varsayılanı kullanır.
create table if not exists public.portfoy_bolt_salary_policy (
  id integer primary key default 1,
  floor_eur numeric not null default 700,
  cap_eur numeric not null default 1000,
  kasa_floor_eur numeric not null default 15000,
  kasa_refill_ratio numeric not null default 0.5,
  kasa_start_eur numeric not null default 29400,
  salary_start_month text not null default '2027-04',
  updated_at timestamptz not null default now(),
  constraint portfoy_bolt_salary_policy_one check (id = 1)
);

insert into public.portfoy_bolt_salary_policy (id)
values (1)
on conflict (id) do nothing;

-- 3) Kasadan maaş tamamlama / geri koyma defteri. Kâr havuzundan DÜŞMEZ.
create table if not exists public.portfoy_bolt_kasa_salary_moves (
  id uuid primary key default gen_random_uuid(),
  moved_at timestamptz not null default now(),
  kind text not null check (kind in ('topup', 'refill')),
  amount_eur numeric(12,2) not null check (amount_eur > 0),
  note text
);

alter table public.portfoy_bolt_salary_policy enable row level security;
alter table public.portfoy_bolt_kasa_salary_moves enable row level security;

-- Diğer portföy tablolarıyla aynı kural: yalnız public.portfoy_bolt_is_owner().
-- Eski açık politika adı da düşülür; tekrar çalışınca (true) kuralı geride kalmasın.
drop policy if exists "portfoy_bolt_salary_policy all" on public.portfoy_bolt_salary_policy;
drop policy if exists portfoy_bolt_owner_all on public.portfoy_bolt_salary_policy;
create policy portfoy_bolt_owner_all
  on public.portfoy_bolt_salary_policy
  for all
  to authenticated
  using (public.portfoy_bolt_is_owner())
  with check (public.portfoy_bolt_is_owner());

drop policy if exists "portfoy_bolt_kasa_salary_moves all" on public.portfoy_bolt_kasa_salary_moves;
drop policy if exists portfoy_bolt_owner_all on public.portfoy_bolt_kasa_salary_moves;
create policy portfoy_bolt_owner_all
  on public.portfoy_bolt_kasa_salary_moves
  for all
  to authenticated
  using (public.portfoy_bolt_is_owner())
  with check (public.portfoy_bolt_is_owner());

revoke all on table public.portfoy_bolt_salary_policy from public, anon;
revoke all on table public.portfoy_bolt_kasa_salary_moves from public, anon;
grant select, insert, update, delete on table public.portfoy_bolt_salary_policy to authenticated, service_role;
grant select, insert, update, delete on table public.portfoy_bolt_kasa_salary_moves to authenticated, service_role;

-- 4) Çekim fonksiyonu. Eski withdraw_salary durur. Yeni kayıt euro kolonunu esas alır,
--    eski ekranlar bozulmasın diye USD kolonlarına da çevrilmiş tutarı yazar.
create or replace function public.withdraw_salary_eur(
  p_holding_id uuid,
  p_source_quantity_deducted numeric,
  p_amount_eur numeric,
  p_reservoir_after_eur numeric,
  p_portfolio_value_eur numeric,
  p_source_symbol text,
  p_realized_try numeric default 0,
  p_note text default null,
  p_amount_usd numeric default 0,
  p_reservoir_after_usd numeric default 0,
  p_portfolio_value_usd numeric default 0,
  p_from_pool_eur numeric default null
) returns numeric
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_remaining numeric;
  v_user constant uuid := '00000000-0000-0000-0000-000000000001';
begin
  if p_source_quantity_deducted is null or p_source_quantity_deducted <= 0 then
    raise exception 'gecersiz miktar %', p_source_quantity_deducted;
  end if;
  if p_amount_eur is null or p_amount_eur <= 0 then
    raise exception 'gecersiz euro tutari %', p_amount_eur;
  end if;

  update public.holdings
     set quantity = quantity - p_source_quantity_deducted,
         updated_at = now()
   where id = p_holding_id
     and quantity >= p_source_quantity_deducted
  returning quantity into v_remaining;
  if not found then
    raise exception 'holding % bulunamadi ya da miktar yetersiz', p_holding_id;
  end if;

  insert into public.salary_withdrawals
    (amount_usd, reservoir_after_usd, portfolio_value_usd, source_symbol, source_quantity_deducted, note,
     amount_eur, reservoir_after_eur, portfolio_value_eur, from_pool_eur)
  values
    (coalesce(p_amount_usd, 0), coalesce(p_reservoir_after_usd, 0), coalesce(p_portfolio_value_usd, 0),
     p_source_symbol, p_source_quantity_deducted, p_note,
     p_amount_eur, p_reservoir_after_eur, p_portfolio_value_eur, coalesce(p_from_pool_eur, p_amount_eur));

  insert into public.cash_transactions
    (transaction_type, type, amount, currency, notes, related_holding_id, user_id)
  values
    ('sell', 'sell', p_source_quantity_deducted, 'TRY',
     coalesce(p_note, 'Maaş çekimi') || ' (Kar/Zarar: ' || round(coalesce(p_realized_try, 0)::numeric, 2) || ' ₺)',
     p_holding_id, v_user);

  return v_remaining;
end;
$$;

revoke execute on function public.withdraw_salary_eur(uuid, numeric, numeric, numeric, numeric, text, numeric, text, numeric, numeric, numeric, numeric) from public, anon;
grant execute on function public.withdraw_salary_eur(uuid, numeric, numeric, numeric, numeric, text, numeric, text, numeric, numeric, numeric, numeric) to authenticated, service_role;

-- 5) Kategori düzeltmesi. Satır silinmez; yalnız XEON ve IB01'in tipi değişir.
-- holdings.asset_type düz metindir (text not null). Depodaki migrasyonlarda
-- bu kolonda CHECK veya enum yoktur; yeni değerler ek kısıt gerektirmez.
update public.holdings
   set asset_type = 'money_market'
 where upper(symbol) = 'XEON'
   and asset_type is distinct from 'money_market';

update public.holdings
   set asset_type = 'treasury_etf'
 where upper(symbol) = 'IB01'
   and asset_type is distinct from 'treasury_etf';

notify pgrst, 'reload schema';
