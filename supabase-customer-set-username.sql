-- ============================================================
-- Eightysixdegrees Punchcard — let a customer set their own username
-- ============================================================
-- Run this AFTER supabase-customer-google-login.sql on the same
-- project: https://edunsrtcdhnpbsipalhc.supabase.co
--
-- WHAT THIS ADDS:
--   - A narrow, single-purpose RPC for the "choose a username" prompt
--     shown right after a customer's first Google sign-in (Google
--     accounts start with a blank username/phone). It only ever
--     touches the phone column — unlike customer_save_self, it can't
--     be used to clobber someone's stamps/history with a stale local
--     copy, since it doesn't take those fields at all.
--   - Rejects a username that's already taken with a clear
--     'username_taken' error, checked before the write instead of
--     relying on the client to parse a raw constraint-violation
--     message.
-- ============================================================

create or replace function public.customer_set_username(p_id text, p_username text)
returns table(id text, name text, phone text, avatar text, stamps integer, rewards_earned integer, joined_at timestamptz, history jsonb, total_stamps_earned integer, reward_banked_at timestamptz)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_username text := lower(trim(p_username));
begin
  if v_username = '' then
    raise exception 'invalid_input';
  end if;

  if exists (select 1 from public.customers c where lower(c.phone) = v_username and c.id <> p_id) then
    raise exception 'username_taken';
  end if;

  update public.customers c set phone = v_username where c.id = p_id;

  return query
    select c.id, c.name, c.phone, c.avatar, c.stamps, c.rewards_earned, c.joined_at, c.history, c.total_stamps_earned, c.reward_banked_at
    from public.customers c where c.id = p_id;
end;
$$;
grant execute on function public.customer_set_username(text, text) to anon;
