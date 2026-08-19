-- ============================================================
-- Eightysixdegrees Punchcard — push notification subscriptions
-- ============================================================
-- Run this in the Supabase SQL Editor, then tell Claude so the matching
-- app.js/service-worker.js/api can deploy.
--
-- WHAT THIS ADDS:
--   - A table to hold each customer's Web Push subscription (their
--     device's endpoint + encryption keys — standard Web Push, not
--     anything Apple/Google-account specific). A customer can have more
--     than one (phone + tablet, etc).
--   - customer_save_push_subscription / customer_remove_push_subscription:
--     the same identity resolution as every other customer-self RPC
--     (customer_id_from_caller — a password-login session token or a
--     live Google auth.uid() session), so a customer can only ever
--     register a subscription against their own row.
--   - staff_get_push_subscriptions / staff_get_all_push_subscriptions:
--     staff-token-gated reads used by the server-side sender (/api/
--     send-push) to know who to notify for a single customer's reward,
--     or everyone at once for a campaign blast. The actual endpoint/
--     key values are only ever readable by staff or the sending
--     function, never by anon at large.
--   - remove_stale_push_subscription: lets the sender prune a
--     subscription once the push service reports it's gone (expired or
--     the customer uninstalled/revoked notifications) — safe to expose
--     narrowly since an endpoint is itself an opaque, unguessable
--     per-subscription value, not something worth locking further.
-- ============================================================

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  customer_id text not null references public.customers(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  unique (customer_id, endpoint)
);
alter table public.push_subscriptions enable row level security;
-- No policies = no direct table access for anon at all; only through
-- the SECURITY DEFINER functions below.

create or replace function public.customer_save_push_subscription(p_token text, p_endpoint text, p_p256dh text, p_auth text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_customer_id text := public.customer_id_from_caller(p_token);
begin
  if p_endpoint is null or p_endpoint = '' or p_p256dh is null or p_auth is null then
    raise exception 'invalid_input';
  end if;

  insert into public.push_subscriptions (customer_id, endpoint, p256dh, auth)
  values (v_customer_id, p_endpoint, p_p256dh, p_auth)
  on conflict (customer_id, endpoint) do update set
    p256dh = excluded.p256dh,
    auth = excluded.auth;
end;
$$;
grant execute on function public.customer_save_push_subscription(text, text, text, text) to anon, authenticated;

create or replace function public.customer_remove_push_subscription(p_token text, p_endpoint text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_customer_id text := public.customer_id_from_caller(p_token);
begin
  delete from public.push_subscriptions s where s.customer_id = v_customer_id and s.endpoint = p_endpoint;
end;
$$;
grant execute on function public.customer_remove_push_subscription(text, text) to anon, authenticated;

create or replace function public.staff_get_push_subscriptions(p_token text, p_customer_id text)
returns table(endpoint text, p256dh text, auth text)
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  perform public.staff_from_token(p_token);
  return query select s.endpoint, s.p256dh, s.auth from public.push_subscriptions s where s.customer_id = p_customer_id;
end;
$$;
grant execute on function public.staff_get_push_subscriptions(text, text) to anon;

create or replace function public.staff_get_all_push_subscriptions(p_token text)
returns table(endpoint text, p256dh text, auth text)
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  perform public.staff_from_token(p_token);
  return query select s.endpoint, s.p256dh, s.auth from public.push_subscriptions s;
end;
$$;
grant execute on function public.staff_get_all_push_subscriptions(text) to anon;

create or replace function public.remove_stale_push_subscription(p_endpoint text)
returns void
language sql
security definer
set search_path = public, extensions
as $$
  delete from public.push_subscriptions where endpoint = p_endpoint;
$$;
grant execute on function public.remove_stale_push_subscription(text) to anon;
