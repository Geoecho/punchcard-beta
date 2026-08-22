-- Adds an optional price badge field to promo banners. Run this on:
-- https://edunsrtcdhnpbsipalhc.supabase.co
-- (needs 35-promo-banners.sql and
-- 36-promo-banners-height-description.sql to already have been run)

alter table public.promo_banners add column if not exists price text not null default '';

-- Signature changed (one new param) — drop the old one first so it
-- doesn't linger as a separate overload.
drop function if exists public.staff_upsert_promo_banner(text, uuid, text, text, text, text, boolean);

create or replace function public.staff_upsert_promo_banner(p_token text, p_id uuid, p_title text, p_description text, p_price text, p_image_url text, p_height_preset text, p_active boolean)
returns public.promo_banners
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_staff public.staff_users;
  v_row public.promo_banners;
  v_next_sort integer;
  v_height text := case when p_height_preset in ('small', 'medium', 'large') then p_height_preset else 'medium' end;
begin
  v_staff := public.staff_from_token(p_token);

  if p_image_url is null or trim(p_image_url) = '' then
    raise exception 'invalid_input';
  end if;

  if p_id is null then
    select coalesce(max(sort_order), -1) + 1 into v_next_sort from public.promo_banners;
    insert into public.promo_banners (title, description, price, image_url, height_preset, sort_order, active)
      values (coalesce(trim(p_title), ''), coalesce(trim(p_description), ''), coalesce(trim(p_price), ''), trim(p_image_url), v_height, v_next_sort, coalesce(p_active, true))
      returning * into v_row;
  else
    update public.promo_banners set
      title = coalesce(trim(p_title), ''),
      description = coalesce(trim(p_description), ''),
      price = coalesce(trim(p_price), ''),
      image_url = trim(p_image_url),
      height_preset = v_height,
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
grant execute on function public.staff_upsert_promo_banner(text, uuid, text, text, text, text, text, boolean) to anon;
