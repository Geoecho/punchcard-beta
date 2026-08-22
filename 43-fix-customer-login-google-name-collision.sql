-- ============================================================
-- Fix: customer_login_google() silently failing on a name collision
-- ============================================================
-- Run this on: https://edunsrtcdhnpbsipalhc.supabase.co
--
-- REAL BUG FOUND (traced live with the actual affected account):
-- public.customers has a unique index on lower(trim(name)) —
-- customers_name_lower_unique_idx — that 42's fix didn't know about.
-- Its bare "on conflict do nothing" was meant only to absorb a race
-- on auth_uid/email (the same Google identity signing in twice at
-- once), but a bare ON CONFLICT with no target absorbs ANY unique
-- violation on the table, including this one. When a *different*
-- Google account happens to share a display name with an existing
-- customer (confirmed: two separate Google accounts both named
-- "Hristijan"), the insert silently did nothing, the re-select by
-- auth_uid/email found nothing either (it's genuinely a different
-- person), and the function returned one row of nulls with no error
-- at all — exactly the silent "back to login, no message" symptom.
--
-- FIX: after a skipped insert, only treat it as the auth_uid/email
-- race this was meant to guard (re-select finds a row). If neither
-- lookup finds anything, the conflict was the name constraint — retry
-- once with the name disambiguated instead of leaving no row behind.
-- ============================================================

drop function if exists public.customer_login_google();
create or replace function public.customer_login_google()
returns table(id text, name text, phone text, avatar text, stamps integer, rewards_earned integer, joined_at timestamptz, history jsonb, total_stamps_earned integer, reward_banked_at timestamptz, is_student boolean, is_new boolean)
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
  v_was_new boolean := false;
begin
  if v_email is null or v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if exists (select 1 from public.staff_users u where lower(u.google_email) = lower(v_email)) then
    raise exception 'staff_account';
  end if;

  select c.* into v_existing from public.customers c where c.auth_uid = v_uid limit 1;
  if not found then
    select c.* into v_existing from public.customers c where lower(c.email) = lower(v_email) limit 1;
  end if;

  if found then
    update public.customers c set auth_uid = v_uid, email = coalesce(c.email, v_email) where c.id = v_existing.id
      returning c.* into v_existing;
  else
    v_new_id := 'cust_' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 9));

    insert into public.customers (id, name, phone, avatar, stamps, rewards_earned, joined_at, history, total_stamps_earned, email, auth_uid)
    values (v_new_id, v_name, '', 'person', 0, 0, now(), '[]'::jsonb, 0, v_email, v_uid)
    on conflict do nothing;

    select c.* into v_existing from public.customers c where c.auth_uid = v_uid limit 1;
    if not found then
      select c.* into v_existing from public.customers c where lower(c.email) = lower(v_email) limit 1;
    end if;

    if not found then
      -- Not the identity race -- a different customer already holds
      -- this display name. Retry once with it disambiguated.
      insert into public.customers (id, name, phone, avatar, stamps, rewards_earned, joined_at, history, total_stamps_earned, email, auth_uid)
      values (v_new_id, v_name || ' ' || upper(left(v_uid::text, 4)), '', 'person', 0, 0, now(), '[]'::jsonb, 0, v_email, v_uid)
      on conflict do nothing;
      select c.* into v_existing from public.customers c where c.id = v_new_id;
    end if;

    v_was_new := (v_existing.id = v_new_id);
  end if;

  return query select v_existing.id, v_existing.name, v_existing.phone, v_existing.avatar,
    v_existing.stamps, v_existing.rewards_earned, v_existing.joined_at, v_existing.history,
    v_existing.total_stamps_earned, v_existing.reward_banked_at, v_existing.is_student, v_was_new;
end;
$$;
grant execute on function public.customer_login_google() to authenticated;
