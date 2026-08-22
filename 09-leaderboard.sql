-- ============================================================
-- Customer-facing leaderboard
-- ============================================================
-- Two public (anon-callable) reads, both SECURITY DEFINER + `language
-- sql` so they're immune to the ambiguous-column bug that's bitten
-- the plpgsql functions in this project — SQL-language functions
-- don't have the OUT-parameter-shadowing issue plpgsql does.
--
-- Privacy note: this intentionally exposes a NARROW slice of data
-- (name, avatar, lifetime stamp count only — no phone/username/id/
-- history) for the top 20 customers, so people can see the board.
-- That's a deliberate, disclosed trade-off for a leaderboard feature
-- to exist at all; nothing else about the lockdown changes.
-- ============================================================

create or replace function public.get_leaderboard(p_limit integer default 20)
returns table(name text, avatar text, total_stamps_earned integer)
language sql
security definer
set search_path = public, extensions
as $$
  select c.name, c.avatar, c.total_stamps_earned
  from public.customers c
  where c.total_stamps_earned > 0
  order by c.total_stamps_earned desc, c.joined_at asc
  limit greatest(1, least(coalesce(p_limit, 20), 50));
$$;
grant execute on function public.get_leaderboard(integer) to anon;

create or replace function public.get_my_rank(p_id text)
returns table(my_rank bigint, total_stamps_earned integer)
language sql
security definer
set search_path = public, extensions
as $$
  select ranked.my_rank, ranked.total_stamps_earned
  from (
    select c.id, c.total_stamps_earned,
      rank() over (order by c.total_stamps_earned desc, c.joined_at asc) as my_rank
    from public.customers c
  ) ranked
  where ranked.id = p_id;
$$;
grant execute on function public.get_my_rank(text) to anon;
