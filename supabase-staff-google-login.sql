-- ============================================================
-- Eightysixdegrees Punchcard — staff login with Google
-- ============================================================
-- Run this AFTER supabase-security-fixes.sql on the same project.
--
-- WHAT THIS ADDS:
--   - The 5-tap "Settings" gesture that opens the Staff Portal now skips
--     the email/password form entirely for staff who are already signed
--     in on this device with their personal Google account ("Continue
--     with Google" on the customer Welcome screen). Everyone else still
--     falls back to the existing email/password login.
--
-- HOW IT WORKS / WHY IT'S SAFE:
--   - staff_login_google() takes no client-supplied identity — it reads
--     auth.email(), which Supabase derives server-side from the
--     caller's verified JWT after they've actually completed Google
--     sign-in. The client can't claim to be a different Google user
--     (same pattern as customer_login_google in
--     supabase-customer-google-login.sql).
--   - It only matches against a per-staff google_email column that YOU
--     set below — a Google account is never enough on its own, it has
--     to be one of the addresses you explicitly whitelisted.
--   - It's granted to `authenticated` (a real Supabase Auth session
--     from Google), not `anon`.
--   - Existing email/password staff logins (staff_login) are untouched.
-- ============================================================

alter table public.staff_users add column if not exists google_email text;
create unique index if not exists staff_users_google_email_unique
  on public.staff_users (lower(google_email))
  where google_email is not null;

-- Whitelisted personal Gmail accounts, mapped to the matching named
-- staff account so stamp/redeem actions still attribute to the right
-- name in the activity log.
update public.staff_users set google_email = 'hbristik@gmail.com' where lower(email) = 'kiko@eightysix.com';
update public.staff_users set google_email = 'ivaandonova73@gmail.com' where lower(email) = 'iva@eightysix.com';
update public.staff_users set google_email = 'anastasijatodorovska12@gmail.com' where lower(email) = 'stacy@eightysix.com';

create or replace function public.staff_login_google()
returns table(token text, staff_id text, name text, email text)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_email text := lower(auth.email());
  v_user public.staff_users;
  v_token text;
begin
  if v_email is null then
    raise exception 'not_authenticated';
  end if;

  select u.* into v_user from public.staff_users u where lower(u.google_email) = v_email limit 1;
  if not found then
    raise exception 'not_staff';
  end if;

  delete from public.staff_sessions s where s.staff_id = v_user.id and s.expires_at < now();
  insert into public.staff_sessions (staff_id) values (v_user.id) returning staff_sessions.token into v_token;
  return query select v_token, v_user.id, v_user.name, v_user.email;
end;
$$;
grant execute on function public.staff_login_google() to authenticated;
