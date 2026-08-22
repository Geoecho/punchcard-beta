-- ============================================================
-- Eightysixdegrees Punchcard — real password authentication
-- ============================================================
-- Run this AFTER 01-new-project-setup.sql / supabase-security-
-- lockdown.sql (whichever you already ran) on the same project:
-- https://edunsrtcdhnpbsipalhc.supabase.co
--
-- WHAT THIS CHANGES:
--   - Signup now actually sets a password, hashed with bcrypt
--     (pgcrypto) — never stored or sent back to the browser in plain
--     text or as the raw hash.
--   - Login now actually checks that password. Before this, "Find My
--     Card" just looked you up by username with no password check at
--     all — anyone who knew or guessed a username could open that
--     person's card. That's now fixed.
--   - Usernames are enforced unique at the database level (a partial
--     index — blank usernames from staff-created walk-in QR cards are
--     still allowed to repeat, since those aren't real logins).
--   - Signing up with a username that already exists no longer fails
--     outright: if the password matches, it logs the returning
--     customer back into their existing card instead (your "let
--     existing users sign up again" ask). If the password is wrong,
--     it's rejected — so nobody can claim someone else's username by
--     just "signing up" again.
--   - Avatar moves to its own real column instead of being crammed
--     into the phone/username field with a "||avatar:" hack.
--
-- HOW TO RUN: Supabase project -> SQL Editor -> paste this whole file
-- -> Run. Then tell Claude it's done so app.js can deploy to match.
-- ============================================================

-- 1. Enable bcrypt hashing support.
create extension if not exists pgcrypto with schema extensions;

-- 2. New columns.
alter table public.customers add column if not exists avatar text not null default 'person';
alter table public.customers add column if not exists password_hash text;

-- 3. One-time cleanup: unpack any old "username||avatar:key" values from
--    testing before this script existed, into the new avatar column.
update public.customers
set avatar = coalesce(nullif(split_part(phone, '||avatar:', 2), ''), 'person'),
    phone = split_part(phone, '||avatar:', 1)
where phone like '%||avatar:%';

-- 4. Enforce unique usernames (case-insensitive). Blank phone values
--    (staff-created walk-in cards with no username) can repeat.
drop index if exists customers_username_unique;
create unique index customers_username_unique
  on public.customers (lower(phone))
  where phone is not null and phone <> '';

-- 5. Drop the old passwordless lookup — replaced by login_customer below.
drop function if exists public.get_customer_by_phone(text);

-- 6. Reads never return password_hash, by only ever selecting these
--    explicit columns. Dropped first because their return shape is
--    changing from the earlier setup script, which CREATE OR REPLACE
--    isn't allowed to do on its own.
drop function if exists public.get_customer_by_id(text);
drop function if exists public.staff_list_customers(text);

create or replace function public.get_customer_by_id(p_id text)
returns table(id text, name text, phone text, avatar text, stamps integer, rewards_earned integer, joined_at timestamptz, history jsonb)
language sql
security definer
set search_path = public, extensions
as $$
  select id, name, phone, avatar, stamps, rewards_earned, joined_at, history
  from public.customers where id = p_id limit 1;
$$;
grant execute on function public.get_customer_by_id(text) to anon;

create or replace function public.staff_list_customers(p_pin text)
returns table(id text, name text, phone text, avatar text, stamps integer, rewards_earned integer, joined_at timestamptz, history jsonb)
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if p_pin is distinct from '8686' then
    raise exception 'unauthorized';
  end if;
  return query
    select c.id, c.name, c.phone, c.avatar, c.stamps, c.rewards_earned, c.joined_at, c.history
    from public.customers c
    order by c.joined_at desc;
end;
$$;
grant execute on function public.staff_list_customers(text) to anon;

-- 7. Sign up. If the username is free, creates a new account. If it's
--    taken and the password matches, returns the existing account
--    instead of erroring (so returning customers can "sign up" again
--    safely). Wrong password on a taken username is rejected.
create or replace function public.signup_customer(p_username text, p_password text, p_name text)
returns table(id text, name text, phone text, avatar text, stamps integer, rewards_earned integer, joined_at timestamptz, history jsonb, is_new boolean)
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
      v_existing.stamps, v_existing.rewards_earned, v_existing.joined_at, v_existing.history, false;
    return;
  end if;

  v_new_id := 'cust_' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 9));
  v_hash := crypt(p_password, gen_salt('bf'));

  insert into public.customers (id, name, phone, avatar, stamps, rewards_earned, joined_at, history, password_hash)
  values (v_new_id, v_name, v_username, 'person', 0, 0, now(), '[]'::jsonb, v_hash);

  return query select v_new_id, v_name, v_username, 'person', 0, 0, now(), '[]'::jsonb, true;
end;
$$;
grant execute on function public.signup_customer(text, text, text) to anon;

-- 8. Log in with username + password.
create or replace function public.login_customer(p_username text, p_password text)
returns table(id text, name text, phone text, avatar text, stamps integer, rewards_earned integer, joined_at timestamptz, history jsonb)
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
  return query select v_row.id, v_row.name, v_row.phone, v_row.avatar, v_row.stamps, v_row.rewards_earned, v_row.joined_at, v_row.history;
end;
$$;
grant execute on function public.login_customer(text, text) to anon;

-- ============================================================
-- Existing test customers created before this script (e.g. any account
-- made while testing) have no password_hash, so they can't log back in
-- the normal way — they'll need to sign up fresh with a username that
-- isn't already taken, or you can delete the old test row from the
-- Table Editor first. This only matters for pre-existing test data.
-- ============================================================
