-- ============================================================
-- Eightysixdegrees Punchcard — friends list + gift a reward
-- ============================================================
-- Run this in the Supabase SQL Editor, then tell Claude so the
-- matching app.js can deploy.
--
-- WHAT THIS ADDS:
--   - customer_friends: a one-directional "my friends" list (an address
--     book, not a mutual connection — adding someone doesn't require
--     them to accept, and doesn't add you to their list). Looked up by
--     username since customers don't know each other's internal ids.
--   - customer_gift_reward: transfers one ALREADY-BANKED reward from the
--     caller to a friend. This is safe to leave essentially unrestricted
--     (no rate limit) because it's zero-sum — it only moves a reward
--     that was already legitimately earned, it can never create one.
--     The abuse this app actually has to guard against is FORGING new
--     stamps/rewards (see supabase-security-fixes.sql), not customers
--     moving their own already-real rewards to each other.
--   - Every gift writes a history entry on both accounts (gift_sent /
--     gift_received) so it shows up in the activity feed same as any
--     other transaction, and staff can see it happened if asked.
--   - Identity resolution is the same customer_id_from_caller(p_token)
--     every other customer-self RPC uses (password session token or
--     live Google auth.uid()) — a customer can only ever add friends to
--     or gift from their own account.
-- ============================================================

create table if not exists public.customer_friends (
  id uuid primary key default gen_random_uuid(),
  owner_id text not null references public.customers(id) on delete cascade,
  friend_id text not null references public.customers(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (owner_id, friend_id),
  check (owner_id <> friend_id)
);
alter table public.customer_friends enable row level security;
-- No policies = no direct table access for anon at all; only through
-- the SECURITY DEFINER functions below.

create or replace function public.customer_add_friend(p_token text, p_friend_username text)
returns table(friend_id text, friend_name text, friend_avatar text)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_owner_id text := public.customer_id_from_caller(p_token);
  v_username text := lower(trim(p_friend_username));
  v_friend public.customers;
begin
  if v_username = '' then
    raise exception 'invalid_input';
  end if;

  select c.* into v_friend from public.customers c where lower(c.phone) = v_username limit 1;
  if not found then
    raise exception 'friend_not_found';
  end if;

  if v_friend.id = v_owner_id then
    raise exception 'cannot_add_self';
  end if;

  insert into public.customer_friends (owner_id, friend_id)
  values (v_owner_id, v_friend.id)
  on conflict (owner_id, friend_id) do nothing;

  return query select v_friend.id, v_friend.name, v_friend.avatar;
end;
$$;
grant execute on function public.customer_add_friend(text, text) to anon, authenticated;

create or replace function public.customer_remove_friend(p_token text, p_friend_id text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_owner_id text := public.customer_id_from_caller(p_token);
begin
  delete from public.customer_friends f where f.owner_id = v_owner_id and f.friend_id = p_friend_id;
end;
$$;
grant execute on function public.customer_remove_friend(text, text) to anon, authenticated;

create or replace function public.customer_list_friends(p_token text)
returns table(friend_id text, friend_name text, friend_avatar text, added_at timestamptz)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_owner_id text := public.customer_id_from_caller(p_token);
begin
  return query
    select c.id, c.name, c.avatar, f.created_at
    from public.customer_friends f
    join public.customers c on c.id = f.friend_id
    where f.owner_id = v_owner_id
    order by f.created_at desc;
end;
$$;
grant execute on function public.customer_list_friends(text) to anon, authenticated;

create or replace function public.customer_gift_reward(p_token text, p_friend_id text)
returns table(id text, name text, phone text, avatar text, stamps integer, rewards_earned integer, joined_at timestamptz, history jsonb, total_stamps_earned integer, reward_banked_at timestamptz)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_owner_id text := public.customer_id_from_caller(p_token);
  v_owner public.customers;
  v_friend public.customers;
  v_sent_entry jsonb;
  v_received_entry jsonb;
  v_tx_id text := 'tx_' || substr(md5(random()::text || clock_timestamp()::text), 1, 7);
begin
  if p_friend_id = v_owner_id then
    raise exception 'cannot_gift_self';
  end if;

  select c.* into v_owner from public.customers c where c.id = v_owner_id for update;
  if not found or v_owner.rewards_earned <= 0 then
    raise exception 'no_reward_available';
  end if;

  select c.* into v_friend from public.customers c where c.id = p_friend_id for update;
  if not found then
    raise exception 'friend_not_found';
  end if;

  v_sent_entry := jsonb_build_object(
    'id', v_tx_id,
    'type', 'gift_sent',
    'toName', v_friend.name,
    'timestamp', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  );
  v_received_entry := jsonb_build_object(
    'id', v_tx_id,
    'type', 'gift_received',
    'fromName', v_owner.name,
    'timestamp', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  );

  update public.customers c set
    rewards_earned = c.rewards_earned - 1,
    reward_banked_at = case when c.rewards_earned - 1 <= 0 then null else c.reward_banked_at end,
    history = jsonb_build_array(v_sent_entry) || coalesce(c.history, '[]'::jsonb)
  where c.id = v_owner_id;

  update public.customers c set
    rewards_earned = c.rewards_earned + 1,
    reward_banked_at = case when c.rewards_earned = 0 then now() else c.reward_banked_at end,
    history = jsonb_build_array(v_received_entry) || coalesce(c.history, '[]'::jsonb)
  where c.id = p_friend_id;

  return query
    select c.id, c.name, c.phone, c.avatar, c.stamps, c.rewards_earned, c.joined_at, c.history, c.total_stamps_earned, c.reward_banked_at
    from public.customers c where c.id = v_owner_id;
end;
$$;
grant execute on function public.customer_gift_reward(text, text) to anon, authenticated;
