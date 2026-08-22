-- ============================================================
-- Staff Drinks — pick who the drink is actually for
-- ============================================================
-- Run this on: https://edunsrtcdhnpbsipalhc.supabase.co
-- (needs 39-staff-drink-log.sql to already have been run)
--
-- Until now staff_log_drink always attributed a drink to whoever was
-- logged in (no way to say "I made this, but it's for Kiko"). This
-- adds an optional recipient, separate from the logger:
--   - staff_id/staff_name (existing columns) = who was logged in and
--     actually called the function — still resolved from their own
--     token, never spoofable.
--   - recipient_staff_id/recipient_staff_name (new) = who the drink is
--     for. Defaults to the logger themselves when omitted, so the
--     existing one-tap "log a drink for me" flow is unchanged.
-- recipient_staff_id uses ON DELETE SET NULL (not CASCADE like
-- staff_id) — if a staff account is later removed, drinks *they made*
-- should go with them, but drinks *made for* them by someone else are
-- still that someone else's accountability record and should survive,
-- just losing the link to the (now-gone) recipient account.

alter table public.staff_drink_log
  add column if not exists recipient_staff_id text references public.staff_users(id) on delete set null,
  add column if not exists recipient_staff_name text;

update public.staff_drink_log
  set recipient_staff_id = staff_id, recipient_staff_name = staff_name
  where recipient_staff_name is null;

alter table public.staff_drink_log alter column recipient_staff_name set not null;

drop function if exists public.staff_log_drink(text, text);
create or replace function public.staff_log_drink(p_token text, p_item_name text, p_recipient_staff_id text default null)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_staff public.staff_users;
  v_item_name text := trim(p_item_name);
  v_recipient public.staff_users;
begin
  v_staff := public.staff_from_token(p_token);

  if v_item_name = '' then
    raise exception 'invalid_input';
  end if;

  if p_recipient_staff_id is null or p_recipient_staff_id = v_staff.id then
    v_recipient := v_staff;
  else
    select u.* into v_recipient from public.staff_users u where u.id = p_recipient_staff_id;
    if not found then
      raise exception 'invalid_recipient';
    end if;
  end if;

  insert into public.staff_drink_log (staff_id, staff_name, item_name, recipient_staff_id, recipient_staff_name)
    values (v_staff.id, v_staff.name, v_item_name, v_recipient.id, v_recipient.name);
end;
$$;
grant execute on function public.staff_log_drink(text, text, text) to anon;

drop function if exists public.staff_list_drink_log(text, integer);
create or replace function public.staff_list_drink_log(p_token text, p_limit integer default 100)
returns table(id bigint, staff_name text, item_name text, logged_at timestamptz, recipient_staff_name text)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_staff public.staff_users;
begin
  v_staff := public.staff_from_token(p_token);
  return query
    select l.id, l.staff_name, l.item_name, l.logged_at, l.recipient_staff_name
    from public.staff_drink_log l
    order by l.logged_at desc
    limit greatest(1, least(coalesce(p_limit, 100), 500));
end;
$$;
grant execute on function public.staff_list_drink_log(text, integer) to anon;

-- Small fixed roster for the "who's this for" picker. No PII beyond
-- name/avatar, and it's gated the same as every other staff_* read —
-- requires a live session token, not just the anon key.
create or replace function public.staff_list_team(p_token text)
returns table(id text, name text, avatar text)
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  perform public.staff_from_token(p_token);
  return query select u.id, u.name, u.avatar from public.staff_users u order by u.name;
end;
$$;
grant execute on function public.staff_list_team(text) to anon;
