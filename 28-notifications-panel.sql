-- ============================================================
-- Eightysixdegrees Punchcard — in-app notification panel
-- ============================================================
-- Run this AFTER 27-friends-gifting.sql, 23-student-status.sql
-- on the same project: https://edunsrtcdhnpbsipalhc.supabase.co
--
-- WHAT THIS ADDS:
--   - A real, persistent notification inbox per customer
--     (customer_notifications) — separate from Web Push, which only
--     ever reaches a device that has notifications enabled AND is
--     currently able to receive them. This is the record a customer
--     sees inside the app itself regardless of push permission state,
--     so nothing quietly gets missed just because they never granted
--     (or later revoked) OS-level notification permission.
--   - customer_list_notifications / customer_unread_notification_count
--     / customer_mark_notification_read / customer_mark_all_notifications_read
--     / customer_delete_notification / customer_clear_all_notifications —
--     the read/manage surface for a customer's own inbox.
--   - notify_customer(...) — an internal-only helper (deliberately NOT
--     granted to anon/authenticated) that inserts a notification row.
--     Only other SECURITY DEFINER functions can call it, which is what
--     keeps this safe: a customer can never insert an arbitrary
--     notification into anyone's inbox (that would be a spam/spoofing
--     vector — e.g. faking a "so-and-so accepted your request" that
--     never happened), because the only paths that create a
--     notification are the same trusted functions that already gate
--     the real underlying event (a real friend request, a real gift,
--     a real reward).
--   - Wires notify_customer(...) into the four events this app already
--     treats as push-worthy, so the panel and Web Push always agree on
--     what happened: a new friend request, a friend request accepted,
--     a gift received, and a reward banked (card full). Each of these
--     three friends/gifting functions is a straight create-or-replace
--     of the version already in 27-friends-gifting.sql (same
--     signature, so no DROP needed) — copied here with one added
--     notify_customer(...) call apiece, not a redesign. staff_add_stamp
--     is re-copied from 23-student-status.sql (the file that most
--     recently owns its definition) the same way, with a defensive
--     DROP first since — unlike the other three — this file didn't
--     originally define it, so there's more room for signature drift.
-- ============================================================

create table if not exists public.customer_notifications (
  id uuid primary key default gen_random_uuid(),
  customer_id text not null references public.customers(id) on delete cascade,
  type text not null check (type in ('friend_request', 'friend_accepted', 'gift_received', 'reward_banked')),
  title text not null,
  body text not null,
  data jsonb not null default '{}'::jsonb,
  read boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.customer_notifications enable row level security;
-- No policies = no direct table access for anon at all; only through
-- the SECURITY DEFINER functions below.
create index if not exists customer_notifications_customer_idx
  on public.customer_notifications (customer_id, created_at desc);

-- Internal-only insert helper — NOT granted to anon/authenticated.
-- Callable only from inside another SECURITY DEFINER function's body
-- (which runs as this function's owner, not the original caller), so
-- there is no way for a customer to invoke this directly.
create or replace function public.notify_customer(p_customer_id text, p_type text, p_title text, p_body text, p_data jsonb default '{}'::jsonb)
returns void
language sql
security definer
set search_path = public, extensions
as $$
  insert into public.customer_notifications (customer_id, type, title, body, data)
  values (p_customer_id, p_type, p_title, p_body, p_data);
$$;

create or replace function public.customer_list_notifications(p_token text)
returns table(id uuid, type text, title text, body text, data jsonb, read boolean, created_at timestamptz)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_id text := public.customer_id_from_caller(p_token);
begin
  return query
    select n.id, n.type, n.title, n.body, n.data, n.read, n.created_at
    from public.customer_notifications n
    where n.customer_id = v_id
    order by n.created_at desc
    limit 50;
end;
$$;
grant execute on function public.customer_list_notifications(text) to anon, authenticated;

create or replace function public.customer_unread_notification_count(p_token text)
returns integer
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_id text := public.customer_id_from_caller(p_token);
  v_count integer;
begin
  select count(*) into v_count from public.customer_notifications where customer_id = v_id and read = false;
  return v_count;
end;
$$;
grant execute on function public.customer_unread_notification_count(text) to anon, authenticated;

create or replace function public.customer_mark_notification_read(p_token text, p_notification_id uuid)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_id text := public.customer_id_from_caller(p_token);
begin
  update public.customer_notifications set read = true where id = p_notification_id and customer_id = v_id;
end;
$$;
grant execute on function public.customer_mark_notification_read(text, uuid) to anon, authenticated;

create or replace function public.customer_mark_all_notifications_read(p_token text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_id text := public.customer_id_from_caller(p_token);
begin
  update public.customer_notifications set read = true where customer_id = v_id and read = false;
end;
$$;
grant execute on function public.customer_mark_all_notifications_read(text) to anon, authenticated;

create or replace function public.customer_delete_notification(p_token text, p_notification_id uuid)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_id text := public.customer_id_from_caller(p_token);
begin
  delete from public.customer_notifications where id = p_notification_id and customer_id = v_id;
end;
$$;
grant execute on function public.customer_delete_notification(text, uuid) to anon, authenticated;

create or replace function public.customer_clear_all_notifications(p_token text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_id text := public.customer_id_from_caller(p_token);
begin
  delete from public.customer_notifications where customer_id = v_id;
end;
$$;
grant execute on function public.customer_clear_all_notifications(text) to anon, authenticated;

-- ============================================================
-- Re-copies of the four event-generating functions, each with one
-- added notify_customer(...) call. Everything else is identical to
-- the version currently live from 27-friends-gifting.sql /
-- 23-student-status.sql.
-- ============================================================

create or replace function public.customer_send_friend_request(p_token text, p_friend_username text)
returns table(status text, friend_id text, friend_name text, friend_avatar text)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_requester_id text := public.customer_id_from_caller(p_token);
  v_requester public.customers;
  v_username text := lower(trim(p_friend_username));
  v_friend public.customers;
  v_reverse public.customer_friend_requests;
  v_existing public.customer_friend_requests;
  v_request_id uuid;
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

  select c.* into v_requester from public.customers c where c.id = v_requester_id;

  -- They already asked us — accept theirs instead of creating a
  -- separate pending request in the other direction.
  select r.* into v_reverse from public.customer_friend_requests r
    where r.requester_id = v_friend.id and r.recipient_id = v_requester_id and r.status = 'pending';
  if found then
    update public.customer_friend_requests r set status = 'accepted', responded_at = now() where r.id = v_reverse.id;
    perform public.notify_customer(
      v_friend.id, 'friend_accepted', '🎉 Friend request accepted',
      coalesce(v_requester.name, 'Someone') || ' accepted your friend request!',
      jsonb_build_object('friend_id', v_requester_id, 'friend_name', v_requester.name, 'friend_avatar', v_requester.avatar)
    );
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
    update public.customer_friend_requests r set status = 'pending', created_at = now(), responded_at = null where r.id = v_existing.id
      returning r.id into v_request_id;
  else
    insert into public.customer_friend_requests (requester_id, recipient_id) values (v_requester_id, v_friend.id)
      returning id into v_request_id;
  end if;

  perform public.notify_customer(
    v_friend.id, 'friend_request', '👋 New friend request',
    coalesce(v_requester.name, 'Someone') || ' wants to add you as a friend',
    jsonb_build_object('request_id', v_request_id, 'requester_id', v_requester_id, 'requester_name', v_requester.name, 'requester_avatar', v_requester.avatar)
  );

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
  v_recipient public.customers;
  v_request public.customer_friend_requests;
begin
  select r.* into v_request from public.customer_friend_requests r
    where r.id = p_request_id and r.recipient_id = v_recipient_id and r.status = 'pending'
    for update;
  if not found then
    raise exception 'request_not_found';
  end if;

  update public.customer_friend_requests r
  set status = case when p_accept then 'accepted' else 'declined' end,
      responded_at = now()
  where r.id = p_request_id;

  if p_accept then
    select c.* into v_recipient from public.customers c where c.id = v_recipient_id;
    perform public.notify_customer(
      v_request.requester_id, 'friend_accepted', '🎉 Friend request accepted',
      coalesce(v_recipient.name, 'Someone') || ' accepted your friend request!',
      jsonb_build_object('friend_id', v_recipient_id, 'friend_name', v_recipient.name, 'friend_avatar', v_recipient.avatar)
    );
  end if;
end;
$$;
grant execute on function public.customer_respond_friend_request(text, uuid, boolean) to anon, authenticated;

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

  perform public.notify_customer(
    p_friend_id, 'gift_received', '🎁 You received a gift!',
    coalesce(v_owner.name, 'A friend') || ' gifted you a free coffee!',
    jsonb_build_object('from_id', v_owner_id, 'from_name', v_owner.name, 'from_avatar', v_owner.avatar)
  );

  return query
    select c.id, c.name, c.phone, c.avatar, c.stamps, c.rewards_earned, c.joined_at, c.history, c.total_stamps_earned, c.reward_banked_at
    from public.customers c where c.id = v_owner_id;
end;
$$;
grant execute on function public.customer_gift_reward(text, text) to anon, authenticated;

drop function if exists public.staff_add_stamp(text, text, integer, text);
create or replace function public.staff_add_stamp(p_token text, p_customer_id text, p_base_stamps integer, p_drink_name text)
returns table(id text, name text, phone text, avatar text, stamps integer, rewards_earned integer, joined_at timestamptz, history jsonb, total_stamps_earned integer, reward_banked_at timestamptz, is_student boolean)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_staff public.staff_users;
  v_row public.customers;
  v_campaign public.campaigns;
  v_effective_stamps integer;
  v_new_total integer;
  v_new_stamps integer;
  v_new_rewards integer;
  v_entry jsonb;
begin
  v_staff := public.staff_from_token(p_token);

  select c.* into v_row from public.customers c where c.id = p_customer_id for update;
  if not found then raise exception 'customer_not_found'; end if;

  select * into v_campaign from public.campaigns camp where camp.id = 1;
  v_effective_stamps := greatest(1, coalesce(p_base_stamps, 1));
  if v_campaign.active then
    v_effective_stamps := v_effective_stamps * v_campaign.multiplier;
  end if;

  v_new_total := v_row.stamps + v_effective_stamps;
  v_new_rewards := v_row.rewards_earned + (v_new_total / 10);
  v_new_stamps := v_new_total % 10;

  v_entry := jsonb_build_object(
    'id', 'tx_' || substr(md5(random()::text || clock_timestamp()::text), 1, 7),
    'type', 'stamp',
    'drink', coalesce(p_drink_name, 'Drink'),
    'stamps', v_effective_stamps,
    'staffName', v_staff.name,
    'staffAvatar', v_staff.avatar,
    'timestamp', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  );

  update public.customers c set
    stamps = v_new_stamps,
    rewards_earned = v_new_rewards,
    total_stamps_earned = c.total_stamps_earned + v_effective_stamps,
    reward_banked_at = case when c.rewards_earned = 0 and v_new_rewards > 0 then now() else c.reward_banked_at end,
    history = jsonb_build_array(v_entry) || coalesce(c.history, '[]'::jsonb)
  where c.id = p_customer_id;

  if v_new_rewards > v_row.rewards_earned then
    perform public.notify_customer(
      p_customer_id, 'reward_banked', '🎉 Free coffee unlocked!',
      'Your card is full — come redeem your free drink.',
      jsonb_build_object('rewards_earned', v_new_rewards)
    );
  end if;

  return query select c.id, c.name, c.phone, c.avatar, c.stamps, c.rewards_earned, c.joined_at, c.history, c.total_stamps_earned, c.reward_banked_at, c.is_student
    from public.customers c where c.id = p_customer_id;
end;
$$;
grant execute on function public.staff_add_stamp(text, text, integer, text) to anon;
