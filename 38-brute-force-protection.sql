-- ============================================================
-- Brute-force protection for login/signup endpoints
-- ============================================================
-- Run this on: https://edunsrtcdhnpbsipalhc.supabase.co
--
-- Confirmed by audit before writing this: login_customer, staff_login,
-- and the "existing username" branch of signup_customer (which silently
-- re-checks the password and can be used as a second password-guessing
-- endpoint against the same account) had ZERO server-side protection —
-- both returned/raised instantly with no attempt tracking, so nothing
-- stopped an automated script from guessing passwords as fast as the
-- network allowed. The only "lockout" that existed was a client-side
-- JS counter in app.js (pinFailedAttempts/pinLockoutUntil) that's
-- trivially bypassed by calling the RPC directly instead of clicking
-- the button — kept as-is for fast UI feedback, but it was never real
-- protection.
--
-- This adds two independent layers, both enforced in the database
-- (can't be bypassed from the client):
--   1. Per-account lockout — stops someone grinding one specific
--      username/email's password.
--   2. Per-IP rate limiting — stops someone spraying guesses across
--      many different accounts from one source, or hammering the
--      endpoint faster than a real user ever would. Pulled from
--      Supabase's request.headers GUC (x-forwarded-for), which
--      PostgREST populates from the real client IP.
--
-- Thresholds are deliberately generous on the IP side — this app's
-- real usage pattern is many customers sharing one shop WiFi IP, so a
-- tight IP limit would lock out the whole shop over a few mistyped
-- passwords. The per-account limit is stricter since it's what
-- actually stops a targeted attack.
-- ============================================================

create table if not exists public.auth_rate_limits (
  id bigint generated always as identity primary key,
  scope text not null,
  key_type text not null,
  key_value text not null,
  attempt_count integer not null default 1,
  window_start timestamptz not null default now(),
  locked_until timestamptz,
  updated_at timestamptz not null default now(),
  unique (scope, key_type, key_value)
);
alter table public.auth_rate_limits enable row level security;
-- No policies = no direct anon access at all; only the internal
-- SECURITY DEFINER functions below ever touch this table.

-- Best-effort real client IP. Falls back to 'unknown' (a single shared
-- bucket) if the header isn't present for some reason — that's still
-- strictly better than no IP-layer check at all, and the per-account
-- lockout below doesn't depend on this working.
create or replace function public.rl_client_ip()
returns text
language sql
stable
as $$
  select coalesce(
    nullif(split_part(current_setting('request.headers', true)::json->>'x-forwarded-for', ',', 1), ''),
    'unknown'
  );
$$;

-- Internal only (not granted to anon) — every other SECURITY DEFINER
-- function below calls this as its own privileged owner, so a customer
-- can never call it directly or manipulate the table themselves.
-- Returns true if this attempt is allowed to proceed, false if this
-- key is currently locked out. Always records the attempt either way,
-- so callers must call this for EVERY check they need (not combined
-- with && / || short-circuiting) to guarantee both the IP and account
-- buckets get hit on every single try.
create or replace function public.rl_check_and_hit(p_scope text, p_key_type text, p_key_value text, p_max_attempts integer, p_window interval, p_lockout interval)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_row public.auth_rate_limits;
begin
  -- select-then-insert has a race window if two first-ever attempts on
  -- the same key land concurrently (both see "not found" and both try
  -- to insert) — loop + catch the unique_violation rather than let it
  -- surface as an ugly 500 to whichever request loses the race.
  loop
    select * into v_row from public.auth_rate_limits
      where scope = p_scope and key_type = p_key_type and key_value = p_key_value
      for update;
    exit when found;

    begin
      insert into public.auth_rate_limits (scope, key_type, key_value, attempt_count, window_start)
        values (p_scope, p_key_type, p_key_value, 1, now());
      return true;
    exception when unique_violation then
      -- lost the race — loop back and select the row the winner just inserted
    end;
  end loop;

  if v_row.locked_until is not null and v_row.locked_until > now() then
    return false;
  end if;

  if now() - v_row.window_start > p_window then
    update public.auth_rate_limits set attempt_count = 1, window_start = now(), locked_until = null, updated_at = now()
      where id = v_row.id;
    return true;
  end if;

  if v_row.attempt_count + 1 > p_max_attempts then
    update public.auth_rate_limits set attempt_count = v_row.attempt_count + 1, locked_until = now() + p_lockout, updated_at = now()
      where id = v_row.id;
    return false;
  end if;

  update public.auth_rate_limits set attempt_count = v_row.attempt_count + 1, updated_at = now()
    where id = v_row.id;
  return true;
end;
$$;

-- Called on a SUCCESSFUL login so a legitimate user's earlier typos
-- don't count against them going forward. Internal only.
create or replace function public.rl_reset(p_scope text, p_key_type text, p_key_value text)
returns void
language sql
security definer
set search_path = public, extensions
as $$
  delete from public.auth_rate_limits where scope = p_scope and key_type = p_key_type and key_value = p_key_value;
$$;

-- ============================================================
-- login_customer — straight copy of the version in
-- 23-student-status.sql (true latest, verified via git log),
-- with the rate-limit gate added at the top and a reset on success.
-- Signature unchanged, no DROP needed.
-- ============================================================
create or replace function public.login_customer(p_username text, p_password text)
returns table(id text, name text, phone text, avatar text, stamps integer, rewards_earned integer, joined_at timestamptz, history jsonb, total_stamps_earned integer, reward_banked_at timestamptz, is_student boolean, token text)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_row public.customers;
  v_token text;
  v_username text := lower(trim(p_username));
  v_ip text := public.rl_client_ip();
  v_ip_ok boolean;
  v_account_ok boolean;
begin
  v_ip_ok := public.rl_check_and_hit('customer_login', 'ip', v_ip, 30, interval '10 minutes', interval '15 minutes');
  v_account_ok := public.rl_check_and_hit('customer_login', 'account', v_username, 8, interval '15 minutes', interval '15 minutes');
  if not v_ip_ok or not v_account_ok then
    raise exception 'rate_limited';
  end if;

  select c.* into v_row from public.customers c where lower(c.phone) = v_username limit 1;
  if not found or v_row.password_hash is null or crypt(p_password, v_row.password_hash) <> v_row.password_hash then
    return;
  end if;

  perform public.rl_reset('customer_login', 'account', v_username);

  delete from public.customer_sessions cs where cs.customer_id = v_row.id and cs.expires_at < now();
  insert into public.customer_sessions (customer_id) values (v_row.id) returning customer_sessions.token into v_token;

  return query select v_row.id, v_row.name, v_row.phone, v_row.avatar, v_row.stamps, v_row.rewards_earned,
    v_row.joined_at, v_row.history, v_row.total_stamps_earned, v_row.reward_banked_at, v_row.is_student, v_token;
end;
$$;
grant execute on function public.login_customer(text, text) to anon;

-- ============================================================
-- signup_customer — same source (33-profanity-filter.sql, true
-- latest). Its "username already exists" branch silently re-checks
-- the password (raising username_taken on a mismatch), which makes it
-- a second password-guessing endpoint against the same account — so
-- it shares login_customer's exact rate-limit buckets ('customer_login'
-- scope, same key values) rather than getting its own. Everything
-- else is untouched. Signature unchanged, no DROP needed.
-- ============================================================
create or replace function public.signup_customer(p_username text, p_password text, p_name text)
returns table(id text, name text, phone text, avatar text, stamps integer, rewards_earned integer, joined_at timestamptz, history jsonb, total_stamps_earned integer, reward_banked_at timestamptz, is_student boolean, is_new boolean, token text)
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
  v_ip text := public.rl_client_ip();
  v_ip_ok boolean;
  v_account_ok boolean;
begin
  if v_username = '' then
    raise exception 'invalid_input';
  end if;

  select c.* into v_existing from public.customers c where lower(c.phone) = v_username limit 1;

  if found then
    v_ip_ok := public.rl_check_and_hit('customer_login', 'ip', v_ip, 30, interval '10 minutes', interval '15 minutes');
    v_account_ok := public.rl_check_and_hit('customer_login', 'account', v_username, 8, interval '15 minutes', interval '15 minutes');
    if not v_ip_ok or not v_account_ok then
      raise exception 'rate_limited';
    end if;

    if v_existing.password_hash is null or crypt(p_password, v_existing.password_hash) <> v_existing.password_hash then
      raise exception 'username_taken';
    end if;

    perform public.rl_reset('customer_login', 'account', v_username);

    delete from public.customer_sessions cs where cs.customer_id = v_existing.id and cs.expires_at < now();
    insert into public.customer_sessions (customer_id) values (v_existing.id) returning customer_sessions.token into v_token;
    return query select v_existing.id, v_existing.name, v_existing.phone, v_existing.avatar,
      v_existing.stamps, v_existing.rewards_earned, v_existing.joined_at, v_existing.history,
      v_existing.total_stamps_earned, v_existing.reward_banked_at, v_existing.is_student, false, v_token;
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

  return query select v_new_id, v_name, v_username, 'person'::text, 0, 0, now(), '[]'::jsonb, 0, null::timestamptz, false, true, v_token;
end;
$$;
grant execute on function public.signup_customer(text, text, text) to anon;

-- ============================================================
-- staff_login — same source (04-staff-upgrade.sql, sole/latest
-- definition), same treatment. Slightly stricter thresholds than the
-- customer side since this endpoint sees far less legitimate traffic.
-- Signature unchanged, no DROP needed.
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
  v_email text := lower(trim(p_email));
  v_ip text := public.rl_client_ip();
  v_ip_ok boolean;
  v_account_ok boolean;
begin
  v_ip_ok := public.rl_check_and_hit('staff_login', 'ip', v_ip, 20, interval '10 minutes', interval '15 minutes');
  v_account_ok := public.rl_check_and_hit('staff_login', 'account', v_email, 6, interval '15 minutes', interval '20 minutes');
  if not v_ip_ok or not v_account_ok then
    raise exception 'rate_limited';
  end if;

  select u.* into v_user from public.staff_users u where lower(u.email) = v_email limit 1;
  if not found or crypt(p_password, v_user.password_hash) <> v_user.password_hash then
    return;
  end if;

  perform public.rl_reset('staff_login', 'account', v_email);

  delete from public.staff_sessions s where s.staff_id = v_user.id and s.expires_at < now();
  insert into public.staff_sessions (staff_id) values (v_user.id) returning staff_sessions.token into v_token;
  return query select v_token, v_user.id, v_user.name, v_user.email;
end;
$$;
grant execute on function public.staff_login(text, text) to anon;
