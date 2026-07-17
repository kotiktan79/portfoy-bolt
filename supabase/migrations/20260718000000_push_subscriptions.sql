-- Web Push abonelikleri: tarayıcının PushManager aboneliği (endpoint + anahtarlar).
-- Tek kullanıcılı app — RLS yerine rol yetkisi: anon kilitli (20260604010000 ile uyumlu),
-- authenticated (istemci upsert) + service_role (cron gönderim/temizlik) erişir.
--
-- NOT: `supabase db push` KULLANMA — Management API ile cerrahi uygula (2026-06-04 kararı).

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now()
);

revoke all on table public.push_subscriptions from public, anon;
grant select, insert, update, delete on table public.push_subscriptions to authenticated, service_role;
