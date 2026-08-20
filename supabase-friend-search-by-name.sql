-- ============================================================
-- Eightysixdegrees Punchcard — friend search by display name
-- ============================================================
-- Collapses the separate "username" concept (customers.phone, only ever
-- populated via the "Choose a Username" prompt shown to Google-signup
-- customers so they'd have *something* unique to be found by) into
-- display name (customers.name). Customers no longer need to remember
-- two different names just so a friend can add them — the name already
-- shown on their card/greeting is now also what friends search for.
--
-- This does NOT touch the phone-based LOGIN username used by
-- password-signup accounts (signup_customer/login_customer, customers.
-- phone) — that's a genuinely separate credential, unrelated to this
-- change, and stays exactly as it is.
--
-- Checked before writing this: 7/7 live customers already have a
-- display name set, zero case-insensitive collisions, so the unique
-- index below applies cleanly with no backfill needed.
--
-- Run this in the Supabase SQL Editor, then tell Claude so the matching
-- app.js/index.html can deploy.
-- ============================================================

-- Case-insensitive uniqueness on display name, enforced at the DB level
-- (not just in customer_set_display_name below) so it holds even under
-- concurrent writes. Partial (only non-empty names) since a customer can
-- still be mid-onboarding with no name set yet.
create unique index if not exists customers_name_lower_unique_idx
  on public.customers (lower(trim(name)))
  where name is not null and trim(name) <> '';

-- Same as before, plus: reject a name someone else already has, now that
-- display name doubles as the friend-search key. Dropped first since the
-- live return type has drifted from this one (extra columns added by
-- later migrations) and Postgres won't let create-or-replace change it.
drop function if exists public.customer_set_display_name(text, text);
create or replace function public.customer_set_display_name(p_token text, p_name text)
returns table(id text, name text, phone text, avatar text, stamps integer, rewards_earned integer, joined_at timestamptz, history jsonb, total_stamps_earned integer, reward_banked_at timestamptz, is_student boolean)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_customer_id text := public.customer_id_from_caller(p_token);
  v_name text := trim(p_name);
  v_row public.customers;
begin
  if v_name = '' or length(v_name) > 40 then
    raise exception 'invalid_input';
  end if;

  select c.* into v_row from public.customers c where c.id = v_customer_id;

  if v_row.name_changed_at is not null and v_row.name_changed_at > now() - interval '14 days' then
    raise exception 'rate_limited:%', to_char(v_row.name_changed_at + interval '14 days', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
  end if;

  if exists (select 1 from public.customers c where lower(trim(c.name)) = lower(v_name) and c.id <> v_customer_id) then
    raise exception 'name_taken';
  end if;

  update public.customers c set name = v_name, name_changed_at = now() where c.id = v_customer_id;

  return query
    select c.id, c.name, c.phone, c.avatar, c.stamps, c.rewards_earned, c.joined_at, c.history, c.total_stamps_earned, c.reward_banked_at, c.is_student
    from public.customers c where c.id = v_customer_id;
end;
$$;
grant execute on function public.customer_set_display_name(text, text) to anon, authenticated;

-- Identical to the version in supabase-notifications-panel.sql except
-- the lookup now matches display name instead of the login-only phone
-- column.
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

-- No longer called from the client — the separate "Choose a Username"
-- prompt is gone, display name covers both jobs now.
drop function if exists public.customer_set_username(text, text);
