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
--
-- SECURITY FIX (this revision): the original version of this function
-- took a client-supplied p_id and trusted it outright, with no identity
-- check at all — any anon caller could call
-- customer_set_username('someone_elses_id', 'whatever') and overwrite a
-- stranger's phone column, which doubles as their password-login
-- username. That's an account-takeover vector, not just a data-integrity
-- one. It was caught before ever being wired up client-side (this RPC
-- had no caller anywhere in app.js), so nothing in production actually
-- depended on the old signature. Now resolves identity the same way
-- every other customer-self RPC does — customer_id_from_caller(p_token),
-- a password-session token or a live Google auth.uid() — so a customer
-- can only ever set their own username.
-- ============================================================

create or replace function public.customer_set_username(p_token text, p_username text)
returns table(id text, name text, phone text, avatar text, stamps integer, rewards_earned integer, joined_at timestamptz, history jsonb, total_stamps_earned integer, reward_banked_at timestamptz)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_id text := public.customer_id_from_caller(p_token);
  v_username text := lower(trim(p_username));
begin
  if v_username = '' then
    raise exception 'invalid_input';
  end if;

  if exists (select 1 from public.customers c where lower(c.phone) = v_username and c.id <> v_id) then
    raise exception 'username_taken';
  end if;

  update public.customers c set phone = v_username where c.id = v_id;

  return query
    select c.id, c.name, c.phone, c.avatar, c.stamps, c.rewards_earned, c.joined_at, c.history, c.total_stamps_earned, c.reward_banked_at
    from public.customers c where c.id = v_id;
end;
$$;
grant execute on function public.customer_set_username(text, text) to anon, authenticated;
