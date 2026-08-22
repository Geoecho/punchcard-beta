-- ============================================================
-- Eightysixdegrees Punchcard — referral bonus + tier milestones
-- ============================================================
-- Two new ways to earn bonus stamps, both tied to a real, staff-verified
-- event (a stamp only ever gets added at the register) rather than an
-- honor-system self-claim:
--
--   - Referral bonus (+2 stamps): the first time a brand-new customer
--     (zero lifetime stamps) becomes friends with an existing customer,
--     that existing customer is recorded as the referrer. The bonus
--     pays out the moment the new customer gets their actual first
--     stamp — i.e. once they've shown up and bought something, not
--     just downloaded the app. One-time per referred customer.
--   - Tier milestones (+5 at Gold/100, +10 at Platinum/250 lifetime
--     stamps): a one-time thank-you the moment a customer's own
--     purchases cross into a new tier. Negligible cost relative to the
--     100/250 drinks already bought to get there.
--
-- Both reuse staff_add_stamp's own overflow-into-rewards logic via a
-- new grant_bonus_stamps() helper, so a bonus that pushes someone over
-- a 10-stamp boundary correctly banks a free coffee same as normal.
--
-- Run this in the Supabase SQL Editor, then tell Claude so the matching
-- app.js/index.html can deploy.
-- ============================================================

alter table public.customers add column if not exists referred_by text references public.customers(id);
alter table public.customers add column if not exists referral_rewarded_at timestamptz;

alter table public.customer_notifications drop constraint if exists customer_notifications_type_check;
alter table public.customer_notifications add constraint customer_notifications_type_check
  check (type in ('friend_request', 'friend_accepted', 'gift_received', 'reward_banked', 'referral_bonus', 'milestone_reached'));

-- Internal helper (not exposed to anon/authenticated — only ever called
-- from other SECURITY DEFINER functions below) that adds stamps outside
-- the normal staff-taps-a-drink flow: same 10-stamp overflow-into-
-- rewards_earned math as staff_add_stamp, its own history entry (typed
-- as an ordinary 'stamp' so it counts in every existing stat/history
-- view for free), and the same reward-banked notification if it tips
-- the customer over a reward.
create or replace function public.grant_bonus_stamps(p_customer_id text, p_amount integer, p_label text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_row public.customers;
  v_new_total integer;
  v_new_stamps integer;
  v_new_rewards integer;
  v_entry jsonb;
begin
  select c.* into v_row from public.customers c where c.id = p_customer_id for update;
  if not found then return; end if;

  v_new_total := v_row.stamps + p_amount;
  v_new_rewards := v_row.rewards_earned + (v_new_total / 10);
  v_new_stamps := v_new_total % 10;

  v_entry := jsonb_build_object(
    'id', 'tx_' || substr(md5(random()::text || clock_timestamp()::text), 1, 7),
    'type', 'stamp',
    'drink', p_label,
    'stamps', p_amount,
    'staffName', null,
    'staffAvatar', null,
    'timestamp', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  );

  update public.customers c set
    stamps = v_new_stamps,
    rewards_earned = v_new_rewards,
    total_stamps_earned = c.total_stamps_earned + p_amount,
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
end;
$$;

-- Records who referred a brand-new customer the moment they first
-- connect as friends — "new" meaning zero lifetime stamps at that
-- point, so two existing regulars becoming friends never counts. Covers
-- both directions (either side of the pair could be the new one).
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
      v_request.requester_id, 'friend_accepted', '🎉 Friend request accepted',
      coalesce(v_recipient.name, 'Someone') || ' accepted your friend request!',
      jsonb_build_object('friend_id', v_recipient_id, 'friend_name', v_recipient.name, 'friend_avatar', v_recipient.avatar)
    );
  end if;
end;
$$;
grant execute on function public.customer_respond_friend_request(text, uuid, boolean) to anon, authenticated;

-- Same as before, plus: on this customer's very first-ever stamp, pay
-- their referrer's bonus (if any); and on crossing into Gold (100) or
-- Platinum (250) lifetime stamps for the first time, pay this
-- customer's own milestone bonus. Both checked against v_row (the
-- pre-update snapshot), so each only ever fires once.
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
      p_customer_id, 'reward_banked', '🎉 Free coffee unlocked!',
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
      v_row.referred_by, 'referral_bonus', '🎉 Referral bonus!',
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
      p_customer_id, 'milestone_reached', '🏆 Platinum tier reached!',
      'You just hit Platinum status — enjoy 10 bonus stamps!',
      jsonb_build_object('tier', 'platinum', 'bonus', 10)
    );
  elsif v_row.total_stamps_earned < 100 and v_post_total >= 100 then
    perform public.grant_bonus_stamps(p_customer_id, 5, 'Gold Tier Bonus');
    perform public.notify_customer(
      p_customer_id, 'milestone_reached', '🏆 Gold tier reached!',
      'You just hit Gold status — enjoy 5 bonus stamps!',
      jsonb_build_object('tier', 'gold', 'bonus', 5)
    );
  end if;

  return query select c.id, c.name, c.phone, c.avatar, c.stamps, c.rewards_earned, c.joined_at, c.history, c.total_stamps_earned, c.reward_banked_at, c.is_student
    from public.customers c where c.id = p_customer_id;
end;
$$;
grant execute on function public.staff_add_stamp(text, text, integer, text) to anon;
