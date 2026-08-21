-- ============================================================
-- Eightysixdegrees Punchcard — optional message on a gifted reward
-- ============================================================
-- Run this AFTER supabase-notifications-panel.sql on the same project:
-- https://edunsrtcdhnpbsipalhc.supabase.co
--
-- WHAT THIS ADDS:
--   - customer_gift_reward gains a third, optional parameter
--     (p_message) — a short note the sender can attach, shown to the
--     recipient in their notification and kept on both sides' activity
--     history so it isn't lost once the notification is dismissed.
--   - Trimmed and hard-capped at 140 characters server-side regardless
--     of whatever the client enforces, since the client isn't trusted.
--   - Plain text only: newlines are collapsed to spaces before storage,
--     and it's always rendered via textContent (never innerHTML) on the
--     client, so there's no way for a message to inject markup/links
--     into another customer's notification panel.
--
-- Existing callers that don't pass a message keep working unchanged —
-- the new parameter defaults to null, and a null/empty message renders
-- exactly like today's fixed "gifted you a free coffee!" text.
-- ============================================================

drop function if exists public.customer_gift_reward(text, text);

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
    p_friend_id, 'gift_received', '🎁 You received a gift!',
    v_body,
    jsonb_build_object('from_id', v_owner_id, 'from_name', v_owner.name, 'from_avatar', v_owner.avatar, 'message', v_message)
  );

  return query
    select c.id, c.name, c.phone, c.avatar, c.stamps, c.rewards_earned, c.joined_at, c.history, c.total_stamps_earned, c.reward_banked_at
    from public.customers c where c.id = v_owner_id;
end;
$$;
grant execute on function public.customer_gift_reward(text, text, text) to anon, authenticated;
