-- ============================================================
-- Eightysixdegrees Punchcard — strip colored emoji from notification titles
-- ============================================================
-- Run this AFTER 30-referrals-milestones.sql on the same
-- project: https://edunsrtcdhnpbsipalhc.supabase.co
--
-- WHAT THIS CHANGES:
-- notify_customer() titles feed BOTH the in-app notification bell and
-- the OS push notification title — every one of them had a colored
-- emoji prefix (🎉 👋 🏆 🎁). Removed from all four functions that
-- call it with a hardcoded title. Nothing else about any of these
-- functions changes — each body below is an exact copy of its current
-- live version (verified via git log which file most recently touched
-- each one, not just filename) with only the title strings edited.
--
--   customer_send_friend_request  — was in 29-friend-search-by-name.sql
--   customer_respond_friend_request, staff_add_stamp
--                                  — were in 30-referrals-milestones.sql
--   customer_gift_reward          — was in 32-gift-message.sql
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
  v_search_name text := lower(trim(p_friend_username));
  v_friend public.customers;
  v_reverse public.customer_friend_requests;
  v_existing public.customer_friend_requests;
  v_request_id uuid;
begin
  if v_search_name = '' then
    raise exception 'invalid_input';
  end if;

  select c.* into v_friend from public.customers c where lower(trim(c.name)) = v_search_name limit 1;
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
      v_friend.id, 'friend_accepted', 'Friend request accepted',
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
    v_friend.id, 'friend_request', 'New friend request',
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
  v_requester public.customers;
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
    select c.* into v_recipient from public.customers c where c.id = v_recipient_id for update;
    select c.* into v_requester from public.customers c where c.id = v_request.requester_id for update;

    if v_recipient.total_stamps_earned = 0 and v_recipient.referred_by is null then
      update public.customers set referred_by = v_requester.id where id = v_recipient.id;
    end if;
    if v_requester.total_stamps_earned = 0 and v_requester.referred_by is null then
      update public.customers set referred_by = v_recipient.id where id = v_requester.id;
    end if;

    perform public.notify_customer(
      v_request.requester_id, 'friend_accepted', 'Friend request accepted',
      coalesce(v_recipient.name, 'Someone') || ' accepted your friend request!',
      jsonb_build_object('friend_id', v_recipient_id, 'friend_name', v_recipient.name, 'friend_avatar', v_recipient.avatar)
    );
  end if;
end;
$$;
grant execute on function public.customer_respond_friend_request(text, uuid, boolean) to anon, authenticated;

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
  v_post_total integer;
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
      p_customer_id, 'reward_banked', 'Free coffee unlocked!',
      'Your card is full — come redeem your free drink.',
      jsonb_build_object('rewards_earned', v_new_rewards)
    );
  end if;

  -- Referral bonus: this customer's first-ever stamp, and someone
  -- referred them, and that referral hasn't paid out yet.
  if v_row.total_stamps_earned = 0 and v_row.referred_by is not null and v_row.referral_rewarded_at is null then
    perform public.grant_bonus_stamps(v_row.referred_by, 2, 'Referral Bonus');
    update public.customers set referral_rewarded_at = now() where id = p_customer_id;
    perform public.notify_customer(
      v_row.referred_by, 'referral_bonus', 'Referral bonus!',
      coalesce(v_row.name, 'Your friend') || ' just visited for the first time — you got +2 stamps!',
      jsonb_build_object('referred_id', p_customer_id, 'referred_name', v_row.name)
    );
  end if;

  -- Tier milestones: check the post-update lifetime total against the
  -- pre-update one so this only fires the moment each threshold is
  -- first crossed, not on every stamp after it.
  v_post_total := v_row.total_stamps_earned + v_effective_stamps;
  if v_row.total_stamps_earned < 250 and v_post_total >= 250 then
    perform public.grant_bonus_stamps(p_customer_id, 10, 'Platinum Tier Bonus');
    perform public.notify_customer(
      p_customer_id, 'milestone_reached', 'Platinum tier reached!',
      'You just hit Platinum status — enjoy 10 bonus stamps!',
      jsonb_build_object('tier', 'platinum', 'bonus', 10)
    );
  elsif v_row.total_stamps_earned < 100 and v_post_total >= 100 then
    perform public.grant_bonus_stamps(p_customer_id, 5, 'Gold Tier Bonus');
    perform public.notify_customer(
      p_customer_id, 'milestone_reached', 'Gold tier reached!',
      'You just hit Gold status — enjoy 5 bonus stamps!',
      jsonb_build_object('tier', 'gold', 'bonus', 5)
    );
  end if;

  return query select c.id, c.name, c.phone, c.avatar, c.stamps, c.rewards_earned, c.joined_at, c.history, c.total_stamps_earned, c.reward_banked_at, c.is_student
    from public.customers c where c.id = p_customer_id;
end;
$$;
grant execute on function public.staff_add_stamp(text, text, integer, text) to anon;

create or replace function public.customer_gift_reward(p_token text, p_friend_id text, p_message text default null)
returns table(id text, name text, phone text, avatar text, stamps integer, rewards_earned integer, joined_at timestamptz, history jsonb, total_stamps_earned integer, reward_banked_at timestamptz)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_owner_id text := public.customer_id_from_caller(p_token);
  v_owner public.customers;
  v_friend public.customers;
  v_message text := nullif(trim(regexp_replace(coalesce(p_message, ''), '\s+', ' ', 'g')), '');
  v_sent_entry jsonb;
  v_received_entry jsonb;
  v_tx_id text := 'tx_' || substr(md5(random()::text || clock_timestamp()::text), 1, 7);
  v_body text;
begin
  if v_message is not null and length(v_message) > 140 then
    v_message := left(v_message, 140);
  end if;

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
    'message', v_message,
    'timestamp', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  );
  v_received_entry := jsonb_build_object(
    'id', v_tx_id,
    'type', 'gift_received',
    'fromName', v_owner.name,
    'message', v_message,
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

  v_body := coalesce(v_owner.name, 'A friend') || ' gifted you a free coffee!';
  if v_message is not null then
    v_body := v_body || ' "' || v_message || '"';
  end if;

  perform public.notify_customer(
    p_friend_id, 'gift_received', 'You received a gift!',
    v_body,
    jsonb_build_object('from_id', v_owner_id, 'from_name', v_owner.name, 'from_avatar', v_owner.avatar, 'message', v_message)
  );

  return query
    select c.id, c.name, c.phone, c.avatar, c.stamps, c.rewards_earned, c.joined_at, c.history, c.total_stamps_earned, c.reward_banked_at
    from public.customers c where c.id = v_owner_id;
end;
$$;
grant execute on function public.customer_gift_reward(text, text, text) to anon, authenticated;
