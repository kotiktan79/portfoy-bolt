-- Maaş çekimini TEK transaction'da yapar: kaynak holding miktarını düşür +
-- salary_withdrawals kaydını ekle. İkisi aynı fonksiyonda olduğu için yarım-işlem
-- (holding düşmüş ama çekim kaydı yok) durumu kalamaz — KarCuzdani'daki iki-adımlı
-- telafi mantığının yerine geçer (istemci, fonksiyon yoksa eski yola düşer).
--
-- NOT: Remote şema migration geçmişinden sapmış durumda; bu dosya `supabase db push`
-- ile DEĞİL, Management API üzerinden cerrahi olarak uygulanmalı (bkz. 2026-06-04 kararı).

create or replace function public.withdraw_salary(
  p_holding_id uuid,
  p_new_quantity numeric,
  p_amount_usd numeric,
  p_reservoir_after_usd numeric,
  p_portfolio_value_usd numeric,
  p_source_symbol text,
  p_source_quantity_deducted numeric
) returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  update public.holdings
     set quantity = p_new_quantity
   where id = p_holding_id;
  if not found then
    raise exception 'holding % bulunamadi', p_holding_id;
  end if;

  insert into public.salary_withdrawals
    (amount_usd, reservoir_after_usd, portfolio_value_usd, source_symbol, source_quantity_deducted)
  values
    (p_amount_usd, p_reservoir_after_usd, p_portfolio_value_usd, p_source_symbol, p_source_quantity_deducted);
end;
$$;

-- anon kilitli kalsın (20260604010000_lock_down_anon ile uyumlu)
revoke execute on function public.withdraw_salary(uuid, numeric, numeric, numeric, numeric, text, numeric) from public, anon;
grant execute on function public.withdraw_salary(uuid, numeric, numeric, numeric, numeric, text, numeric) to authenticated, service_role;
