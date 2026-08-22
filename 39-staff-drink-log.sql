-- ============================================================
-- Staff drink log — lets staff log a drink they made for themselves
-- straight from the existing menu list, for tracking/accountability.
-- Run this on: https://edunsrtcdhnpbsipalhc.supabase.co
-- ============================================================

create table if not exists public.staff_drink_log (
  id bigint generated always as identity primary key,
  staff_id text not null references public.staff_users(id) on delete cascade,
  staff_name text not null,
  item_name text not null,
  logged_at timestamptz not null default now()
);
alter table public.staff_drink_log enable row level security;
-- No policies = no direct anon access; only the SECURITY DEFINER
-- functions below touch this table.
create index if not exists staff_drink_log_logged_at_idx on public.staff_drink_log (logged_at desc);

-- A staff member can only ever log a drink as themselves — staff_id/
-- staff_name are resolved from their own token, never taken from the
-- caller's input, so there's no way to log a drink under someone
-- else's name.
create or replace function public.staff_log_drink(p_token text, p_item_name text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_staff public.staff_users;
  v_item_name text := trim(p_item_name);
begin
  v_staff := public.staff_from_token(p_token);

  if v_item_name = '' then
    raise exception 'invalid_input';
  end if;

  insert into public.staff_drink_log (staff_id, staff_name, item_name)
    values (v_staff.id, v_staff.name, v_item_name);
end;
$$;
grant execute on function public.staff_log_drink(text, text) to anon;

-- Any logged-in staff member can see the shared log (accountability
-- works both ways — it's meant to be visible, not private per-staff).
create or replace function public.staff_list_drink_log(p_token text, p_limit integer default 100)
returns table(id bigint, staff_name text, item_name text, logged_at timestamptz)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_staff public.staff_users;
begin
  v_staff := public.staff_from_token(p_token);
  return query
    select l.id, l.staff_name, l.item_name, l.logged_at
    from public.staff_drink_log l
    order by l.logged_at desc
    limit greatest(1, least(coalesce(p_limit, 100), 500));
end;
$$;
grant execute on function public.staff_list_drink_log(text, integer) to anon;
