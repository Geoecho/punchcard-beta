-- Adds a description field and a staff-selectable height preset to promo
-- banners. Run this on: https://edunsrtcdhnpbsipalhc.supabase.co
-- (needs 35-promo-banners.sql to already have been run)

alter table public.promo_banners add column if not exists description text not null default '';
alter table public.promo_banners add column if not exists height_preset text not null default 'medium';
alter table public.promo_banners drop constraint if exists promo_banners_height_preset_check;
alter table public.promo_banners add constraint promo_banners_height_preset_check
  check (height_preset in ('small', 'medium', 'large'));

-- Signature changed (two new params) — drop the old one first so it
-- doesn't linger as a separate overload.
drop function if exists public.staff_upsert_promo_banner(text, uuid, text, text, boolean);

create or replace function public.staff_upsert_promo_banner(p_token text, p_id uuid, p_title text, p_description text, p_image_url text, p_height_preset text, p_active boolean)
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
    insert into public.promo_banners (title, description, image_url, height_preset, sort_order, active)
      values (coalesce(trim(p_title), ''), coalesce(trim(p_description), ''), trim(p_image_url), v_height, v_next_sort, coalesce(p_active, true))
      returning * into v_row;
  else
    update public.promo_banners set
      title = coalesce(trim(p_title), ''),
      description = coalesce(trim(p_description), ''),
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
grant execute on function public.staff_upsert_promo_banner(text, uuid, text, text, text, text, boolean) to anon;
