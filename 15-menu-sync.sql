-- ============================================================
-- Eightysixdegrees Punchcard — move the menu to the cloud
-- ============================================================
-- Run this in the Supabase SQL Editor, then tell Claude so the
-- matching app.js can deploy.
--
-- WHY: the menu was stored only in each device's localStorage
-- ('86_menu'). Staff adding/removing an item on one device never
-- reached anyone else's phone — not "slow to update", literally never
-- synced at all. This gives every device the same menu, pushed out
-- automatically the moment staff save a change (Supabase Realtime),
-- with a local cache so the app still boots instantly and works
-- offline.
--
-- PRIVACY NOTE: unlike the customers table, a coffee menu has no
-- sensitive data in it, so this table is intentionally readable by
-- anyone (anon SELECT + realtime) — that's required for the "instant"
-- push. Writes still go through a staff-token-verified function only,
-- same as every other write in this app.
-- ============================================================

create table if not exists public.menu_items (
  id text primary key,
  name text not null,
  sub text not null default '',
  price text not null default '0.00',
  category text not null default 'Other',
  stamps integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.menu_items enable row level security;

drop policy if exists "anyone can read menu" on public.menu_items;
create policy "anyone can read menu" on public.menu_items
  for select to anon, authenticated using (true);

alter publication supabase_realtime add table public.menu_items;

-- Seed with the existing default menu so the table isn't empty on
-- first deploy. Safe to run even if some/all ids already exist.
insert into public.menu_items (id, name, sub, price, category, stamps) values
  ('m1', 'Espresso', 'Hot / Iced', '100', 'Espresso Based', 0),
  ('m2', 'Americano', 'Hot / Iced', '100', 'Espresso Based', 0),
  ('m3', 'Flat White', 'Hot / Iced', '120', 'Espresso Based', 0),
  ('m4', 'Cappuccino', 'Hot / Iced', '120', 'Espresso Based', 0),
  ('m5', 'Latte', 'Hot / Iced', '140', 'Espresso Based', 0),
  ('m6', 'Nescafé', 'Hot / Iced', '140', 'Instant Coffee', 0),
  ('m7', 'Nescafé Decaf', 'Hot / Iced', '150', 'Instant Coffee', 0),
  ('m8', 'Matcha', 'Hot / Iced', '150', 'Matcha & Specialty', 0),
  ('m9', 'Ube', 'Hot / Iced', '150', 'Matcha & Specialty', 0),
  ('m10', 'Add-ons (Strawberry, Peach, Mango)', '', '20', 'Matcha & Specialty', 0),
  ('m11', 'Coca Cola / Zero', '', '120', 'Soft Drinks', 0),
  ('m12', 'Sprite', '', '120', 'Soft Drinks', 0),
  ('m13', 'San Pellegrino', '', '100', 'Soft Drinks', 0),
  ('m14', 'Lipton Iced Tea', '', '120', 'Soft Drinks', 0),
  ('m15', 'Natural Juice', '', '120', 'Soft Drinks', 0),
  ('m16', 'Cocoa', '', '120', 'Warm Comfort', 0),
  ('m17', 'Salep', '', '120', 'Warm Comfort', 0),
  ('m18', 'Tea', '', '80', 'Warm Comfort', 0)
on conflict (id) do nothing;

create or replace function public.staff_upsert_menu_item(p_token text, p_id text, p_name text, p_sub text, p_price text, p_category text, p_stamps integer)
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

  insert into public.menu_items (id, name, sub, price, category, stamps)
  values (p_id, trim(p_name), coalesce(p_sub, ''), coalesce(nullif(p_price, ''), '0.00'), coalesce(nullif(trim(p_category), ''), 'Other'), greatest(0, coalesce(p_stamps, 0)))
  on conflict (id) do update set
    name = excluded.name,
    sub = excluded.sub,
    price = excluded.price,
    category = excluded.category,
    stamps = excluded.stamps,
    updated_at = now();

  return query select * from public.menu_items m where m.id = p_id;
end;
$$;
grant execute on function public.staff_upsert_menu_item(text, text, text, text, text, text, integer) to anon;

create or replace function public.staff_delete_menu_item(p_token text, p_id text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  perform public.staff_from_token(p_token);
  delete from public.menu_items where id = p_id;
end;
$$;
grant execute on function public.staff_delete_menu_item(text, text) to anon;
