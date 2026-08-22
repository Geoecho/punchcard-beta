-- ============================================================
-- Eightysixdegrees Punchcard — keep staff Google accounts admin-only
-- ============================================================
-- Run this AFTER 17-staff-google-login.sql on the same project.
--
-- WHY: app.js now checks staff_login_google() before customer_login_google()
-- on a fresh "Continue with Google" return, so the 3 whitelisted staff
-- Gmail accounts land in the Staff Portal, not a customer card. This is
-- the server-side backstop for that rule — customer_login_google() itself
-- now refuses to run for any email on the staff google_email allowlist
-- (see 17-staff-google-login.sql), no matter what calls it or in
-- what order, so a customer card can never be created/attached for a
-- staff account by accident.
-- ============================================================

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

  if exists (select 1 from public.staff_users u where lower(u.google_email) = lower(v_email)) then
    raise exception 'staff_account';
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

-- ============================================================
-- Clean up any customer card already created for a staff Gmail before
-- this fix went in. Only touches rows whose email matches the staff
-- google_email allowlist — nothing else.
-- ============================================================
delete from public.customers
  where lower(email) in (select lower(google_email) from public.staff_users where google_email is not null);
