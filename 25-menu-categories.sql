-- ============================================================
-- Eightysixdegrees Punchcard — manageable, orderable menu sections
-- ============================================================
-- Run this AFTER 15-menu-sync.sql (and 24-student-price.sql
-- if you've run that one) on the same project.
--
-- WHY: menu item "category" was just a free-text field typed per item —
-- there was no list of sections to pick from (so a typo like "Espresso
-- Based " vs "espresso based" silently created two different sections),
-- and the order sections appeared in was whatever order their first
-- item happened to be created in, with no way to control it.
--
-- This adds a real menu_categories table (name + sort_order) that the
-- admin app now manages directly: reorder with the arrows on each
-- section header, or add a brand new one right from the item editor.
-- Same public-read / staff-token-write split as menu_items.
-- ============================================================

create table if not exists public.menu_categories (
  name text primary key,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
alter table public.menu_categories enable row level security;

drop policy if exists "anyone can read categories" on public.menu_categories;
create policy "anyone can read categories" on public.menu_categories
  for select to anon, authenticated using (true);

alter publication supabase_realtime add table public.menu_categories;

-- Seed the 5 built-in sections at their historical order (only runs if
-- the table is currently empty, so this is safe to run on a fresh or an
-- already-customized project).
insert into public.menu_categories (name, sort_order)
select v.name, v.sort_order from (values
  ('Espresso Based', 0),
  ('Instant Coffee', 1),
  ('Matcha & Specialty', 2),
  ('Soft Drinks', 3),
  ('Warm Comfort', 4)
) as v(name, sort_order)
where not exists (select 1 from public.menu_categories);

-- Backfill any category already in use by an existing menu item that
-- isn't in menu_categories yet (e.g. a custom section staff typed by
-- hand before this migration existed), appended after whatever's there.
insert into public.menu_categories (name, sort_order)
select distinct mi.category,
  (select coalesce(max(sort_order), -1) from public.menu_categories) + row_number() over (order by mi.category)
from public.menu_items mi
where mi.category is not null and trim(mi.category) <> ''
  and not exists (select 1 from public.menu_categories mc where mc.name = mi.category)
on conflict (name) do nothing;

create or replace function public.staff_list_categories()
returns setof public.menu_categories
language sql
security definer
set search_path = public, extensions
as $$
  select * from public.menu_categories order by sort_order asc, name asc;
$$;
grant execute on function public.staff_list_categories() to anon;

-- Create (p_old_name null/empty) or rename (p_old_name set) a section.
-- Renaming cascades onto every item currently filed under the old name
-- so nothing gets silently orphaned.
drop function if exists public.staff_upsert_category(text, text, text, integer);
create or replace function public.staff_upsert_category(
  p_token text, p_old_name text, p_new_name text, p_sort_order integer default null
)
returns setof public.menu_categories
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_order integer;
begin
  perform public.staff_from_token(p_token);

  if p_new_name is null or trim(p_new_name) = '' then
    raise exception 'invalid_input';
  end if;

  if p_old_name is not null and trim(p_old_name) <> '' and trim(p_old_name) <> trim(p_new_name) then
    update public.menu_categories set name = trim(p_new_name) where name = p_old_name;
    update public.menu_items set category = trim(p_new_name) where category = p_old_name;
  end if;

  select coalesce(p_sort_order, (select max(sort_order) + 1 from public.menu_categories), 0) into v_order;

  insert into public.menu_categories (name, sort_order)
  values (trim(p_new_name), v_order)
  on conflict (name) do update set
    sort_order = coalesce(p_sort_order, public.menu_categories.sort_order);

  return query select * from public.menu_categories order by sort_order asc, name asc;
end;
$$;
grant execute on function public.staff_upsert_category(text, text, text, integer) to anon;

-- Deletes a section outright. Items left pointing at a name no longer
-- in menu_categories still render (grouped by that leftover text at
-- the end of the menu) — the app only offers this button when a
-- section has zero items, so in practice nothing gets orphaned.
drop function if exists public.staff_delete_category(text, text);
create or replace function public.staff_delete_category(p_token text, p_name text)
returns setof public.menu_categories
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  perform public.staff_from_token(p_token);
  delete from public.menu_categories where name = p_name;
  return query select * from public.menu_categories order by sort_order asc, name asc;
end;
$$;
grant execute on function public.staff_delete_category(text, text) to anon;

-- Bulk reorder: pass the full section list in the order it should
-- display, sort_order becomes each name's position in that array.
drop function if exists public.staff_reorder_categories(text, text[]);
create or replace function public.staff_reorder_categories(p_token text, p_names text[])
returns setof public.menu_categories
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  i integer;
begin
  perform public.staff_from_token(p_token);
  for i in 1 .. coalesce(array_length(p_names, 1), 0) loop
    update public.menu_categories set sort_order = i - 1 where name = p_names[i];
  end loop;
  return query select * from public.menu_categories order by sort_order asc, name asc;
end;
$$;
grant execute on function public.staff_reorder_categories(text, text[]) to anon;
