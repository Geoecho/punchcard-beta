-- ============================================================
-- Eightysixdegrees Punchcard — staff accounts & loyalty upgrades
-- ============================================================
-- Adds: named staff logins (replacing the shared PIN), per-action staff
-- attribution, remove-stamp, void-last-redemption, a lifetime stamp
-- counter for milestone badges, reward expiration (1 year), and a
-- stamp campaign toggle (e.g. "double stamps this week").
--
-- Run this once in the Supabase SQL editor for
-- https://edunsrtcdhnpbsipalhc.supabase.co, then tell Claude so the
-- matching app.js can deploy.
-- ============================================================

-- 1. New customer columns.
alter table public.customers add column if not exists total_stamps_earned integer not null default 0;
alter table public.customers add column if not exists reward_banked_at timestamptz;

-- Backfill: anyone who already has a banked reward gets today as their
-- bank date, and lifetime total starts from their current progress (an
-- approximation — history before this migration doesn't retroactively
-- count past redeemed cycles, only current stamps/rewards).
update public.customers
set reward_banked_at = coalesce(reward_banked_at, case when rewards_earned > 0 then now() else null end),
    total_stamps_earned = greatest(total_stamps_earned, stamps + rewards_earned * 10);

-- 2. Staff accounts.
create table if not exists public.staff_users (
  id text primary key default ('staff_' || substr(md5(random()::text || clock_timestamp()::text), 1, 9)),
  email text not null,
  name text not null,
  password_hash text not null,
  created_at timestamptz not null default now()
);
create unique index if not exists staff_users_email_unique on public.staff_users (lower(email));
alter table public.staff_users enable row level security;
-- No policies = no direct table access for anon at all; only through
-- the SECURITY DEFINER functions below.

-- 3. Staff sessions (simple bearer-token auth, since this app has no
--    real backend session/JWT layer). Tokens last 24 hours.
create table if not exists public.staff_sessions (
  token text primary key default gen_random_uuid()::text,
  staff_id text not null references public.staff_users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours')
);
alter table public.staff_sessions enable row level security;

-- 4. Stamp campaign (e.g. "Double Stamps This Week"). Single row.
create table if not exists public.campaigns (
  id int primary key default 1,
  active boolean not null default false,
  multiplier integer not null default 2,
  label text not null default 'Double Stamps',
  updated_at timestamptz not null default now(),
  constraint campaigns_single_row check (id = 1)
);
insert into public.campaigns (id) values (1) on conflict (id) do nothing;
alter table public.campaigns enable row level security;

-- Seed the 3 staff accounts. Passwords are hashed with bcrypt — the
-- plain password is never stored in this file (this project has since
-- moved to Google-only admin login anyway; see
-- supabase-staff-google-login.sql / supabase-block-staff-customer-login.sql
-- — password login is disabled for all staff accounts via a rotated,
-- unknown password_hash). If you ever need a new password-login staff
-- account, set REPLACE_WITH_YOUR_OWN_PASSWORD to a real value before
-- running this, then rotate it immediately after.
insert into public.staff_users (email, name, password_hash)
values
  ('stacy@eightysix.com', 'Stacy', crypt('REPLACE_WITH_YOUR_OWN_PASSWORD', gen_salt('bf'))),
  ('kiko@eightysix.com', 'Kiko', crypt('REPLACE_WITH_YOUR_OWN_PASSWORD', gen_salt('bf'))),
  ('iva@eightysix.com', 'Iva', crypt('REPLACE_WITH_YOUR_OWN_PASSWORD', gen_salt('bf')))
on conflict (lower(email)) do nothing;

-- ============================================================
-- 5. Staff auth functions
-- ============================================================

create or replace function public.staff_login(p_email text, p_password text)
returns table(token text, staff_id text, name text, email text)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user public.staff_users;
  v_token text;
begin
  select u.* into v_user from public.staff_users u where lower(u.email) = lower(trim(p_email)) limit 1;
  if not found or crypt(p_password, v_user.password_hash) <> v_user.password_hash then
    return;
  end if;
  delete from public.staff_sessions s where s.staff_id = v_user.id and s.expires_at < now();
  insert into public.staff_sessions (staff_id) values (v_user.id) returning staff_sessions.token into v_token;
  return query select v_token, v_user.id, v_user.name, v_user.email;
end;
$$;
grant execute on function public.staff_login(text, text) to anon;

create or replace function public.staff_logout(p_token text)
returns void
language sql
security definer
set search_path = public, extensions
as $$
  delete from public.staff_sessions where token = p_token;
$$;
grant execute on function public.staff_logout(text) to anon;

-- Internal helper (not exposed to anon): resolve a token to a staff
-- member, raising if missing/expired. Every staff_* function below
-- calls this first.
create or replace function public.staff_from_token(p_token text)
returns public.staff_users
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_staff public.staff_users;
begin
  select u.* into v_staff
  from public.staff_sessions s
  join public.staff_users u on u.id = s.staff_id
  where s.token = p_token and s.expires_at > now();
  if not found then
    raise exception 'unauthorized';
  end if;
  return v_staff;
end;
$$;

-- ============================================================
-- 6. Reads (staff list, single lookups — unchanged shape from before,
--    plus the two new columns)
-- ============================================================

drop function if exists public.get_customer_by_id(text);
create or replace function public.get_customer_by_id(p_id text)
returns table(id text, name text, phone text, avatar text, stamps integer, rewards_earned integer, joined_at timestamptz, history jsonb, total_stamps_earned integer, reward_banked_at timestamptz)
language sql
security definer
set search_path = public, extensions
as $$
  select id, name, phone, avatar, stamps, rewards_earned, joined_at, history, total_stamps_earned, reward_banked_at
  from public.customers where id = p_id limit 1;
$$;
grant execute on function public.get_customer_by_id(text) to anon;

drop function if exists public.staff_list_customers(text);
create or replace function public.staff_list_customers(p_token text)
returns table(id text, name text, phone text, avatar text, stamps integer, rewards_earned integer, joined_at timestamptz, history jsonb, total_stamps_earned integer, reward_banked_at timestamptz)
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  perform public.staff_from_token(p_token);
  return query
    select c.id, c.name, c.phone, c.avatar, c.stamps, c.rewards_earned, c.joined_at, c.history, c.total_stamps_earned, c.reward_banked_at
    from public.customers c
    order by c.joined_at desc;
end;
$$;
grant execute on function public.staff_list_customers(text) to anon;

drop function if exists public.signup_customer(text, text, text);
create or replace function public.signup_customer(p_username text, p_password text, p_name text)
returns table(id text, name text, phone text, avatar text, stamps integer, rewards_earned integer, joined_at timestamptz, history jsonb, total_stamps_earned integer, reward_banked_at timestamptz, is_new boolean)
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
begin
  if v_username = '' or p_password is null or length(p_password) < 6 then
    raise exception 'invalid_input';
  end if;

  select c.* into v_existing from public.customers c where lower(c.phone) = v_username limit 1;

  if found then
    if v_existing.password_hash is null or crypt(p_password, v_existing.password_hash) <> v_existing.password_hash then
      raise exception 'username_taken';
    end if;
    return query select v_existing.id, v_existing.name, v_existing.phone, v_existing.avatar,
      v_existing.stamps, v_existing.rewards_earned, v_existing.joined_at, v_existing.history,
      v_existing.total_stamps_earned, v_existing.reward_banked_at, false;
    return;
  end if;

  v_new_id := 'cust_' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 9));
  v_hash := crypt(p_password, gen_salt('bf'));

  insert into public.customers (id, name, phone, avatar, stamps, rewards_earned, joined_at, history, password_hash, total_stamps_earned)
  values (v_new_id, v_name, v_username, 'person', 0, 0, now(), '[]'::jsonb, v_hash, 0);

  return query select v_new_id, v_name, v_username, 'person', 0, 0, now(), '[]'::jsonb, 0, null::timestamptz, true;
end;
$$;
grant execute on function public.signup_customer(text, text, text) to anon;

drop function if exists public.login_customer(text, text);
create or replace function public.login_customer(p_username text, p_password text)
returns table(id text, name text, phone text, avatar text, stamps integer, rewards_earned integer, joined_at timestamptz, history jsonb, total_stamps_earned integer, reward_banked_at timestamptz)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_row public.customers;
begin
  select c.* into v_row from public.customers c where lower(c.phone) = lower(trim(p_username)) limit 1;
  if not found or v_row.password_hash is null or crypt(p_password, v_row.password_hash) <> v_row.password_hash then
    return;
  end if;
  return query select v_row.id, v_row.name, v_row.phone, v_row.avatar, v_row.stamps, v_row.rewards_earned,
    v_row.joined_at, v_row.history, v_row.total_stamps_earned, v_row.reward_banked_at;
end;
$$;
grant execute on function public.login_customer(text, text) to anon;

-- ============================================================
-- 7. Stamp campaign
-- ============================================================

create or replace function public.get_campaign_status()
returns table(active boolean, multiplier integer, label text)
language sql
security definer
set search_path = public, extensions
as $$
  select active, multiplier, label from public.campaigns where id = 1;
$$;
grant execute on function public.get_campaign_status() to anon;

create or replace function public.staff_set_campaign(p_token text, p_active boolean, p_multiplier integer, p_label text)
returns table(active boolean, multiplier integer, label text)
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  perform public.staff_from_token(p_token);
  update public.campaigns
  set active = p_active,
      multiplier = greatest(1, coalesce(p_multiplier, 1)),
      label = coalesce(nullif(trim(p_label), ''), 'Double Stamps'),
      updated_at = now()
  where id = 1;
  return query select c.active, c.multiplier, c.label from public.campaigns c where c.id = 1;
end;
$$;
grant execute on function public.staff_set_campaign(text, boolean, integer, text) to anon;

-- ============================================================
-- 8. Staff-attributed writes (stamp, remove stamp, void, edit, delete)
-- ============================================================

create or replace function public.staff_add_stamp(p_token text, p_customer_id text, p_base_stamps integer, p_drink_name text)
returns table(id text, name text, phone text, avatar text, stamps integer, rewards_earned integer, joined_at timestamptz, history jsonb, total_stamps_earned integer, reward_banked_at timestamptz)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_staff public.staff_users;
  v_row public.customers;
  v_campaign public.campaigns;
  v_effective_stamps integer;
  v_new_total integer;
  v_new_stamps integer;
  v_new_rewards integer;
  v_entry jsonb;
begin
  v_staff := public.staff_from_token(p_token);

  select c.* into v_row from public.customers c where c.id = p_customer_id for update;
  if not found then raise exception 'customer_not_found'; end if;

  select * into v_campaign from public.campaigns camp where camp.id = 1;
  v_effective_stamps := greatest(1, coalesce(p_base_stamps, 1));
  if v_campaign.active then
    v_effective_stamps := v_effective_stamps * v_campaign.multiplier;
  end if;

  v_new_total := v_row.stamps + v_effective_stamps;
  v_new_rewards := v_row.rewards_earned + (v_new_total / 10);
  v_new_stamps := v_new_total % 10;

  v_entry := jsonb_build_object(
    'id', 'tx_' || substr(md5(random()::text || clock_timestamp()::text), 1, 7),
    'type', 'stamp',
    'drink', coalesce(p_drink_name, 'Drink'),
    'stamps', v_effective_stamps,
    'staffName', v_staff.name,
    'timestamp', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  );

  update public.customers c set
    stamps = v_new_stamps,
    rewards_earned = v_new_rewards,
    total_stamps_earned = c.total_stamps_earned + v_effective_stamps,
    reward_banked_at = case when c.rewards_earned = 0 and v_new_rewards > 0 then now() else c.reward_banked_at end,
    history = jsonb_build_array(v_entry) || coalesce(c.history, '[]'::jsonb)
  where c.id = p_customer_id;

  return query select c.id, c.name, c.phone, c.avatar, c.stamps, c.rewards_earned, c.joined_at, c.history, c.total_stamps_earned, c.reward_banked_at
    from public.customers c where c.id = p_customer_id;
end;
$$;
grant execute on function public.staff_add_stamp(text, text, integer, text) to anon;

create or replace function public.staff_remove_stamp(p_token text, p_customer_id text)
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
  if v_row.stamps <= 0 then raise exception 'no_stamps_to_remove'; end if;

  v_entry := jsonb_build_object(
    'id', 'tx_' || substr(md5(random()::text || clock_timestamp()::text), 1, 7),
    'type', 'stamp_removed',
    'staffName', v_staff.name,
    'timestamp', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  );

  update public.customers c set
    stamps = c.stamps - 1,
    total_stamps_earned = greatest(0, c.total_stamps_earned - 1),
    history = jsonb_build_array(v_entry) || coalesce(c.history, '[]'::jsonb)
  where c.id = p_customer_id;

  return query select c.id, c.name, c.phone, c.avatar, c.stamps, c.rewards_earned, c.joined_at, c.history, c.total_stamps_earned, c.reward_banked_at
    from public.customers c where c.id = p_customer_id;
end;
$$;
grant execute on function public.staff_remove_stamp(text, text) to anon;

create or replace function public.staff_void_last_redemption(p_token text, p_customer_id text)
returns table(id text, name text, phone text, avatar text, stamps integer, rewards_earned integer, joined_at timestamptz, history jsonb, total_stamps_earned integer, reward_banked_at timestamptz)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_staff public.staff_users;
  v_row public.customers;
  v_history jsonb;
  v_idx integer := null;
  v_entry jsonb;
  v_method text;
  v_void_entry jsonb;
begin
  v_staff := public.staff_from_token(p_token);

  select c.* into v_row from public.customers c where c.id = p_customer_id for update;
  if not found then raise exception 'customer_not_found'; end if;

  v_history := coalesce(v_row.history, '[]'::jsonb);
  for i in 0 .. jsonb_array_length(v_history) - 1 loop
    v_entry := v_history -> i;
    if (v_entry ->> 'type') = 'redemption' and coalesce((v_entry ->> 'voided')::boolean, false) = false then
      v_idx := i;
      exit;
    end if;
  end loop;

  if v_idx is null then raise exception 'no_redemption_to_void'; end if;

  v_method := coalesce(v_history -> v_idx ->> 'method', 'wallet');
  v_history := jsonb_set(v_history, array[v_idx::text, 'voided'], 'true'::jsonb);

  v_void_entry := jsonb_build_object(
    'id', 'tx_' || substr(md5(random()::text || clock_timestamp()::text), 1, 7),
    'type', 'void',
    'staffName', v_staff.name,
    'timestamp', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  );
  v_history := jsonb_build_array(v_void_entry) || v_history;

  if v_method = 'direct' then
    update public.customers c set stamps = 10, history = v_history where c.id = p_customer_id;
  else
    update public.customers c set
      rewards_earned = c.rewards_earned + 1,
      reward_banked_at = case when c.rewards_earned = 0 then now() else c.reward_banked_at end,
      history = v_history
    where c.id = p_customer_id;
  end if;

  return query select c.id, c.name, c.phone, c.avatar, c.stamps, c.rewards_earned, c.joined_at, c.history, c.total_stamps_earned, c.reward_banked_at
    from public.customers c where c.id = p_customer_id;
end;
$$;
grant execute on function public.staff_void_last_redemption(text, text) to anon;

create or replace function public.staff_edit_customer(p_token text, p_customer_id text, p_name text, p_phone text)
returns table(id text, name text, phone text, avatar text, stamps integer, rewards_earned integer, joined_at timestamptz, history jsonb, total_stamps_earned integer, reward_banked_at timestamptz)
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  perform public.staff_from_token(p_token);
  update public.customers c set
    name = coalesce(nullif(trim(p_name), ''), c.name),
    phone = coalesce(nullif(trim(p_phone), ''), c.phone)
  where c.id = p_customer_id;

  return query select c.id, c.name, c.phone, c.avatar, c.stamps, c.rewards_earned, c.joined_at, c.history, c.total_stamps_earned, c.reward_banked_at
    from public.customers c where c.id = p_customer_id;
end;
$$;
grant execute on function public.staff_edit_customer(text, text, text, text) to anon;

create or replace function public.staff_delete_customer(p_token text, p_customer_id text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  perform public.staff_from_token(p_token);
  delete from public.customers where id = p_customer_id;
end;
$$;
grant execute on function public.staff_delete_customer(text, text) to anon;

-- ============================================================
-- CAVEATS:
--   - Reward expiration (1 year) is enforced by the app reading
--     reward_banked_at and treating anything older than a year as
--     expired — it doesn't run as a background job. A customer's own
--     "Redeem Now" button checks this client-side before allowing the
--     tap, same trust level as the rest of the stamp/redeem flow
--     (barista visually confirms, same as a paper punch card).
--   - staff_add_stamp/staff_remove_stamp/staff_void_last_redemption/
--     staff_edit_customer/staff_delete_customer replace the old direct
--     table writes for staff actions. Customer self-service writes
--     (their own avatar change, their own redeem) still go through the
--     existing open anon UPDATE policy from the last migration —
--     unchanged from before.
--   - Session tokens last 24 hours; staff will need to log in again
--     after that (or after closing/reopening the app past that
--     window).
-- ============================================================
