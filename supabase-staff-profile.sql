-- ============================================================
-- Eightysixdegrees Punchcard — staff profile (avatar + self lookup)
-- ============================================================
-- Run this AFTER supabase-staff-upgrade.sql on the same project.
--
-- WHAT THIS ADDS:
--   - staff_users gets the same "avatar" concept customers already
--     have (one of the MONOCHROME_AVATARS keys, default 'person'), so
--     the new admin-only "My Profile" screen has something to show
--     and let a staff member change.
--   - staff_get_self(token): returns the caller's own id/name/email/
--     avatar, resolved from their token server-side — used to populate
--     the profile screen right after login.
--   - staff_set_own_avatar(token, avatar): lets a staff member change
--     ONLY their own avatar — resolved from their own token the same
--     way every other staff_* function is, so one staff member can
--     never touch another's row through this.
-- ============================================================

alter table public.staff_users add column if not exists avatar text not null default 'person';

create or replace function public.staff_get_self(p_token text)
returns table(staff_id text, name text, email text, avatar text)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_staff public.staff_users;
begin
  v_staff := public.staff_from_token(p_token);
  return query select v_staff.id, v_staff.name, v_staff.email, v_staff.avatar;
end;
$$;
grant execute on function public.staff_get_self(text) to anon;

create or replace function public.staff_set_own_avatar(p_token text, p_avatar text)
returns table(staff_id text, name text, email text, avatar text)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_staff public.staff_users;
begin
  v_staff := public.staff_from_token(p_token);
  update public.staff_users u set avatar = coalesce(nullif(trim(p_avatar), ''), u.avatar) where u.id = v_staff.id;
  return query select u.id, u.name, u.email, u.avatar from public.staff_users u where u.id = v_staff.id;
end;
$$;
grant execute on function public.staff_set_own_avatar(text, text) to anon;
