-- Fiyat hassasiyeti, Ev Parası işareti, REVOLUT-ROBO manuel EUR.
-- Yalnız public.holdings ve public.price_history. RLS, auth ve başka tablo yok.
--
-- 1) numeric(20,4) TEFAS NAV'ı kesiyor (GPY1PPF 0.142216 → 0.1422; GPA ve IPV de).
--    Tan bu genişletmeyi onayladı. Bağımlı view varsa dur; view burada değiştirilmez.
--    Depodaki migrasyonlarda bu kolonlara bakan view/fonksiyon yok.
-- 2) house_money: Ev Parası hedef dağılım ve dengelemenin dışında.
-- 3) REVOLUT-ROBO sabit TRY fiyatı EUR karşılığını kurla kaydırıyor. Değer €8.762.
--    Alış fiyatı bugünkü EURO kuruyla EUR'ya çevrilir; TL maliyet zıplamaz.
--    Adet durur. current_price = 8762 / adet → pozisyon değeri tam €8.762.

do $$
declare
  dep text;
begin
  select string_agg(distinct (vn.nspname || '.' || v.relname), ', ')
    into dep
  from pg_depend d
  join pg_rewrite rw on rw.oid = d.objid
  join pg_class v on v.oid = rw.ev_class
  join pg_namespace vn on vn.oid = v.relnamespace
  join pg_class src on src.oid = d.refobjid
  join pg_namespace sn on sn.oid = src.relnamespace
  join pg_attribute a on a.attrelid = src.oid and a.attnum = d.refobjsubid and not a.attisdropped
  where sn.nspname = 'public'
    and src.relname in ('holdings', 'price_history')
    and a.attname in ('current_price', 'price')
    and v.oid <> src.oid
    and v.relkind in ('v', 'm');
  if dep is not null then
    raise exception 'price precision blocked by view(s): %', dep;
  end if;
end $$;

alter table public.holdings
  alter column current_price type numeric(20, 8);

alter table public.price_history
  alter column price type numeric(20, 8);

alter table public.holdings
  add column if not exists house_money boolean not null default false;

comment on column public.holdings.house_money is
  'Ev Parası. Hedef dağılım ve dengeleme dışında, kasadan ayrı gösterilir.';

-- GPY1PPF (fon, notu "Ev Parası" ile başlar) ve TRY nakit "Ev Parası".
update public.holdings
   set house_money = true,
       updated_at = now()
 where coalesce(house_money, false) = false
   and (
     (
       upper(symbol) = 'GPY1PPF'
       and coalesce(price_notes, '') ~* '^[[:space:]]*Ev Paras[ıiİI]'
     )
     or btrim(symbol) ~* '^Ev Paras[ıiİI]$'
     or (
       asset_type = 'cash'
       and upper(coalesce(currency, 'TRY')) = 'TRY'
       and (
         btrim(symbol) ~* '^Ev Paras[ıiİI]'
         or coalesce(price_notes, '') ~* '^[[:space:]]*Ev Paras[ıiİI]'
       )
     )
   );

-- REVOLUT-ROBO: manuel EUR değer €8.762. İkinci kez çalışırsa (currency zaten EUR) dokunmaz.
-- EURO kuru yoksa sessizce TRY'de bırakma.
do $$
declare
  pending int;
  fx numeric;
begin
  select count(*) into pending
    from public.holdings
   where upper(symbol) = 'REVOLUT-ROBO'
     and upper(coalesce(currency, 'TRY')) <> 'EUR'
     and quantity > 0;
  if pending > 0 then
    select current_price into fx
      from public.holdings
     where asset_type = 'currency'
       and upper(symbol) in ('EURO', 'EUR')
       and current_price > 1
     order by updated_at desc nulls last
     limit 1;
    if fx is null then
      raise exception 'REVOLUT-ROBO EUR conversion blocked: no EURO/EUR currency holding with current_price > 1';
    end if;
  end if;
end $$;

update public.holdings as h
   set currency = 'EUR',
       purchase_currency = 'EUR',
       current_price = round((8762::numeric / h.quantity), 8),
       purchase_price = round((h.purchase_price / fx.rate), 8),
       manual_price = true,
       manual_price_updated_at = now(),
       updated_at = now()
  from (
    select current_price as rate
      from public.holdings
     where asset_type = 'currency'
       and upper(symbol) in ('EURO', 'EUR')
       and current_price > 1
     order by updated_at desc nulls last
     limit 1
  ) as fx
 where upper(h.symbol) = 'REVOLUT-ROBO'
   and upper(coalesce(h.currency, 'TRY')) <> 'EUR'
   and h.quantity > 0
   and fx.rate > 1;
