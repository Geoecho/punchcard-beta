-- ============================================================
-- Eightysixdegrees Punchcard — close the open write/forgery holes
-- ============================================================
-- Run this in the Supabase SQL Editor for
-- https://edunsrtcdhnpbsipalhc.supabase.co, then tell Claude so the
-- matching app.js can deploy (the old customer_save_self/
-- customer_set_username signatures stop working the moment you run
-- this — app.js needs to ship together with it).
--
-- WHAT WAS WRONG (found in a security audit):
--   1. anon had raw INSERT/UPDATE/DELETE on public.customers with no
--      row restriction (`using (true) with check (true)`). Anyone with
--      the public anon key (it's in app.js, so effectively anyone) could
--      write or delete ANY customer row directly through Supabase's
--      REST API — no app logic involved at all.
--   2. customer_save_self took a plain p_id with no proof the caller
--      owned that id, and let the caller set stamps/rewards_earned/
--      total_stamps_earned/history to anything. Anyone who obtained any
--      customer's id could forge unlimited free-coffee rewards on that
--      account, or overwrite it into anything.
--   3. customer_set_username had the same "just pass any id" gap.
--
-- WHAT THIS CHANGES:
--   - Direct table writes for anon/authenticated are revoked entirely.
--     Every write must go through a SECURITY DEFINER function (which
--     runs with the function owner's privileges regardless of table
--     grants, so this breaks nothing already using RPCs — and nothing
--     in app.js writes to the table directly, it's all .rpc() calls).
--   - Password-login customers now get a real session token on login/
--     signup (customer_sessions table, 90-day expiry), the same pattern
--     staff already had with staff_sessions. Google-login customers
--     already have a real Supabase Auth session (auth.uid()), so they
--     don't need one — every function below accepts either.
--   - customer_save_self is narrowed to ONLY the customer's own avatar —
--     it can no longer touch stamps/rewards/history for anyone, self
--     included. A customer can no longer forge their own balance either.
--   - customer_set_username now requires the caller's own session token
--     (or Google auth.uid()) instead of trusting a client-supplied id.
--   - All stamp/reward-value-changing actions (redeem, keep-in-wallet,
--     avatar override, new-customer QR onboarding) now exist in two
--     forms: a customer-self version (token-verified, can only touch
--     the caller's own row, can only consume a reward the row already
--     legitimately has) and a staff version (staff-token-verified, for
--     when a barista is running the action at the counter) — matching
--     how app.js's UI actually splits between "my own card" and
--     "staff looking at a selected customer's card."
-- ============================================================

-- ============================================================
-- 1. Lock the table down to RPC-only access.
-- ============================================================
revoke insert, update, delete on public.customers from anon, authenticated, public;
drop policy if exists "anon insert customers" on public.customers;
drop policy if exists "anon update customers" on public.customers;
drop policy if exists "anon delete customers" on public.customers;
drop policy if exists "public insert customers" on public.customers;
drop policy if exists "public update customers" on public.customers;
drop policy if exists "public delete customers" on public.customers;

-- ============================================================
-- 2. Customer sessions (mirrors staff_sessions). Password-login
--    customers get a bearer token on login/signup; Google-login
--    customers use their real Supabase Auth session instead (no row
--    needed here for them).
-- ============================================================
create table if not exists public.customer_sessions (
  token text primary key default gen_random_uuid()::text,
  customer_id text not null references public.customers(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '90 days')
);
alter table public.customer_sessions enable row level security;
-- No policies = no direct table access for anon at all; only through
-- SECURITY DEFINER functions.

-- Internal helper (not exposed to anon): resolve either a password-
-- session token OR a live Google OAuth session to a customer id.
-- Raises 'unauthorized' if neither checks out.
create or replace function public.customer_id_from_caller(p_token text)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_customer_id text;
begin
  if p_token is not null then
    select cs.customer_id into v_customer_id
    from public.customer_sessions cs
    where cs.token = p_token and cs.expires_at > now();
    if found then
      return v_customer_id;
    end if;
  end if;

  if auth.uid() is not null then
    select c.id into v_customer_id from public.customers c where c.auth_uid = auth.uid();
    if found then
      return v_customer_id;
    end if;
  end if;

  raise exception 'unauthorized';
end;
$$;

-- ============================================================
-- 3. Login / signup now hand back a session token.
-- ============================================================
drop function if exists public.login_customer(text, text);
create or replace function public.login_customer(p_username text, p_password text)
returns table(id text, name text, phone text, avatar text, stamps integer, rewards_earned integer, joined_at timestamptz, history jsonb, total_stamps_earned integer, reward_banked_at timestamptz, token text)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_row public.customers;
  v_token text;
begin
  select c.* into v_row from public.customers c where lower(c.phone) = lower(trim(p_username)) limit 1;
  if not found or v_row.password_hash is null or crypt(p_password, v_row.password_hash) <> v_row.password_hash then
    return;
  end if;

  delete from public.customer_sessions cs where cs.customer_id = v_row.id and cs.expires_at < now();
  insert into public.customer_sessions (customer_id) values (v_row.id) returning customer_sessions.token into v_token;

  return query select v_row.id, v_row.name, v_row.phone, v_row.avatar, v_row.stamps, v_row.rewards_earned,
    v_row.joined_at, v_row.history, v_row.total_stamps_earned, v_row.reward_banked_at, v_token;
end;
$$;
grant execute on function public.login_customer(text, text) to anon;

drop function if exists public.signup_customer(text, text, text);
create or replace function public.signup_customer(p_username text, p_password text, p_name text)
returns table(id text, name text, phone text, avatar text, stamps integer, rewards_earned integer, joined_at timestamptz, history jsonb, total_stamps_earned integer, reward_banked_at timestamptz, is_new boolean, token text)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_username text := lower(trim(p_username));
  v_existing public.customers;
  v_new_id text;
  v_hash text;
  v_name text := coalesce(nullif(trim(p_name), ''), v_username);
  v_token text;
begin
  if v_username = '' then
    raise exception 'invalid_input';
  end if;

  select c.* into v_existing from public.customers c where lower(c.phone) = v_username limit 1;

  if found then
    if v_existing.password_hash is null or crypt(p_password, v_existing.password_hash) <> v_existing.password_hash then
      raise exception 'username_taken';
    end if;
    delete from public.customer_sessions cs where cs.customer_id = v_existing.id and cs.expires_at < now();
    insert into public.customer_sessions (customer_id) values (v_existing.id) returning customer_sessions.token into v_token;
    return query select v_existing.id, v_existing.name, v_existing.phone, v_existing.avatar,
      v_existing.stamps, v_existing.rewards_earned, v_existing.joined_at, v_existing.history,
      v_existing.total_stamps_earned, v_existing.reward_banked_at, false, v_token;
    return;
  end if;

  if p_password is null
     or length(p_password) < 8
     or p_password !~ '[A-Z]'
     or p_password !~ '[a-z]'
     or p_password !~ '[0-9]' then
    raise exception 'weak_password';
  end if;

  v_new_id := 'cust_' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 9));
  v_hash := crypt(p_password, gen_salt('bf'));

  insert into public.customers (id, name, phone, avatar, stamps, rewards_earned, joined_at, history, password_hash, total_stamps_earned)
  values (v_new_id, v_name, v_username, 'person', 0, 0, now(), '[]'::jsonb, v_hash, 0);

  insert into public.customer_sessions (customer_id) values (v_new_id) returning customer_sessions.token into v_token;

  return query select v_new_id, v_name, v_username, 'person', 0, 0, now(), '[]'::jsonb, 0, null::timestamptz, true, v_token;
end;
$$;
grant execute on function public.signup_customer(text, text, text) to anon;

-- ============================================================
-- 4. Self-service, narrowed to what a customer can safely touch
--    (their own display avatar) and identity-verified via token/
--    auth.uid() instead of a trusted client-supplied id.
-- ============================================================
drop function if exists public.customer_save_self(text, text, text, text, integer, integer, jsonb, integer, timestamptz);
create or replace function public.customer_save_self(p_token text, p_avatar text)
returns table(id text, name text, phone text, avatar text, stamps integer, rewards_earned integer, joined_at timestamptz, history jsonb, total_stamps_earned integer, reward_banked_at timestamptz)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_customer_id text := public.customer_id_from_caller(p_token);
begin
  update public.customers c set avatar = coalesce(nullif(trim(p_avatar), ''), c.avatar)
  where c.id = v_customer_id;

  return query
    select c.id, c.name, c.phone, c.avatar, c.stamps, c.rewards_earned, c.joined_at, c.history, c.total_stamps_earned, c.reward_banked_at
    from public.customers c where c.id = v_customer_id;
end;
$$;
grant execute on function public.customer_save_self(text, text) to anon, authenticated;

drop function if exists public.customer_set_username(text, text);
create or replace function public.customer_set_username(p_token text, p_username text)
returns table(id text, name text, phone text, avatar text, stamps integer, rewards_earned integer, joined_at timestamptz, history jsonb, total_stamps_earned integer, reward_banked_at timestamptz)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_customer_id text := public.customer_id_from_caller(p_token);
  v_username text := lower(trim(p_username));
begin
  if v_username = '' then
    raise exception 'invalid_input';
  end if;

  if exists (select 1 from public.customers c where lower(c.phone) = v_username and c.id <> v_customer_id) then
    raise exception 'username_taken';
  end if;

  update public.customers c set phone = v_username where c.id = v_customer_id;

  return query
    select c.id, c.name, c.phone, c.avatar, c.stamps, c.rewards_earned, c.joined_at, c.history, c.total_stamps_earned, c.reward_banked_at
    from public.customers c where c.id = v_customer_id;
end;
$$;
grant execute on function public.customer_set_username(text, text) to anon, authenticated;

-- ============================================================
-- 5. Redeeming / banking a reward — a customer can only ever consume
--    a reward their own row already legitimately has (server checks
--    rewards_earned/stamps and expiry, then decrements atomically —
--    there's no field the caller sets directly, so there's nothing to
--    forge). Staff versions mirror these for the counter flow, with
--    staff-attributed history entries, same pattern as staff_add_stamp.
-- ============================================================
create or replace function public.customer_redeem_reward(p_token text, p_method text)
returns table(id text, name text, phone text, avatar text, stamps integer, rewards_earned integer, joined_at timestamptz, history jsonb, total_stamps_earned integer, reward_banked_at timestamptz)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_customer_id text := public.customer_id_from_caller(p_token);
  v_row public.customers;
  v_entry jsonb;
begin
  select c.* into v_row from public.customers c where c.id = v_customer_id for update;
  if not found then raise exception 'customer_not_found'; end if;

  if p_method = 'wallet' then
    if v_row.rewards_earned <= 0 then raise exception 'no_reward_available'; end if;
    if v_row.reward_banked_at is not null and v_row.reward_banked_at < now() - interval '1 year' then
      raise exception 'reward_expired';
    end if;
    update public.customers c set
      rewards_earned = c.rewards_earned - 1,
      reward_banked_at = case when c.rewards_earned - 1 <= 0 then null else c.reward_banked_at end
    where c.id = v_customer_id;
  elsif p_method = 'direct' then
    if v_row.stamps < 10 then raise exception 'not_enough_stamps'; end if;
    update public.customers c set stamps = 0 where c.id = v_customer_id;
  else
    raise exception 'invalid_input';
  end if;

  v_entry := jsonb_build_object(
    'id', 'tx_' || substr(md5(random()::text || clock_timestamp()::text), 1, 7),
    'type', 'redemption',
    'drink', 'Free Coffee',
    'method', p_method,
    'timestamp', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  );
  update public.customers c set history = jsonb_build_array(v_entry) || coalesce(c.history, '[]'::jsonb) where c.id = v_customer_id;

  return query select c.id, c.name, c.phone, c.avatar, c.stamps, c.rewards_earned, c.joined_at, c.history, c.total_stamps_earned, c.reward_banked_at
    from public.customers c where c.id = v_customer_id;
end;
$$;
grant execute on function public.customer_redeem_reward(text, text) to anon, authenticated;

create or replace function public.customer_bank_reward(p_token text)
returns table(id text, name text, phone text, avatar text, stamps integer, rewards_earned integer, joined_at timestamptz, history jsonb, total_stamps_earned integer, reward_banked_at timestamptz)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_customer_id text := public.customer_id_from_caller(p_token);
  v_row public.customers;
begin
  select c.* into v_row from public.customers c where c.id = v_customer_id for update;
  if not found then raise exception 'customer_not_found'; end if;
  if v_row.stamps < 10 then raise exception 'not_enough_stamps'; end if;

  update public.customers c set
    stamps = 0,
    rewards_earned = c.rewards_earned + 1,
    reward_banked_at = case when c.rewards_earned = 0 then now() else c.reward_banked_at end
  where c.id = v_customer_id;

  return query select c.id, c.name, c.phone, c.avatar, c.stamps, c.rewards_earned, c.joined_at, c.history, c.total_stamps_earned, c.reward_banked_at
    from public.customers c where c.id = v_customer_id;
end;
$$;
grant execute on function public.customer_bank_reward(text) to anon, authenticated;

-- ============================================================
-- 6. Staff-side equivalents for the counter flow (staff has a
--    customer selected in the admin panel and taps Redeem / Keep In
--    Wallet / avatar / onboard-new-customer-from-QR on their behalf).
-- ============================================================
create or replace function public.staff_redeem_reward(p_token text, p_customer_id text, p_method text)
returns table(id text, name text, phone text, avatar text, stamps integer, rewards_earned integer, joined_at timestamptz, history jsonb, total_stamps_earned integer, reward_banked_at timestamptz)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_staff public.staff_users;
  v_row public.customers;
  v_entry jsonb;
begin
  v_staff := public.staff_from_token(p_token);

  select c.* into v_row from public.customers c where c.id = p_customer_id for update;
  if not found then raise exception 'customer_not_found'; end if;

  if p_method = 'wallet' then
    if v_row.rewards_earned <= 0 then raise exception 'no_reward_available'; end if;
    update public.customers c set
      rewards_earned = c.rewards_earned - 1,
      reward_banked_at = case when c.rewards_earned - 1 <= 0 then null else c.reward_banked_at end
    where c.id = p_customer_id;
  elsif p_method = 'direct' then
    if v_row.stamps < 10 then raise exception 'not_enough_stamps'; end if;
    update public.customers c set stamps = 0 where c.id = p_customer_id;
  else
    raise exception 'invalid_input';
  end if;

  v_entry := jsonb_build_object(
    'id', 'tx_' || substr(md5(random()::text || clock_timestamp()::text), 1, 7),
    'type', 'redemption',
    'drink', 'Free Coffee',
    'method', p_method,
    'staffName', v_staff.name,
    'timestamp', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  );
  update public.customers c set history = jsonb_build_array(v_entry) || coalesce(c.history, '[]'::jsonb) where c.id = p_customer_id;

  return query select c.id, c.name, c.phone, c.avatar, c.stamps, c.rewards_earned, c.joined_at, c.history, c.total_stamps_earned, c.reward_banked_at
    from public.customers c where c.id = p_customer_id;
end;
$$;
grant execute on function public.staff_redeem_reward(text, text, text) to anon;

create or replace function public.staff_bank_reward(p_token text, p_customer_id text)
returns table(id text, name text, phone text, avatar text, stamps integer, rewards_earned integer, joined_at timestamptz, history jsonb, total_stamps_earned integer, reward_banked_at timestamptz)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_row public.customers;
begin
  perform public.staff_from_token(p_token);

  select c.* into v_row from public.customers c where c.id = p_customer_id for update;
  if not found then raise exception 'customer_not_found'; end if;
  if v_row.stamps < 10 then raise exception 'not_enough_stamps'; end if;

  update public.customers c set
    stamps = 0,
    rewards_earned = c.rewards_earned + 1,
    reward_banked_at = case when c.rewards_earned = 0 then now() else c.reward_banked_at end
  where c.id = p_customer_id;

  return query select c.id, c.name, c.phone, c.avatar, c.stamps, c.rewards_earned, c.joined_at, c.history, c.total_stamps_earned, c.reward_banked_at
    from public.customers c where c.id = p_customer_id;
end;
$$;
grant execute on function public.staff_bank_reward(text, text) to anon;

create or replace function public.staff_set_avatar(p_token text, p_customer_id text, p_avatar text)
returns table(id text, name text, phone text, avatar text, stamps integer, rewards_earned integer, joined_at timestamptz, history jsonb, total_stamps_earned integer, reward_banked_at timestamptz)
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  perform public.staff_from_token(p_token);
  update public.customers c set avatar = coalesce(nullif(trim(p_avatar), ''), c.avatar) where c.id = p_customer_id;

  return query select c.id, c.name, c.phone, c.avatar, c.stamps, c.rewards_earned, c.joined_at, c.history, c.total_stamps_earned, c.reward_banked_at
    from public.customers c where c.id = p_customer_id;
end;
$$;
grant execute on function public.staff_set_avatar(text, text, text) to anon;

-- QR-scan onboarding: staff scans a customer's card whose id isn't in
-- the cloud yet (a locally-created card syncing for the first time) and
-- creates the row server-side. Only inserts if the id truly doesn't
-- exist yet — never overwrites an existing customer's data.
create or replace function public.staff_create_customer(p_token text, p_customer_id text, p_name text, p_phone text)
returns table(id text, name text, phone text, avatar text, stamps integer, rewards_earned integer, joined_at timestamptz, history jsonb, total_stamps_earned integer, reward_banked_at timestamptz)
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  perform public.staff_from_token(p_token);

  if p_customer_id is null or p_customer_id = '' then
    raise exception 'invalid_input';
  end if;

  insert into public.customers (id, name, phone, avatar, stamps, rewards_earned, joined_at, history, total_stamps_earned)
  values (p_customer_id, coalesce(nullif(trim(p_name), ''), 'Customer'), coalesce(p_phone, ''), 'person', 0, 0, now(), '[]'::jsonb, 0)
  on conflict (id) do nothing;

  return query select c.id, c.name, c.phone, c.avatar, c.stamps, c.rewards_earned, c.joined_at, c.history, c.total_stamps_earned, c.reward_banked_at
    from public.customers c where c.id = p_customer_id;
end;
$$;
grant execute on function public.staff_create_customer(text, text, text, text) to anon;

-- ============================================================
-- 7. customer_login_google needs to keep working: it already reads
--    auth.email()/auth.uid() server-side and is unaffected by the
--    table-grant revoke above (SECURITY DEFINER). No change needed —
--    listed here just as a confirmation this migration doesn't touch it.
-- ============================================================
