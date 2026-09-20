-- MAAŞ ÇEKİMİ v3 (2026-09-20, denetim bulgusu): v2 `returning user_id` yapıyordu ama holdings'te
-- user_id sütunu YOK → ilk çağrıda 42703 ile patlar, çekim hiç çalışmazdı.
-- Düzeltmeler: (1) user_id sabit ANON_USER_ID (cash_transactions'taki 77/77 satır bu değeri kullanıyor);
-- (2) miktar MUTLAK değil GÖRELİ düşülür (istemcinin bayat React state'i panel çekimini geri almasın)
--     ve yetersiz miktarda hata verir; (3) realize satırı korunur (kâr motoru çekimi zarar sanmasın).
drop function if exists public.withdraw_salary(uuid, numeric, numeric, numeric, numeric, text, numeric, numeric, text);

create or replace function public.withdraw_salary(
  p_holding_id uuid,
  p_source_quantity_deducted numeric,
  p_amount_usd numeric,
  p_reservoir_after_usd numeric,
  p_portfolio_value_usd numeric,
  p_source_symbol text,
  p_realized_try numeric default 0,
  p_note text default null
) returns numeric   -- kalan miktar
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

  return v_remaining;
end;
$$;

revoke execute on function public.withdraw_salary(uuid, numeric, numeric, numeric, numeric, text, numeric, text) from public, anon;
grant execute on function public.withdraw_salary(uuid, numeric, numeric, numeric, numeric, text, numeric, text) to authenticated, service_role;
