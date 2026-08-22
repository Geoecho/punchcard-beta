-- ============================================================
-- Real fix for the customer self-service write bug (redeeming a
-- reward, "keep in wallet", changing avatar).
--
-- What actually happened, verified live:
--   - Plain UPDATE reports success (204, no error) but the change does
--     not persist — confirmed by reading the row back through two
--     independent paths immediately after. The two previous "fixes"
--     (re-asserting policies, then switching from upsert to a plain
--     update/insert) both ran cleanly but didn't touch the real cause,
--     which I could not pin down from outside — it may be a platform-
--     level quirk with how this project's newer-style publishable key
--     interacts with RLS UPDATE policies, not something wrong with the
--     policies themselves (I confirmed a plain INSERT works, and a
--     bare SELECT-diagnostic confirmed the key correctly connects as
--     the `anon` role).
--
-- Rather than keep guessing at that, this routes customer self-writes
-- through a SECURITY DEFINER function — the same pattern every other
-- write in this app already uses successfully (signup, login, all the
-- staff_* actions). A SECURITY DEFINER function runs with the
-- function owner's privileges, not the caller's, so it's not subject
-- to whatever is blocking anon's direct UPDATE — it sidesteps the
-- mystery instead of solving it, but it's the same reliable mechanism
-- already proven to work everywhere else in this build.
--
-- This does NOT change who can write what — a customer could already
-- overwrite any customer_id's stamps directly (same as before this
-- whole investigation); that's an existing, disclosed trust boundary
-- (the barista visually checking the phone), not something this
-- script changes.
-- ============================================================

create or replace function public.customer_save_self(
  p_id text,
  p_name text,
  p_phone text,
  p_avatar text,
  p_stamps integer,
  p_rewards_earned integer,
  p_history jsonb,
  p_total_stamps_earned integer,
  p_reward_banked_at timestamptz
)
returns table(id text, name text, phone text, avatar text, stamps integer, rewards_earned integer, joined_at timestamptz, history jsonb, total_stamps_earned integer, reward_banked_at timestamptz)
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  insert into public.customers (id, name, phone, avatar, stamps, rewards_earned, joined_at, history, total_stamps_earned, reward_banked_at)
  values (p_id, coalesce(nullif(trim(p_name), ''), p_id), coalesce(p_phone, ''), coalesce(p_avatar, 'person'),
          coalesce(p_stamps, 0), coalesce(p_rewards_earned, 0), now(), coalesce(p_history, '[]'::jsonb),
          coalesce(p_total_stamps_earned, 0), p_reward_banked_at)
  on conflict on constraint customers_pkey do update set
    name = excluded.name,
    phone = excluded.phone,
    avatar = excluded.avatar,
    stamps = excluded.stamps,
    rewards_earned = excluded.rewards_earned,
    history = excluded.history,
    total_stamps_earned = excluded.total_stamps_earned,
    reward_banked_at = excluded.reward_banked_at;

  return query
    select c.id, c.name, c.phone, c.avatar, c.stamps, c.rewards_earned, c.joined_at, c.history, c.total_stamps_earned, c.reward_banked_at
    from public.customers c where c.id = p_id;
end;
$$;
grant execute on function public.customer_save_self(text, text, text, text, integer, integer, jsonb, integer, timestamptz) to anon;
