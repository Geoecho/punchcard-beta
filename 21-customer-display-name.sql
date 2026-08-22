-- ============================================================
-- Eightysixdegrees Punchcard — customer-changeable display name
-- ============================================================
-- Run this AFTER 12-security-fixes.sql on the same project.
--
-- WHAT THIS ADDS:
--   - A way for a customer to change their DISPLAY name (customers.name
--     — what's shown in the greeting, QR code, leaderboard, activity
--     log) as distinct from their LOGIN username (customers.phone,
--     already changeable via customer_set_username). Rate-limited to
--     once every 14 days per customer, enforced server-side so it can't
--     be bypassed by calling the RPC directly.
--   - Same identity resolution as every other customer-self RPC:
--     customer_id_from_caller(p_token) accepts either a password-login
--     session token or a live Google auth.uid() session — the caller
--     can only ever touch their own row.
--   - On a cooldown violation, raises 'rate_limited:<ISO timestamp>' —
--     the timestamp is when the customer can next change their name —
--     so the client can show a specific date instead of a generic error.
-- ============================================================

alter table public.customers add column if not exists name_changed_at timestamptz;

create or replace function public.customer_set_display_name(p_token text, p_name text)
returns table(id text, name text, phone text, avatar text, stamps integer, rewards_earned integer, joined_at timestamptz, history jsonb, total_stamps_earned integer, reward_banked_at timestamptz)
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

  update public.customers c set name = v_name, name_changed_at = now() where c.id = v_customer_id;

  return query
    select c.id, c.name, c.phone, c.avatar, c.stamps, c.rewards_earned, c.joined_at, c.history, c.total_stamps_earned, c.reward_banked_at
    from public.customers c where c.id = v_customer_id;
end;
$$;
grant execute on function public.customer_set_display_name(text, text) to anon, authenticated;
