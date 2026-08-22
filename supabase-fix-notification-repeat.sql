-- ============================================================
-- Fix: friend-request notifications reappearing after accept/decline
-- ============================================================
-- Run this on: https://edunsrtcdhnpbsipalhc.supabase.co
--
-- BUG: customer_respond_friend_request() (latest version was in
-- supabase-remove-emoji-titles.sql) updates customer_friend_requests.status
-- but never removes the originating 'friend_request' row from
-- customer_notifications. The notifications panel (app.js) only ever
-- deletes that row on an explicit "X" click (customer_delete_notification) —
-- accepting or declining just removes it from the DOM for that one session.
-- Next time the panel is opened, customer_list_notifications() re-fetches
-- every row for this customer from the table, and the same already-handled
-- friend_request notification comes back — its Accept/Decline buttons now
-- silently fail (customer_respond_friend_request raises request_not_found
-- since the request is no longer 'pending'), but the row itself never goes
-- away since nothing ever deleted it.
--
-- FIX: after recording accept/decline, delete the notification row that
-- represents this specific pending request. Straight copy of the version
-- in supabase-remove-emoji-titles.sql — no signature/return-type change,
-- so no DROP needed — with one delete statement added at the end.
-- ============================================================

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
    -- Already responded to (e.g. a stale notification row from before this
    -- fix). Clean up the leftover notification instead of raising, so a
    -- second click on an already-handled row just makes it go away.
    delete from public.customer_notifications
      where customer_id = v_recipient_id and type = 'friend_request'
        and (data->>'request_id')::uuid = p_request_id;
    return;
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

  delete from public.customer_notifications
    where customer_id = v_recipient_id and type = 'friend_request'
      and (data->>'request_id')::uuid = p_request_id;
end;
$$;
grant execute on function public.customer_respond_friend_request(text, uuid, boolean) to anon, authenticated;
