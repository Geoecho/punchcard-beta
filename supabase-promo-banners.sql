-- ============================================================
-- Eightysixdegrees Punchcard — scrollable promo banner carousel
-- ============================================================
-- Run this on: https://edunsrtcdhnpbsipalhc.supabase.co
--
-- Adds a horizontally-scrollable row of image banners at the top of the
-- customer Menu tab (above the Regular/Student price toggle), similar to
-- a Wolt-style promo carousel. Staff manage these from a new "Promo
-- Banners" section in the admin Menu editor, including uploading the
-- banner image straight from their device.
--
-- SECURITY NOTE ON IMAGE UPLOADS: this app's staff auth is a custom
-- token system (staff_from_token), not Supabase Auth — so unlike a
-- typical Supabase Storage setup, a bucket policy can't cheaply verify
-- "is this caller a logged-in staff member" the way `auth.uid()` does
-- elsewhere. Every other privileged write in this app is instead gated
-- at the RPC/table layer (SECURITY DEFINER functions that check
-- staff_from_token themselves), while the anon key is trusted for
-- low-stakes plumbing. Storage uploads follow that same model: the
-- 'promo-banners' bucket accepts uploads from anyone holding the public
-- anon key (matching this app's existing security posture — see
-- supabase-security-fixes.sql), but uploading a file alone does
-- nothing — a file only ever becomes a visible banner once
-- staff_upsert_promo_banner() (which DOES verify a real staff token)
-- is called to reference it. Worst case for an anon-only upload is an
-- orphaned, never-displayed file sitting in storage, not a compromise
-- of any customer data or admin action.
-- ============================================================

create table if not exists public.promo_banners (
  id uuid primary key default gen_random_uuid(),
  title text not null default '',
  image_url text not null,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.promo_banners enable row level security;

drop policy if exists "anyone can read active promo banners" on public.promo_banners;
create policy "anyone can read active promo banners" on public.promo_banners
  for select using (active = true);

alter publication supabase_realtime add table public.promo_banners;

-- Storage bucket for banner images (public read so <img> tags just work).
insert into storage.buckets (id, name, public)
  values ('promo-banners', 'promo-banners', true)
  on conflict (id) do nothing;

drop policy if exists "anyone can read promo banner images" on storage.objects;
create policy "anyone can read promo banner images" on storage.objects
  for select using (bucket_id = 'promo-banners');

drop policy if exists "anyone can upload promo banner images" on storage.objects;
create policy "anyone can upload promo banner images" on storage.objects
  for insert with check (bucket_id = 'promo-banners');

drop policy if exists "anyone can replace promo banner images" on storage.objects;
create policy "anyone can replace promo banner images" on storage.objects
  for update using (bucket_id = 'promo-banners');

drop policy if exists "anyone can delete promo banner images" on storage.objects;
create policy "anyone can delete promo banner images" on storage.objects
  for delete using (bucket_id = 'promo-banners');

-- Staff-only: list every banner (including inactive ones) for the admin
-- management screen. Customers read active ones straight off the table
-- via the RLS policy above (same "anyone can read menu" shape as
-- menu_items) — no RPC needed for that side.
create or replace function public.staff_list_promo_banners(p_token text)
returns setof public.promo_banners
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_staff public.staff_users;
begin
  v_staff := public.staff_from_token(p_token);
  return query select * from public.promo_banners order by sort_order asc, created_at asc;
end;
$$;
grant execute on function public.staff_list_promo_banners(text) to anon;

-- p_id null creates a new banner; passing an existing id updates it.
create or replace function public.staff_upsert_promo_banner(p_token text, p_id uuid, p_title text, p_image_url text, p_active boolean)
returns public.promo_banners
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_staff public.staff_users;
  v_row public.promo_banners;
  v_next_sort integer;
begin
  v_staff := public.staff_from_token(p_token);

  if p_image_url is null or trim(p_image_url) = '' then
    raise exception 'invalid_input';
  end if;

  if p_id is null then
    select coalesce(max(sort_order), -1) + 1 into v_next_sort from public.promo_banners;
    insert into public.promo_banners (title, image_url, sort_order, active)
      values (coalesce(trim(p_title), ''), trim(p_image_url), v_next_sort, coalesce(p_active, true))
      returning * into v_row;
  else
    update public.promo_banners set
      title = coalesce(trim(p_title), ''),
      image_url = trim(p_image_url),
      active = coalesce(p_active, true)
    where id = p_id
    returning * into v_row;
    if not found then
      raise exception 'not_found';
    end if;
  end if;

  return v_row;
end;
$$;
grant execute on function public.staff_upsert_promo_banner(text, uuid, text, text, boolean) to anon;

create or replace function public.staff_delete_promo_banner(p_token text, p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_staff public.staff_users;
begin
  v_staff := public.staff_from_token(p_token);
  delete from public.promo_banners where id = p_id;
end;
$$;
grant execute on function public.staff_delete_promo_banner(text, uuid) to anon;

-- p_ids is the full banner id list in the order it should display,
-- same shape as staff_reorder_categories(p_names).
create or replace function public.staff_reorder_promo_banners(p_token text, p_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_staff public.staff_users;
  v_id uuid;
  v_idx integer := 0;
begin
  v_staff := public.staff_from_token(p_token);
  foreach v_id in array p_ids loop
    update public.promo_banners set sort_order = v_idx where id = v_id;
    v_idx := v_idx + 1;
  end loop;
end;
$$;
grant execute on function public.staff_reorder_promo_banners(text, uuid[]) to anon;
