-- ============================================================
-- Eightysixdegrees Punchcard — monthly leaderboard
-- ============================================================
-- Re-run this whole file to replace the previous version — both
-- functions use `create or replace`, so this is safe to run again over
-- an existing install.
--
-- WHAT THIS ADDS:
--   - "This Month" versions of get_leaderboard / get_my_rank, so the
--     customer-facing Leaderboard screen can switch between All Time
--     (lifetime stamps, unchanged) and This Month (stamps earned since
--     the start of the current calendar month).
--
-- HOW IT WORKS:
--   - There's no running monthly counter column — customers.history
--     already has a timestamped entry for every stamp
--     ({type:"stamp", stamps:N, timestamp:...}, written by
--     staff_add_stamp), so monthly totals are derived by summing those
--     entries whose timestamp falls in the current month. Cheap enough
--     at this table size; if the customer list ever gets huge this can
--     be swapped for a real monthly_stamps counter column instead.
--   - Defensive against bad data on purpose: history is jsonb with no
--     schema enforcement, so a single malformed/legacy entry (history
--     stored as something other than an array, a non-numeric "stamps"
--     value, an unparseable timestamp) used to be able to throw inside
--     jsonb_array_elements()/the int or timestamptz cast and blank out
--     the ENTIRE leaderboard for everyone, not just that one customer.
--     Every risky cast below is guarded so a bad row is just skipped
--     instead of failing the whole query.
--   - date_trunc('month', now()) compares timestamptz to timestamptz
--     directly — unambiguous regardless of session timezone, unlike
--     comparing against a timezone-stripped timestamp would be.
--   - Same privacy slice as the all-time board: name, avatar, stamp
--     count only.
-- ============================================================

create or replace function public.get_leaderboard_monthly(p_limit integer default 20)
returns table(name text, avatar text, monthly_stamps integer)
language sql
security definer
set search_path = public, extensions
as $$
  with monthly as (
    select c.name, c.avatar, c.joined_at,
      coalesce((
        select sum(case when (h->>'stamps') ~ '^-?[0-9]+$' then (h->>'stamps')::int else 1 end)
        from jsonb_array_elements(
          case when jsonb_typeof(c.history) = 'array' then c.history else '[]'::jsonb end
        ) h
        where h->>'type' = 'stamp'
          and (h->>'timestamp') ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}'
          and (h->>'timestamp')::timestamptz >= date_trunc('month', now())
      ), 0)::integer as monthly_stamps
    from public.customers c
  )
  select name, avatar, monthly_stamps
  from monthly
  where monthly_stamps > 0
  order by monthly_stamps desc, joined_at asc
  limit greatest(1, least(coalesce(p_limit, 20), 50));
$$;
grant execute on function public.get_leaderboard_monthly(integer) to anon;

create or replace function public.get_my_rank_monthly(p_id text)
returns table(my_rank bigint, monthly_stamps integer)
language sql
security definer
set search_path = public, extensions
as $$
  with monthly as (
    select c.id, c.joined_at,
      coalesce((
        select sum(case when (h->>'stamps') ~ '^-?[0-9]+$' then (h->>'stamps')::int else 1 end)
        from jsonb_array_elements(
          case when jsonb_typeof(c.history) = 'array' then c.history else '[]'::jsonb end
        ) h
        where h->>'type' = 'stamp'
          and (h->>'timestamp') ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}'
          and (h->>'timestamp')::timestamptz >= date_trunc('month', now())
      ), 0)::integer as monthly_stamps
    from public.customers c
  ), ranked as (
    select id, monthly_stamps, rank() over (order by monthly_stamps desc, joined_at asc) as my_rank
    from monthly
  )
  select ranked.my_rank, ranked.monthly_stamps
  from ranked
  where ranked.id = p_id;
$$;
grant execute on function public.get_my_rank_monthly(text) to anon;
