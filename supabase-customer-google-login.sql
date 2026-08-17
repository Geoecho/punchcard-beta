-- ============================================================
-- Eightysixdegrees Punchcard — customer login with Google
-- ============================================================
-- Run this AFTER supabase-staff-upgrade.sql on the same project:
-- https://edunsrtcdhnpbsipalhc.supabase.co
--
-- WHAT THIS ADDS:
--   - A "Sign in with Google" option on the customer Welcome screen,
--     alongside the existing username/password signup and login. All
--     three end up as a normal row in public.customers, so nothing
--     else in the app (stamps, redemptions, staff view, leaderboard)
--     needs to change.
--
-- HOW IT WORKS / WHY IT'S SAFE:
--   - customer_login_google() takes no client-supplied identity — it
--     reads auth.email()/auth.uid(), which Supabase derives
--     server-side from the caller's verified JWT after they've
--     actually completed Google sign-in via supabase-js. The client
--     can't claim to be a different Google user.
--   - It's granted to `authenticated` (a real Supabase Auth session
--     from Google), not `anon`.
--   - First-time Google sign-in auto-creates a customer row (find-or-
--     create), matching the "New Card" flow's spirit — no separate
--     signup step needed for Google users.
--   - Returning Google users are matched by auth_uid first, falling
--     back to email, so re-authenticating always lands back on the
--     same card instead of creating a duplicate.
--
-- YOU STILL NEED TO (outside of SQL, can't be scripted):
--   1. In Google Cloud Console, create an OAuth 2.0 Client ID (Web
--      application) and add this project's Supabase callback URL
--      (https://edunsrtcdhnpbsipalhc.supabase.co/auth/v1/callback) as
--      an Authorized redirect URI.
--   2. In Supabase Dashboard -> Authentication -> Providers -> Google,
--      paste that Client ID + Client Secret and enable the provider.
--   3. In Supabase Dashboard -> Authentication -> URL Configuration,
--      set Site URL to your deployed app's URL and add it (plus
--      http://localhost:5500 for local testing) to Redirect URLs.
-- ============================================================

-- 1. Link a customer row to the Google-authenticated identity that
--    created/claimed it.
alter table public.customers add column if not exists email text;
alter table public.customers add column if not exists auth_uid uuid;

create unique index if not exists customers_email_unique
  on public.customers (lower(email))
  where email is not null and email <> '';
create unique index if not exists customers_auth_uid_unique
  on public.customers (auth_uid)
  where auth_uid is not null;

-- 2. Find-or-create by Google identity.
create or replace function public.customer_login_google()
returns table(id text, name text, phone text, avatar text, stamps integer, rewards_earned integer, joined_at timestamptz, history jsonb, total_stamps_earned integer, reward_banked_at timestamptz, is_new boolean)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_email text := auth.email();
  v_uid uuid := auth.uid();
  v_name text := coalesce(
    nullif(trim(auth.jwt() -> 'user_metadata' ->> 'full_name'), ''),
    nullif(trim(auth.jwt() -> 'user_metadata' ->> 'name'), ''),
    split_part(coalesce(auth.email(), 'Customer'), '@', 1)
  );
  v_existing public.customers;
  v_new_id text;
begin
  if v_email is null or v_uid is null then
    raise exception 'not_authenticated';
  end if;

  select c.* into v_existing from public.customers c where c.auth_uid = v_uid limit 1;
  if not found then
    select c.* into v_existing from public.customers c where lower(c.email) = lower(v_email) limit 1;
  end if;

  if found then
    update public.customers c set auth_uid = v_uid, email = coalesce(c.email, v_email) where c.id = v_existing.id;
    return query select v_existing.id, v_existing.name, v_existing.phone, v_existing.avatar,
      v_existing.stamps, v_existing.rewards_earned, v_existing.joined_at, v_existing.history,
      v_existing.total_stamps_earned, v_existing.reward_banked_at, false;
    return;
  end if;

  v_new_id := 'cust_' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 9));

  insert into public.customers (id, name, phone, avatar, stamps, rewards_earned, joined_at, history, total_stamps_earned, email, auth_uid)
  values (v_new_id, v_name, '', 'person', 0, 0, now(), '[]'::jsonb, 0, v_email, v_uid);

  return query select v_new_id, v_name, ''::text, 'person'::text, 0, 0, now(), '[]'::jsonb, 0, null::timestamptz, true;
end;
$$;
grant execute on function public.customer_login_google() to authenticated;
