-- MAAŞ ÇEKİMİ v2 (2026-09-20) — kâr havuzu kuralıyla birlikte.
-- Sorun (denetim bulgusu): çekim yalnız holdings.quantity'yi düşürüyordu. Kâr motoru için
-- akış = Δmaliyet − kurDrift − realize olduğundan, değer o günkü fiyatla düşerken maliyet
-- alış fiyatıyla düştüğü için aradaki fark SAHTE ZARAR olarak kâra yazılıyordu (€1.000 çekimde ≈ −€140).
-- Çözüm: çekimde cash_transactions'a "(Kar/Zarar: X ₺)" notlu 'sell' satırı da yazılır; motor bunu
-- realize olarak okuyup akışı doğru kurar ve kâr çekimden etkilenmez. Havuzdan düşüm ayrıca
-- salary_withdrawals üzerinden yapılır (TEK DEFTER — panel de buraya yazar).
create or replace function public.withdraw_salary(
  p_holding_id uuid,
  p_new_quantity numeric,
  p_amount_usd numeric,
  p_reservoir_after_usd numeric,
  p_portfolio_value_usd numeric,
  p_source_symbol text,
  p_source_quantity_deducted numeric,
  p_realized_try numeric default 0,
  p_note text default null
) returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user uuid;
begin
  update public.holdings
     set quantity = p_new_quantity
   where id = p_holding_id
  returning user_id into v_user;
  if not found then
    raise exception 'holding % bulunamadi', p_holding_id;
  end if;

  insert into public.salary_withdrawals
    (amount_usd, reservoir_after_usd, portfolio_value_usd, source_symbol, source_quantity_deducted, note)
  values
    (p_amount_usd, p_reservoir_after_usd, p_portfolio_value_usd, p_source_symbol, p_source_quantity_deducted, p_note);

  -- Kâr motorunun akışı doğru kurması için realize satırı (TRY cinsinden K/Z)
  insert into public.cash_transactions
    (transaction_type, type, amount, currency, notes, related_holding_id, user_id)
  values
    ('sell', 'sell', p_source_quantity_deducted, 'TRY',
     coalesce(p_note, 'Maaş çekimi') || ' (Kar/Zarar: ' || round(coalesce(p_realized_try, 0)::numeric, 2) || ' ₺)',
     p_holding_id, v_user);
end;
$$;

revoke execute on function public.withdraw_salary(uuid, numeric, numeric, numeric, numeric, text, numeric, numeric, text) from public, anon;
grant execute on function public.withdraw_salary(uuid, numeric, numeric, numeric, numeric, text, numeric, numeric, text) to authenticated, service_role;

-- Eski 7 argümanlı sürüm kaldırıldı: realize satırı yazmayan çekim yolu açık kalmasın.
drop function if exists public.withdraw_salary(uuid, numeric, numeric, numeric, numeric, text, numeric);
