-- ============================================================
-- Eightysixdegrees Punchcard — carry the staff avatar on stamp entries
-- ============================================================
-- Run this AFTER supabase-staff-profile.sql on the same project.
--
-- WHAT THIS ADDS:
--   - staff_add_stamp's history entry now also records staffAvatar
--     (from staff_users.avatar, set on supabase-staff-profile.sql),
--     the same way it already records staffName. The customer-facing
--     "New Stamp from X!" toast can then show that staff member's
--     avatar without a separate lookup/RPC — it just rides along in
--     the history entry already returned to the customer.
--   - No new grants needed — same function, same permissions.
-- ============================================================

create or replace function public.staff_add_stamp(p_token text, p_customer_id text, p_base_stamps integer, p_drink_name text)
returns table(id text, name text, phone text, avatar text, stamps integer, rewards_earned integer, joined_at timestamptz, history jsonb, total_stamps_earned integer, reward_banked_at timestamptz)
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

  return query select c.id, c.name, c.phone, c.avatar, c.stamps, c.rewards_earned, c.joined_at, c.history, c.total_stamps_earned, c.reward_banked_at
    from public.customers c where c.id = p_customer_id;
end;
$$;
grant execute on function public.staff_add_stamp(text, text, integer, text) to anon;
