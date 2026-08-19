-- ============================================================
-- Eightysixdegrees Punchcard — friends list + gift a reward
-- ============================================================
-- Run this in the Supabase SQL Editor, then tell Claude so the
-- matching app.js can deploy.
--
-- WHAT THIS ADDS:
--   - A real request/accept friendship model (customer_friend_requests),
--     not a one-directional "I added you" list — sending a request
--     doesn't put you in someone's friends list until THEY accept it,
--     and once accepted, both sides see each other.
--   - If two people happen to request each other (both already sent a
--     pending request the other way), the second request auto-accepts
--     instead of sitting as a duplicate — a small "you both already
--     wanted this" nicety.
--   - customer_gift_reward transfers one ALREADY-BANKED reward to an
--     ACCEPTED friend only. This is safe to leave unrestricted on rate
--     (no cooldown) because it's zero-sum — it only moves a reward that
--     was already legitimately earned, it can never create one. The
--     abuse this app actually has to guard against is FORGING new
--     stamps/rewards (see supabase-security-fixes.sql), not customers
--     moving their own already-real rewards to each other.
--   - Every gift writes a history entry on both accounts so it's
--     visible in the activity feed same as any other transaction.
--   - Identity resolution is the same customer_id_from_caller(p_token)
--     every other customer-self RPC uses (password session token or
--     live Google auth.uid()) — a customer can only ever act as
--     themselves.
-- ============================================================

create table if not exists public.customer_friend_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id text not null references public.customers(id) on delete cascade,
  recipient_id text not null references public.customers(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  unique (requester_id, recipient_id),
  check (requester_id <> recipient_id)
);
alter table public.customer_friend_requests enable row level security;
-- No policies = no direct table access for anon at all; only through
-- the SECURITY DEFINER functions below.

-- Send a request, or auto-accept if the recipient already sent one to
-- the caller. Re-sending after a decline resets it back to pending
-- rather than staying permanently blocked by the unique constraint.
create or replace function public.customer_send_friend_request(p_token text, p_friend_username text)
returns table(status text, friend_id text, friend_name text, friend_avatar text)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_requester_id text := public.customer_id_from_caller(p_token);
  v_username text := lower(trim(p_friend_username));
  v_friend public.customers;
  v_reverse public.customer_friend_requests;
  v_existing public.customer_friend_requests;
begin
  if v_username = '' then
    raise exception 'invalid_input';
  end if;

  select c.* into v_friend from public.customers c where lower(c.phone) = v_username limit 1;
  if not found then
    raise exception 'friend_not_found';
  end if;
  if v_friend.id = v_requester_id then
    raise exception 'cannot_add_self';
  end if;

  -- They already asked us — accept theirs instead of creating a
  -- separate pending request in the other direction.
  select r.* into v_reverse from public.customer_friend_requests r
    where r.requester_id = v_friend.id and r.recipient_id = v_requester_id and r.status = 'pending';
  if found then
    update public.customer_friend_requests r set status = 'accepted', responded_at = now() where r.id = v_reverse.id;
    return query select 'accepted'::text, v_friend.id, v_friend.name, v_friend.avatar;
    return;
  end if;

  select r.* into v_existing from public.customer_friend_requests r
    where r.requester_id = v_requester_id and r.recipient_id = v_friend.id;

  if found and v_existing.status = 'accepted' then
    return query select 'already_friends'::text, v_friend.id, v_friend.name, v_friend.avatar;
    return;
  elsif found and v_existing.status = 'pending' then
    return query select 'already_pending'::text, v_friend.id, v_friend.name, v_friend.avatar;
    return;
  elsif found then
    update public.customer_friend_requests r set status = 'pending', created_at = now(), responded_at = null where r.id = v_existing.id;
  else
    insert into public.customer_friend_requests (requester_id, recipient_id) values (v_requester_id, v_friend.id);
  end if;

  return query select 'pending'::text, v_friend.id, v_friend.name, v_friend.avatar;
end;
$$;
grant execute on function public.customer_send_friend_request(text, text) to anon, authenticated;

create or replace function public.customer_respond_friend_request(p_token text, p_request_id uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_recipient_id text := public.customer_id_from_caller(p_token);
begin
  update public.customer_friend_requests r
  set status = case when p_accept then 'accepted' else 'declined' end,
      responded_at = now()
  where r.id = p_request_id and r.recipient_id = v_recipient_id and r.status = 'pending';

  if not found then
    raise exception 'request_not_found';
  end if;
end;
$$;
grant execute on function public.customer_respond_friend_request(text, uuid, boolean) to anon, authenticated;

-- Incoming requests the caller still needs to respond to.
create or replace function public.customer_list_pending_requests(p_token text)
returns table(request_id uuid, requester_id text, requester_name text, requester_avatar text, created_at timestamptz)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_caller_id text := public.customer_id_from_caller(p_token);
begin
  return query
    select r.id, c.id, c.name, c.avatar, r.created_at
    from public.customer_friend_requests r
    join public.customers c on c.id = r.requester_id
    where r.recipient_id = v_caller_id and r.status = 'pending'
    order by r.created_at desc;
end;
$$;
grant execute on function public.customer_list_pending_requests(text) to anon, authenticated;

-- Mutual: everyone with an accepted request in either direction.
create or replace function public.customer_list_friends(p_token text)
returns table(friend_id text, friend_name text, friend_avatar text, since timestamptz)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_caller_id text := public.customer_id_from_caller(p_token);
begin
  return query
    select c.id, c.name, c.avatar, r.responded_at
    from public.customer_friend_requests r
    join public.customers c on c.id = (case when r.requester_id = v_caller_id then r.recipient_id else r.requester_id end)
    where (r.requester_id = v_caller_id or r.recipient_id = v_caller_id) and r.status = 'accepted'
    order by r.responded_at desc nulls last;
end;
$$;
grant execute on function public.customer_list_friends(text) to anon, authenticated;

create or replace function public.customer_remove_friend(p_token text, p_friend_id text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_caller_id text := public.customer_id_from_caller(p_token);
begin
  delete from public.customer_friend_requests r
  where ((r.requester_id = v_caller_id and r.recipient_id = p_friend_id)
      or (r.requester_id = p_friend_id and r.recipient_id = v_caller_id))
    and r.status = 'accepted';
end;
$$;
grant execute on function public.customer_remove_friend(text, text) to anon, authenticated;

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

  if not exists (
    select 1 from public.customer_friend_requests r
    where ((r.requester_id = v_owner_id and r.recipient_id = p_friend_id)
        or (r.requester_id = p_friend_id and r.recipient_id = v_owner_id))
      and r.status = 'accepted'
  ) then
    raise exception 'not_friends';
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

-- Lets a customer trigger a push notification to another customer for a
-- friend request they just sent or accepted — the only case where one
-- customer needs to read another's push subscriptions. Gated on an
-- actual just-verified relationship between the two (same pattern as
-- customer_gift_reward's accepted-friendship check), so a customer can
-- never look up an arbitrary stranger's subscription data.
create or replace function public.customer_get_friend_notify_subscriptions(p_token text, p_target_id text, p_context text)
returns table(endpoint text, p256dh text, auth text)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_caller_id text := public.customer_id_from_caller(p_token);
  v_ok boolean;
begin
  if p_context = 'friend_request' then
    select exists(
      select 1 from public.customer_friend_requests r
      where r.requester_id = v_caller_id and r.recipient_id = p_target_id and r.status = 'pending'
    ) into v_ok;
  elsif p_context = 'friend_accepted' then
    select exists(
      select 1 from public.customer_friend_requests r
      where ((r.requester_id = v_caller_id and r.recipient_id = p_target_id)
          or (r.requester_id = p_target_id and r.recipient_id = v_caller_id))
        and r.status = 'accepted'
    ) into v_ok;
  else
    raise exception 'invalid_context';
  end if;

  if not v_ok then
    raise exception 'not_authorized';
  end if;

  return query select s.endpoint, s.p256dh, s.auth from public.push_subscriptions s where s.customer_id = p_target_id;
end;
$$;
grant execute on function public.customer_get_friend_notify_subscriptions(text, text, text) to anon, authenticated;
