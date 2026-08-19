-- ============================================================
-- Eightysixdegrees Punchcard — per-item student prices
-- ============================================================
-- Run this AFTER supabase-menu-sync.sql on the same project.
--
-- WHAT THIS ADDS:
--   - menu_items.student_price: optional. Staff type the actual student
--     price for an item directly (not a percentage) — the app computes
--     and displays the discount percentage itself by comparing it to
--     the regular price, so there's nothing to keep in sync by hand.
--   - Items with no student_price set just show the regular price in
--     the customer menu's Student view too — this is opt-in per item,
--     not an all-or-nothing toggle.
--   - staff_upsert_menu_item gets one new optional parameter at the end
--     (p_student_price), so this is dropped and recreated the same way
--     every other signature change in this project has been.
-- ============================================================

alter table public.menu_items add column if not exists student_price text;

drop function if exists public.staff_upsert_menu_item(text, text, text, text, text, text, integer);
create or replace function public.staff_upsert_menu_item(
  p_token text, p_id text, p_name text, p_sub text, p_price text, p_category text, p_stamps integer,
  p_student_price text default null
)
returns setof public.menu_items
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  perform public.staff_from_token(p_token);

  if p_id is null or p_id = '' or p_name is null or trim(p_name) = '' then
    raise exception 'invalid_input';
  end if;

  insert into public.menu_items (id, name, sub, price, category, stamps, student_price)
  values (
    p_id, trim(p_name), coalesce(p_sub, ''), coalesce(nullif(p_price, ''), '0.00'),
    coalesce(nullif(trim(p_category), ''), 'Other'), greatest(0, coalesce(p_stamps, 0)),
    nullif(trim(p_student_price), '')
  )
  on conflict (id) do update set
    name = excluded.name,
    sub = excluded.sub,
    price = excluded.price,
    category = excluded.category,
    stamps = excluded.stamps,
    student_price = excluded.student_price,
    updated_at = now();

  return query select * from public.menu_items m where m.id = p_id;
end;
$$;
grant execute on function public.staff_upsert_menu_item(text, text, text, text, text, text, integer, text) to anon;
